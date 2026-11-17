const db = require('../lib/db');
const { asyncRouter, requireAuth } = require('../middleware/common');
const notify = require('../lib/notify');

const router = asyncRouter();
router.use(requireAuth);

// Jumlah belum dibaca + notifikasi baru sejak id ?after= (untuk popup dan suara)
router.get('/ringkas.json', async (req, res) => {
  const m = await db('notifications').where({ user_id: req.user.id }).max({ m: 'id' }).first();
  const last = Number((m && m.m) || 0);
  let after = parseInt(req.query.after, 10) || 0;
  if (after > last) after = 0; // penanda di browser lebih besar dari data (misalnya database diatur ulang)
  const n = await db('notifications').where({ user_id: req.user.id }).whereNull('read_at').count({ n: '*' }).first();
  const q = db('notifications').where({ user_id: req.user.id }).where('id', '>', after);
  if (req.query.unread === '1') q.whereNull('read_at');
  const fresh = await q.orderBy('id', 'desc').limit(3).select('id', 'title', 'body', 'url');
  res.set('Cache-Control', 'no-store');
  res.json({ unread: Number(n.n), last, items: fresh.reverse() });
});

router.get('/', async (req, res) => {
  const items = await db('notifications').where({ user_id: req.user.id }).orderBy('id', 'desc').limit(60);
  const unreadIds = items.filter((i) => !i.read_at).map((i) => i.id);
  const wasUnread = new Set(unreadIds);
  if (unreadIds.length) await db('notifications').whereIn('id', unreadIds).update({ read_at: new Date() });
  res.locals.unreadNotif = 0;
  if (req.user.role !== 'customer') res.locals.layout = 'layouts/dashboard';
  res.locals.area = req.user.role === 'admin' ? 'admin' : 'merchant';
  res.render('pages/notifications', { title: 'Notifikasi', items, wasUnread });
});

// Langganan notifikasi browser. Dikirim sebagai formulir biasa dari app.js.
router.post('/push/daftar', async (req, res) => {
  const endpoint = String(req.body.endpoint || '').slice(0, 600);
  const p256dh = String(req.body.p256dh || '').slice(0, 200);
  const auth = String(req.body.auth || '').slice(0, 100);
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return res.status(400).json({ ok: false });
  await db('push_subs').where({ endpoint }).del();
  await db('push_subs').insert({ user_id: req.user.id, endpoint, p256dh, auth, created_at: new Date() });
  res.json({ ok: true });
});

router.post('/push/hapus', async (req, res) => {
  await db('push_subs').where({ endpoint: String(req.body.endpoint || ''), user_id: req.user.id }).del();
  res.json({ ok: true });
});

router.post('/push/tes', async (req, res) => {
  await notify.notifyUser(req.user.id, { title: 'Tes notifikasi', text: 'Kalau ini muncul, notifikasi di perangkat ini sudah aktif.', path: '/notifikasi' });
  req.flash('success', 'Tes dikirim. Notifikasi muncul dalam beberapa detik.');
  res.redirect(303, req.get('referer') && req.get('referer').includes('/merchant/') ? '/merchant/notifikasi' : '/notifikasi');
});

// Dipakai server.js: angka lonceng di setiap halaman
async function unreadCount(req, res, next) {
  res.locals.unreadNotif = 0;
  res.locals.lastNotifId = 0;
  res.locals.pushOn = notify.pushEnabled();
  res.locals.vapidKey = notify.vapidPublicKey();
  if (req.user) {
    const n = await db('notifications').where({ user_id: req.user.id }).whereNull('read_at').count({ n: '*' }).first();
    const m = await db('notifications').where({ user_id: req.user.id }).max({ m: 'id' }).first();
    res.locals.unreadNotif = Number(n.n);
    res.locals.lastNotifId = Number((m && m.m) || 0);
  }
  next();
}

module.exports = router;
module.exports.unreadCount = unreadCount;
