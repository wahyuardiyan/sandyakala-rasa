require('dotenv').config();
const { backupNow, backupDir } = require('../src/lib/backup');

backupNow()
  .then((r) => {
    if (r.skipped) console.log(r.message);
    else console.log('Selesai. Cadangan database: ' + r.file + '\nFolder cadangan: ' + backupDir());
    process.exit(0);
  })
  .catch((e) => {
    console.error('Cadangan gagal:', e.message);
    process.exit(1);
  });
