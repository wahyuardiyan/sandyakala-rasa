// JavaScript ringan tanpa framework (halaman memakai CSP ketat: tanpa script inline).
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // Tombol buka/tutup menu: <button data-toggle="id">
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-toggle]');
    if (t) {
      var id = t.getAttribute('data-toggle');
      var el = document.getElementById(id);
      if (el) {
        el.classList.toggle('hidden');
        if (id === 'sidebar') {
          var bd = document.getElementById('sidebar-backdrop');
          if (bd) bd.classList.toggle('hidden', el.classList.contains('hidden'));
        }
      }
    } else if (!e.target.closest('#user-menu')) {
      var um = document.getElementById('user-menu');
      if (um) um.classList.add('hidden');
    }
    if (e.target.id === 'sidebar-backdrop') {
      document.getElementById('sidebar').classList.add('hidden');
      e.target.classList.add('hidden');
    }
  });

  // Tombol cetak: <button data-print>
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-print]')) window.print();
  });

  // Konfirmasi sebelum kirim form: <form data-confirm="Yakin?">
  document.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute && e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  // Tombol kirim baru aktif setelah file dipilih: <form data-needs-file>
  $$('form[data-needs-file]').forEach(function (f) {
    var inp = f.querySelector('input[type=file]');
    var btn = f.querySelector('button:not([type=button])');
    if (!inp || !btn) return;
    inp.addEventListener('change', function () { btn.disabled = !(inp.files && inp.files.length); });
  });

  // Angka ringkasan naik perlahan saat halaman dibuka (dilewati bila pengguna memilih kurangi gerakan)
  if (!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    $$('[data-count]').forEach(function (el) {
      var to = parseInt(el.getAttribute('data-count'), 10);
      if (!(to > 0)) return;
      var rp = el.hasAttribute('data-rp');
      var t0 = null;
      function fmt(n) { return rp ? 'Rp\u00a0' + n.toLocaleString('id-ID') : String(n); }
      function step(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / 900);
        el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
      }
      requestAnimationFrame(step);
    });
  }

  // Tampilkan / sembunyikan password
  $$('[data-reveal]').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = document.getElementById(b.getAttribute('data-reveal'));
      if (i) i.type = i.type === 'password' ? 'text' : 'password';
    });
  });

  // Pilihan peran pada form daftar: tampilkan kolom nama toko untuk merchant
  var roleInputs = $$('input[name="role"]');
  var storeField = document.getElementById('store-field');
  function syncRole() {
    var v = (roleInputs.filter(function (r) { return r.checked; })[0] || {}).value;
    if (storeField) storeField.classList.toggle('hidden', v !== 'merchant');
    roleInputs.forEach(function (r) {
      var card = r.closest('label');
      if (card) card.classList.toggle('ring-2', r.checked), card.classList.toggle('ring-terra', r.checked);
    });
  }
  if (roleInputs.length) { roleInputs.forEach(function (r) { r.addEventListener('change', syncRole); }); syncRole(); }

  // Hitung mundur batas waktu pembayaran: <span data-countdown="2026-10-24T01:00:00.000Z">
  $$('[data-countdown]').forEach(function (el) {
    var end = new Date(el.getAttribute('data-countdown')).getTime();
    function tick() {
      var s = Math.max(0, Math.floor((end - Date.now()) / 1000));
      el.textContent = ('0' + Math.floor(s / 60)).slice(-2) + ':' + ('0' + (s % 60)).slice(-2);
      if (s === 0) { clearInterval(timer); setTimeout(function () { window.location.reload(); }, 1500); }
    }
    var timer = setInterval(tick, 1000);
    tick();
  });

  // Format angka rupiah pada input: <input data-rupiah>
  $$('input[data-rupiah]').forEach(function (i) {
    function fmt() { var d = i.value.replace(/\D/g, ''); i.value = d ? Number(d).toLocaleString('id-ID') : ''; }
    i.addEventListener('input', fmt); fmt();
  });

  // Cari menu di halaman toko + filter kategori
  var ms = document.getElementById('menu-search');
  function applyMenuFilter() {
    var q = ms ? ms.value.trim().toLowerCase() : '';
    var active = ($('[data-cat-btn].is-active') || {}).getAttribute ? $('[data-cat-btn].is-active').getAttribute('data-cat-btn') : 'all';
    $$('[data-menu-group]').forEach(function (g) {
      var anyVisible = false;
      $$('[data-menu-item]', g).forEach(function (it) {
        var show = (!q || it.getAttribute('data-name').indexOf(q) > -1);
        it.classList.toggle('hidden', !show);
        if (show) anyVisible = true;
      });
      var inCat = active === 'all' || g.getAttribute('data-menu-group') === active;
      g.classList.toggle('hidden', !(anyVisible && inCat));
    });
  }
  if (ms) ms.addEventListener('input', applyMenuFilter);
  $$('[data-cat-btn]').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('[data-cat-btn]').forEach(function (x) { x.classList.toggle('is-active', x === b); });
      applyMenuFilter();
    });
  });

  // Tab bagian di halaman toko (Menu / Ulasan / Tentang)
  $$('[data-tab-btn]').forEach(function (b) {
    b.addEventListener('click', function () {
      var key = b.getAttribute('data-tab-btn');
      $$('[data-tab-btn]').forEach(function (x) { x.classList.toggle('is-active', x === b); x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
      $$('[data-tab-panel]').forEach(function (p) { p.classList.toggle('hidden', p.getAttribute('data-tab-panel') !== key); });
    });
  });

  // Pilih bintang ulasan
  $$('[data-stars]').forEach(function (wrap) {
    var input = wrap.querySelector('input[type=hidden]');
    var btns = $$('button', wrap);
    function paint(n) { btns.forEach(function (b, i) { b.classList.toggle('is-on', i < n); }); }
    var label = wrap.parentNode.querySelector('[data-star-label]');
    var words = ['Kurang', 'Biasa saja', 'Lumayan', 'Enak', 'Enak sekali'];
    btns.forEach(function (b, i) { b.addEventListener('click', function () { input.value = i + 1; paint(i + 1); if (label) label.textContent = (i + 1) + ' dari 5: ' + words[i]; }); });
    paint(0);
  });

  // Pratinjau gambar sebelum diunggah
  $$('input[type=file][data-preview]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var img = document.getElementById(inp.getAttribute('data-preview'));
      var f = inp.files && inp.files[0];
      if (f && img) { img.src = URL.createObjectURL(f); img.classList.remove('hidden'); }
    });
  });

  // Checkout: alamat hanya untuk "diantar"; ongkos, zona, dan potongan promo dihitung server lewat /checkout/hitung.json
  var ful = $$('input[name="fulfillment"]');
  var addr = document.getElementById('address-box');
  var zoneBox = document.getElementById('zone-box');
  var zoneSel = document.getElementById('zona');
  var vRadios = $$('input[name="voucher"]');
  var vMsg = document.getElementById('voucher-msg');
  var curVoucher = function () { return (vRadios.filter(function (r) { return r.checked; })[0] || {}).value || ''; };
  var feeRow = document.getElementById('fee-row');
  var feeEl = document.getElementById('fee-amount');
  var discRow = document.getElementById('discount-row');
  var discEl = document.getElementById('discount-amount');
  var totalEl = document.getElementById('total-amount');
  var quoteForm = document.querySelector('form[data-quote-url]');
  var rpFmt = function (n) { return 'Rp\u00a0' + Number(n).toLocaleString('id-ID'); };
  var curFul = function () { return (ful.filter(function (r) { return r.checked; })[0] || {}).value; };
  var refreshQuote = function () {
    if (!quoteForm || !window.fetch || !totalEl) return;
    var f = curFul();
    var url = quoteForm.getAttribute('data-quote-url') + '?fulfillment=' + encodeURIComponent(f) + '&zona=' + encodeURIComponent(zoneSel ? zoneSel.value : '') + '&kode=' + encodeURIComponent(curVoucher());
    fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) return;
        if (feeRow) feeRow.classList.toggle('hidden', f !== 'delivery');
        if (feeEl) feeEl.textContent = d.zoneError ? 'pilih zona' : rpFmt(d.fee);
        if (discRow) discRow.classList.toggle('hidden', !d.discount);
        if (discEl) discEl.textContent = '- ' + rpFmt(d.discount);
        totalEl.textContent = rpFmt(d.total);
        if (vMsg && curVoucher()) vMsg.textContent = d.voucherError ? d.voucherError : (d.voucherCode ? 'Kode ' + d.voucherCode + ' dipakai. Kamu hemat ' + rpFmt(d.discount) + '.' : '');
        else if (vMsg) vMsg.textContent = '';
      })
      .catch(function () {});
  };
  function syncFul() {
    var v = curFul();
    if (addr) addr.classList.toggle('hidden', v !== 'delivery');
    if (zoneBox) zoneBox.classList.toggle('hidden', v !== 'delivery');
    refreshQuote();
  }
  if (ful.length) { ful.forEach(function (r) { r.addEventListener('change', syncFul); }); syncFul(); }
  if (zoneSel) zoneSel.addEventListener('change', refreshQuote);
  vRadios.forEach(function (r) { r.addEventListener('change', refreshQuote); });

  // Salin tautan: <button data-copy="id-input">
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var input = document.getElementById(b.getAttribute('data-copy'));
      if (!input) return;
      input.select();
      var done = function () { var t = b.textContent; b.textContent = 'Tersalin'; setTimeout(function () { b.textContent = t; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(input.value).then(done, function () { document.execCommand('copy'); done(); });
      else { document.execCommand('copy'); done(); }
    });
  });

  // Penjual: cek pesanan baru tiap 30 detik (hanya saat tab terlihat), tanpa memuat ulang halaman
  var pollUrl = document.body.getAttribute('data-poll');
  if (pollUrl && window.fetch) {
    var lastSeen = Number(document.body.getAttribute('data-latest') || 0);
    var baseTitle = document.title;
    var bar = document.getElementById('new-order-bar');
    var badges = $$('[data-attn-badge]');
    var check = function () {
      if (document.visibilityState !== 'visible') return;
      fetch(pollUrl, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d) return;
          var n = Number(d.attention) || 0;
          badges.forEach(function (el) { el.textContent = n; el.classList.toggle('hidden', n === 0); });
          document.title = (n > 0 ? '(' + n + ') ' : '') + baseTitle;
          if (Number(d.latest) > lastSeen && bar) bar.classList.remove('hidden');
        })
        .catch(function () {});
    };
    setInterval(check, 30000);
    document.addEventListener('visibilitychange', check);
  }
  // Suara notifikasi (nada singkat dibuat langsung di browser, tanpa berkas). Bisa dimatikan.
  var soundOn = function () { try { return localStorage.getItem('sr_sound') !== 'off'; } catch (e) { return true; } };
  var audioCtx = null;
  var unlockAudio = function () {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* abaikan */ }
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, unlockAudio, { passive: true }); });
  var chime = function () {
    if (!soundOn() || !audioCtx || audioCtx.state !== 'running') return;
    var t0 = audioCtx.currentTime;
    [[784, 0], [1047, 0.16], [1319, 0.32]].forEach(function (n) {
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = n[0];
      g.gain.setValueAtTime(0.0001, t0 + n[1]);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + n[1] + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n[1] + 0.5);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t0 + n[1]); o.stop(t0 + n[1] + 0.55);
    });
  };
  var soundBtn = document.querySelector('[data-sound-toggle]');
  if (soundBtn) {
    var paintSound = function () { soundBtn.textContent = soundOn() ? 'Suara notifikasi: nyala (ketuk untuk mematikan)' : 'Suara notifikasi: mati (ketuk untuk menyalakan)'; };
    paintSound();
    soundBtn.addEventListener('click', function () {
      try { localStorage.setItem('sr_sound', soundOn() ? 'off' : 'on'); } catch (e) { /* abaikan */ }
      unlockAudio(); paintSound(); chime();
    });
  }

  // Popup notifikasi di pojok layar
  var toastBox = null;
  var showToast = function (it) {
    if (!toastBox) {
      toastBox = document.createElement('div');
      toastBox.className = 'sr-toasts';
      toastBox.setAttribute('role', 'status');
      toastBox.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastBox);
    }
    var el = document.createElement(it.url ? 'a' : 'div');
    el.className = 'sr-toast';
    if (it.url) el.href = it.url;
    var b = document.createElement('b'); b.textContent = it.title; el.appendChild(b);
    if (it.body) { var p = document.createElement('span'); p.textContent = it.body; el.appendChild(p); }
    var x = document.createElement('button');
    x.type = 'button'; x.className = 'x'; x.setAttribute('aria-label', 'Tutup'); x.textContent = '×';
    x.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); el.remove(); });
    el.appendChild(x);
    toastBox.appendChild(el);
    while (toastBox.children.length > 3) toastBox.removeChild(toastBox.firstChild);
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 400); }, 9000);
  };

  // Lonceng: cek notifikasi baru tiap 8 detik (hanya saat tab terlihat), munculkan popup dan bunyi
  var bell = document.querySelector('.sr-bell[data-last]');
  var bellBadges = $$('[data-notif-badge]');
  if (bell && window.fetch) {
    var seenKey = 'sr_seen_' + (bell.getAttribute('data-uid') || '0');
    var lastId = 0;
    var readSeen = function () { try { return Number(localStorage.getItem(seenKey)) || 0; } catch (e) { return 0; } };
    var saveSeen = function (n) { try { localStorage.setItem(seenKey, String(n)); } catch (e) { /* abaikan */ } };
    var first = true;
    var checkBell = function () {
      if (document.visibilityState !== 'visible') return;
      // Pengecekan pertama setelah halaman dibuka: tampilkan juga notifikasi yang belum dibaca dan belum pernah dimunculkan
      var url = first ? '/notifikasi/ringkas.json?unread=1&after=' + readSeen() : '/notifikasi/ringkas.json?after=' + lastId;
      fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d) return;
          var n = Number(d.unread) || 0;
          bellBadges.forEach(function (el) { el.textContent = n; el.classList.toggle('hidden', n === 0); });
          if (d.items && d.items.length && location.pathname !== '/notifikasi') {
            d.items.forEach(showToast);
            chime();
          }
          first = false;
          lastId = Number(d.last) || 0;
          saveSeen(lastId);
        })
        .catch(function () {});
    };
    setInterval(checkBell, 8000);
    setTimeout(checkBell, 1200);
    document.addEventListener('visibilitychange', checkBell);
  }

  // Sinkron otomatis notifikasi browser: kalau izin sudah diberikan di perangkat ini, daftarkan perangkat ke akun yang sedang login.
  // Ini membuat kabar sampai ke akun yang terakhir dipakai di perangkat ini (misalnya saat berganti akun penjual dan pelanggan).
  var syncBell = document.querySelector('.sr-bell[data-key]');
  if (syncBell && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && Notification.permission === 'granted') {
    var syncKey = 'sr_pushsync_' + (syncBell.getAttribute('data-uid') || '0');
    var doneRecently = false;
    try { doneRecently = Date.now() - Number(sessionStorage.getItem(syncKey) || 0) < 600000; } catch (e) { /* abaikan */ }
    if (!doneRecently) {
      var b64s = function (buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); };
      var keyToArr = function (b64) {
        var pad = '='.repeat((4 - b64.length % 4) % 4);
        var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
        var out = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out;
      };
      navigator.serviceWorker.register('/sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) {
          return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToArr(syncBell.getAttribute('data-key')) });
        });
      }).then(function (sub) {
        return fetch('/notifikasi/push/daftar', {
          method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' },
          body: new URLSearchParams({ _csrf: syncBell.getAttribute('data-csrf'), endpoint: sub.endpoint, p256dh: b64s(sub.getKey('p256dh')), auth: b64s(sub.getKey('auth')) }),
        });
      }).then(function (r) {
        if (r && r.ok) { try { sessionStorage.setItem(syncKey, String(Date.now())); } catch (e) { /* abaikan */ } }
      }).catch(function () {});
    }
  }

  // Halaman detail pesanan (pelanggan): cek status tiap 6 detik. Kalau berubah, popup + nada, lalu halaman dimuat ulang.
  var watchEl = document.querySelector('[data-order-watch]');
  if (watchEl && window.fetch) {
    var curStatus = watchEl.getAttribute('data-status');
    var curPay = watchEl.getAttribute('data-pay');
    var watchUrl = watchEl.getAttribute('data-order-watch');
    var changed = false;
    var checkOrder = function () {
      if (changed || document.visibilityState !== 'visible') return;
      fetch(watchUrl, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.ok || changed) return;
          if (d.status !== curStatus || d.pay !== curPay) {
            changed = true;
            showToast({ title: 'Status pesanan berubah', body: 'Sekarang: ' + d.label + (d.pay && d.pay !== curPay && d.payLabel ? ' (pembayaran: ' + d.payLabel.toLowerCase() + ')' : '') });
            chime();
            setTimeout(function () { window.location.reload(); }, 2500);
          }
        })
        .catch(function () {});
    };
    setInterval(checkOrder, 6000);
    document.addEventListener('visibilitychange', checkOrder);
    window.addEventListener('focus', checkOrder);
  }

  // Notifikasi browser (Web Push): aktifkan atau matikan di perangkat ini
  var pushOn = document.querySelector('[data-push-on]');
  var pushOff = document.querySelector('[data-push-off]');
  var pushState = document.querySelector('[data-push-state]');
  if (pushOn && pushState) {
    var supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    var say = function (t) { pushState.textContent = t; };
    var toKey = function (b64) {
      var pad = '='.repeat((4 - b64.length % 4) % 4);
      var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
      var out = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
      return out;
    };
    var b64 = function (buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); };
    var post = function (url, data) {
      var body = new URLSearchParams(data);
      return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' }, body: body });
    };
    var show = function (active) {
      pushOn.classList.toggle('hidden', active);
      if (pushOff) pushOff.classList.toggle('hidden', !active);
      say(active ? 'Aktif di perangkat ini.' : 'Belum aktif di perangkat ini.');
    };
    if (!supported) {
      pushOn.classList.add('hidden');
      say('Browser ini belum mendukung notifikasi. Coba Chrome di Android, atau pasang situs ke Layar Utama di iPhone.');
    } else {
      navigator.serviceWorker.register('/sw.js').then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) { show(!!sub); });
      }).catch(function () { say('Notifikasi butuh alamat https atau localhost.'); });
      pushOn.addEventListener('click', function () {
        pushOn.disabled = true;
        Notification.requestPermission().then(function (perm) {
          if (perm !== 'granted') { say('Izin ditolak. Buka pengaturan situs di browser dan izinkan notifikasi.'); pushOn.disabled = false; return null; }
          return navigator.serviceWorker.ready.then(function (reg) {
            return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(pushOn.getAttribute('data-key')) });
          }).then(function (sub) {
            return post('/notifikasi/push/daftar', {
              _csrf: pushOn.getAttribute('data-csrf'), endpoint: sub.endpoint,
              p256dh: b64(sub.getKey('p256dh')), auth: b64(sub.getKey('auth')),
            }).then(function (r) { if (!r.ok) throw new Error('gagal'); show(true); });
          });
        }).catch(function (e) { say('Gagal mengaktifkan (' + (e && e.name ? e.name : 'error') + (e && e.message ? ': ' + e.message : '') + '). Coba lagi, atau muat ulang halaman.'); if (window.console) console.error('push', e); })
          .then(function () { pushOn.disabled = false; });
      });
      if (pushOff) pushOff.addEventListener('click', function () {
        navigator.serviceWorker.ready.then(function (reg) {
          return reg.pushManager.getSubscription().then(function (sub) {
            if (!sub) return show(false);
            var ep = sub.endpoint;
            return sub.unsubscribe().then(function () { return post('/notifikasi/push/hapus', { _csrf: pushOff.getAttribute('data-csrf'), endpoint: ep }); }).then(function () { show(false); });
          });
        }).catch(function () { say('Gagal mematikan. Coba lagi.'); });
      });
    }
  }
})();

// Tabel menjadi kartu di HP: beri label tiap sel dari judul kolom, dan geser menu atas ke halaman aktif.
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('table.sr-table').forEach(function (t) {
      var heads = Array.prototype.map.call(t.querySelectorAll('thead th'), function (h) { return h.textContent.trim(); });
      t.querySelectorAll('tbody tr').forEach(function (tr) {
        Array.prototype.forEach.call(tr.children, function (td, i) {
          td.setAttribute('data-label', heads[i] || '');
          if (heads[i]) {
            var v = document.createElement('div');
            v.className = 'v';
            while (td.firstChild) v.appendChild(td.firstChild);
            td.appendChild(v);
          }
        });
      });
    });
    var a = document.querySelector('.sr-subnav a[aria-current]');
    if (a && a.parentNode && a.parentNode.scrollWidth > a.parentNode.clientWidth) {
      var c = a.parentNode;
      c.scrollLeft = a.offsetLeft - (c.clientWidth - a.offsetWidth) / 2;
    }
  });
})();

// Kotak unggah gambar: pratinjau langsung, nama dan ukuran file, serta cek ukuran sebelum dikirim
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-up]').forEach(function (box) {
      var input = box.querySelector('.sr-up-input');
      var img = box.querySelector('.sr-up-img');
      var ph = box.querySelector('.sr-up-ph');
      var change = box.querySelector('.sr-up-change');
      var info = box.querySelector('.sr-up-info');
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        info.textContent = '';
        box.classList.remove('is-bad');
        if (!f) return;
        var max = (parseFloat(input.getAttribute('data-max-mb')) || 10) * 1024 * 1024;
        if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
          info.textContent = 'File harus berupa gambar JPG, PNG, atau WEBP.';
        } else if (f.size > max) {
          info.textContent = 'Ukuran file ' + (f.size / 1048576).toFixed(1).replace('.', ',') + ' MB, maksimal ' + (max / 1048576) + ' MB. Pilih foto yang lebih kecil.';
        } else {
          if (img.dataset.blob) URL.revokeObjectURL(img.dataset.blob);
          var u = URL.createObjectURL(f);
          img.dataset.blob = u;
          img.src = u;
          img.classList.remove('hidden');
          if (ph) ph.classList.add('hidden');
          if (change) change.textContent = 'Ganti foto';
          info.textContent = f.name + ' · ' + (f.size >= 1048576 ? (f.size / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.round(f.size / 1024) + ' KB');
          return;
        }
        box.classList.add('is-bad');
        input.value = '';
      });
    });
  });
})();
