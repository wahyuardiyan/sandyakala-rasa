const crypto = require('crypto');
const express = require('express');
const db = require('../lib/db');

// Membungkus handler async agar error tidak membuat server macet (Express 4)
function wrap(fn) {
  if (typeof fn !== 'function' || fn.length === 4) return fn;
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function asyncRouter() {
  const r = express.Router();
  for (const m of ['get', 'post', 'put', 'patch', 'delete', 'use']) {
    const orig = r[m].bind(r);
    r[m] = (path, ...handlers) => orig(path, ...handlers.flat().map(wrap));
  }
  return r;
}

function flash(req, res, next) {
  res.locals.flash = req.session.flash || null;
  if (req.session.flash) req.session.flash = null;
  req.flash = (type, msg) => {
    req.session.flash = { type, msg };
  };
  next();
}

function csrf(req, res, next) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrf;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = String((req.body && req.body._csrf) || req.get('x-csrf-token') || '');
  const a = Buffer.from(sent);
  const b = Buffer.from(req.session.csrf);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).render('errors/error', { code: 403, message: 'Formulir sudah kedaluwarsa. Muat ulang halaman lalu coba lagi.', layout: 'layouts/main' });
  }
  next();
}

async function loadUser(req, res, next) {
  req.user = null;
  res.locals.user = null;
  res.locals.cartCount = 0;
  res.locals.viewAs = null;
  // Mode uji: admin yang sedang "masuk sebagai" pengguna lain. Admin dicek ulang di setiap permintaan.
  if (req.session.adm) {
    const adm = await db('users').where({ id: req.session.adm }).first();
    if (adm && adm.role === 'admin' && adm.is_active) res.locals.viewAs = { adminName: adm.name };
    else { delete req.session.adm; delete req.session.uid; }
  }
  if (req.session.uid) {
    const u = await db('users').where({ id: req.session.uid }).first();
    if (u && u.is_active) {
      req.user = u;
      res.locals.user = u;
      if (u.role === 'customer') {
        const c = await db('cart_items as ci').join('carts as c', 'c.id', 'ci.cart_id').where('c.user_id', u.id).sum({ n: 'ci.qty' }).first();
        res.locals.cartCount = Number((c && c.n) || 0);
      }
    } else {
      delete req.session.uid;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    req.flash('error', 'Silakan masuk dulu untuk melanjutkan.');
    const next_ = req.method === 'GET' ? '?next=' + encodeURIComponent(req.originalUrl) : '';
    return res.redirect('/masuk' + next_);
  }
  next();
}

function requireRole(...roles) {
  return [
    requireAuth,
    (req, res, next) => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).render('errors/error', { code: 403, message: 'Kamu tidak punya akses ke halaman ini.', layout: 'layouts/main' });
      }
      next();
    },
  ];
}

async function loadStore(req, res, next) {
  req.store = await db('stores').where({ user_id: req.user.id }).first();
  res.locals.store = req.store;
  if (!req.store) {
    return res.status(404).render('errors/error', { code: 404, message: 'Toko tidak ditemukan untuk akunmu.', layout: 'layouts/main' });
  }
  next();
}

module.exports = { wrap, asyncRouter, flash, csrf, loadUser, requireAuth, requireRole, loadStore };
