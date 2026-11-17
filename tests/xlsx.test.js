const test = require('node:test');
const assert = require('node:assert');
const { buildReport } = require('../src/lib/report-xlsx');

test('laporan Excel berisi sheet, logo, dan berkas zip yang sah', () => {
  const buf = buildReport({
    storeName: 'Warung Uji', rangeDays: 7, from: '2026-11-01', to: '2026-11-08', madeAt: 'hari ini',
    orders: [{ code: 'A1', date: '2026-11-08', customer: 'Budi & <Co>', menu: '1x Nasi', subtotal: 10000, delivery: 0, discount: 0, voucher: '', total: 10000, fulfillment: 'Diantar' }],
    top: [{ name: 'Nasi', qty: 1, revenue: 10000 }],
  });
  assert.strictEqual(buf.readUInt32LE(0), 0x04034b50); // tanda zip
  const text = buf.toString('latin1');
  for (const n of ['xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/media/logo.png', 'xl/drawings/drawing1.xml']) assert.ok(text.includes(n), n);
});

test('laporan Excel kosong tetap jadi berkas', () => {
  const buf = buildReport({ storeName: 'Kosong', rangeDays: 30, from: 'a', to: 'b', madeAt: 'c', orders: [], top: [] });
  assert.ok(buf.length > 1000);
});
