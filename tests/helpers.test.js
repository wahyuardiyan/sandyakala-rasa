// Tes dasar fungsi bantu. Jalankan: npm test
const test = require('node:test');
const assert = require('node:assert');
const H = require('../src/lib/helpers');

test('rp memformat rupiah', () => {
  assert.strictEqual(H.rp(41900).replace(/\s/g, ' '), 'Rp 41.900');
  assert.strictEqual(H.rp(0).replace(/\s/g, ' '), 'Rp 0');
});

test('normalizePhone menerima format umum dan menolak yang salah', () => {
  assert.strictEqual(H.normalizePhone('0812 3456 7890'), '081234567890');
  assert.strictEqual(H.normalizePhone('+62 812-3456-7890'), '081234567890');
  assert.ok(!H.normalizePhone('12345'));
  assert.ok(!H.normalizePhone('abc'));
});

test('isEmail', () => {
  assert.ok(H.isEmail('a@b.co'));
  assert.ok(!H.isEmail('a@b'));
  assert.ok(!H.isEmail('tanpa-at.com'));
});

test('slugify membuat alamat aman', () => {
  assert.strictEqual(H.slugify('Warung Nasi Bu Sari!'), 'warung-nasi-bu-sari');
  assert.ok(!/[^a-z0-9-]/.test(H.slugify('Dapur Mama Rina & Co. #1')));
});

test('isOpenNow menangani jam buka biasa', () => {
  const store = { open_time: '00:00', close_time: '23:59', is_accepting: 1 };
  assert.strictEqual(typeof H.isOpenNow(store), 'boolean');
});
