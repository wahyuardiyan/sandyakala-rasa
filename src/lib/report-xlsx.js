// Laporan penjualan penjual dalam bentuk Excel (.xlsx) berlogo Sandyakala Rasa.
const fs = require('fs');
const path = require('path');
const { build, STYLE: S } = require('./xlsx');

let logoCache = null;
function logo() {
  if (logoCache === null) {
    try { logoCache = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'img', 'logo-lockup.png')); } catch (e) { logoCache = false; }
  }
  return logoCache || null;
}

const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

/**
 * data: { storeName, rangeDays, from, to, madeAt (teks), orders: [{ code, date, customer, menu, subtotal, delivery, discount, voucher, total, fulfillment }], top: [{ name, qty, revenue }] }
 */
function buildReport(data) {
  const orders = data.orders || [];
  const top = data.top || [];
  const total = sum(orders, 'total');
  const avg = orders.length ? Math.round(total / orders.length) : 0;
  const lg = logo();
  const HEAD = 11; // baris judul tabel (1-based)
  const first = HEAD + 1;
  const last = HEAD + orders.length;

  const rows = [];
  const R = (cells, h) => rows.push({ cells, h });
  R([{ c: 2, v: 'Laporan Penjualan', s: S.title }], 30);
  R([{ c: 2, v: data.storeName, s: S.subtitle }], 22);
  R([{ c: 2, v: 'Periode: ' + data.from + ' sampai ' + data.to + ' (' + data.rangeDays + ' hari)', s: S.muted }], 20);
  R([{ c: 2, v: 'Dibuat: ' + data.madeAt, s: S.muted }], 20);
  R([{ c: 2, v: 'Hanya pesanan yang pembayarannya sudah dikonfirmasi. · Dibuat lewat Sandyakala Rasa', s: S.muted }], 20);
  R([], 14);
  R([{ c: 0, v: 'Pendapatan', s: S.label }, { c: 1, s: S.label }, { c: 2, v: total, s: S.bigMoney }], 26);
  R([{ c: 0, v: 'Jumlah pesanan', s: S.label }, { c: 1, s: S.label }, { c: 2, v: orders.length, s: S.bigInt }], 26);
  R([{ c: 0, v: 'Rata-rata per pesanan', s: S.label }, { c: 1, s: S.label }, { c: 2, v: avg, s: S.bigMoney }], 26);
  R([], 14);
  const heads = ['Kode', 'Tanggal', 'Pelanggan', 'Menu', 'Subtotal', 'Ongkir', 'Diskon', 'Voucher', 'Total', 'Antar atau ambil'];
  R(heads.map((v, c) => ({ c, v, s: S.header })), 26);
  for (const o of orders) {
    R([
      { c: 0, v: o.code, s: S.cell }, { c: 1, v: o.date, s: S.cell }, { c: 2, v: o.customer, s: S.cell }, { c: 3, v: o.menu, s: S.cell },
      { c: 4, v: o.subtotal, s: S.money }, { c: 5, v: o.delivery, s: S.money }, { c: 6, v: o.discount, s: S.money },
      { c: 7, v: o.voucher || '', s: S.cell }, { c: 8, v: o.total, s: S.money }, { c: 9, v: o.fulfillment, s: S.cell },
    ]);
  }
  if (orders.length) {
    const f = (col) => ({ c: col.i, f: `SUM(${col.l}${first}:${col.l}${last})`, v: sum(orders, col.k), s: S.totalMoney });
    R([
      { c: 0, v: 'Total', s: S.totalLabel }, { c: 1, s: S.totalLabel }, { c: 2, s: S.totalLabel }, { c: 3, s: S.totalLabel },
      f({ i: 4, l: 'E', k: 'subtotal' }), f({ i: 5, l: 'F', k: 'delivery' }), f({ i: 6, l: 'G', k: 'discount' }),
      { c: 7, s: S.totalLabel }, f({ i: 8, l: 'I', k: 'total' }), { c: 9, s: S.totalLabel },
    ], 24);
  } else {
    R([{ c: 0, v: 'Belum ada pesanan pada periode ini.', s: S.muted }]);
  }

  const sheet1 = {
    name: 'Laporan',
    cols: [14, 13, 24, 46, 15, 14, 14, 14, 16, 18],
    rows,
    merges: ['A7:B7', 'A8:B8', 'A9:B9'],
    landscape: true,
  };
  if (lg) sheet1.logo = { data: lg, widthPx: 150 };
  // Ruang logo: baris 1-5 sudah cukup tinggi untuk logo 150 piksel lebar

  const rows2 = [];
  rows2.push({ cells: [{ c: 0, v: 'Menu terlaris', s: S.title }], h: 30 });
  rows2.push({ cells: [{ c: 0, v: data.storeName + ' · ' + data.from + ' sampai ' + data.to, s: S.muted }], h: 20 });
  rows2.push({ cells: [], h: 10 });
  rows2.push({ cells: ['Menu', 'Terjual', 'Pendapatan'].map((v, c) => ({ c, v, s: S.header })), h: 26 });
  for (const t of top) rows2.push({ cells: [{ c: 0, v: t.name, s: S.cell }, { c: 1, v: Number(t.qty) || 0, s: S.int }, { c: 2, v: Number(t.revenue) || 0, s: S.money }] });
  if (!top.length) rows2.push({ cells: [{ c: 0, v: 'Belum ada data.', s: S.muted }] });
  const sheet2 = { name: 'Menu terlaris', cols: [46, 12, 18], rows: rows2 };

  return build([sheet1, sheet2]);
}

module.exports = { buildReport };
