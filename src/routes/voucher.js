const db = require('../lib/db');
const { asyncRouter, requireRole } = require('../middleware/common');
const { checkVoucher } = require('../lib/pricing');
const { safeBack } = require('../lib/upload');
const { dayKey } = require('../lib/helpers');

const router = asyncRouter();
router.use(requireRole('customer'));

// Voucher yang sudah diklaim dan belum dipakai atau berakhir
router.get('/', async (req, res) => {
  const rows = await db('voucher_claims as c').join('vouchers as v', 'v.id', 'c.voucher_id').join('stores as s', 's.id', 'v.store_id')
    .where('c.user_id', req.user.id).where('s.status', 'approved').where('v.active', 1)
    .select('v.*', 's.name as store_name', 's.slug as store_slug').orderBy('c.id', 'desc');
  const today = dayKey(new Date());
  const list = [];
  for (const v of rows) {
    if (v.ends_on && v.ends_on < today) continue;
    const r = await checkVoucher(db, { id: v.store_id }, 1000000000, 0, v, req.user.id);
    if (r.error === 'Sudah pernah kamu pakai.') continue;
    list.push(v);
  }
  res.render('customer/vouchers', { title: 'Voucher saya', vouchers: list });
});

async function claim(userId, voucher) {
  const has = await db('voucher_claims').where({ voucher_id: voucher.id, user_id: userId }).first();
  if (has) return false;
  await db('voucher_claims').insert({ voucher_id: voucher.id, user_id: userId, claimed_at: new Date() });
  return true;
}

// Klaim satu voucher dari halaman toko
router.post('/klaim/:id', async (req, res) => {
  const back = safeBack(req, '/voucher');
  const v = await db('vouchers as v').join('stores as s', 's.id', 'v.store_id').where('v.id', req.params.id).where('v.active', 1).where('s.status', 'approved').select('v.*').first();
  if (!v || (v.ends_on && v.ends_on < dayKey(new Date()))) { req.flash('error', 'Voucher ini sudah tidak tersedia.'); return res.redirect(303, back); }
  const ok = await claim(req.user.id, v);
  req.flash('success', ok ? 'Voucher ' + v.code + ' diklaim. Pilih saat checkout.' : 'Voucher ini sudah kamu klaim.');
  res.redirect(303, back);
});

// Klaim lewat kode yang dibagikan penjual
router.post('/kode', async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase().slice(0, 30);
  const today = dayKey(new Date());
  const found = code ? await db('vouchers as v').join('stores as s', 's.id', 'v.store_id').where('v.code', code).where('v.active', 1).where('s.status', 'approved').select('v.*') : [];
  let n = 0;
  for (const v of found) {
    if (v.ends_on && v.ends_on < today) continue;
    if (await claim(req.user.id, v)) n += 1;
  }
  req.flash(n ? 'success' : 'error', n ? 'Voucher ' + code + ' diklaim.' : 'Kode tidak ditemukan, sudah berakhir, atau sudah kamu klaim.');
  res.redirect(303, '/voucher');
});

module.exports = router;
