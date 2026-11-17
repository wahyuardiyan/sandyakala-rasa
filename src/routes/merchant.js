const db = require('../lib/db');
const { asyncRouter, requireRole, loadStore } = require('../middleware/common');
const { getOrderFull, ratingSummary } = require('../lib/queries');
const { cancelOrder, expireStale, PAY_WINDOW_MS } = require('../lib/orders');
const { saveImage, removeUpload } = require('../lib/upload');
const notify = require('../lib/notify');
const billing = require('../lib/billing');
const { UserError, lastDays, dayKey, shortDay, lineChart, normalizePhone, greeting, fmtDateTime } = require('../lib/helpers');
const { buildReport } = require('../lib/report-xlsx');

const router = asyncRouter();
router.use(requireRole('merchant'), loadStore);
router.use((req, res, next) => {
  res.locals.layout = 'layouts/dashboard';
  res.locals.area = 'merchant';
  next();
});

// Jumlah pesanan yang butuh tindakan penjual (klaim bayar belum dicek, atau sudah lunas tapi belum dikirim).
// Dipakai untuk penanda di menu dan untuk pengecekan otomatis di browser.
router.use(async (req, res, next) => {
  const sid = req.store.id;
  const a = await db('orders as o').join('payments as p', 'p.order_id', 'o.id').where('o.store_id', sid)
    .where((w) => w.where((x) => x.where('o.status', 'pending_payment').where('p.status', 'claimed')).orWhere('o.status', 'processing'))
    .count({ n: '*' }).first();
  const l = await db('orders').where({ store_id: sid }).max({ m: 'id' }).first();
  res.locals.attn = Number(a.n);
  res.locals.latestOrderId = Number((l && l.m) || 0);
  next();
});

router.get('/ringkas.json', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ attention: res.locals.attn, latest: res.locals.latestOrderId });
});

// Pendapatan tercatat = pesanan yang pembayarannya sudah dikonfirmasi merchant dan tidak dibatalkan
const revenueOrders = (storeId) =>
  db('orders as o').join('payments as p', 'p.order_id', 'o.id').where('o.store_id', storeId).where('p.status', 'confirmed').whereNot('o.status', 'cancelled');

router.get('/', async (req, res) => {
  await expireStale();
  const sid = req.store.id;
  const days = lastDays(7);
  const since = new Date(Date.now() - 8 * 86400000);
  const rows = await revenueOrders(sid).where('o.created_at', '>=', since).select('o.total', 'o.created_at');
  const byDay = Object.fromEntries(days.map((d) => [d, 0]));
  for (const r of rows) {
    const k = dayKey(r.created_at);
    if (k in byDay) byDay[k] += r.total;
  }
  const chart = lineChart(days.map((d) => ({ label: shortDay(d), value: byDay[d] })), { money: true });
  const totalOrders = await db('orders').where({ store_id: sid }).count({ n: '*' }).first();
  const revenue = await revenueOrders(sid).sum({ s: 'o.total' }).first();
  const activeMenu = await db('products').where({ store_id: sid, is_available: 1 }).count({ n: '*' }).first();
  const waiting = await db('orders as o').join('payments as p', 'p.order_id', 'o.id').where('o.store_id', sid).where('o.status', 'pending_payment').where('p.status', 'claimed').count({ n: '*' }).first();
  const rate = await ratingSummary(sid);
  const unanswered = await db('reviews').where({ store_id: sid, hidden: 0 }).whereNull('reply').count({ n: '*' }).first();
  const recent = await db('orders').where({ store_id: sid }).orderBy('id', 'desc').limit(6);
  for (const o of recent) o.items = await db('order_items').where({ order_id: o.id });
  res.render('merchant/dashboard', {
    title: 'Ringkasan', greet: greeting(), needNotify: notify.pushEnabled() && !(await db('push_subs').where({ user_id: req.user.id }).first()), hideStoreNotice: ['pending', 'approved'].includes(req.store.status), chart,
    stats: { orders: Number(totalOrders.n), revenue: Number((revenue && revenue.s) || 0), menu: Number(activeMenu.n), waiting: Number(waiting.n), rate, unanswered: Number(unanswered.n) },
    recent,
  });
});

// ---------------- Menu ----------------
router.get('/menu', async (req, res) => {
  const products = await db('products as p').leftJoin('categories as c', 'c.id', 'p.category_id').where('p.store_id', req.store.id).select('p.*', 'c.name as category_name').orderBy('p.id', 'desc');
  res.render('merchant/menu', { title: 'Kelola Menu', products });
});

async function productForm(req, res, product, errors, status = 200) {
  const categories = await db('categories').orderBy('sort');
  res.status(status).render('merchant/menu-form', { title: product && product.id ? 'Ubah Menu' : 'Tambah Menu', product: product || {}, categories, errors: errors || [] });
}

router.get('/menu/baru', (req, res) => productForm(req, res, { is_available: 1 }));

function parseProduct(body) {
  const errors = [];
  const name = String(body.name || '').trim();
  const price = Math.round(Number(String(body.price || '').replace(/\D/g, '')));
  const stockRaw = String(body.stock || '').trim();
  let stock = null;
  if (stockRaw !== '') {
    stock = Math.round(Number(stockRaw));
    if (!Number.isFinite(stock) || stock < 0 || stock > 100000) errors.push('Stok harus berupa angka 0 atau lebih (kosongkan bila tidak dibatasi).');
  }
  if (name.length < 2 || name.length > 120) errors.push('Nama menu harus 2 sampai 120 karakter.');
  if (!Number.isFinite(price) || price < 500 || price > 50000000) errors.push('Harga harus antara Rp 500 dan Rp 50.000.000.');
  return { errors, data: { name, price, stock, description: String(body.description || '').trim().slice(0, 500) || null, category_id: parseInt(body.category_id, 10) || null, is_available: body.is_available ? 1 : 0 } };
}

router.post('/menu/baru', async (req, res) => {
  const { errors, data } = parseProduct(req.body);
  let image = null;
  try {
    if (!errors.length) image = await saveImage(req.files && req.files.image && req.files.image[0], 'menu');
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    errors.push(e.message);
  }
  if (errors.length) return productForm(req, res, { ...data, price: data.price || '' }, errors, 422);
  const now = new Date();
  await db('products').insert({ ...data, store_id: req.store.id, image, created_at: now, updated_at: now });
  req.flash('success', 'Menu ditambahkan.');
  res.redirect(303, '/merchant/menu');
});

router.get('/menu/:id/ubah', async (req, res) => {
  const product = await db('products').where({ id: req.params.id, store_id: req.store.id }).first();
  if (!product) return res.status(404).render('errors/error', { code: 404, message: 'Menu tidak ditemukan.', layout: 'layouts/main' });
  productForm(req, res, product);
});

router.post('/menu/:id/ubah', async (req, res) => {
  const product = await db('products').where({ id: req.params.id, store_id: req.store.id }).first();
  if (!product) return res.status(404).render('errors/error', { code: 404, message: 'Menu tidak ditemukan.', layout: 'layouts/main' });
  const { errors, data } = parseProduct(req.body);
  let image = null;
  try {
    if (!errors.length) image = await saveImage(req.files && req.files.image && req.files.image[0], 'menu');
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    errors.push(e.message);
  }
  if (errors.length) return productForm(req, res, { ...product, ...data, price: data.price || '' }, errors, 422);
  const upd = { ...data, updated_at: new Date() };
  if (image) {
    upd.image = image;
    removeUpload(product.image);
  } else if (req.body.remove_image) {
    upd.image = null;
    removeUpload(product.image);
  }
  await db('products').where({ id: product.id }).update(upd);
  req.flash('success', 'Menu diperbarui.');
  res.redirect(303, '/merchant/menu');
});

router.post('/menu/:id/toggle', async (req, res) => {
  const p = await db('products').where({ id: req.params.id, store_id: req.store.id }).first();
  if (p) await db('products').where({ id: p.id }).update({ is_available: p.is_available ? 0 : 1, updated_at: new Date() });
  res.redirect(303, '/merchant/menu');
});

router.post('/menu/:id/hapus', async (req, res) => {
  const p = await db('products').where({ id: req.params.id, store_id: req.store.id }).first();
  if (p) {
    await db('products').where({ id: p.id }).del(); // riwayat pesanan tetap aman karena nama & harga disalin di order_items
    removeUpload(p.image);
    req.flash('success', 'Menu dihapus.');
  }
  res.redirect(303, '/merchant/menu');
});

// ---------------- Pesanan ----------------
const TABS = [
  ['semua', 'Semua'],
  ['perlu', 'Perlu Dikonfirmasi'],
  ['pending_payment', 'Belum Dibayar'],
  ['processing', 'Diproses'],
  ['delivering', 'Dikirim'],
  ['completed', 'Selesai'],
  ['cancelled', 'Dibatalkan'],
];

router.get('/pesanan', async (req, res) => {
  await expireStale();
  const tab = TABS.some((t) => t[0] === req.query.status) ? req.query.status : 'semua';
  const qb = db('orders as o').join('payments as p', 'p.order_id', 'o.id').where('o.store_id', req.store.id).select('o.*', 'p.status as pay_status').orderBy('o.id', 'desc').limit(150);
  if (tab === 'perlu') qb.where('o.status', 'pending_payment').where('p.status', 'claimed');
  else if (tab !== 'semua') qb.where('o.status', tab);
  const orders = await qb;
  for (const o of orders) o.items = await db('order_items').where({ order_id: o.id });
  res.render('merchant/orders', { title: 'Pesanan', orders, tabs: TABS, tab });
});

router.get('/pesanan/:code', async (req, res) => {
  await expireStale();
  const order = await getOrderFull({ 'o.code': req.params.code, 'o.store_id': req.store.id });
  if (!order) return res.status(404).render('errors/error', { code: 404, message: 'Pesanan tidak ditemukan.', layout: 'layouts/main' });
  res.render('merchant/order', { title: 'Pesanan ' + order.code, order });
});

router.get('/pesanan/:code/struk', async (req, res) => {
  const order = await getOrderFull({ 'o.code': req.params.code, 'o.store_id': req.store.id });
  if (!order) return res.status(404).render('errors/error', { code: 404, message: 'Pesanan tidak ditemukan.', layout: 'layouts/main' });
  res.render('merchant/receipt', { layout: false, title: 'Struk ' + order.code, order, shop: req.store });
});

async function ownOrder(req, res) {
  const order = await getOrderFull({ 'o.code': req.params.code, 'o.store_id': req.store.id });
  if (!order) res.status(404).render('errors/error', { code: 404, message: 'Pesanan tidak ditemukan.', layout: 'layouts/main' });
  return order;
}
const back = (res, order, type, msg, req) => {
  req.flash(type, msg);
  res.redirect(303, '/merchant/pesanan/' + order.code);
};

// Merchant memastikan uang sudah masuk lewat aplikasi pembayarannya sendiri, lalu menekan konfirmasi
router.post('/pesanan/:code/konfirmasi', async (req, res) => {
  const order = await ownOrder(req, res);
  if (!order) return;
  if (order.status !== 'pending_payment' || !['unpaid', 'claimed', 'rejected'].includes(order.pay_status)) {
    return back(res, order, 'error', 'Pesanan ini tidak sedang menunggu konfirmasi pembayaran.', req);
  }
  const now = new Date();
  await db.transaction(async (trx) => {
    await trx('payments').where({ order_id: order.id }).update({ status: 'confirmed', confirmed_by: req.user.id, confirmed_at: now, reject_reason: null, updated_at: now });
    await trx('orders').where({ id: order.id }).update({ status: 'processing', expires_at: null, updated_at: now });
  });
  notify.notifyUser(order.user_id, { title: 'Pembayaran dikonfirmasi', text: 'Pesanan #' + order.code + ' di ' + order.store_name + ' sedang disiapkan.', path: '/pesanan/' + order.code });
  back(res, order, 'success', 'Pembayaran dikonfirmasi. Pesanan masuk ke status Diproses.', req);
});

router.post('/pesanan/:code/tolak', async (req, res) => {
  const order = await ownOrder(req, res);
  if (!order) return;
  if (order.status !== 'pending_payment' || order.pay_status !== 'claimed') return back(res, order, 'error', 'Tidak ada klaim pembayaran yang bisa ditolak.', req);
  const reason = String(req.body.reason || '').trim().slice(0, 200) || 'Pembayaran belum kami terima.';
  const now = new Date();
  await db.transaction(async (trx) => {
    await trx('payments').where({ order_id: order.id }).update({ status: 'rejected', reject_reason: reason, updated_at: now });
    await trx('orders').where({ id: order.id }).update({ expires_at: new Date(now.getTime() + PAY_WINDOW_MS), updated_at: now }); // beri waktu 15 menit lagi
  });
  notify.notifyUser(order.user_id, { title: 'Pembayaran belum diterima', text: 'Pesanan #' + order.code + ': ' + reason + ' Kamu punya 15 menit untuk membayar ulang.', path: '/pesanan/' + order.code });
  back(res, order, 'success', 'Klaim pembayaran ditolak. Pelanggan diberi waktu 15 menit untuk membayar ulang.', req);
});

router.post('/pesanan/:code/kirim', async (req, res) => {
  const order = await ownOrder(req, res);
  if (!order) return;
  if (order.status !== 'processing') return back(res, order, 'error', 'Pesanan harus berstatus Diproses.', req);
  await db('orders').where({ id: order.id }).update({ status: 'delivering', updated_at: new Date() });
  notify.notifyUser(order.user_id, { title: order.fulfillment === 'pickup' ? 'Pesananmu siap diambil' : 'Pesananmu sedang diantar', text: 'Pesanan #' + order.code + ' dari ' + order.store_name + '.', path: '/pesanan/' + order.code });
  back(res, order, 'success', order.fulfillment === 'pickup' ? 'Pesanan siap diambil.' : 'Pesanan ditandai sedang dikirim.', req);
});

router.post('/pesanan/:code/selesai', async (req, res) => {
  const order = await ownOrder(req, res);
  if (!order) return;
  if (!['processing', 'delivering'].includes(order.status)) return back(res, order, 'error', 'Pesanan belum bisa diselesaikan.', req);
  await db('orders').where({ id: order.id }).update({ status: 'completed', completed_at: new Date(), updated_at: new Date() });
  notify.notifyUser(order.user_id, { title: 'Pesanan selesai', text: 'Pesanan #' + order.code + ' sudah selesai. Beri ulasan untuk ' + order.store_name + ' ya.', path: '/pesanan/' + order.code });
  back(res, order, 'success', 'Pesanan selesai.', req);
});

router.post('/pesanan/:code/batal', async (req, res) => {
  const order = await ownOrder(req, res);
  if (!order) return;
  const reason = String(req.body.reason || '').trim().slice(0, 200);
  if (!reason) return back(res, order, 'error', 'Isi alasan pembatalan.', req);
  const ok = await cancelOrder(order.id, 'Dibatalkan oleh toko: ' + reason);
  if (ok) notify.notifyUser(order.user_id, { title: 'Pesanan dibatalkan toko', text: 'Pesanan #' + order.code + ': ' + reason, path: '/pesanan/' + order.code });
  back(res, order, ok ? 'success' : 'error', ok ? 'Pesanan dibatalkan.' + (order.pay_status === 'confirmed' ? ' Pembayaran sudah dikonfirmasi, urus pengembalian dana langsung dengan pelanggan.' : '') : 'Pesanan tidak bisa dibatalkan.', req);
});

// ---------------- Pengaturan toko ----------------
router.get('/toko', async (req, res) => {
  const categories = await db('categories').orderBy('sort');
  res.render('merchant/settings', { title: 'Pengaturan Toko', categories, errors: [], form: req.store });
});

router.post('/toko', async (req, res) => {
  const b = req.body;
  const errors = [];
  const f = {
    name: String(b.name || '').trim(),
    description: String(b.description || '').trim().slice(0, 600) || null,
    address: String(b.address || '').trim().slice(0, 300) || null,
    city: String(b.city || '').trim().slice(0, 80) || null,
    category_id: parseInt(b.category_id, 10) || null,
    open_time: b.open_24 ? '00:00' : (/^([01]\d|2[0-3]):[0-5]\d$/.test(b.open_time || '') ? b.open_time : '08:00'),
    close_time: b.open_24 ? '00:00' : (/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(b.close_time || '') ? b.close_time : '21:00'),
    delivery_fee: Math.min(100000, Math.max(0, Math.round(Number(String(b.delivery_fee || '0').replace(/\D/g, ''))) || 0)),
    is_accepting: b.is_accepting ? 1 : 0,
    qris_name: String(b.qris_name || '').trim().slice(0, 100) || null,
    whatsapp: normalizePhone(b.whatsapp),
  };
  if (!b.open_24 && f.open_time === f.close_time) errors.push('Jam buka dan jam tutup tidak boleh sama. Kalau tokomu buka sepanjang hari, centang "Buka 24 jam".');
  if (f.name.length < 3 || f.name.length > 100) errors.push('Nama toko harus 3 sampai 100 karakter.');
  if (!f.whatsapp) errors.push('Isi nomor WhatsApp toko yang valid, misalnya 0812 3456 7890. Pelanggan memakainya untuk menghubungimu.');
  const files = req.files || {};
  const saved = {};
  try {
    if (!errors.length) {
      for (const k of ['logo', 'cover', 'qris']) saved[k] = await saveImage(files[k] && files[k][0], k);
    }
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    errors.push(e.message);
  }
  if (errors.length) {
    const categories = await db('categories').orderBy('sort');
    return res.status(422).render('merchant/settings', { title: 'Pengaturan Toko', categories, errors, form: { ...req.store, ...f, whatsapp: f.whatsapp || String(b.whatsapp || '').slice(0, 20) } });
  }
  const upd = { ...f, updated_at: new Date() };
  if (saved.logo) { removeUpload(req.store.logo); upd.logo = saved.logo; }
  if (saved.cover) { removeUpload(req.store.cover); upd.cover = saved.cover; }
  if (saved.qris) {
    removeUpload(req.store.qris_image);
    upd.qris_image = saved.qris;
    upd.qris_status = 'pending'; // QRIS baru/berubah harus diverifikasi admin dulu
  }
  await db('stores').where({ id: req.store.id }).update(upd);
  if (saved.qris) notify.notifyAdmin({ title: 'QRIS menunggu verifikasi', text: 'Toko "' + f.name + '" mengunggah QRIS baru.', path: '/admin/toko/' + req.store.id });
  req.flash('success', saved.qris ? 'Tersimpan. QRIS baru akan diperiksa admin sebelum dipakai pelanggan.' : 'Pengaturan toko disimpan.');
  res.redirect(303, '/merchant/toko');
});

// ---------------- Laporan ----------------
// ---- Ulasan pelanggan ----
router.get('/ulasan', async (req, res) => {
  const rate = await ratingSummary(req.store.id);
  const reviews = await db('reviews as r').join('users as u', 'u.id', 'r.user_id').join('orders as o', 'o.id', 'r.order_id')
    .where('r.store_id', req.store.id).select('r.*', 'u.name as user_name', 'o.code as order_code').orderBy('r.id', 'desc').limit(100);
  res.render('merchant/reviews', { title: 'Ulasan', rate, reviews });
});

router.post('/ulasan/:id/balas', async (req, res) => {
  const rv = await db('reviews').where({ id: req.params.id, store_id: req.store.id }).first();
  if (!rv) return res.status(404).render('errors/error', { code: 404, message: 'Ulasan tidak ditemukan.' });
  const reply = String(req.body.reply || '').trim().slice(0, 500);
  await db('reviews').where({ id: rv.id }).update({ reply: reply || null, reply_at: reply ? new Date() : null });
  req.flash('success', reply ? 'Balasanmu sudah tampil di halaman toko.' : 'Balasan dihapus.');
  res.redirect(303, '/merchant/ulasan');
});

// ---- Pemberitahuan (WhatsApp dan email) ----
router.get('/notifikasi', async (req, res) => {
  const store = await db('stores').where({ id: req.store.id }).first();
  const user = await db('users').where({ id: req.user.id }).first();
  res.render('merchant/notif', { title: 'Pemberitahuan', st: store, email: user && user.email, waOn: notify.waEnabled(), mailOn: notify.emailEnabled(), pushOn: notify.pushEnabled(), vapidKey: notify.vapidPublicKey() });
});

router.post('/notifikasi/simpan', async (req, res) => {
  await db('stores').where({ id: req.store.id }).update({ notify_wa: req.body.notify_wa ? 1 : 0, notify_email: req.body.notify_email ? 1 : 0 });
  req.flash('success', 'Pengaturan pemberitahuan disimpan.');
  res.redirect(303, '/merchant/notifikasi');
});

router.post('/notifikasi/tes', async (req, res) => {
  await notify.notifyStore(req.store.id, { title: 'Tes pemberitahuan', text: 'Kalau pesan ini sampai, kabar pesanan akan dikirim ke sini.', path: '/merchant' });
  req.flash('success', 'Pesan tes dikirim. Cek WhatsApp atau emailmu dalam beberapa detik.');
  res.redirect(303, '/merchant/notifikasi');
});

router.post('/ulasan/:id/laporkan', async (req, res) => {
  const rv = await db('reviews').where({ id: req.params.id, store_id: req.store.id }).first();
  if (!rv) return res.status(404).render('errors/error', { code: 404, message: 'Ulasan tidak ditemukan.' });
  const reason = String(req.body.reason || '').trim().slice(0, 200);
  if (!reason) { req.flash('error', 'Tulis alasan melaporkan ulasan ini.'); return res.redirect(303, '/merchant/ulasan'); }
  await db('reviews').where({ id: rv.id }).update({ report_reason: reason });
  notify.notifyAdmin({ title: 'Ulasan dilaporkan penjual', text: req.store.name + ': ' + reason, path: '/admin/ulasan?tampil=dilaporkan' });
  req.flash('success', 'Laporan terkirim. Admin akan memeriksa ulasan ini.');
  res.redirect(303, '/merchant/ulasan');
});

// ---------------- Promo dan zona antar ----------------
const rpInt = (v, max) => Math.min(max, Math.max(0, Math.round(Number(String(v || '0').replace(/\D/g, ''))) || 0));

router.get('/promo', async (req, res) => {
  const vouchers = await db('vouchers as v').where('v.store_id', req.store.id)
    .select('v.*', db.raw("(select count(*) from orders o where o.store_id = v.store_id and o.voucher_code = v.code and o.status <> 'cancelled') as used"), db.raw('(select count(*) from voucher_claims c where c.voucher_id = v.id) as claims'))
    .orderBy('v.id', 'desc');
  const zones = await db('store_zones').where({ store_id: req.store.id }).orderBy('fee').orderBy('id');
  res.render('merchant/promo', { title: 'Promo dan zona antar', vouchers, zones, today: dayKey(new Date()), form: {}, errors: [] });
});

router.post('/promo/voucher', async (req, res) => {
  const b = req.body;
  const errors = [];
  const f = {
    code: String(b.code || '').trim().toUpperCase(),
    type: b.type === 'fixed' ? 'fixed' : 'percent',
    value: rpInt(b.value, 500000),
    min_order: rpInt(b.min_order, 5000000),
    max_discount: rpInt(b.max_discount, 500000) || null,
    ends_on: /^\d{4}-\d{2}-\d{2}$/.test(String(b.ends_on || '')) ? b.ends_on : null,
    usage_limit: rpInt(b.usage_limit, 100000) || null,
  };
  if (!/^[A-Z0-9]{3,20}$/.test(f.code)) errors.push('Kode promo 3 sampai 20 huruf atau angka, tanpa spasi.');
  if (f.type === 'percent' && !(f.value >= 1 && f.value <= 90)) errors.push('Diskon persen harus 1 sampai 90.');
  if (f.type === 'fixed' && f.value < 1000) errors.push('Potongan harga minimal Rp 1.000.');
  if (f.ends_on && f.ends_on < dayKey(new Date())) errors.push('Tanggal berakhir tidak boleh sudah lewat.');
  if (f.type === 'fixed') f.max_discount = null;
  if (!errors.length && (await db('vouchers').where({ store_id: req.store.id, code: f.code }).first())) errors.push('Kode ' + f.code + ' sudah ada. Pakai kode lain.');
  if (errors.length) {
    const vouchers = await db('vouchers').where({ store_id: req.store.id }).orderBy('id', 'desc').select('*', db.raw('0 as used'));
    const zones = await db('store_zones').where({ store_id: req.store.id }).orderBy('fee').orderBy('id');
    return res.status(422).render('merchant/promo', { title: 'Promo dan zona antar', vouchers, zones, today: dayKey(new Date()), form: b, errors });
  }
  await db('vouchers').insert({ store_id: req.store.id, ...f, active: 1, created_at: new Date() });
  req.flash('success', 'Kode promo ' + f.code + ' dibuat. Bagikan ke pelanggan, atau biarkan tampil di halaman tokomu.');
  res.redirect(303, '/merchant/promo');
});

router.post('/promo/voucher/:id/toggle', async (req, res) => {
  const v = await db('vouchers').where({ id: req.params.id, store_id: req.store.id }).first();
  if (v) await db('vouchers').where({ id: v.id }).update({ active: v.active ? 0 : 1 });
  res.redirect(303, '/merchant/promo');
});

router.post('/promo/voucher/:id/hapus', async (req, res) => {
  await db('vouchers').where({ id: req.params.id, store_id: req.store.id }).del();
  req.flash('success', 'Kode promo dihapus. Pesanan lama yang memakainya tidak berubah.');
  res.redirect(303, '/merchant/promo');
});

router.post('/promo/zona', async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  const fee = rpInt(req.body.fee, 100000);
  const count = Number((await db('store_zones').where({ store_id: req.store.id }).count({ n: '*' }).first()).n);
  if (name.length < 2) req.flash('error', 'Nama zona minimal 2 huruf, contoh: "Dalam kompleks".');
  else if (count >= 10) req.flash('error', 'Maksimal 10 zona. Hapus yang tidak dipakai dulu.');
  else {
    await db('store_zones').insert({ store_id: req.store.id, name, fee });
    req.flash('success', 'Zona "' + name + '" ditambahkan.');
  }
  res.redirect(303, '/merchant/promo');
});

router.post('/promo/zona/:id/hapus', async (req, res) => {
  await db('store_zones').where({ id: req.params.id, store_id: req.store.id }).del();
  req.flash('success', 'Zona dihapus.');
  res.redirect(303, '/merchant/promo');
});

router.get('/laporan', async (req, res) => {
  const range = [7, 30, 90].includes(Number(req.query.hari)) ? Number(req.query.hari) : 30;
  const since = new Date(Date.now() - range * 86400000);
  const orders = await revenueOrders(req.store.id).where('o.created_at', '>=', since).select('o.id', 'o.code', 'o.total', 'o.created_at', 'o.status');
  const days = lastDays(range);
  const byDay = Object.fromEntries(days.map((d) => [d, { total: 0, count: 0 }]));
  for (const o of orders) {
    const k = dayKey(o.created_at);
    if (byDay[k]) { byDay[k].total += o.total; byDay[k].count += 1; }
  }
  const ids = orders.map((o) => o.id);
  const top = ids.length
    ? await db('order_items').whereIn('order_id', ids).groupBy('name').select('name').sum({ qty: 'qty' }).select(db.raw('sum(price * qty) as revenue')).orderBy('qty', 'desc').limit(8)
    : [];
  const total = orders.reduce((a, o) => a + o.total, 0);
  const chart = lineChart(days.map((d) => ({ label: shortDay(d), value: byDay[d].total })), { money: true });
  res.render('merchant/report', { title: 'Laporan', range, orders: orders.length, total, avg: orders.length ? Math.round(total / orders.length) : 0, top, chart, table: days.slice().reverse().map((d) => ({ day: shortDay(d), ...byDay[d] })).filter((r) => r.count) });
});

// Unduh laporan dalam bentuk Excel (.xlsx) berlogo
router.get('/laporan.xlsx', async (req, res) => {
  const range = [7, 30, 90].includes(Number(req.query.hari)) ? Number(req.query.hari) : 30;
  const now = new Date();
  const since = new Date(now.getTime() - range * 86400000);
  const orders = await revenueOrders(req.store.id).where('o.created_at', '>=', since).orderBy('o.created_at', 'desc')
    .select('o.id', 'o.code', 'o.total', 'o.subtotal', 'o.delivery_fee', 'o.discount', 'o.voucher_code', 'o.customer_name', 'o.fulfillment', 'o.created_at');
  const ids = orders.map((o) => o.id);
  const items = ids.length ? await db('order_items').whereIn('order_id', ids).select('order_id', 'name', 'qty', 'price') : [];
  const by = {};
  const tally = {};
  for (const it of items) {
    (by[it.order_id] = by[it.order_id] || []).push(it.qty + 'x ' + it.name);
    const t = (tally[it.name] = tally[it.name] || { name: it.name, qty: 0, revenue: 0 });
    t.qty += it.qty;
    t.revenue += it.qty * it.price;
  }
  const buf = buildReport({
    storeName: req.store.name,
    rangeDays: range,
    from: dayKey(since),
    to: dayKey(now),
    madeAt: fmtDateTime(now),
    orders: orders.map((o) => ({ code: o.code, date: dayKey(o.created_at), customer: o.customer_name, menu: (by[o.id] || []).join('; '), subtotal: o.subtotal, delivery: o.delivery_fee, discount: o.discount, voucher: o.voucher_code || '', total: o.total, fulfillment: o.fulfillment === 'pickup' ? 'Ambil sendiri' : 'Diantar' })),
    top: Object.values(tally).sort((a, b) => b.qty - a.qty),
  });
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="laporan-' + String(req.store.slug || 'toko').replace(/[^a-z0-9-]/gi, '') + '-' + range + 'hari.xlsx"',
    'Cache-Control': 'no-store',
  }).send(buf);
});

// ---------------- Tagihan komisi ----------------
router.get('/tagihan', async (req, res) => {
  const cfg = await billing.getConfig();
  const invoices = await db('invoices').where({ store_id: req.store.id }).orderBy('period', 'desc');
  const until = req.store.commission_free_until ? new Date(req.store.commission_free_until) : null;
  const free = !!(until && until > new Date());
  res.render('merchant/billing', {
    title: 'Tagihan', cfg, invoices, now: new Date(), free,
    freeText: until ? (until.getFullYear() >= 2099 ? 'waktu yang belum ditentukan' : until.toLocaleDateString('id-ID')) : '',
    est: await billing.currentEstimate(cfg, req.store),
  });
});

async function ownInvoice(req, res) {
  const inv = await db('invoices').where({ id: req.params.id, store_id: req.store.id }).first();
  if (!inv) res.status(404).render('errors/error', { code: 404, message: 'Tagihan tidak ditemukan.', layout: 'layouts/main' });
  return inv;
}

router.get('/tagihan/:id', async (req, res) => {
  const inv = await ownInvoice(req, res);
  if (!inv) return;
  const orders = await db('orders as o').where('o.invoice_id', inv.id).orderBy('o.id')
    .select('o.code', 'o.subtotal', 'o.discount', db.raw('coalesce(o.completed_at, o.updated_at) as done_at'));
  res.render('merchant/invoice', { title: 'Tagihan ' + billing.monthLabel(inv.period), inv, orders, cfg: await billing.getConfig(), now: new Date() });
});

router.post('/tagihan/:id/bukti', async (req, res) => {
  const inv = await ownInvoice(req, res);
  if (!inv) return;
  if (inv.status !== 'unpaid') {
    req.flash('error', 'Tagihan ini tidak menunggu pembayaran.');
    return res.redirect(303, '/merchant/tagihan/' + inv.id);
  }
  const file = req.files && req.files.proof && req.files.proof[0];
  if (!file) {
    req.flash('error', 'Pilih foto bukti pembayaran dulu.');
    return res.redirect(303, '/merchant/tagihan/' + inv.id);
  }
  const url = await saveImage(file);
  removeUpload(inv.proof_image);
  await db('invoices').where({ id: inv.id }).update({ status: 'submitted', proof_image: url, submitted_at: new Date(), note: null, updated_at: new Date() });
  notify.notifyAdmin({ title: 'Bukti bayar komisi masuk', text: req.store.name + ' mengirim bukti untuk tagihan ' + billing.monthLabel(inv.period) + '.', path: '/admin/tagihan?status=submitted' });
  req.flash('success', 'Bukti terkirim. Admin akan memeriksanya.');
  res.redirect(303, '/merchant/tagihan/' + inv.id);
});

module.exports = router;
