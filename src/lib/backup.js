// Cadangan database SQLite (dan foto) ke folder backups/.
const fs = require('fs');
const path = require('path');

const isMysql = (process.env.DB_CLIENT || 'sqlite').toLowerCase() === 'mysql';
const dbFile = () => path.resolve(process.env.SQLITE_FILE || path.join(__dirname, '..', '..', 'data', 'sandyakala.sqlite'));
const uploadDir = () => path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'));
const backupDir = () => path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups'));
const KEEP = 14;

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
}

function listBackups() {
  try {
    return fs.readdirSync(backupDir()).filter((f) => /^sandyakala-\d{8}-\d{4}\.sqlite$/.test(f)).sort();
  } catch (_) {
    return [];
  }
}

async function backupNow() {
  if (isMysql) {
    return { skipped: true, message: 'Database MySQL dicadangkan dengan: mysqldump -u USER -p NAMA_DATABASE > cadangan.sql' };
  }
  const Database = require('better-sqlite3');
  fs.mkdirSync(backupDir(), { recursive: true });
  const dest = path.join(backupDir(), 'sandyakala-' + stamp() + '.sqlite');
  const src = new Database(dbFile(), { readonly: true, fileMustExist: true });
  try {
    await src.backup(dest);
  } finally {
    src.close();
  }
  // Foto: hanya salin yang baru (yang sudah ada dilewati).
  try {
    if (fs.existsSync(uploadDir())) {
      fs.cpSync(uploadDir(), path.join(backupDir(), 'uploads'), { recursive: true, force: false, errorOnExist: false });
    }
  } catch (_) { /* foto gagal disalin tidak membatalkan cadangan database */ }
  const all = listBackups();
  for (const f of all.slice(0, Math.max(0, all.length - KEEP))) fs.unlinkSync(path.join(backupDir(), f));
  return { file: dest };
}

// Cadangan otomatis: saat server menyala dan lalu tiap 6 jam, tapi hanya bila cadangan terakhir lebih dari 12 jam.
function startAutoBackup(onError) {
  if (isMysql || process.env.AUTO_BACKUP === '0') return;
  const tick = async () => {
    try {
      const last = listBackups().pop();
      const age = last ? Date.now() - fs.statSync(path.join(backupDir(), last)).mtimeMs : Infinity;
      if (age > 12 * 3600 * 1000) {
        const r = await backupNow();
        console.log('Cadangan database dibuat: ' + r.file);
      }
    } catch (e) {
      if (onError) onError(e, 'auto backup');
    }
  };
  setTimeout(tick, 60 * 1000).unref();
  setInterval(tick, 6 * 3600 * 1000).unref();
}

module.exports = { backupNow, startAutoBackup, backupDir, listBackups };
