const db = require('../lib/db');
const { asyncRouter, requireRole } = require('../middleware/common');
const { storeQuery } = require('../lib/queries');
const { safeBack } = require('../lib/upload');

const router = asyncRouter();
router.use(requireRole('customer'));

router.get('/', async (req, res) => {
  const stores = await storeQuery().join('favorites as f', 'f.store_id', 's.id').where('f.user_id', req.user.id).where('s.status', 'approved').orderBy('f.id', 'desc');
  res.render('customer/favorites', { title: 'Toko favorit', stores });
});

// Simpan atau lepas satu toko dari favorit
router.post('/:storeId', async (req, res) => {
  const storeId = parseInt(req.params.storeId, 10);
  const store = await db('stores').where({ id: storeId, status: 'approved' }).first();
  const back = safeBack(req, '/favorit');
  if (!store) { req.flash('error', 'Toko tidak ditemukan.'); return res.redirect(303, back); }
  const has = await db('favorites').where({ user_id: req.user.id, store_id: storeId }).first();
  if (has) {
    await db('favorites').where({ id: has.id }).del();
    req.flash('success', store.name + ' dilepas dari favorit.');
  } else {
    await db('favorites').insert({ user_id: req.user.id, store_id: storeId, created_at: new Date() });
    req.flash('success', store.name + ' disimpan ke toko favorit.');
  }
  res.redirect(303, back);
});

module.exports = router;
