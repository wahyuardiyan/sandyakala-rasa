const db = require('../lib/db');
const { asyncRouter, requireRole } = require('../middleware/common');
const { getOrderFull } = require('../lib/queries');
const { cancelOrder, expireStale, PAY_WINDOW_MS } = require('../lib/orders');
const { normalizePhone, rp, ORDER_STATUS, PAYMENT_STATUS, isOpenNow } = require('../lib/helpers');
const { notifyStore } = require('../lib/notify');
const { saveImage, removeUpload } = require('../lib/upload');

const router = asyncRouter();
router.use(['/pesanan', '/profil'], requireRole('customer'));

const TABS = [
  ['semua', 'Semua'],
  ['pending_payment', 'Belum Dibayar'],
  ['processing', 'Diproses'],
  ['delivering', 'Dikirim'],
  ['completed', 'Selesai'],
  ['cancelled', 'Dibatalkan'],
];

router.get('/pesanan', async (req, res) => {
  await expireStale();
  const tab = TABS.some((t) => t[0] === req.query.status) ? req.query.status : 'semua';
  const qb = db('orders as o').join('stores as s', 's.id', 'o.store_id').where('o.user_id', req.user.id).select('o.*', 's.name as store_name', 's.slug as store_slug').orderBy('o.id', 'desc').limit(100);
  if (tab !== 'semua') qb.where('o.status', tab);
  const orders = await qb;
  for (const o of orders) o.items = await db('order_items').where({ order_id: o.id }).orderBy('id');
  res.render('customer/orders', { title: 'Pesanan Saya', orders, tabs: TABS, tab });
});

// Status terbaru satu pesanan, dicek berkala oleh halaman detail pesanan
router.get('/pesanan/:code/status.json', async (req, res) => {
  const order = await getOrderFull({ 'o.code': req.params.code, 'o.user_id': req.user.id });
  res.set('Cache-Control', 'no-store');
  if (!order) return res.status(404).json({ ok: false });
  const st = ORDER_STATUS[order.status];
  res.json({ ok: true, status: order.status, pay: order.pay_status, label: st ? st.label : order.status, payLabel: (PAYMENT_STATUS[order.pay_status] || {}).label || '' });
});

router.get('/pesanan/:code', async (req, res) => {
  await expireStale();
  const order = await getOrderFull({ 'o.code': req.params.code, 'o.user_id': req.user.id });
  if (!order) return res.status(404).render('errors/error', { code: 404, message: 'Pesanan tidak ditemukan.' });
  res.render('customer/order', { title: 'Pesanan ' + order.code, order });
});

// Pesan lagi: isi keranjang dengan menu yang sama dari pesanan ini (harga dan stok memakai data terbaru)
router.post('/pesanan/:code/ulang', async (req, res) => {
  const order = await getOrderFull({ 'o.code': req.params.code, 'o.user_id': req.user.id });
  if (!order) return res.status(404).render('errors/error', { code: 404, message: 'Pesanan tidak ditemukan.' });
  const store = await db('stores').where({ id: order.store_id }).first();
  if (!store || store.status !== 'approved' || !store.is_accepting) {
    req.flash('error', 'Toko ini sedang tidak menerima pesanan.');
    return res.redirect(303, '/pesanan/' + order.code);
  }
  if (!isOpenNow(store)) {
    req.flash('error', 'Toko sedang tutup. Buka lagi pukul ' + store.open_time + '.');
    return res.redirect(303, '/pesanan/' + order.code);
  }
  const now = new Date();
  let cart = await db('carts').where({ user_id: req.user.id }).first();
  if (!cart) {
    await db('carts').insert({ user_id: req.user.id, store_id: null, updated_at: now });
    cart = await db('carts').where({ user_id: req.user.id }).first();
  }
  await db('cart_items').where({ cart_id: cart.id }).del(); // keranjang lama diganti, karena satu pesanan hanya untuk satu toko
  const skipped = [];
  let added = 0;
  for (const it of order.items) {
    const p = it.product_id ? await db('products').where({ id: it.product_id, store_id: store.id }).first() : null;
    if (!p || !p.is_available || (p.stock !== null && p.stock !== undefined && p.stock < 1)) { skipped.push(it.name); continue; }
    const qty = p.stock !== null && p.stock !== undefined ? Math.min(it.qty, p.stock) : it.qty;
    await db('cart_items').insert({ cart_id: cart.id, product_id: p.id, qty: Math.min(50, qty) });
    added += 1;
  }
  await db('carts').where({ id: cart.id }).update({ store_id: added ? store.id : null, updated_at: now });
  if (!added) {
    req.flash('error', 'Menu dari pesanan ini sudah tidak tersedia.');
    return res.redirect(303, '/pesanan/' + order.code);
  }
  req.flash('success', 'Menu dari pesanan #' + order.code + ' masuk keranjang.' + (skipped.length ? ' Tidak tersedia lagi: ' + skipped.join(', ') + '.' : ''));
  res.redirect(303, '/keranjang');
});

router.post('/pesanan/:code/bayar', async (req, res) => {
  await expireStale();
  const order = await getOrderFull({ 'o.code': req.params.code, 'o.user_id': req.user.id });
  if (!order) return res.status(404).render('errors/error', { code: 404, message: 'Pesanan tidak ditemukan.' });
  if (order.status !== 'pending_payment' || !['unpaid', 'rejected'].includes(order.pay_status)) {
    req.flash('error', 'Pesanan ini tidak sedang menunggu pembayaran.');
    return res.redirect(303, '/pesanan/' + order.code);
  }
  const file = req.files && req.files.proof && req.files.proof[0];
  if (!file) {
    req.flash('error', 'Unggah dulu foto atau tangkapan layar bukti pembayaranmu.');
    return res.redirect(303, '/pesanan/' + order.code);
  }
  const proof = await saveImage(file, 'photo');
  if (order.proof_image) removeUpload(order.proof_image);
  const now = new Date();
  await db('payments').where({ order_id: order.id }).update({ status: 'claimed', proof_image: proof, claimed_at: now, reject_reason: null, updated_at: now });
  notifyStore(order.store_id, { title: 'Pembayaran perlu dicek', text: 'Pesanan #' + order.code + ' dari ' + order.customer_name + ', total ' + rp(order.total) + '. Cek uang masuk, lalu konfirmasi.', path: '/merchant/pesanan/' + order.code });
  req.flash('success', 'Terima kasih! Merchant akan memeriksa pembayaranmu dan mengonfirmasi pesanan.');
  res.redirect(303, '/pesanan/' + order.code);
});

router.post('/pesanan/:code/batal', async (req, res) => {
  const order = await getOrderFull({ 'o.code': req.params.code, 'o.user_id': req.user.id });
  if (!order) return res.status(404).render('errors/error', { code: 404, message: 'Pesanan tidak ditemukan.' });
  if (order.status !== 'pending_payment' || !['unpaid', 'rejected'].includes(order.pay_status)) {
    req.flash('error', 'Pesanan ini tidak bisa dibatalkan lagi. Hubungi merchant bila perlu.');
    return res.redirect(303, '/pesanan/' + order.code);
  }
  await cancelOrder(order.id, 'Dibatalkan oleh pelanggan.');
  notifyStore(order.store_id, { title: 'Pesanan dibatalkan pelanggan', text: 'Pesanan #' + order.code + ' dibatalkan sebelum dibayar.', path: '/merchant/pesanan/' + order.code });
  req.flash('success', 'Pesanan dibatalkan.');
  res.redirect(303, '/pesanan/' + order.code);
});

router.post('/pesanan/:code/diterima', async (req, res) => {
  const order = await getOrderFull({ 'o.code': req.params.code, 'o.user_id': req.user.id });
  if (!order) return res.status(404).render('errors/error', { code: 404, message: 'Pesanan tidak ditemukan.' });
  if (order.status !== 'delivering') {
    req.flash('error', 'Pesanan belum dikirim atau sudah selesai.');
    return res.redirect(303, '/pesanan/' + order.code);
  }
  await db('orders').where({ id: order.id }).update({ status: 'completed', completed_at: new Date(), updated_at: new Date() });
  notifyStore(order.store_id, { title: 'Pesanan diterima pelanggan', text: 'Pesanan #' + order.code + ' ditandai selesai oleh pelanggan.', path: '/merchant/pesanan/' + order.code });
  req.flash('success', 'Pesanan selesai. Selamat menikmati! Jangan lupa beri ulasan.');
  res.redirect(303, '/pesanan/' + order.code);
});

router.post('/pesanan/:code/ulasan', async (req, res) => {
  const order = await getOrderFull({ 'o.code': req.params.code, 'o.user_id': req.user.id });
  if (!order) return res.status(404).render('errors/error', { code: 404, message: 'Pesanan tidak ditemukan.' });
  const rating = parseInt(req.body.rating, 10);
  if (order.status !== 'completed' || order.review) {
    req.flash('error', 'Ulasan hanya bisa diberikan satu kali untuk pesanan yang sudah selesai.');
    return res.redirect(303, '/pesanan/' + order.code);
  }
  if (!(rating >= 1 && rating <= 5)) {
    req.flash('error', 'Pilih bintang 1 sampai 5.');
    return res.redirect(303, '/pesanan/' + order.code);
  }
  await db('reviews').insert({ order_id: order.id, store_id: order.store_id, user_id: req.user.id, rating, comment: String(req.body.comment || '').trim().slice(0, 500) || null, created_at: new Date() });
  notifyStore(order.store_id, { title: 'Ulasan baru: ' + rating + ' dari 5 bintang', text: (order.customer_name || 'Pelanggan') + ' menilai pesanan #' + order.code + '.', path: '/merchant/ulasan' });
  req.flash('success', 'Terima kasih atas ulasanmu!');
  res.redirect(303, '/pesanan/' + order.code);
});

// ---- Profil pelanggan ----
router.get('/profil', async (req, res) => {
  res.render('customer/profile', { title: 'Profil Saya', errors: [] });
});

router.post('/profil', async (req, res) => {
  const bcrypt = require('bcryptjs');
  const name = String(req.body.name || '').trim();
  const address = String(req.body.address || '').trim().slice(0, 500);
  const phoneRaw = String(req.body.phone || '').trim();
  const errors = [];
  if (name.length < 2 || name.length > 100) errors.push('Nama harus 2 sampai 100 karakter.');
  let phone = req.user.phone;
  if (phoneRaw) {
    phone = normalizePhone(phoneRaw);
    if (!phone) errors.push('Nomor telepon tidak valid.');
    else if (await db('users').where({ phone }).whereNot({ id: req.user.id }).first()) errors.push('Nomor telepon sudah dipakai akun lain.');
  }
  const upd = { name, address: address || null, phone, updated_at: new Date() };
  const newPw = String(req.body.new_password || '');
  if (newPw) {
    if (!(await bcrypt.compare(String(req.body.current_password || ''), req.user.password_hash))) errors.push('Password saat ini salah.');
    if (newPw.length < 8 || newPw.length > 72) errors.push('Password baru minimal 8 dan maksimal 72 karakter.');
    if (!errors.length) upd.password_hash = await bcrypt.hash(newPw, 10);
  }
  if (errors.length) return res.status(422).render('customer/profile', { title: 'Profil Saya', errors });
  await db('users').where({ id: req.user.id }).update(upd);
  req.flash('success', 'Profil diperbarui.');
  res.redirect(303, '/profil');
});

module.exports = router;
