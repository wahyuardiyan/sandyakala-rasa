// Interaksi kecil untuk halaman masuk & daftar (tanpa library).
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };

  // Lihat / sembunyikan password
  Array.prototype.forEach.call(document.querySelectorAll('[data-reveal]'), function (b) {
    b.addEventListener('click', function () {
      var i = document.getElementById(b.getAttribute('data-reveal'));
      if (!i) return;
      var show = i.type === 'password';
      i.type = show ? 'text' : 'password';
      b.textContent = show ? 'Sembunyikan' : 'Lihat';
      b.setAttribute('aria-pressed', show ? 'true' : 'false');
    });
  });

  // Pilihan peran: tampilkan kolom nama toko untuk penjual
  var reveal = document.getElementById('store-reveal');
  var radios = document.querySelectorAll('input[name="role"]');
  function syncRole() {
    var on = '';
    Array.prototype.forEach.call(radios, function (r) {
      r.closest('.opt').classList.toggle('is-on', r.checked);
      if (r.checked) on = r.value;
    });
    if (!reveal) return;
    var open = on === 'merchant';
    reveal.classList.toggle('open', open);
    if (open) reveal.removeAttribute('inert'); else reveal.setAttribute('inert', '');
    var sn = document.getElementById('store_name');
    if (sn) sn.required = open;
  }
  Array.prototype.forEach.call(radios, function (r) { r.addEventListener('change', syncRole); });
  if (radios.length) syncRole();

  // Kekuatan password
  var pw = document.getElementById('password');
  var meter = document.getElementById('meter');
  var hint = document.getElementById('pw-hint');
  if (pw && meter && hint) {
    pw.addEventListener('input', function () {
      var v = pw.value, level = 0, text = 'Minimal 8 karakter.';
      if (v.length > 0 && v.length < 8) { level = 1; text = 'Kurang panjang: baru ' + v.length + ' dari 8 karakter.'; }
      else if (v.length >= 8) {
        var kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(function (re) { return re.test(v); }).length;
        if (v.length >= 12 || kinds >= 3) { level = 3; text = 'Kuat.'; }
        else { level = 2; text = 'Cukup. Tambah huruf besar, angka, atau panjangkan agar lebih kuat.'; }
      }
      meter.setAttribute('data-level', String(level));
      hint.textContent = text;
    });
  }

  // Cek kecocokan password saat meninggalkan kolom
  var pc = document.getElementById('password_confirmation');
  var pcMsg = document.getElementById('pc-msg');
  if (pw && pc && pcMsg) {
    var check = function () {
      var bad = pc.value !== '' && pc.value !== pw.value;
      pcMsg.hidden = !bad;
      pc.closest('.field').classList.toggle('has-error', bad);
    };
    pc.addEventListener('blur', check);
    pc.addEventListener('input', function () { if (!pcMsg.hidden) check(); });
  }

  // Cegah kirim ganda
  Array.prototype.forEach.call(document.querySelectorAll('form[data-form]'), function (f) {
    f.addEventListener('submit', function () {
      var b = $('button[type=submit]', f);
      if (!b || b.getAttribute('aria-busy') === 'true') return;
      b.setAttribute('aria-busy', 'true');
      b.textContent = b.getAttribute('data-busy') || 'Memproses…';
      setTimeout(function () { b.disabled = true; }, 0);
    });
  });
})();
