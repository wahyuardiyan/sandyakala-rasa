// Hitung ongkos antar (flat atau per zona) dan potongan voucher. Dipakai checkout dan pembuatan pesanan,
// jadi angka yang dibayar pelanggan selalu dihitung ulang di server, bukan dari browser.
const { dayKey, rp } = require('./helpers');

const MIN_PAY = 1000; // total bayar minimal setelah diskon (QRIS tidak bisa Rp 0)

function describe(v) {
  const base = v.type === 'percent'
    ? 'Diskon ' + v.value + '%' + (v.max_discount ? ' (maksimal ' + rp(v.max_discount) + ')' : '')
    : 'Potongan ' + rp(v.value);
  return base + (v.min_order ? ', belanja minimal ' + rp(v.min_order) : '') + (v.ends_on ? ', sampai ' + v.ends_on : '');
}

// Cek satu voucher untuk pelanggan: kembalikan potongan (rupiah) atau alasan kenapa belum bisa dipakai
async function checkVoucher(conn, store, subtotal, fee, v, userId) {
  if (!v || !v.active) return { discount: 0, error: 'Voucher tidak tersedia.' };
  if (v.ends_on && dayKey(new Date()) > v.ends_on) return { discount: 0, error: 'Voucher sudah berakhir.' };
  if (subtotal < v.min_order) return { discount: 0, error: 'Belanja minimal ' + rp(v.min_order) + '.' };
  const used = Number((await conn('orders').where({ store_id: store.id, voucher_code: v.code }).whereNot('status', 'cancelled').count({ n: '*' }).first()).n);
  if (v.usage_limit && used >= v.usage_limit) return { discount: 0, error: 'Kuota voucher sudah habis.' };
  if (userId) {
    const mine = Number((await conn('orders').where({ store_id: store.id, voucher_code: v.code, user_id: userId }).whereNot('status', 'cancelled').count({ n: '*' }).first()).n);
    if (mine > 0) return { discount: 0, error: 'Sudah pernah kamu pakai.' };
  }
  let d = v.type === 'percent' ? Math.floor((subtotal * v.value) / 100) : v.value;
  if (v.type === 'percent' && v.max_discount) d = Math.min(d, v.max_discount);
  d = Math.max(0, Math.min(d, subtotal + fee - MIN_PAY));
  return { discount: d, error: '' };
}

async function quote(conn, store, subtotal, opts) {
  const o = opts || {};
  const out = { fee: 0, zone: null, zones: [], discount: 0, voucher: null, total: subtotal, error: '', voucherError: '' };
  if (o.fulfillment === 'delivery') {
    out.zones = await conn('store_zones').where({ store_id: store.id }).orderBy('fee').orderBy('id');
    if (out.zones.length) {
      const z = out.zones.find((x) => x.id === Number(o.zoneId));
      if (z) { out.fee = z.fee; out.zone = z; } else out.error = 'Pilih zona antar dulu.';
    } else {
      out.fee = store.delivery_fee;
    }
  }
  const code = String(o.code || '').trim().toUpperCase();
  if (code) {
    const v = await conn('vouchers').where({ store_id: store.id, code }).first();
    if (!v || !v.active) out.voucherError = 'Voucher tidak tersedia.';
    else if (o.userId && !(await conn('voucher_claims').where({ voucher_id: v.id, user_id: o.userId }).first())) {
      out.voucherError = 'Klaim voucher ini dulu di halaman toko atau menu Voucher saya.';
    } else {
      const r = await checkVoucher(conn, store, subtotal, out.fee, v, o.userId);
      if (r.error) out.voucherError = r.error;
      else { out.discount = r.discount; out.voucher = v; }
    }
  }
  out.total = subtotal - out.discount + out.fee;
  return out;
}

module.exports = { quote, checkVoucher, describe, MIN_PAY };
