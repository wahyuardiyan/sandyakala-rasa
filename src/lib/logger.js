// Catatan error ke berkas logs/error-TANGGAL.log supaya masalah di server bisa dilacak kemudian.
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(process.env.LOG_DIR || path.join(__dirname, '..', '..', 'logs'));
const KEEP_DAYS = 30;

function fileFor(d = new Date()) {
  return path.join(DIR, 'error-' + d.toISOString().slice(0, 10) + '.log');
}

function logError(err, ctx) {
  const text = err && err.stack ? err.stack : String(err);
  console.error('[error]', ctx || '', err && err.message ? err.message : err);
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.appendFileSync(fileFor(), '[' + new Date().toISOString() + '] ' + (ctx ? ctx + '\n' : '') + text + '\n\n');
  } catch (_) { /* gagal menulis log tidak boleh menjatuhkan aplikasi */ }
}

// Hapus log yang lebih tua dari KEEP_DAYS hari.
function pruneOld() {
  try {
    const limit = Date.now() - KEEP_DAYS * 86400000;
    for (const f of fs.readdirSync(DIR)) {
      const p = path.join(DIR, f);
      if (/^error-.*\.log$/.test(f) && fs.statSync(p).mtimeMs < limit) fs.unlinkSync(p);
    }
  } catch (_) { /* folder belum ada */ }
}

// Isi log terbaru (hari terbaru lebih dulu), dibatasi ukurannya.
function readRecent(maxBytes = 60000) {
  let out = '';
  try {
    const files = fs.readdirSync(DIR).filter((f) => /^error-.*\.log$/.test(f)).sort().reverse();
    for (const f of files) {
      const chunk = fs.readFileSync(path.join(DIR, f), 'utf8');
      out += '===== ' + f + ' =====\n' + chunk + '\n';
      if (out.length > maxBytes) break;
    }
  } catch (_) { /* belum ada log */ }
  return out.length > maxBytes ? out.slice(0, maxBytes) + '\n... (dipotong)' : out;
}

module.exports = { logError, pruneOld, readRecent, DIR };
