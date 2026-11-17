// Tagihan komisi cara B: komisi dihitung dari pesanan selesai, ditagih sebulan sekali ke penjual.
// Uang pelanggan tetap langsung ke QRIS penjual. Platform hanya menagih komisinya.
const db = require('./db');
const settings = require('./settings');
const notify = require('./notify');

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAY = 86400000;

const INVOICE_STATUS = {
  unpaid: { label: 'Belum dibayar', cls: 'bg-amber-100 text-amber-700' },
  submitted: { label: 'Bukti dikirim, menunggu cek', cls: 'bg-sky-100 text-sky-700' },
  paid: { label: 'Lunas', cls: 'bg-emerald-100 text-emerald-700' },
  waived: { label: 'Dibebaskan', cls: 'bg-stone-200 text-stone-600' },
};

function monthLabel(period) {
  const [y, m] = String(period).split('-').map(Number);
  return (MONTHS[m - 1] || '?') + ' ' + y;
}
function periodOf(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function periodRange(period) {
  const [y, m] = period.split('-').map(Number);
  return [new Date(y, m - 1, 1), new Date(y, m, 1)];
}

async function getConfig() {
  const s = await settings.getAll();
  const pct = Math.max(0, Math.min(30, parseFloat(String(s.commission_pct || '0').replace(',', '.')) || 0));
  const start = /^\d{4}-\d{2}-\d{2}$/.test(s.commission_start || '') ? s.commission_start : '';
  return {
    pct,
    start,
    dueDays: Math.max(1, Math.min(60, parseInt(s.commission_due_days, 10) || 7)),
    bank: s.platform_bank || '',
    qris: s.platform_qris || '',
    enabled: pct > 0 && !!start,
  };
}

// Pesanan selesai milik toko pada satu bulan yang belum masuk tagihan manapun
function billableOrders(cfg, store, period) {
  const [from0, to] = periodRange(period);
  let from = from0;
  const startD = new Date(cfg.start + 'T00:00:00');
  if (startD > from) from = startD;
  if (store.commission_free_until && new Date(store.commission_free_until) > from) from = new Date(store.commission_free_until);
  return db('orders as o').where('o.store_id', store.id).where('o.status', 'completed').whereNull('o.invoice_id')
    .whereRaw('coalesce(o.completed_at, o.updated_at) >= ?', [from])
    .whereRaw('coalesce(o.completed_at, o.updated_at) < ?', [to]);
}

// Membuat tagihan untuk bulan-bulan yang sudah lewat. Aman dijalankan berulang.
async function generateAll() {
  const cfg = await getConfig();
  if (!cfg.enabled) return { created: 0 };
  const now = new Date();
  const thisMonth = periodOf(now);
  const startD = new Date(cfg.start + 'T00:00:00');
  let cur = new Date(startD.getFullYear(), startD.getMonth(), 1);
  const periods = [];
  while (periodOf(cur) < thisMonth && periods.length < 24) {
    periods.push(periodOf(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  let created = 0;
  const stores = await db('stores').select('*');
  for (const period of periods) {
    for (const store of stores) {
      if (await db('invoices').where({ store_id: store.id, period }).first()) continue;
      const rows = await billableOrders(cfg, store, period).select('o.id', 'o.subtotal', 'o.discount');
      if (!rows.length) continue;
      const base = rows.reduce((a, r) => a + Math.max(0, r.subtotal - r.discount), 0);
      const amount = Math.round(base * cfg.pct / 100);
      if (amount <= 0) continue;
      const t = new Date();
      const due = new Date(Date.now() + cfg.dueDays * DAY);
      let id;
      await db.transaction(async (trx) => {
        const ins = await trx('invoices').insert({
          store_id: store.id, period, order_count: rows.length, base_total: base, pct: cfg.pct, amount,
          status: 'unpaid', due_at: due, created_at: t, updated_at: t,
        });
        id = Array.isArray(ins) ? ins[0] : ins;
        await trx('orders').whereIn('id', rows.map((r) => r.id)).update({ invoice_id: id });
      });
      created++;
      notify.notifyStore(store.id, {
        title: 'Tagihan komisi ' + monthLabel(period),
        text: 'Tagihan Rp' + amount.toLocaleString('id-ID') + ' untuk ' + rows.length + ' pesanan selesai. Jatuh tempo ' + due.toLocaleDateString('id-ID') + '.',
        path: '/merchant/tagihan/' + id,
      });
    }
  }
  return { created };
}

// Pengingat otomatis untuk tagihan lewat jatuh tempo (paling sering tiap 3 hari)
async function remindOverdue() {
  const now = Date.now();
  const rows = await db('invoices').where({ status: 'unpaid' }).where('due_at', '<', new Date(now));
  let n = 0;
  for (const inv of rows) {
    if (inv.reminded_at && now - new Date(inv.reminded_at).getTime() < 3 * DAY) continue;
    await remind(inv);
    n++;
  }
  return n;
}

async function remind(inv) {
  await db('invoices').where({ id: inv.id }).update({ reminded_at: new Date() });
  notify.notifyStore(inv.store_id, {
    title: 'Pengingat tagihan komisi',
    text: 'Tagihan ' + monthLabel(inv.period) + ' sebesar Rp' + inv.amount.toLocaleString('id-ID') + ' belum dibayar.',
    path: '/merchant/tagihan/' + inv.id,
  });
}

// Perkiraan komisi bulan berjalan (belum jadi tagihan)
async function currentEstimate(cfg, store) {
  if (!cfg.enabled) return { count: 0, base: 0, amount: 0 };
  const rows = await billableOrders(cfg, store, periodOf(new Date())).select('o.subtotal', 'o.discount');
  const base = rows.reduce((a, r) => a + Math.max(0, r.subtotal - r.discount), 0);
  return { count: rows.length, base, amount: Math.round(base * cfg.pct / 100) };
}

function startBilling(onError) {
  if (process.env.AUTO_BILLING === '0') return;
  const tick = async () => {
    try { await generateAll(); await remindOverdue(); } catch (e) { if (onError) onError(e, 'penagihan komisi'); }
  };
  setTimeout(tick, 20000).unref();
  setInterval(tick, 3600 * 1000).unref();
}

module.exports = { INVOICE_STATUS, monthLabel, periodOf, getConfig, generateAll, remindOverdue, remind, currentEstimate, startBilling };
