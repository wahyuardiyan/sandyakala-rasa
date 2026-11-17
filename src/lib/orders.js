const crypto = require('crypto');
const db = require('./db');
const { UserError, dayKey, isOpenNow } = require('./helpers');
const { quote } = require('./pricing');

const PAY_WINDOW_MS = 15 * 60 * 1000; // 15 menit untuk membayar

function makeCode() {
  const ymd = dayKey(new Date()).replace(/-/g, '').slice(2);
  return `SR${ymd}${crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 5)}`;
}

// Membatalkan pesanan dan mengembalikan stok. Mengembalikan true bila benar-benar dibatalkan.
async function cancelOrder(id, reason) {
  return db.transaction(async (trx) => {
    const o = await trx('orders').where({ id }).first();
    if (!o || ['completed', 'cancelled'].includes(o.status)) return false;
    const items = await trx('order_items').where({ order_id: id }).whereNotNull('product_id');
    for (const it of items) {
      await trx('products').where({ id: it.product_id }).whereNotNull('stock').increment('stock', it.qty);
    }
    const now = new Date();
    await trx('orders').where({ id }).update({ status: 'cancelled', cancelled_reason: String(reason).slice(0, 255), updated_at: now });
    await trx('payments').where({ order_id: id }).whereNot('status', 'confirmed').update({ status: 'void', updated_at: now });
    return true;
  });
}

// Pesanan yang tidak dibayar sampai batas waktu dibatalkan otomatis (tanpa cron: dipanggil saat halaman dibuka)
async function expireStale() {
  const stale = await db('orders as o')
    .join('payments as p', 'p.order_id', 'o.id')
    .where('o.status', 'pending_payment')
    .whereIn('p.status', ['unpaid', 'rejected'])
    .where('o.expires_at', '<', new Date())
    .select('o.id');
  for (const { id } of stale) await cancelOrder(id, 'Waktu pembayaran habis.');
}

async function createOrderFromCart(user, form) {
  return db.transaction(async (trx) => {
    const cart = await trx('carts').where({ user_id: user.id }).first();
    if (!cart || !cart.store_id) throw new UserError('Keranjangmu masih kosong.');
    // Stok langsung dipesan saat checkout, jadi batasi pesanan yang belum dibayar agar stok tidak bisa ditahan terus
    const waiting = await trx('orders').where({ user_id: user.id, status: 'pending_payment' }).count({ n: '*' }).first();
    if (Number(waiting.n) >= 3) throw new UserError('Kamu masih punya 3 pesanan yang belum dibayar. Bayar atau batalkan salah satunya dulu di menu Pesanan.');
    const items = await trx('cart_items as ci')
      .join('products as p', 'p.id', 'ci.product_id')
      .where('ci.cart_id', cart.id)
      .select('ci.id as item_id', 'ci.qty', 'p.id as product_id', 'p.store_id', 'p.name', 'p.price', 'p.stock', 'p.is_available');
    if (!items.length) throw new UserError('Keranjangmu masih kosong.');

    const store = await trx('stores').where({ id: cart.store_id }).first();
    if (!store || store.status !== 'approved') throw new UserError('Toko ini belum aktif.');
    if (!store.is_accepting) throw new UserError('Toko ini sedang tidak menerima pesanan.');
    if (!isOpenNow(store)) throw new UserError('Toko sedang tutup. Buka lagi pukul ' + store.open_time + '.');
    if (store.qris_status !== 'approved' || !store.qris_image) throw new UserError('Toko ini belum bisa menerima pembayaran QRIS.');

    let subtotal = 0;
    for (const it of items) {
      if (it.store_id !== store.id || !it.is_available) throw new UserError(`"${it.name}" sudah tidak tersedia. Hapus dari keranjang dulu.`);
      if (it.stock !== null && it.stock !== undefined) {
        const n = await trx('products').where('id', it.product_id).where('stock', '>=', it.qty).decrement('stock', it.qty);
        if (!n) throw new UserError(`Stok "${it.name}" tidak cukup.`);
      }
      subtotal += it.price * it.qty; // harga selalu dari database, bukan dari browser
    }

    const delivery = form.fulfillment === 'delivery';
    const q = await quote(trx, store, subtotal, { fulfillment: delivery ? 'delivery' : 'pickup', zoneId: form.zoneId, code: form.voucher, userId: user.id });
    if (q.error) throw new UserError(q.error);
    if (q.voucherError) throw new UserError(q.voucherError);
    const now = new Date();
    const code = makeCode();
    const [orderId] = await trx('orders').insert({
      code,
      user_id: user.id,
      store_id: store.id,
      customer_name: form.name,
      customer_phone: form.phone,
      fulfillment: delivery ? 'delivery' : 'pickup',
      address: delivery ? form.address : null,
      note: form.note || null,
      subtotal,
      delivery_fee: q.fee,
      discount: q.discount,
      voucher_code: q.voucher ? q.voucher.code : null,
      delivery_zone: q.zone ? q.zone.name : null,
      total: q.total,
      status: 'pending_payment',
      expires_at: new Date(now.getTime() + PAY_WINDOW_MS),
      created_at: now,
      updated_at: now,
    });
    await trx('order_items').insert(items.map((it) => ({ order_id: orderId, product_id: it.product_id, name: it.name, price: it.price, qty: it.qty })));
    await trx('payments').insert({ order_id: orderId, method: 'qris', amount: q.total, status: 'unpaid', created_at: now, updated_at: now });
    await trx('cart_items').where({ cart_id: cart.id }).del();
    await trx('carts').where({ id: cart.id }).update({ store_id: null, updated_at: now });
    return code;
  });
}

module.exports = { PAY_WINDOW_MS, cancelOrder, expireStale, createOrderFromCart };
