// Pengaturan sederhana (kunci dan nilai) yang disimpan di database, dipakai misalnya untuk centang daftar legalitas.
const db = require('./db');

async function getAll() {
  const rows = await db('settings').select('key', 'value');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function get(key, fallback = '') {
  const r = await db('settings').where({ key }).first();
  return r ? r.value : fallback;
}

async function set(key, value) {
  await db('settings').where({ key }).del();
  await db('settings').insert({ key, value: String(value), updated_at: new Date() });
}

module.exports = { getAll, get, set };
