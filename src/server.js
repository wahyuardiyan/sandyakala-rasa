require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieSession = require('cookie-session');
const expressLayouts = require('express-ejs-layouts');

const db = require('./lib/db');
const { createSchema, ensureCategories } = require('./lib/schema');
const H = require('./lib/helpers');
const { UPLOAD_DIR, multipart } = require('./lib/upload');
const { flash, csrf, loadUser, wrap } = require('./middleware/common');
const { logError, pruneOld } = require('./lib/logger');
const { startAutoBackup } = require('./lib/backup');
const { startBilling } = require('./lib/billing');

const isProd = process.env.NODE_ENV === 'production';
const secret = process.env.SESSION_SECRET || '';
if (secret.length < 32) {
  console.error('SESSION_SECRET belum diatur atau terlalu pendek (minimal 32 karakter). Isi di file .env.');
  process.exit(1);
}

if (isProd && /^ganti-dengan/.test(secret)) {
  console.error('SESSION_SECRET masih memakai contoh bawaan. Ganti dengan teks acak sendiri di .env sebelum production.');
  process.exit(1);
}

if (isProd && !process.env.APP_URL) {
  console.warn('PERINGATAN: APP_URL belum diisi. Tautan dan pratinjau saat dibagikan memakai alamat dari permintaan masuk. Isi dengan alamat situs, misalnya https://namamu.my.id');
}

const app = express();
app.disable('x-powered-by');
if (isProd) app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

app.use(
  helmet({
    referrerPolicy: { policy: 'same-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: isProd ? [] : null,
      },
    },
  })
);

app.get('/sw.js', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.type('application/javascript').sendFile(path.join(__dirname, '..', 'public', 'sw.js'));
});
app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css'), { maxAge: isProd ? '7d' : 0 }));
app.use('/js', express.static(path.join(__dirname, '..', 'public', 'js'), { maxAge: isProd ? '7d' : 0 }));
app.use('/img', express.static(path.join(__dirname, '..', 'public', 'img'), { maxAge: isProd ? '30d' : 0 }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: isProd ? '7d' : 0, index: false, dotfiles: 'deny' }));

app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use(
  cookieSession({
    name: 'sr_session',
    keys: [secret],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
  })
);
app.use((req, res, next) => {
  res.locals.path = req.path;
  res.locals.query = req.query;
  res.locals.baseUrl = (process.env.APP_URL || req.protocol + '://' + req.get('host')).replace(/\/$/, '');
  next();
});

app.get('/healthz', async (req, res) => {
  try { await require('./lib/db').raw('select 1'); res.set('Cache-Control', 'no-store').json({ ok: true }); } catch (e) { res.status(503).json({ ok: false }); }
});
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /admin\nDisallow: /merchant\nDisallow: /keranjang\nDisallow: /checkout\nDisallow: /pesanan\nDisallow: /profil\nDisallow: /atur-ulang\nSitemap: ' + res.locals.baseUrl + '/sitemap.xml\n');
});
app.use(flash);
app.use(wrap(loadUser));
app.use(multipart); // form berisi upload gambar
app.use(csrf);
app.use(wrap(require('./routes/notif').unreadCount));

// Helper yang bisa dipakai di semua tampilan
Object.assign(app.locals, {
  rp: H.rp, fmtDateTime: H.fmtDateTime, fmtDate: H.fmtDate, stars: H.stars, icon: H.icon,
  ORDER_STATUS: H.ORDER_STATUS, PAYMENT_STATUS: H.PAYMENT_STATUS, STORE_STATUS: H.STORE_STATUS, INVOICE_STATUS: require('./lib/billing').INVOICE_STATUS, monthLabel: require('./lib/billing').monthLabel, QRIS_STATUS: H.QRIS_STATUS,
  voucherText: require('./lib/pricing').describe,
  isOpenNow: H.isOpenNow, isAllDay: H.isAllDay, closeText: H.closeText, hoursText: H.hoursText,
  appName: 'Sandyakala Rasa',
  waLink: H.waLink,
  operator: { name: process.env.OPERATOR_NAME || '', address: process.env.OPERATOR_ADDRESS || '' },
  contact: { email: process.env.CONTACT_EMAIL || '', wa: process.env.CONTACT_WA || '' },
});
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/public'));
app.use('/notifikasi', require('./routes/notif'));
app.use('/favorit', require('./routes/favorit'));
app.use('/voucher', require('./routes/voucher'));
app.use('/', require('./routes/cart'));
app.use('/', require('./routes/orders'));
app.use('/merchant', require('./routes/merchant'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('errors/error', { code: 404, message: 'Halaman yang kamu cari tidak ditemukan.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logError(err, req.method + ' ' + req.originalUrl + (req.user ? ' (pengguna ' + req.user.id + ')' : ''));
  if (res.headersSent) return;
  res.status(500).render('errors/error', { code: 500, message: 'Terjadi kesalahan di server. Coba lagi sebentar lagi.', layout: 'layouts/main' });
});

process.on('unhandledRejection', (e) => logError(e, 'unhandledRejection'));
process.on('uncaughtException', (e) => { logError(e, 'uncaughtException'); process.exit(1); });

const port = Number(process.env.PORT || 3000);
(async () => {
  try {
    await createSchema(db); // membuat tabel yang belum ada
    await ensureCategories(db);
  } catch (e) {
    console.error('Tidak bisa terhubung/menyiapkan database:', e.message);
    process.exit(1);
  }
  app.listen(port, () => {
    console.log(`Sandyakala Rasa berjalan di http://localhost:${port}`);
    pruneOld();
    startAutoBackup(logError);
    startBilling(logError);
   
  });
})();
