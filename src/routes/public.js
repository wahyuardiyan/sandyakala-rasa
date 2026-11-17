const db = require('../lib/db');
const { asyncRouter } = require('../middleware/common');
const { storeQuery, ratingSummary } = require('../lib/queries');
const { isOpenNow, greeting, dayKey } = require('../lib/helpers');

const router = asyncRouter();
const PER_PAGE = 9;

router.get('/', async (req, res) => {
  const categories = await db('categories as c')
    .select('c.*', db.raw("(select count(*) from stores s where s.category_id = c.id and s.status = 'approved') as store_count"))
    .orderBy('c.sort');
  const featured = await storeQuery().where('s.status', 'approved').orderByRaw('sold desc, s.id desc').limit(4);
  const counts = await db('stores').where({ status: 'approved' }).count({ n: '*' }).first();
  res.render('shop/home', { title: 'Marketplace UMKM Kuliner Lokal', bare: true, greeting: greeting(), categories, featured, storeCount: Number(counts.n), isOpenNow });
});

// Halaman informasi
const UPDATED = '4 November 2026';
router.get('/syarat', (req, res) => res.render('pages/terms', { title: 'Syarat dan Ketentuan', updated: UPDATED, metaDesc: 'Aturan memakai Sandyakala Rasa bagi pelanggan dan penjual.' }));
router.get('/privasi', (req, res) => res.render('pages/privacy', { title: 'Kebijakan Privasi', updated: UPDATED, metaDesc: 'Data apa yang kami simpan, untuk apa, dan hak kamu atas data itu.' }));
router.get('/jualan', (req, res) => res.render('pages/seller', { title: 'Jualan di Sandyakala Rasa', metaDesc: 'Buka toko kuliner rumahanmu di internet. Pelanggan membayar langsung ke QRIS-mu, tanpa COD.' }));
router.get('/bantuan', (req, res) => res.render('pages/help', { title: 'Bantuan', metaDesc: 'Pertanyaan yang sering diajukan pelanggan dan penjual Sandyakala Rasa.' }));

router.get('/sitemap.xml', async (req, res) => {
  const base = res.locals.baseUrl;
  const stores = await db('stores').where({ status: 'approved' }).select('slug');
  const urls = ['/', '/toko', '/jualan', '/bantuan', '/syarat', '/privasi'].concat(stores.map((x) => '/toko/' + encodeURIComponent(x.slug)));
  res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map((u) => '<url><loc>' + base + u + '</loc></url>').join('\n') + '\n</urlset>');
});

router.get('/toko', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const kategori = String(req.query.kategori || '');
  const urut = ['populer', 'rating', 'terbaru'].includes(req.query.urut) ? req.query.urut : 'populer';
  const kota = String(req.query.kota || '').slice(0, 80);
  const rating = Math.min(5, Math.max(0, Number(req.query.rating) || 0));
  const harga = Number(req.query.harga) || 0; // batas harga menu termurah
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const build = () => {
    const qb = storeQuery().where('s.status', 'approved');
    if (q) {
      const like = `%${q.replace(/[%_]/g, '')}%`;
      qb.where((w) => {
        w.where('s.name', 'like', like)
          .orWhere('s.description', 'like', like)
          .orWhereExists(db('products as p').whereRaw('p.store_id = s.id').where('p.is_available', 1).where('p.name', 'like', like).select(db.raw('1')));
      });
    }
    if (kategori) qb.where('c.slug', kategori);
    if (kota) qb.where('s.city', kota);
    if (rating) qb.whereRaw('(select avg(r.rating) from reviews r where r.store_id = s.id and r.hidden = 0) >= ?', [rating]);
    if (harga) qb.whereRaw('(select min(p.price) from products p where p.store_id = s.id and p.is_available = 1) <= ?', [harga]);
    return qb;
  };

  const totalRow = await db.count({ n: '*' }).from(build().as('t')).first();
  const total = Number(totalRow.n);
  const qb = build();
  if (urut === 'rating') qb.orderByRaw('rating_avg desc, sold desc');
  else if (urut === 'terbaru') qb.orderBy('s.id', 'desc');
  else qb.orderByRaw('sold desc, review_count desc, s.id desc');
  const stores = await qb.limit(PER_PAGE).offset((page - 1) * PER_PAGE);

  const categories = await db('categories').orderBy('sort');
  const cities = (await db('stores').where({ status: 'approved' }).whereNotNull('city').distinct('city').orderBy('city')).map((r) => r.city);
  res.render('shop/stores', {
    title: 'Toko Kuliner',
    bare: true,
    stores, categories, cities, total, page, pages: Math.max(1, Math.ceil(total / PER_PAGE)),
    filters: { q, kategori, urut, kota, rating, harga },
    isOpenNow,
  });
});

router.get('/toko/:slug', async (req, res) => {
  const store = await storeQuery().where('s.slug', req.params.slug).first();
  const canPreview = req.user && (req.user.role === 'admin' || (store && store.user_id === req.user.id));
  if (!store || (store.status !== 'approved' && !canPreview)) {
    return res.status(404).render('errors/error', { code: 404, message: 'Toko tidak ditemukan.' });
  }
  const products = await db('products as p')
    .leftJoin('categories as c', 'c.id', 'p.category_id')
    .where('p.store_id', store.id)
    .select('p.*', 'c.name as category_name')
    .orderBy('p.is_available', 'desc')
    .orderBy('p.name');
  const reviews = await db('reviews as r').join('users as u', 'u.id', 'r.user_id').where('r.store_id', store.id).where('r.hidden', 0).select('r.*', 'u.name as user_name').orderBy('r.id', 'desc').limit(20);
  const rate = await ratingSummary(store.id);
  const fav = res.locals.user && res.locals.user.role === 'customer' ? !!(await db('favorites').where({ user_id: res.locals.user.id, store_id: store.id }).first()) : false;
  const promos = await db('vouchers').where({ store_id: store.id, active: 1 }).where((w) => w.whereNull('ends_on').orWhere('ends_on', '>=', dayKey(new Date()))).orderBy('id', 'desc').limit(3);
  const claimed = res.locals.user && res.locals.user.role === 'customer' && promos.length ? (await db('voucher_claims').where({ user_id: res.locals.user.id }).whereIn('voucher_id', promos.map((v) => v.id))).map((c) => c.voucher_id) : [];
  const groups = [];
  for (const p of products.filter((x) => x.is_available || canPreview)) {
    const name = p.category_name || 'Menu Lainnya';
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, items: [] }));
    g.items.push(p);
  }
  res.render('shop/store', { title: store.name, bare: true, metaDesc: (store.description || 'Lihat menu dan pesan dari ' + store.name + ' di Sandyakala Rasa.').slice(0, 160), ogImage: store.cover || store.logo || null, shop: store, groups, reviews, rate, fav, promos, claimed, open: isOpenNow(store), preview: store.status !== 'approved' });
});

module.exports = router;
