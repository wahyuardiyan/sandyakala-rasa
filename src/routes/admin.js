const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../lib/db');
const { asyncRouter, requireRole } = require('../middleware/common');
const { readRecent } = require('../lib/logger');
const fs = require('fs');
const path = require('path');
const { listBackups, backupDir } = require('../lib/backup');
const settings = require('../lib/settings');
const billing = require('../lib/billing');
const { saveImage, removeUpload } = require('../lib/upload');
const { getOrderFull } = require('../lib/queries');
const { cancelOrder } = require('../lib/orders');
const { notifyStore, notifyUser } = require('../lib/notify');
const { slugify, monthKey, barChart, UserError, greeting } = require('../lib/helpers');

const router = asyncRouter();
router.use(requireRole('admin'));
router.use((req, res, next) => {
  res.locals.layout = 'layouts/dashboard';
  res.locals.area = 'admin';
  next();
});

router.get('/', async (req, res) => {
  const c = async (q) => Number((await q.count({ n: '*' }).first()).n);
  const stats = {
    users: await c(db('users').where({ role: 'customer' })),
    stores: await c(db('stores')),
    approved: await c(db('stores').where({ status: 'approved' })),
    pending: await c(db('stores').where({ status: 'pending' })),
    qrisPending: await c(db('stores').where({ qris_status: 'pending' })),
    orders: await c(db('orders')),
  };
  const gmvRow = await db('orders as o').join('payments as p', 'p.order_id', 'o.id').where('p.status', 'confirmed').whereNot('o.status', 'cancelled').sum({ s: 'o.total' }).first();
  stats.gmv = Number((gmvRow && gmvRow.s) || 0);

  // jumlah pesanan 6 bulan terakhir
  const months = [];
  const base = new Date();
  for (let i = 5; i >= 0; i--) months.push(monthKey(new Date(base.getFullYear(), base.getMonth() - i, 15)));
  const since = new Date(base.getFullYear(), base.getMonth() - 6, 1);
  const rows = await db('orders').where('created_at', '>=', since).select('created_at');
  const counts = Object.fromEntries(months.map((m) => [m, 0]));
  for (const r of rows) {
    const k = monthKey(r.created_at);
    if (k in counts) counts[k] += 1;
  }
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const chart = barChart(months.map((m) => ({ label: names[Number(m.slice(5)) - 1], value: counts[m] })));
  const newest = await db('stores as s').join('users as u', 'u.id', 's.user_id').select('s.*', 'u.name as owner_name').orderBy('s.id', 'desc').limit(6);
  res.render('admin/dashboard', { title: 'Ringkasan', greet: greeting(), stats, chart, newest });
});

router.get('/toko', async (req, res) => {
  const f = ['pending', 'approved', 'suspended', 'rejected', 'qris'].includes(req.query.status) ? req.query.status : '';
  const qb = db('stores as s').join('users as u', 'u.id', 's.user_id').select('s.*', 'u.name as owner_name', 'u.email as owner_email', 'u.phone as owner_phone').orderBy('s.id', 'desc');
  if (f === 'qris') qb.where('s.qris_status', 'pending');
  else if (f) qb.where('s.status', f);
  res.render('admin/stores', { title: 'Kelola Toko', stores: await qb, f });
});

router.get('/toko/:id', async (req, res) => {
  const shop = await db('stores as s').join('users as u', 'u.id', 's.user_id').where('s.id', req.params.id).select('s.*', 'u.name as owner_name', 'u.email as owner_email', 'u.phone as owner_phone').first();
  if (!shop) return res.status(404).render('errors/error', { code: 404, message: 'Toko tidak ditemukan.', layout: 'layouts/main' });
  const menuCount = await db('products').where({ store_id: shop.id }).count({ n: '*' }).first();
  res.render('admin/store', { title: shop.name, shop, menuCount: Number(menuCount.n) });
});

router.post('/toko/:id/status', async (req, res) => {
  const shop = await db('stores').where({ id: req.params.id }).first();
  if (!shop) return res.status(404).render('errors/error', { code: 404, message: 'Toko tidak ditemukan.', layout: 'layouts/main' });
  const to = String(req.body.status || '');
  if (!['approved', 'suspended', 'rejected', 'pending'].includes(to)) {
    req.flash('error', 'Status tidak valid.');
    return res.redirect(303, '/admin/toko/' + shop.id);
  }
  if (to === 'approved' && !shop.whatsapp) {
    req.flash('error', 'Toko belum mengisi nomor WhatsApp, jadi belum bisa disetujui. Minta penjual melengkapinya di Pengaturan toko.');
    return res.redirect(303, '/admin/toko/' + shop.id);
  }
  const upd = { status: to, updated_at: new Date() };
  if (to === 'approved' && shop.qris_image && shop.qris_status === 'pending') upd.qris_status = 'approved';
  await db('stores').where({ id: shop.id }).update(upd);
  req.flash('success', 'Status toko diperbarui.');
  res.redirect(303, '/admin/toko/' + shop.id);
});

router.post('/toko/:id/qris', async (req, res) => {
  const shop = await db('stores').where({ id: req.params.id }).first();
  if (!shop || !shop.qris_image) {
    req.flash('error', 'Toko belum mengunggah QRIS.');
    return res.redirect(303, '/admin/toko');
  }
  const ok = req.body.decision === 'approve';
  await db('stores').where({ id: shop.id }).update({ qris_status: ok ? 'approved' : 'none', updated_at: new Date() });
  req.flash('success', ok ? 'QRIS disetujui.' : 'QRIS ditolak. Merchant perlu mengunggah ulang.');
  res.redirect(303, '/admin/toko/' + shop.id);
});

router.get('/pengguna', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const qb = db('users').orderBy('id', 'desc').limit(200);
  if (q) {
    const like = `%${q.replace(/[%_]/g, '')}%`;
    qb.where((w) => w.where('name', 'like', like).orWhere('email', 'like', like).orWhere('phone', 'like', like));
  }
  res.render('admin/users', { title: 'Kelola Pengguna', users: await qb, q });
});

router.post('/pengguna/:id/aktif', async (req, res) => {
  const u = await db('users').where({ id: req.params.id }).first();
  if (!u) {
    req.flash('error', 'Pengguna tidak ditemukan.');
  } else if (u.id === req.user.id || u.role === 'admin') {
    req.flash('error', 'Akun admin tidak bisa dinonaktifkan dari sini.');
  } else {
    await db('users').where({ id: u.id }).update({ is_active: u.is_active ? 0 : 1, updated_at: new Date() });
    req.flash('success', u.is_active ? 'Akun dinonaktifkan.' : 'Akun diaktifkan lagi.');
  }
  res.redirect(303, '/admin/pengguna');
});

// Tautan atur ulang password. Admin membuatnya lalu mengirimkannya ke pemilik akun (misalnya lewat WhatsApp).
// Yang disimpan di database hanya sidik jarinya (hash), jadi tautan tidak bisa dibaca ulang. Berlaku 1 jam, sekali pakai.
router.post('/pengguna/:id/atur-ulang', async (req, res) => {
  const u = await db('users').where({ id: req.params.id }).first();
  if (!u || u.role === 'admin') {
    req.flash('error', 'Akun tidak ditemukan, atau akun admin (atur ulang lewat npm run create-admin).');
    return res.redirect(303, '/admin/pengguna');
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  await db.transaction(async (trx) => {
    await trx('password_resets').where({ user_id: u.id }).del();
    await trx('password_resets').insert({ user_id: u.id, token_hash: crypto.createHash('sha256').update(token).digest('hex'), expires_at: expires, created_at: new Date() });
  });
  const base = (process.env.APP_URL || req.protocol + '://' + req.get('host')).replace(/\/$/, '');
  res.set('Cache-Control', 'no-store');
  res.render('admin/reset-link', { title: 'Tautan atur ulang password', target: u, link: base + '/atur-ulang/' + token, expires });
});

// Mode uji: admin masuk sebagai pelanggan atau penjual untuk mencoba alurnya.
router.post('/pengguna/:id/masuk-sebagai', async (req, res) => {
  const u = await db('users').where({ id: req.params.id }).first();
  if (!u || u.role === 'admin' || !u.is_active) {
    req.flash('error', 'Akun ini tidak bisa dimasuki: tidak ditemukan, nonaktif, atau sesama admin.');
    return res.redirect(303, '/admin/pengguna');
  }
  req.session.adm = req.user.id;
  req.session.uid = u.id;
  req.flash('success', 'Mode uji: kamu sekarang melihat sebagai ' + u.name + '.');
  res.redirect(303, u.role === 'merchant' ? '/merchant' : '/');
});

// Membuat satu pelanggan uji dan satu penjual uji. Passwordnya acak dan tidak ditampilkan,
// jadi akun ini hanya bisa dimasuki lewat tombol "Masuk sebagai" oleh admin.
router.post('/pengguna/akun-uji', async (req, res) => {
  const now = new Date();
  const made = [];
  await db.transaction(async (trx) => {
    const mk = async (name, email, role) => {
      if (await trx('users').where({ email }).first()) return null;
      const hash = await bcrypt.hash(crypto.randomBytes(18).toString('hex'), 10);
      const [id] = await trx('users').insert({ name, email, password_hash: hash, role, is_active: true, created_at: now, updated_at: now });
      return id;
    };
    const cid = await mk('Pelanggan Uji', 'uji.pelanggan@sandyakala.test', 'customer');
    if (cid) made.push('pelanggan');
    const mid = await mk('Penjual Uji', 'uji.penjual@sandyakala.test', 'merchant');
    if (mid) {
      made.push('penjual');
      await trx('stores').insert({ user_id: mid, name: 'Warung Uji', slug: 'warung-uji-' + crypto.randomBytes(2).toString('hex'), status: 'pending', qris_status: 'none', created_at: now, updated_at: now });
    }
  });
  req.flash(made.length ? 'success' : 'error', made.length ? 'Akun uji dibuat: ' + made.join(' dan ') + '. Pakai tombol "Masuk sebagai".' : 'Akun uji sudah ada.');
  res.redirect(303, '/admin/pengguna');
});

router.get('/kategori', async (req, res) => {
  const cats = await db('categories as c').select('c.*', db.raw('(select count(*) from stores s where s.category_id = c.id) as store_count'), db.raw('(select count(*) from products p where p.category_id = c.id) as product_count')).orderBy('c.sort');
  res.render('admin/categories', { title: 'Kategori', cats });
});

router.post('/kategori', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const emoji = String(req.body.emoji || '').trim().slice(0, 8) || null;
  if (name.length < 2 || name.length > 60) {
    req.flash('error', 'Nama kategori harus 2 sampai 60 karakter.');
    return res.redirect(303, '/admin/kategori');
  }
  let slug = slugify(name);
  if (await db('categories').where({ slug }).first()) {
    req.flash('error', 'Kategori dengan nama itu sudah ada.');
    return res.redirect(303, '/admin/kategori');
  }
  const max = await db('categories').max({ m: 'sort' }).first();
  await db('categories').insert({ name, slug, emoji, sort: Number((max && max.m) || 0) + 1 });
  req.flash('success', 'Kategori ditambahkan.');
  res.redirect(303, '/admin/kategori');
});

router.post('/kategori/:id/hapus', async (req, res) => {
  const used = await db('stores').where({ category_id: req.params.id }).count({ n: '*' }).first();
  const usedP = await db('products').where({ category_id: req.params.id }).count({ n: '*' }).first();
  if (Number(used.n) + Number(usedP.n) > 0) req.flash('error', 'Kategori masih dipakai toko atau menu, jadi tidak bisa dihapus.');
  else {
    await db('categories').where({ id: req.params.id }).del();
    req.flash('success', 'Kategori dihapus.');
  }
  res.redirect(303, '/admin/kategori');
});

// ---------------- Ulasan ----------------
router.get('/ulasan', async (req, res) => {
  const f = ['tampil', 'sembunyi', 'rendah', 'dilaporkan'].includes(req.query.tampil) ? req.query.tampil : '';
  const q = String(req.query.q || '').trim().slice(0, 80);
  const qb = db('reviews as r').join('users as u', 'u.id', 'r.user_id').join('stores as s', 's.id', 'r.store_id').join('orders as o', 'o.id', 'r.order_id')
    .select('r.*', 'u.name as user_name', 's.name as store_name', 's.slug as store_slug', 'o.code as order_code').orderBy('r.id', 'desc').limit(100);
  if (f === 'tampil') qb.where('r.hidden', 0);
  else if (f === 'sembunyi') qb.where('r.hidden', 1);
  else if (f === 'rendah') qb.where('r.rating', '<=', 2);
  else if (f === 'dilaporkan') qb.whereNotNull('r.report_reason').where('r.hidden', 0);
  if (q) qb.where((w) => w.where('s.name', 'like', '%' + q + '%').orWhere('r.comment', 'like', '%' + q + '%').orWhere('u.name', 'like', '%' + q + '%'));
  res.render('admin/reviews', { title: 'Ulasan', reviews: await qb, f, q });
});

router.post('/ulasan/:id/sembunyikan', async (req, res) => {
  const rv = await db('reviews').where({ id: req.params.id }).first();
  if (!rv) return res.status(404).render('errors/error', { code: 404, message: 'Ulasan tidak ditemukan.', layout: 'layouts/main' });
  const hide = req.body.hide === '1';
  const reason = String(req.body.reason || '').trim().slice(0, 200) || null;
  await db('reviews').where({ id: rv.id }).update({ hidden: hide ? 1 : 0, hidden_reason: hide ? reason : null });
  if (hide) notifyStore(rv.store_id, { title: 'Ulasan disembunyikan admin', text: reason || 'Ulasan melanggar aturan komunitas.', path: '/merchant/ulasan' });
  req.flash('success', hide ? 'Ulasan disembunyikan. Tidak tampil di toko dan tidak dihitung dalam rating.' : 'Ulasan ditampilkan lagi.');
  res.redirect(303, req.get('referer') && req.get('referer').includes('/admin/ulasan') ? req.get('referer').replace(/^https?:\/\/[^/]+/, '') : '/admin/ulasan');
});

// ---------------- Semua pesanan ----------------
router.get('/pesanan', async (req, res) => {
  const status = ['pending_payment', 'processing', 'delivering', 'completed', 'cancelled', 'claimed'].includes(req.query.status) ? req.query.status : '';
  const q = String(req.query.q || '').trim().slice(0, 80);
  const page = Math.max(1, parseInt(req.query.hal, 10) || 1);
  const per = 25;
  const base = () => {
    const qb = db('orders as o').join('stores as s', 's.id', 'o.store_id').join('payments as p', 'p.order_id', 'o.id');
    if (status === 'claimed') qb.where('o.status', 'pending_payment').where('p.status', 'claimed');
    else if (status) qb.where('o.status', status);
    if (q) qb.where((w) => w.where('o.code', 'like', '%' + q + '%').orWhere('o.customer_name', 'like', '%' + q + '%').orWhere('o.customer_phone', 'like', '%' + q + '%').orWhere('s.name', 'like', '%' + q + '%'));
    return qb;
  };
  const total = Number((await base().count({ n: '*' }).first()).n);
  const orders = await base().select('o.*', 's.name as store_name', 'p.status as pay_status').orderBy('o.id', 'desc').limit(per).offset((page - 1) * per);
  res.render('admin/orders', { title: 'Semua Pesanan', orders, status, q, page, pages: Math.max(1, Math.ceil(total / per)), total });
});

router.get('/pesanan/:code', async (req, res) => {
  const order = await getOrderFull({ 'o.code': req.params.code });
  if (!order) return res.status(404).render('errors/error', { code: 404, message: 'Pesanan tidak ditemukan.', layout: 'layouts/main' });
  res.render('admin/order', { title: 'Pesanan ' + order.code, order });
});

router.post('/pesanan/:code/batal', async (req, res) => {
  const order = await getOrderFull({ 'o.code': req.params.code });
  if (!order) return res.status(404).render('errors/error', { code: 404, message: 'Pesanan tidak ditemukan.', layout: 'layouts/main' });
  const reason = String(req.body.reason || '').trim().slice(0, 200);
  if (!reason) { req.flash('error', 'Isi alasan pembatalan.'); return res.redirect(303, '/admin/pesanan/' + order.code); }
  const ok = await cancelOrder(order.id, 'Dibatalkan oleh admin: ' + reason);
  if (ok) {
    notifyUser(order.user_id, { title: 'Pesanan dibatalkan admin', text: 'Pesanan #' + order.code + ': ' + reason, path: '/pesanan/' + order.code });
    notifyStore(order.store_id, { title: 'Pesanan dibatalkan admin', text: 'Pesanan #' + order.code + ': ' + reason, path: '/merchant/pesanan/' + order.code });
  }
  req.flash(ok ? 'success' : 'error', ok ? 'Pesanan dibatalkan.' + (order.pay_status === 'confirmed' ? ' Pembayaran sudah dikonfirmasi: pengembalian dana diurus langsung antara toko dan pelanggan.' : '') : 'Pesanan ini tidak bisa dibatalkan lagi.');
  res.redirect(303, '/admin/pesanan/' + order.code);
});

// ---------------- Catatan error dan cadangan ----------------
router.get('/log', (req, res) => {
  res.render('admin/log', { title: 'Catatan error', text: readRecent(), backups: listBackups().reverse().slice(0, 14).map((n) => {
    let st = { size: 0, mtime: new Date() };
    try { st = fs.statSync(path.join(backupDir(), n)); } catch (_) { /* abaikan */ }
    return { name: n, size: st.size, mtime: st.mtime };
  }) });
});

// ---------------- Legalitas dan uji coba ----------------
const LEGAL_ITEMS = [
  { id: 'nib', title: 'NIB / izin usaha lewat OSS', text: 'PP 80/2019 Pasal 15 mewajibkan pelaku usaha perdagangan lewat sistem elektronik memiliki izin usaha. Daftar di oss.go.id.', link: 'https://oss.go.id' },
  { id: 'pse', title: 'Daftar PSE lingkup privat', text: 'Permenkominfo 10/2021: penyelenggara sistem elektronik privat wajib terdaftar sebelum layanan dipakai publik. Komdigi aktif menegur dan dapat memblokir yang belum terdaftar.', link: 'https://pse.komdigi.go.id' },
  { id: 'npwp', title: 'NPWP dan paham pajak UMKM', text: 'PPh final UMKM 0,5% dari omzet. Wajib pajak orang pribadi tidak dikenai pajak pada omzet sampai Rp500 juta per tahun (PP 55/2022, perubahan terbarunya PP 20/2026). Batas omzet Rp4,8 miliar. Cek aturan terbaru di pajak.go.id atau tanyakan ke KPP.', link: 'https://pajak.go.id' },
  { id: 'pdp', title: 'Patuhi UU Perlindungan Data Pribadi', text: 'UU 27/2022: ada dasar pemrosesan data, hak pengguna, dan kewajiban memberi tahu bila terjadi kebocoran. Pastikan kebijakan privasi sesuai kenyataan.', link: '' },
  { id: 'pp80', title: 'Kewajiban identitas dan kelayakan sistem (PP 80/2019)', text: 'Cantumkan identitas pengelola, syarat, dan cara pengaduan secara jelas. Isi OPERATOR_NAME dan OPERATOR_ADDRESS di .env.', link: '' },
  { id: 'seller', title: 'Ingatkan penjual soal izin produk', text: 'Beri tahu penjual tentang NIB, PIRT untuk makanan olahan kemasan, dan sertifikasi halal bila mengklaim halal.', link: '' },
  { id: 'rek', title: 'Rekening atau QRIS platform untuk komisi', text: 'Disiapkan sebelum sistem tagihan komisi dipakai. Wajib atas nama yang jelas.', link: '' },
  { id: 'kontak', title: 'Kontak admin terisi', text: 'CONTACT_EMAIL dan ADMIN_WA di .env terisi supaya pengguna bisa menghubungi.', link: '' },
  { id: 'backup', title: 'Cadangan disalin ke luar server', text: 'Salin folder backups/ secara berkala ke flashdisk atau penyimpanan awan.', link: '' },
  { id: 'prod', title: 'Pengaturan produksi aman', text: 'HTTPS aktif, NODE_ENV=production, SESSION_SECRET panjang dan acak, APP_URL berisi alamat asli.', link: '' },
];

router.get('/legalitas', async (req, res) => {
  const all = await settings.getAll();
  const items = LEGAL_ITEMS.map((i) => ({ ...i, done: all['legal_' + i.id] === '1' }));
  const operatorEmpty = !(process.env.OPERATOR_NAME || '').trim();
  res.render('admin/legal', { title: 'Legalitas', items, doneCount: items.filter((i) => i.done).length, operatorEmpty });
});

router.post('/legalitas/:id', async (req, res) => {
  const item = LEGAL_ITEMS.find((i) => i.id === req.params.id);
  if (!item) return res.redirect(303, '/admin/legalitas');
  await settings.set('legal_' + item.id, req.body.done === '1' ? '1' : '0');
  res.redirect(303, '/admin/legalitas#' + item.id);
});

router.get('/uji-coba', (req, res) => {
  res.render('admin/trial', { title: 'Uji coba' });
});

// ---------------- Tagihan komisi ----------------
router.get('/tagihan', async (req, res) => {
  const cfg = await billing.getConfig();
  const status = ['unpaid', 'submitted', 'paid', 'waived', 'overdue'].includes(req.query.status) ? req.query.status : '';
  const qb = db('invoices as i').join('stores as s', 's.id', 'i.store_id').select('i.*', 's.name as store_name', 's.status as store_status', 's.whatsapp as store_wa').orderBy('i.id', 'desc').limit(200);
  if (status === 'overdue') qb.where('i.status', 'unpaid').where('i.due_at', '<', new Date());
  else if (status) qb.where('i.status', status);
  const invoices = await qb;
  const sum = async (st) => Number((await db('invoices').where({ status: st }).sum({ n: 'amount' }).first()).n || 0);
  res.render('admin/billing', {
    title: 'Tagihan komisi', cfg, invoices, status, now: new Date(),
    totals: { unpaid: await sum('unpaid'), submitted: await sum('submitted'), paid: await sum('paid') },
    errors: [],
  });
});

router.post('/tagihan/pengaturan', async (req, res) => {
  const b = req.body;
  const pct = parseFloat(String(b.pct || '0').replace(',', '.'));
  const errors = [];
  if (!(pct >= 0 && pct <= 30)) errors.push('Komisi harus antara 0 dan 30 persen.');
  const start = String(b.start || '');
  if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) errors.push('Tanggal mulai tidak valid.');
  const due = parseInt(b.due_days, 10);
  if (!(due >= 1 && due <= 60)) errors.push('Jatuh tempo harus 1 sampai 60 hari.');
  let qris = null;
  if (!errors.length) {
    try { qris = await saveImage(req.files && req.files.qris && req.files.qris[0], 'qris'); } catch (e) { errors.push(e.message); }
  }
  if (errors.length) {
    req.flash('error', errors.join(' '));
    return res.redirect(303, '/admin/tagihan');
  }
  await settings.set('commission_pct', String(pct));
  await settings.set('commission_start', start);
  await settings.set('commission_due_days', String(due));
  await settings.set('platform_bank', String(b.bank || '').slice(0, 300));
  if (qris) {
    removeUpload(await settings.get('platform_qris', ''));
    await settings.set('platform_qris', qris);
  } else if (b.remove_qris === '1') {
    removeUpload(await settings.get('platform_qris', ''));
    await settings.set('platform_qris', '');
  }
  req.flash('success', 'Pengaturan komisi disimpan.');
  res.redirect(303, '/admin/tagihan');
});

router.post('/tagihan/buat', async (req, res) => {
  const cfg = await billing.getConfig();
  if (!cfg.enabled) {
    req.flash('error', 'Isi persen komisi dan tanggal mulai dulu.');
    return res.redirect(303, '/admin/tagihan');
  }
  const r = await billing.generateAll();
  req.flash('success', r.created ? r.created + ' tagihan baru dibuat.' : 'Tidak ada tagihan baru. Tagihan dibuat untuk bulan yang sudah berakhir.');
  res.redirect(303, '/admin/tagihan');
});

router.post('/tagihan/:id/:aksi', async (req, res) => {
  const inv = await db('invoices').where({ id: req.params.id }).first();
  if (!inv) { req.flash('error', 'Tagihan tidak ditemukan.'); return res.redirect(303, '/admin/tagihan'); }
  const now = new Date();
  const aksi = req.params.aksi;
  const label = billing.monthLabel(inv.period);
  if (aksi === 'lunas' && ['unpaid', 'submitted'].includes(inv.status)) {
    await db('invoices').where({ id: inv.id }).update({ status: 'paid', paid_at: now, note: null, updated_at: now });
    notifyStore(inv.store_id, { title: 'Tagihan komisi lunas', text: 'Pembayaran tagihan ' + label + ' sudah kami terima. Terima kasih!', path: '/merchant/tagihan/' + inv.id });
    req.flash('success', 'Ditandai lunas.');
  } else if (aksi === 'tolak' && inv.status === 'submitted') {
    const why = String(req.body.reason || '').trim().slice(0, 200) || 'Bukti pembayaran belum sesuai.';
    await db('invoices').where({ id: inv.id }).update({ status: 'unpaid', note: why, updated_at: now });
    notifyStore(inv.store_id, { title: 'Bukti bayar komisi ditolak', text: why + ' Unggah bukti yang benar.', path: '/merchant/tagihan/' + inv.id });
    req.flash('success', 'Bukti ditolak, penjual diberi tahu.');
  } else if (aksi === 'ingatkan' && ['unpaid', 'submitted'].includes(inv.status)) {
    await billing.remind(inv);
    req.flash('success', 'Pengingat dikirim.');
  } else if (aksi === 'bebaskan' && ['unpaid', 'submitted'].includes(inv.status)) {
    await db('invoices').where({ id: inv.id }).update({ status: 'waived', updated_at: now });
    req.flash('success', 'Tagihan dibebaskan.');
  } else {
    req.flash('error', 'Aksi tidak bisa dilakukan pada tagihan ini.');
  }
  res.redirect(303, '/admin/tagihan' + (req.body.back ? '?status=' + encodeURIComponent(req.body.back) : ''));
});

router.post('/toko/:id/gratis-komisi', async (req, res) => {
  const shop = await db('stores').where({ id: req.params.id }).first();
  if (!shop) return res.redirect(303, '/admin/toko');
  const months = parseInt(req.body.months, 10);
  let until = null;
  if (months > 0 && months <= 36) {
    until = new Date();
    until.setMonth(until.getMonth() + months);
  } else if (req.body.forever === '1') {
    until = new Date(2099, 0, 1);
  }
  await db('stores').where({ id: shop.id }).update({ commission_free_until: until, updated_at: new Date() });
  req.flash('success', until ? 'Komisi toko ini gratis sampai ' + until.toLocaleDateString('id-ID') + '.' : 'Masa gratis komisi dihapus.');
  res.redirect(303, '/admin/toko/' + shop.id);
});

module.exports = router;
