const db = require('../src/lib/db');
const { createSchema, ensureCategories } = require('../src/lib/schema');

(async () => {
  try {
    console.log('Menyiapkan database...');
    await createSchema(db);
    await ensureCategories(db);
    console.log('Selesai. Database siap dipakai.');
  } catch (e) {
    console.error('GAGAL menyiapkan database:', e.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
