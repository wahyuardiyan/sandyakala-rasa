const db = require('./db');

// Query dasar toko + rating + jumlah ulasan + harga termurah + jumlah pesanan selesai
function storeQuery() {
  return db('stores as s')
    .leftJoin('categories as c', 'c.id', 's.category_id')
    .select(
      's.*',
      'c.name as category_name',
      'c.emoji as category_emoji',
      'c.slug as category_slug',
      db.raw('(select avg(r.rating) from reviews r where r.store_id = s.id and r.hidden = 0) as rating_avg'),
      db.raw('(select count(*) from reviews r where r.store_id = s.id and r.hidden = 0) as review_count'),
      db.raw('(select min(p.price) from products p where p.store_id = s.id and p.is_available = 1) as min_price'),
      db.raw("(select count(*) from orders o where o.store_id = s.id and o.status = 'completed') as sold")
    );
}

async function getCart(userId) {
  const cart = await db('carts').where({ user_id: userId }).first();
  if (!cart) return { cart: null, store: null, items: [], subtotal: 0, count: 0 };
  const items = await db('cart_items as ci')
    .join('products as p', 'p.id', 'ci.product_id')
    .where('ci.cart_id', cart.id)
    .select('ci.id as item_id', 'ci.qty', 'p.id as product_id', 'p.name', 'p.price', 'p.stock', 'p.image', 'p.is_available', 'p.store_id')
    .orderBy('ci.id');
  const store = cart.store_id ? await storeQuery().where('s.id', cart.store_id).first() : null;
  const subtotal = items.reduce((a, it) => a + it.price * it.qty, 0);
  const count = items.reduce((a, it) => a + it.qty, 0);
  return { cart, store, items, subtotal, count };
}

async function getOrderFull(whereObj) {
  const order = await db('orders as o')
    .join('stores as s', 's.id', 'o.store_id')
    .join('payments as p', 'p.order_id', 'o.id')
    .where(whereObj)
    .select('o.*', 's.name as store_name', 's.slug as store_slug', 's.qris_image', 's.qris_name', 's.whatsapp as store_whatsapp', 's.user_id as store_owner_id', 'p.status as pay_status', 'p.proof_image', 'p.claimed_at', 'p.confirmed_at', 'p.reject_reason')
    .first();
  if (!order) return null;
  order.items = await db('order_items').where({ order_id: order.id }).orderBy('id');
  order.review = await db('reviews').where({ order_id: order.id }).first();
  return order;
}

// Ringkasan rating satu toko: rata-rata, jumlah, dan sebaran per bintang (5 sampai 1)
async function ratingSummary(storeId) {
  const rows = await db('reviews').where({ store_id: storeId, hidden: 0 }).select('rating').count({ n: '*' }).groupBy('rating');
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;
  for (const r of rows) {
    const k = Number(r.rating);
    if (k >= 1 && k <= 5) { dist[k] = Number(r.n); total += Number(r.n); sum += k * Number(r.n); }
  }
  return { count: total, avg: total ? sum / total : 0, dist };
}

module.exports = { storeQuery, getCart, getOrderFull, ratingSummary };
