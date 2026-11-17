const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../lib/db');
const { asyncRouter } = require('../middleware/common');
const { isEmail, normalizePhone, slugify, greeting, toDate } = require('../lib/helpers');
const { notifyAdmin } = require('../lib/notify');

const router = asyncRouter();
const DUMMY_HASH = bcrypt.hashSync('tidak-dipakai-untuk-apa-apa', 10);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.');
    res.redirect(303, req.path);
  },
});

const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)[^\\]*$/.test(n) ? n : null);
const home = (role) => (role === 'admin' ? '/admin' : role === 'merchant' ? '/merchant' : '/');

function startSession(req, uid) {
  req.session = { uid, csrf: crypto.randomBytes(24).toString('hex') };
}

router.get('/masuk', (req, res) => {
  if (req.user) return res.redirect(home(req.user.role));
  res.render('auth/login', { layout: 'layouts/auth', title: 'Masuk', greeting: greeting(), next: safeNext(req.query.next) || '', form: {} });
});

router.post('/masuk', limiter, async (req, res) => {
  const idf = String(req.body.identifier || '').trim();
  const password = String(req.body.password || '');
  const next = safeNext(req.body.next);
  let user = null;
  if (idf) {
    if (idf.includes('@')) user = await db('users').where({ email: idf.toLowerCase() }).first();
    else {
      const ph = normalizePhone(idf);
      if (ph) user = await db('users').where({ phone: ph }).first();
    }
  }
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    return res.status(401).render('auth/login', { layout: 'layouts/auth', title: 'Masuk', greeting: greeting(), next: next || '', form: { identifier: idf }, error: 'Email, nomor telepon, atau password tidak cocok. Periksa lagi, atau buat akun kalau belum punya.' });
  }
  if (!user.is_active) {
    return res.status(403).render('auth/login', { layout: 'layouts/auth', title: 'Masuk', greeting: greeting(), next: next || '', form: { identifier: idf }, error: 'Akun ini dinonaktifkan. Hubungi admin Sandyakala Rasa.' });
  }
  startSession(req, user.id);
  res.redirect(user.role === 'customer' && next ? next : home(user.role));
});

router.get('/daftar', (req, res) => {
  if (req.user) return res.redirect(home(req.user.role));
  res.render('auth/register', { layout: 'layouts/auth', title: 'Daftar', form: { role: req.query.sebagai === 'merchant' ? 'merchant' : 'customer' }, errors: {} });
});

router.post('/daftar', limiter, async (req, res) => {
  const f = {
    name: String(req.body.name || '').trim(),
    identifier: String(req.body.identifier || '').trim(),
    role: req.body.role === 'merchant' ? 'merchant' : 'customer', // admin TIDAK bisa dipilih lewat pendaftaran publik
    store_name: String(req.body.store_name || '').trim(),
  };
  const password = String(req.body.password || '');
  const confirm = String(req.body.password_confirmation || '');
  const errors = {};

  if (f.name.length < 2 || f.name.length > 100) errors.name = 'Isi nama lengkap, 2 sampai 100 karakter.';
  let email = null;
  let phone = null;
  if (f.identifier.includes('@')) {
    email = f.identifier.toLowerCase();
    if (!isEmail(email)) errors.identifier = 'Format email belum benar. Contoh: nama@email.com.';
  } else {
    phone = normalizePhone(f.identifier);
    if (!phone) errors.identifier = 'Isi email yang valid atau nomor telepon, misalnya 0812 3456 7890.';
  }
  if (password.length < 8) errors.password = 'Password minimal 8 karakter.';
  else if (password.length > 72) errors.password = 'Password maksimal 72 karakter.';
  if (password !== confirm) errors.password_confirmation = 'Password belum sama dengan yang di atas.';
  if (f.role === 'merchant' && (f.store_name.length < 3 || f.store_name.length > 100)) errors.store_name = 'Nama toko harus 3 sampai 100 karakter.';

  if (!errors.identifier && !Object.keys(errors).length) {
    const dup = await db('users').where((q) => (email ? q.where({ email }) : q.where({ phone }))).first();
    if (dup) errors.identifier = email ? 'Email ini sudah terdaftar. Silakan masuk.' : 'Nomor telepon ini sudah terdaftar. Silakan masuk.';
  }
  if (Object.keys(errors).length) {
    return res.status(422).render('auth/register', { layout: 'layouts/auth', title: 'Daftar', form: f, errors });
  }

  const now = new Date();
  const hash = await bcrypt.hash(password, 10);
  const uid = await db.transaction(async (trx) => {
    const [id] = await trx('users').insert({ name: f.name, email, phone, password_hash: hash, role: f.role, is_active: true, created_at: now, updated_at: now });
    if (f.role === 'merchant') {
      let slug = slugify(f.store_name);
      if (await trx('stores').where({ slug }).first()) slug += '-' + crypto.randomBytes(2).toString('hex');
      await trx('stores').insert({ user_id: id, name: f.store_name, slug, status: 'pending', qris_status: 'none', created_at: now, updated_at: now });
    }
    return id;
  });
  if (f.role === 'merchant') notifyAdmin({ title: 'Toko baru mendaftar', text: '"' + f.store_name + '" oleh ' + f.name + ' menunggu verifikasi.', path: '/admin/toko?status=pending' });
  startSession(req, uid);
  req.flash('success', f.role === 'merchant' ? 'Akun dibuat! Lengkapi profil toko dan QRIS-mu, lalu tunggu verifikasi admin.' : 'Selamat datang di Sandyakala Rasa!');
  res.redirect(home(f.role));
});

// ---- Atur ulang password lewat tautan dari admin ----
async function findReset(token) {
  const hash = crypto.createHash('sha256').update(String(token || '')).digest('hex');
  const r = await db('password_resets').where({ token_hash: hash }).first();
  if (!r || r.used_at || toDate(r.expires_at) < new Date()) return null;
  const user = await db('users').where({ id: r.user_id }).first();
  if (!user || user.role === 'admin') return null;
  return { r, user };
}

router.get('/atur-ulang/:token', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const found = await findReset(req.params.token);
  if (!found) return res.status(410).render('auth/reset-invalid', { layout: 'layouts/auth', title: 'Tautan tidak berlaku' });
  res.render('auth/reset', { layout: 'layouts/auth', title: 'Atur ulang password', who: found.user.name.split(' ')[0], errors: {} });
});

router.post('/atur-ulang/:token', limiter, async (req, res) => {
  const found = await findReset(req.params.token);
  if (!found) return res.status(410).render('auth/reset-invalid', { layout: 'layouts/auth', title: 'Tautan tidak berlaku' });
  const pw = String(req.body.password || '');
  const confirm = String(req.body.password_confirmation || '');
  const errors = {};
  if (pw.length < 8) errors.password = 'Password minimal 8 karakter.';
  else if (pw.length > 72) errors.password = 'Password maksimal 72 karakter.';
  if (pw !== confirm) errors.password_confirmation = 'Password belum sama dengan yang di atas.';
  if (Object.keys(errors).length) return res.status(422).render('auth/reset', { layout: 'layouts/auth', title: 'Atur ulang password', who: found.user.name.split(' ')[0], errors });
  const hash = await bcrypt.hash(pw, 10);
  await db.transaction(async (trx) => {
    await trx('users').where({ id: found.user.id }).update({ password_hash: hash, updated_at: new Date() });
    await trx('password_resets').where({ user_id: found.user.id }).del(); // tautan hanya sekali pakai
  });
  req.flash('success', 'Password sudah diganti. Silakan masuk dengan password baru.');
  res.redirect(303, '/masuk');
});

// Akhiri mode uji: kembali ke akun admin. Hanya bisa dipakai kalau sesi memang dimulai oleh admin.
router.post('/akhiri-uji', (req, res) => {
  if (req.session && req.session.adm) {
    req.session.uid = req.session.adm;
    delete req.session.adm;
    req.flash('success', 'Kembali ke akun admin.');
    return res.redirect(303, '/admin/pengguna');
  }
  res.redirect(303, '/');
});

router.post('/keluar', (req, res) => {
  req.session = null;
  res.redirect('/');
});

module.exports = router;
