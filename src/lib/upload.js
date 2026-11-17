const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { UserError } = require('./helpers');

// "sharp" dipakai untuk memperkecil foto dan membuang metadata (termasuk lokasi GPS dari kamera).
// Kalau belum terpasang, foto tetap disimpan apa adanya supaya aplikasi tidak berhenti.
let sharp = null;
try {
  sharp = require('sharp');
  // Hemat memori: tanpa cache gambar dan satu utas per proses, supaya server kecil (gratisan) tidak kehabisan RAM.
  sharp.cache(false);
  sharp.concurrency(1);
} catch (e) {
  console.warn('[upload] Paket "sharp" belum terpasang, foto disimpan tanpa diperkecil. Jalankan: npm install');
}

// QRIS tidak boleh diperkecil berlebihan atau diubah ke format berloss, supaya tetap bisa dipindai.
// Foto HD tidak diperbesar dan tidak dipotong sembarangan: ukuran dibatasi agar tetap tajam di layar retina.
//  - menu  : dipotong 4:3 (sama dengan kartu menu), 1600x1200
//  - cover : dipotong 3:1 (sama dengan banner toko), 2400x800
//  - logo  : persegi 640x640
//  - photo : bukti bayar dan lainnya, tidak dipotong
const PRESETS = {
  photo: { w: 1600, h: 1600, fit: 'inside', fmt: 'webp', q: 82 },
  menu: { w: 1600, h: 1200, fit: 'cover', fmt: 'webp', q: 84 },
  logo: { w: 640, h: 640, fit: 'cover', fmt: 'webp', q: 86 },
  cover: { w: 2400, h: 800, fit: 'cover', fmt: 'webp', q: 85 },
  qris: { w: 1400, h: 1400, fit: 'inside', fmt: 'png' },
};
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_JPEG_PIXELS = 120e6; // JPEG dibaca per bagian kecil (shrink-on-load), jadi aman walau resolusinya besar
const MAX_OTHER_PIXELS = 30e6; // PNG/WEBP harus dibuka penuh di memori, jadi dibatasi lebih ketat

// Maksimal 2 gambar diproses bersamaan; sisanya antre. Mencegah lonjakan memori saat banyak yang mengunggah.
let busy = 0;
const waiting = [];
async function slot() {
  if (busy >= 2) await new Promise((r) => waiting.push(r));
  busy++;
}
function release() {
  busy--;
  const next = waiting.shift();
  if (next) next();
}

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 4, fields: 40, fieldSize: 20000 },
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'logo', maxCount: 1 },
  { name: 'cover', maxCount: 1 },
  { name: 'qris', maxCount: 1 },
  { name: 'proof', maxCount: 1 },
]);

// Mengenali jenis gambar dari isi file (bukan dari nama/ekstensi yang bisa dipalsukan)
function detectExt(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return '.webp';
  return null;
}

async function saveImage(file, kind = 'photo') {
  if (!file) return null;
  let ext = detectExt(file.buffer);
  if (!ext) throw new UserError('File harus berupa gambar JPG, PNG, atau WEBP.');
  let data = file.buffer;
  if (sharp) {
    const p = PRESETS[kind] || PRESETS.photo;
    await slot();
    try {
      const meta = await sharp(file.buffer, { limitInputPixels: false }).metadata();
      const pixels = (meta.width || 0) * (meta.height || 0);
      const limit = meta.format === 'jpeg' ? MAX_JPEG_PIXELS : MAX_OTHER_PIXELS;
      if (!pixels || pixels > limit) throw new UserError('Resolusi gambar terlalu besar. Perkecil dulu, misalnya lewat menu "Ubah ukuran" di galeri HP.');
      let pipe = sharp(file.buffer, { limitInputPixels: limit, sequentialRead: true })
        .rotate() // ikuti arah foto dari kamera, lalu metadata (termasuk lokasi GPS) dibuang
        .resize({ width: p.w, height: p.h, fit: p.fit, position: 'attention', withoutEnlargement: true, kernel: 'lanczos3' });
      pipe = p.fmt === 'png' ? pipe.png({ compressionLevel: 9 }) : pipe.webp({ quality: p.q, smartSubsample: true });
      data = await pipe.toBuffer();
      ext = p.fmt === 'png' ? '.png' : '.webp';
    } catch (e) {
      if (e instanceof UserError) throw e;
      throw new UserError('Gambar tidak bisa dibaca. Coba foto yang lain.');
    } finally {
      release();
    }
  }
  const name = crypto.randomBytes(16).toString('hex') + ext;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), data);
  return '/uploads/' + name;
}

function removeUpload(url) {
  if (!url || !String(url).startsWith('/uploads/')) return;
  fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(url))).catch(() => {});
}

// Hanya memproses form multipart; error upload ditampilkan sebagai pesan ramah
function multipart(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  parser(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran file maksimal 10 MB. Coba foto yang lebih kecil.' : 'Upload gagal. Coba lagi dengan file gambar yang lain.';
    req.session.flash = { type: 'error', msg };
    return res.redirect(303, safeBack(req));
  });
}

function safeBack(req, fallback = '/') {
  try {
    const ref = req.get('referer');
    if (!ref) return fallback;
    const u = new URL(ref);
    if (u.host !== req.get('host')) return fallback;
    return u.pathname + u.search;
  } catch (e) {
    return fallback;
  }
}

module.exports = { UPLOAD_DIR, multipart, saveImage, removeUpload, safeBack };
