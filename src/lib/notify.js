/* global fetch, AbortController, clearTimeout, URLSearchParams */
// Pemberitahuan ke penjual dan admin lewat WhatsApp (gateway) dan/atau email.
// Semuanya opsional: kalau belum diatur di .env, fungsi di sini diam saja dan tidak mengganggu pesanan.
const db = require('./db');
const { logError } = require('./logger');
const { normalizePhone } = require('./helpers');

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (_) { /* opsional: npm install nodemailer */ }

let mailer = null;

let webpush = null;
try {
  webpush = require('web-push');
} catch (_) { /* opsional: npm install web-push */ }

// Notifikasi browser (Web Push). Gratis. Perlu kunci VAPID: jalankan `npm run vapid`, salin ke .env
const pushEnabled = () => !!(webpush && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || '';
let vapidSet = false;

async function sendPush(userId, payload) {
  if (!pushEnabled()) return;
  if (!vapidSet) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:' + (process.env.CONTACT_EMAIL || 'admin@example.com'), process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    vapidSet = true;
  }
  const subs = await db('push_subs').where({ user_id: userId });
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600 });
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) await db('push_subs').where({ id: s.id }).del(); // langganan sudah tidak berlaku
      else logError(e, 'sendPush');
    }
  }));
}

// Kabari satu pengguna: masuk ke lonceng di aplikasi, lalu notifikasi browser bila ia sudah mengaktifkannya.
async function notifyUser(userId, { title, text, path }) {
  try {
    if (!userId) return;
    await db('notifications').insert({ user_id: userId, title: String(title).slice(0, 150), body: text ? String(text).slice(0, 400) : null, url: path || null, created_at: new Date() });
    await sendPush(userId, { title, body: text || '', url: path || '/notifikasi' });
  } catch (e) {
    logError(e, 'notifyUser');
  }
}

// WhatsApp lewat gateway (bawaan: Fonnte). Isi WA_GATEWAY_TOKEN di .env untuk mengaktifkan.
const waToken = () => process.env.WA_GATEWAY_TOKEN || '';
const waEnabled = () => !!waToken();
const emailEnabled = () => !!(nodemailer && process.env.SMTP_HOST);

async function sendWhatsApp(phone, text) {
  const d = normalizePhone(phone);
  if (!d) throw new Error('Nomor WhatsApp tidak valid: ' + phone);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const form = new URLSearchParams({ target: d, message: text, countryCode: '62' });
    const r = await fetch(process.env.WA_GATEWAY_URL || 'https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: waToken() },
      body: form,
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.status === false) throw new Error('Gateway WhatsApp: ' + (j.reason || j.message || r.status));
  } finally {
    clearTimeout(timer);
  }
}

function getMailer() {
  if (!emailEnabled()) return null;
  if (!mailer) {
    const port = Number(process.env.SMTP_PORT || 587);
    mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === '1' || port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    });
  }
  return mailer;
}

async function sendEmail(to, subject, text) {
  const m = getMailer();
  if (!m || !to) return;
  await m.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
}

function compose(title, text, path) {
  const base = (process.env.APP_URL || '').replace(/\/$/, '');
  return title + '\n' + text + (base && path ? '\n' + base + path : '');
}

// Kabari toko. Tidak pernah melempar error dan boleh dipanggil tanpa await.
async function notifyStore(storeId, { title, text, path }) {
  try {
    const row = await db('stores as s').join('users as u', 'u.id', 's.user_id').where('s.id', storeId)
      .select('s.user_id', 's.whatsapp', 's.notify_wa', 's.notify_email', 'u.email').first();
    if (!row) return;
    const body = compose(title, text, path);
    const jobs = [notifyUser(row.user_id, { title, text, path })];
    if (waEnabled() && row.notify_wa && row.whatsapp) jobs.push(sendWhatsApp(row.whatsapp, body));
    if (emailEnabled() && row.notify_email && row.email) jobs.push(sendEmail(row.email, title, body));
    const results = await Promise.allSettled(jobs);
    results.forEach((r) => { if (r.status === 'rejected') logError(r.reason, 'notifyStore'); });
  } catch (e) {
    logError(e, 'notifyStore');
  }
}

// Kabari admin lewat ADMIN_WA dan CONTACT_EMAIL (bila diisi).
async function notifyAdmin({ title, text, path }) {
  try {
    const body = compose(title, text, path);
    const jobs = [];
    const admins = await db('users').where({ role: 'admin', is_active: 1 }).select('id');
    admins.forEach((a) => jobs.push(notifyUser(a.id, { title, text, path })));
    if (waEnabled() && process.env.ADMIN_WA) jobs.push(sendWhatsApp(process.env.ADMIN_WA, body));
    if (emailEnabled() && process.env.CONTACT_EMAIL) jobs.push(sendEmail(process.env.CONTACT_EMAIL, title, body));
    const results = await Promise.allSettled(jobs);
    results.forEach((r) => { if (r.status === 'rejected') logError(r.reason, 'notifyAdmin'); });
  } catch (e) {
    logError(e, 'notifyAdmin');
  }
}

module.exports = { waEnabled, emailEnabled, pushEnabled, vapidPublicKey, notifyStore, notifyAdmin, notifyUser, sendWhatsApp, sendEmail };
