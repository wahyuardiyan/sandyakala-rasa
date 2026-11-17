const rateLimit = require('express-rate-limit');
const db = require('../lib/db');
const { asyncRouter, requireRole } = require('../middleware/common');
const { getCart } = require('../lib/queries');
const { createOrderFromCart } = require('../lib/orders');
const { safeBack } = require('../lib/upload');
const { UserError, normalizePhone, rp, isOpenNow } = require('../lib/helpers');
const { notifyStore } = require('../lib/notify');
const { quote, checkVoucher } = require('../lib/pricing');
const { dayKey } = require('../lib/helpers');

const router = asyncRouter();
router.use(['/keranjang', '/checkout'], requireRole('customer'));

router.get('/keranjang', async (req, res) => {
  const data = await getCart(req.user.id);
  res.render('customer/cart', { title: 'Keranjang', ...data });
});

router.post('/keranjang/tambah', async (req, res) => {
  const back = safeBack(req, '/keranjang');
  const productId = parseInt(req.body.product_id, 10);
  const qty = Math.min(50, Math.max(1, parseInt(req.body.qty, 10) || 1));
  const p = await db('products as p').join('stores as s', 's.id', 'p.store_id').where('p.id', productId).select('p.*', 's.status as store_status', 's.is_accepting', 's.name as store_name', 's.open_time', 's.close_time').first();
  if (!p || p.store_status !== 'approved' || !p.is_available) {
    req.flash('error', 'Menu ini tidak tersedia.');
    return res.redirect(303, back);
  }
  if (!p.is_accepting) {
    req.flash('error', `${p.store_name} sedang tidak menerima pesanan.`);
    return res.redirect(303, back);
  }
  if (!isOpenNow(p)) {
    req.flash('error', `${p.store_name} sedang tutup. Buka lagi pukul ${p.open_time}.`);
    return res.redirect(303, back);
  }
  const now = new Date();
  let cart = await db('carts').where({ user_id: req.user.id }).first();
  if (!cart) {
    await db('carts').insert({ user_id: req.user.id, store_id: null, updated_at: now });
    cart = await db('carts').where({ user_id: req.user.id }).first();
  }
  const existingCount = await db('cart_items').where({ cart_id: cart.id }).count({ n: '*' }).first();
  if (cart.store_id && cart.store_id !== p.store_id && Number(existingCount.n) > 0) {
    req.flash('error', 'Keranjangmu berisi menu dari toko lain. Selesaikan pesanan itu atau kosongkan keranjang dulu, karena satu pesanan hanya untuk satu toko.');
    return res.redirect(303, '/keranjang');
  }
  const line = await db('cart_items').where({ cart_id: cart.id, product_id: p.id }).first();
  const newQty = Math.min(50, (line ? line.qty : 0) + qty);
  if (p.stock !== null && p.stock !== undefined && newQty > p.stock) {
    req.flash('error', `Stok "${p.name}" tersisa ${p.stock}.`);
    return res.redirect(303, back);
  }
  if (line) await db('cart_items').where({ id: line.id }).update({ qty: newQty });
  else await db('cart_items').insert({ cart_id: cart.id, product_id: p.id, qty: newQty });
  await db('carts').where({ id: cart.id }).update({ store_id: p.store_id, updated_at: now });
  req.flash('success', `"${p.name}" masuk keranjang.`);
  res.redirect(303, back);
});

router.post('/keranjang/ubah', async (req, res) => {
  const cart = await db('carts').where({ user_id: req.user.id }).first();
  const itemId = parseInt(req.body.item_id, 10);
  const qty = Math.min(50, Math.max(0, parseInt(req.body.qty, 10) || 0));
  if (cart) {
    const item = await db('cart_items as ci').join('products as p', 'p.id', 'ci.product_id').where({ 'ci.id': itemId, 'ci.cart_id': cart.id }).select('ci.id', 'p.stock', 'p.name').first();
    if (item) {
      if (qty === 0) await db('cart_items').where({ id: item.id }).del();
      else if (item.stock !== null && item.stock !== undefined && qty > item.stock) req.flash('error', `Stok "${item.name}" tersisa ${item.stock}.`);
      else await db('cart_items').where({ id: item.id }).update({ qty });
      const left = await db('cart_items').where({ cart_id: cart.id }).count({ n: '*' }).first();
      if (Number(left.n) === 0) await db('carts').where({ id: cart.id }).update({ store_id: null });
    }
  }
  res.redirect(303, '/keranjang');
});

router.post('/keranjang/kosongkan', async (req, res) => {
  const cart = await db('carts').where({ user_id: req.user.id }).first();
  if (cart) {
    await db('cart_items').where({ cart_id: cart.id }).del();
    await db('carts').where({ id: cart.id }).update({ store_id: null });
  }
  req.flash('success', 'Keranjang dikosongkan.');
  res.redirect(303, '/keranjang');
});

// Hitung ulang ongkos, zona, dan potongan untuk tampilan checkout (angka resmi tetap dihitung lagi saat pesanan dibuat)
router.get('/checkout/hitung.json', async (req, res) => {
  const data = await getCart(req.user.id);
  res.set('Cache-Control', 'no-store');
  if (!data.items.length || !data.store) return res.json({ ok: false });
  const fulfillment = req.query.fulfillment === 'pickup' ? 'pickup' : 'delivery';
  const q = await quote(db, data.store, data.subtotal, { fulfillment, zoneId: req.query.zona, code: req.query.kode, userId: req.user.id });
  res.json({
    ok: true, subtotal: data.subtotal, fee: q.fee, discount: q.discount, total: q.total,
    zoneError: q.error, voucherError: q.voucherError, voucherCode: q.voucher ? q.voucher.code : '',
  });
});

async function checkoutView(req, res, data, form, errors, status) {
  const zones = data.store ? await db('store_zones').where({ store_id: data.store.id }).orderBy('fee').orderBy('id') : [];
  const q = data.store ? await quote(db, data.store, data.subtotal, { fulfillment: form.fulfillment, zoneId: form.zona, code: form.voucher, userId: req.user.id }) : null;
  // Voucher yang sudah diklaim pelanggan untuk toko ini, lengkap dengan alasan bila belum bisa dipakai
  const claimed = [];
  if (data.store) {
    const rows = await db('voucher_claims as c').join('vouchers as v', 'v.id', 'c.voucher_id').where('c.user_id', req.user.id).where('v.store_id', data.store.id).where('v.active', 1).select('v.*').orderBy('c.id', 'desc');
    for (const v of rows) {
      if (v.ends_on && v.ends_on < dayKey(new Date())) continue;
      const r = await checkVoucher(db, data.store, data.subtotal, 0, v, req.user.id);
      if (r.error === 'Sudah pernah kamu pakai.') continue;
      claimed.push({ ...v, error: r.error, saving: r.discount });
    }
  }
  res.status(status || 200).render('customer/checkout', { title: 'Checkout', ...data, form, errors, zones, q, claimed });
}

router.get('/checkout', async (req, res) => {
  const data = await getCart(req.user.id);
  if (!data.items.length) {
    req.flash('error', 'Keranjangmu masih kosong.');
    return res.redirect('/keranjang');
  }
  await checkoutView(req, res, data, { name: req.user.name, phone: req.user.phone || '', address: req.user.address || '', fulfillment: 'delivery', note: '', zona: '', voucher: '' }, []);
});

const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    req.flash('error', 'Terlalu banyak percobaan checkout. Tunggu beberapa menit lalu coba lagi.');
    res.redirect(303, '/keranjang');
  },
});

router.post('/checkout', checkoutLimiter, async (req, res) => {
  const form = {
    fulfillment: req.body.fulfillment === 'pickup' ? 'pickup' : 'delivery',
    name: String(req.body.name || '').trim(),
    phone: String(req.body.phone || '').trim(),
    address: String(req.body.address || '').trim(),
    note: String(req.body.note || '').trim().slice(0, 300),
    zona: String(req.body.zona || '').slice(0, 10),
    voucher: String(req.body.voucher || '').trim().toUpperCase().slice(0, 30),
  };
  const errors = [];
  if (form.name.length < 2 || form.name.length > 100) errors.push('Nama penerima harus 2 sampai 100 karakter.');
  const phone = normalizePhone(form.phone);
  if (!phone) errors.push('Nomor telepon tidak valid (contoh 0812 3456 7890).');
  if (form.fulfillment === 'delivery' && (form.address.length < 8 || form.address.length > 500)) errors.push('Alamat pengiriman wajib diisi lengkap (minimal 8 karakter).');

  if (!errors.length) {
    try {
      const code = await createOrderFromCart(req.user, { ...form, phone, zoneId: form.zona });
      // simpan alamat/telepon sebagai bawaan untuk pesanan berikutnya
      const upd = { updated_at: new Date() };
      if (form.address) upd.address = form.address;
      if (!req.user.phone) {
        const taken = await db('users').where({ phone }).whereNot({ id: req.user.id }).first();
        if (!taken) upd.phone = phone;
      }
      await db('users').where({ id: req.user.id }).update(upd);
      const placed = await db('orders').where({ code }).first();
      if (placed) notifyStore(placed.store_id, { title: 'Pesanan baru masuk', text: placed.customer_name + ' memesan, total ' + rp(placed.total) + '. Menunggu pembayaran pelanggan.', path: '/merchant/pesanan/' + code });
      return res.redirect(303, '/pesanan/' + code);
    } catch (e) {
      if (!(e instanceof UserError)) throw e;
      errors.push(e.message);
    }
  }
  const data = await getCart(req.user.id);
  if (!data.items.length) {
    req.flash('error', errors[0] || 'Keranjangmu kosong.');
    return res.redirect('/keranjang');
  }
  await checkoutView(req, res, data, form, errors, 422);
});

module.exports = router;
