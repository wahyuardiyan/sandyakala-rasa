// Ilustrasi vektor sederhana untuk foto menu contoh. Hanya dipakai oleh scripts/demo-toko.js.
// Semua gambar dibuat dari bentuk dasar (SVG), tanpa unduhan dari internet.
const W = 400, H = 300;

// Pengacak tetap supaya gambar yang sama selalu menghasilkan hasil yang sama
function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const f = (n) => Math.round(n * 10) / 10;
const circ = (x, y, r, fill, extra = '') => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}" ${extra}/>`;
const ell = (x, y, rx, ry, fill, rot = 0, extra = '') => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}" transform="rotate(${rot} ${f(x)} ${f(y)})" ${extra}/>`;
const rect = (x, y, w, h, r, fill, rot = 0, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${r}" fill="${fill}" transform="rotate(${rot} ${f(x + w / 2)} ${f(y + h / 2)})" ${extra}/>`;

function scene(bgA, bgB, inner, seed = 'x') {
  return `<defs><linearGradient id="bg${seed}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bgA}"/><stop offset="1" stop-color="${bgB}"/></linearGradient></defs>`
    + `<rect width="${W}" height="${H}" fill="url(#bg${seed})"/>` + inner;
}

function plate(cx = 200, cy = 152, r = 108, tone = '#fffaf2') {
  return ell(cx + 4, cy + 10, r, r * 0.97, 'rgba(60,35,20,.18)')
    + circ(cx, cy, r, tone) + circ(cx, cy, r - 12, 'none', 'stroke="#eadcc8" stroke-width="3"') + circ(cx, cy, r - 26, '#fff', 'opacity=".55"');
}
function bowl(cx = 200, cy = 152, r = 112, broth = '#e9b64a') {
  return ell(cx + 4, cy + 10, r, r, 'rgba(60,35,20,.2)')
    + circ(cx, cy, r, '#b4501f') + circ(cx, cy, r - 7, '#f6ead8') + circ(cx, cy, r - 17, broth) + circ(cx, cy, r - 17, 'none', 'stroke="rgba(255,255,255,.35)" stroke-width="3"');
}

function riceMound(x, y, r, tone = '#fffdf8', seed = 'r') {
  const R = rng(seed);
  let g = circ(x, y, r, tone) + circ(x - r * 0.25, y - r * 0.3, r * 0.55, '#fff', 'opacity=".7"');
  for (let i = 0; i < 26; i++) {
    const a = R() * 6.283, d = Math.sqrt(R()) * r * 0.85;
    g += ell(x + Math.cos(a) * d, y + Math.sin(a) * d, 3.2, 1.5, 'rgba(180,160,130,.45)', R() * 180);
  }
  return g;
}
const slices = (x, y, n, seed) => { const R = rng(seed); let g = ''; for (let i = 0; i < n; i++) { const a = (i / n) * 6.283; g += circ(x + Math.cos(a) * 15 * (n > 3 ? 1 : 0.4) + R() * 3, y + Math.sin(a) * 15 * (n > 3 ? 1 : 0.4), 9, '#8fb35a') + circ(x + Math.cos(a) * 15 * (n > 3 ? 1 : 0.4) + R() * 3, y + Math.sin(a) * 15 * (n > 3 ? 1 : 0.4), 5.5, '#d9e8b0'); } return g; };
const crumbs = (cx, cy, r, n, colors, seed, size = 2.4) => { const R = rng(seed); let g = ''; for (let i = 0; i < n; i++) { const a = R() * 6.283, d = Math.sqrt(R()) * r; g += circ(cx + Math.cos(a) * d, cy + Math.sin(a) * d, size * (0.6 + R() * 0.8), colors[Math.floor(R() * colors.length)]); } return g; };
const leaf = (x, y, rot, c = '#5c9a4a') => ell(x, y, 16, 7, c, rot) + `<line x1="${f(x - 14 * Math.cos(rot * Math.PI / 180))}" y1="${f(y - 14 * Math.sin(rot * Math.PI / 180))}" x2="${f(x + 14 * Math.cos(rot * Math.PI / 180))}" y2="${f(y + 14 * Math.sin(rot * Math.PI / 180))}" stroke="rgba(255,255,255,.5)" stroke-width="1.5"/>`;
const chili = (x, y, rot) => `<g transform="rotate(${rot} ${x} ${y})">${rect(x - 14, y - 4, 28, 8, 4, '#d63a1f')}${rect(x - 16, y - 2, 6, 4, 2, '#4f8a3a')}</g>`;

// ---------- Piring dan mangkuk (tampak atas) ----------
function nasiAyam(seed) {
  const R = rng(seed);
  let g = plate() + riceMound(150, 150, 50, '#fffdf8', seed);
  for (const [x, y, rot] of [[236, 120, -20], [244, 170, 24]]) {
    g += rect(x - 36, y - 20, 72, 40, 18, '#b9651d', rot) + rect(x - 30, y - 15, 60, 30, 14, '#d58a32', rot) + crumbs(x, y, 24, 14, ['#f2c37a', '#9a5014'], seed + x, 2.5);
  }
  g += ell(215, 208, 30, 14, '#c92a17') + crumbs(215, 208, 20, 10, ['#e8503a', '#8e1608'], seed + 's', 2);
  g += slices(150, 214, 2, seed) + circ(110, 108, 12, '#e24b34') + circ(108, 106, 5, '#f3806c');
  return g + chili(250, 215, 20);
}
function rendang(seed) {
  let g = plate() + riceMound(145, 150, 52, '#fffdf8', seed);
  const chunks = [[232, 118, 30], [262, 150, 26], [230, 172, 32], [205, 130, 22], [248, 202, 22]];
  for (const [x, y, r] of chunks) g += rect(x - r, y - r * 0.7, r * 2, r * 1.4, r * 0.5, '#4a2214', x) + rect(x - r + 5, y - r * 0.7 + 4, r * 2 - 14, r * 1.4 - 12, r * 0.4, '#6e3820', x) + crumbs(x, y, r * 0.7, 6, ['#9c5a30', '#2f130a'], seed + x, 2);
  return g + leaf(120, 214, -30) + leaf(170, 220, 25, '#6aa84f') + circ(120, 100, 10, '#e24b34');
}
function nasiGoreng(seed) {
  let g = plate() + circ(190, 156, 66, '#c46a24') + circ(186, 150, 56, '#d98438') + crumbs(190, 156, 56, 60, ['#7a3c10', '#f0b96a', '#fff0d0', '#4f8a3a', '#b63b22'], seed, 3);
  g += circ(266, 108, 32, '#fffdf5') + circ(266, 108, 32, 'none', 'stroke="#efe3cf" stroke-width="2"') + circ(268, 108, 13, '#f2a900') + circ(264, 104, 4, 'rgba(255,255,255,.7)');
  for (const [x, y] of [[120, 92], [150, 70]]) g += circ(x, y, 24, '#f1d9a3') + circ(x, y, 24, 'none', 'stroke="#d3b374" stroke-width="2"') + circ(x, y, 12, '#e8c987', 'opacity=".7"');
  return g + slices(268, 212, 3, seed) + circ(136, 218, 11, '#e24b34');
}
function soto(seed) {
  let g = bowl(200, 152, 116, '#f0c23c') + crumbs(200, 152, 84, 40, ['#fff2c8', '#e5a91d'], seed, 2.5);
  for (let i = 0; i < 7; i++) { const a = i * 0.9; g += rect(200 + Math.cos(a) * 36 - 12, 152 + Math.sin(a) * 30 - 6, 26, 11, 5, '#f7e4b0', a * 57); }
  g += ell(228, 122, 26, 20, '#fffbea') + ell(228, 124, 13, 10, '#f2a900') + ell(168, 188, 24, 18, '#fffbea') + ell(168, 190, 12, 9, '#f2a900');
  g += crumbs(200, 152, 80, 30, ['#4f8a3a', '#8fc25a'], seed + 'g', 2.2) + ell(300, 215, 22, 12, '#9bc450', -20) + ell(300, 215, 12, 6, '#d6ec9a', -20);
  return g;
}
function bakso(seed) {
  const R = rng(seed);
  let g = bowl(200, 152, 116, '#d9a24e');
  for (let i = 0; i < 9; i++) { const a = R() * 6.283, d = 30 + R() * 38; g += `<path d="M${f(200 + Math.cos(a) * d - 30)},${f(152 + Math.sin(a) * d)} q15,-14 30,0 t30,0" stroke="#f0d27a" stroke-width="5" fill="none" stroke-linecap="round"/>`; }
  for (const [x, y, r] of [[170, 128, 25], [230, 134, 27], [200, 182, 26], [148, 176, 20], [256, 188, 20]]) g += circ(x, y, r, '#8a5b3a') + circ(x, y, r - 2, '#a77650') + circ(x - r * 0.3, y - r * 0.3, r * 0.3, 'rgba(255,255,255,.35)');
  g += ell(200, 100, 24, 10, '#5c9a4a', 15) + ell(150, 140, 20, 9, '#6aa84f', -35) + crumbs(200, 152, 80, 24, ['#3f7a2f'], seed + 'o', 2.2);
  return g + rect(270, 100, 36, 36, 6, '#e8c26a', 20) + circ(110, 108, 11, '#c92a17');
}
function mieAyam(seed) {
  const R = rng(seed);
  let g = bowl(200, 152, 116, '#f6e7b8');
  for (let i = 0; i < 12; i++) { const y = 98 + i * 9; g += `<path d="M${f(122 + R() * 10)},${y} q18,-12 36,0 t36,0 t36,0 t30,0" stroke="#f0c85a" stroke-width="6" fill="none" stroke-linecap="round" opacity=".95"/>`; }
  g += ell(200, 150, 46, 36, '#7a3f1c') + crumbs(200, 150, 38, 30, ['#a05d2e', '#4a2214', '#c98a52'], seed, 4);
  g += leaf(150, 120, -30) + leaf(256, 118, 30, '#6aa84f') + crumbs(200, 152, 70, 16, ['#4f8a3a'], seed + 'g', 2.2);
  for (const [x, y] of [[262, 190], [286, 160]]) g += `<path d="M${x - 16},${y - 12} q16,-10 32,0 q-2,22 -16,26 q-14,-4 -16,-26 Z" fill="#e8b24a"/>`;
  return g;
}
function sate(seed) {
  let g = plate(200, 150, 112, '#fff6e6');
  for (let i = 0; i < 4; i++) {
    const y = 96 + i * 34;
    g += `<g transform="rotate(-8 200 ${y})"><rect x="78" y="${y - 2}" width="244" height="4" rx="2" fill="#d8b684"/>`;
    for (let k = 0; k < 4; k++) g += rect(150 + k * 38, y - 15, 38, 30, 11, k % 2 ? '#6e3414' : '#7f3f18') + rect(154 + k * 38, y - 11, 30, 22, 8, '#a8602a') + circ(168 + k * 38, y - 4, 3, '#4f2410');
    g += '</g>';
  }
  g += `<g>${rect(52, 200, 70, 50, 14, '#fff')}${ell(87, 222, 28, 16, '#b96b2a')}${crumbs(87, 222, 22, 12, ['#7a3c10', '#e8b070'], seed, 2)}</g>`;
  return g + rect(250, 218, 28, 26, 5, '#fffdf8', 8) + rect(284, 212, 28, 26, 5, '#fffdf8', -6) + circ(112, 92, 12, '#e24b34') + `<circle cx="90" cy="92" r="8" fill="#d9c27a"/>`;
}
function snack(kind, seed) {
  const R = rng(seed);
  let g = plate();
  const place = (n, fn) => { for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + R() * 0.4, d = n > 3 ? 52 + R() * 12 : 36; fn(200 + Math.cos(a) * d, 150 + Math.sin(a) * d, a * 57, i); } };
  if (kind === 'pisang') {
    place(5, (x, y, rot) => { g += rect(x - 42, y - 17, 84, 34, 17, '#bf7a25', rot) + rect(x - 38, y - 13, 76, 26, 13, '#e3a43f', rot) + crumbs(x, y, 28, 14, ['#f8e08a', '#fff2b0'], seed + x, 3); });
    g += circ(200, 150, 22, '#e3a43f') + crumbs(200, 150, 18, 10, ['#f8e08a'], seed + 'c', 3);
  } else if (kind === 'risoles') {
    place(4, (x, y, rot) => { g += ell(x, y, 44, 26, '#b5671a', rot) + ell(x, y, 40, 22, '#e0a240', rot) + crumbs(x, y, 28, 18, ['#f3c670', '#c78226'], seed + x, 2.6); });
    g += ell(200, 150, 18, 11, '#e0a240') + circ(100, 205, 9, '#c92a17');
  } else if (kind === 'tahu') {
    place(6, (x, y, rot) => { g += rect(x - 26, y - 26, 52, 52, 10, '#c4852f', rot) + rect(x - 22, y - 22, 44, 44, 8, '#e8b55a', rot) + crumbs(x, y, 20, 14, ['#f7dc94', '#b9701f'], seed + x, 2.8); });
    g += chili(120, 222, -20) + chili(285, 222, 25) + circ(200, 150, 24, '#e8b55a');
  } else if (kind === 'bakwan') {
    place(5, (x, y, rot) => { g += circ(x, y, 34, '#b5671a') + circ(x, y, 30, '#dba03f') + crumbs(x, y, 26, 18, ['#4f8a3a', '#e8503a', '#f3c670'], seed + x, 3.2); });
    g += chili(285, 225, 15);
  } else if (kind === 'klepon') {
    place(6, (x, y) => { g += circ(x, y, 25, '#5f9a3a') + circ(x, y, 22, '#7bb84c') + crumbs(x, y, 19, 18, ['#fff', '#f4f4ee'], seed + x, 2.6) + circ(x - 8, y - 9, 6, 'rgba(255,255,255,.35)'); });
    g += circ(200, 150, 24, '#7bb84c') + crumbs(200, 150, 19, 18, ['#fff'], seed, 2.6);
  } else if (kind === 'dadar') {
    place(4, (x, y, rot) => { g += rect(x - 40, y - 20, 80, 40, 20, '#4f8a3a', rot) + rect(x - 36, y - 16, 72, 32, 16, '#78b34a', rot) + ell(x + Math.cos(rot * 0.0175) * 38, y + Math.sin(rot * 0.0175) * 38 * 0.1, 8, 15, '#7a3f1c', rot) + crumbs(x, y, 28, 10, ['#9bd05e'], seed + x, 2); });
  }
  return g;
}
function martabak(kind, seed) {
  let g = plate(200, 152, 112, '#fff6e6');
  if (kind === 'manis') {
    for (let i = 0; i < 3; i++) g += rect(96 + i * 6, 86 + i * 18, 208 - i * 12, 56, 16, i === 0 ? '#9a5a1a' : '#c98a2c', i * -2) + rect(104 + i * 6, 92 + i * 18, 192 - i * 12, 44, 12, i === 0 ? '#d9a13e' : '#e8b955', i * -2);
    g += rect(110, 92, 180, 44, 12, '#e8b955') + crumbs(200, 114, 80, 50, ['#4a2214', '#fff2c4', '#f6d36b'], seed, 3.4) + rect(112, 120, 176, 12, 6, '#4a2214', 0, 'opacity=".85"');
    g += rect(100, 156, 200, 50, 16, '#c98a2c') + rect(108, 162, 184, 38, 12, '#e8b955') + rect(116, 170, 168, 8, 4, '#4a2214') + rect(116, 184, 168, 8, 4, '#f6efd2');
  } else {
    g += rect(100, 88, 200, 110, 16, '#b8721f') + rect(108, 96, 184, 94, 12, '#e0a444') + crumbs(200, 143, 84, 40, ['#f3c670', '#b9701f'], seed, 3);
    g += `<path d="M108,143 H292 M200,96 V190" stroke="#b8721f" stroke-width="3" opacity=".7"/>` + leaf(130, 224, -20) + circ(268, 224, 10, '#c92a17');
  }
  return g;
}
function lapis(kind) {
  const cols = kind === 'pelangi' ? ['#e8503a', '#f5a53a', '#f2d54a', '#6bbf59', '#4a9fd8', '#8a5fc4'] : ['#7a3f1c', '#e8b55a', '#7a3f1c', '#e8b55a', '#7a3f1c', '#e8b55a', '#7a3f1c'];
  let g = ell(205, 232, 130, 22, 'rgba(60,35,20,.2)') + ell(200, 226, 126, 20, '#fffaf2');
  const h = 130 / cols.length;
  cols.forEach((c, i) => { g += rect(92, 100 + i * h, 216, h + 1, 0, c); });
  g += `<path d="M92,100 L128,70 L344,70 L308,100 Z" fill="${cols[0]}" opacity=".95"/><path d="M308,100 L344,70 V200 L308,230 Z" fill="rgba(0,0,0,.18)"/>`;
  cols.forEach((c, i) => { g += `<path d="M308,${f(100 + i * h)} L344,${f(70 + i * h)} v${f(h)} L308,${f(100 + (i + 1) * h)} Z" fill="${c}" opacity=".78"/>`; });
  return g;
}
function klepon() { return snack('klepon', 'k'); }

// ---------- Minuman (tampak samping) ----------
function glass(layers, { ice = true, straw = '#e8503a', slice = null, pearls = false, tall = false, seed = 'g' } = {}) {
  const top = tall ? 52 : 66, bot = 252, wT = 108, wB = 84, cx = 200;
  const R = rng(seed);
  const body = `M${cx - wT},${top} L${cx + wT},${top} L${cx + wB},${bot} Q${cx},${bot + 14} ${cx - wB},${bot} Z`;
  let g = ell(cx + 8, bot + 16, 118, 14, 'rgba(60,35,20,.22)') + `<defs><clipPath id="c${seed}"><path d="${body}"/></clipPath></defs>`;
  g += `<path d="${body}" fill="rgba(255,255,255,.55)"/>`;
  let y = top + 22;
  const total = bot - y;
  g += `<g clip-path="url(#c${seed})">`;
  let acc = y;
  for (const [c, share] of layers) { g += `<rect x="${cx - wT}" y="${f(acc)}" width="${wT * 2}" height="${f(total * share + 2)}" fill="${c}"/>`; acc += total * share; }
  if (ice) for (let i = 0; i < 6; i++) g += rect(cx - 80 + R() * 130, y + 6 + R() * (total * 0.55), 40, 40, 8, 'rgba(255,255,255,.42)', R() * 40 - 20, 'stroke="rgba(255,255,255,.7)" stroke-width="2"');
  if (pearls) for (let i = 0; i < 26; i++) g += circ(cx - 66 + R() * 132, bot - 12 - R() * 36, 6.5, '#2a160d') + circ(cx - 68 + R() * 132, bot - 14 - R() * 34, 1.8, 'rgba(255,255,255,.5)');
  g += '</g>';
  g += `<path d="${body}" fill="none" stroke="rgba(255,255,255,.95)" stroke-width="4"/><path d="M${cx - wT + 14},${top + 18} L${cx - wB + 12},${bot - 22}" stroke="rgba(255,255,255,.75)" stroke-width="7" stroke-linecap="round"/>`;
  g += `<rect x="${cx + 18}" y="14" width="9" height="${bot - 40}" rx="4" fill="${straw}" transform="rotate(10 ${cx + 22} 150)"/>`;
  if (slice) g += circ(cx + wT - 8, top + 2, 34, slice[0]) + circ(cx + wT - 8, top + 2, 28, slice[1]) + `<path d="M${cx + wT - 8},${top + 2} m-26,0 h52 M${cx + wT - 8},${top - 24} v52 M${cx + wT - 26},${top - 16} l36,36 M${cx + wT + 10},${top - 16} l-36,36" stroke="${slice[0]}" stroke-width="2"/>`;
  return g;
}
function esCampur(seed) {
  const R = rng(seed);
  let g = ell(208, 262, 120, 14, 'rgba(60,35,20,.22)') + `<path d="M90,110 Q90,248 200,252 Q310,248 310,110 Z" fill="rgba(255,255,255,.6)" stroke="#fff" stroke-width="4"/>` + rect(184, 250, 32, 20, 4, 'rgba(255,255,255,.8)') + rect(150, 268, 100, 10, 5, 'rgba(255,255,255,.85)');
  g += `<path d="M96,132 Q96,240 200,244 Q304,240 304,132 Z" fill="#f2a1b4"/><path d="M96,132 Q96,150 200,150 Q304,150 304,132 Z" fill="#ffe0e8"/>`;
  g += `<path d="M104,92 Q200,40 296,92 Q290,130 200,132 Q110,130 104,92 Z" fill="#fff"/>` + `<path d="M120,90 Q200,52 280,90" fill="none" stroke="#fde7ee" stroke-width="6"/>`;
  const items = [['#e8503a', 11], ['#f2d54a', 10], ['#6bbf59', 10], ['#8a5fc4', 9], ['#f5a53a', 11]];
  for (let i = 0; i < 18; i++) { const [c, r] = items[i % 5]; g += rect(130 + R() * 128, 96 + R() * 26, r, r, 3, c, R() * 60) + circ(120 + R() * 150, 170 + R() * 54, 5 + R() * 3, items[(i + 2) % 5][0]); }
  return g + `<path d="M210,60 q30,-30 40,-48" stroke="#e8503a" stroke-width="9" stroke-linecap="round" fill="none"/>`;
}
function cup(layers, lid = '#fffaf2', seed = 'cup', opts = {}) { return glass(layers, { ...opts, seed, tall: true }); }
function kopiSusu(seed) { return glass([['#f4e7d3', 0.18], ['#d9b48a', 0.2], ['#a8703a', 0.22], ['#5a3318', 0.4]], { seed, straw: '#2f7d6b' }); }
function americano(seed) { return glass([['#3a1f10', 0.55], ['#2a150a', 0.45]], { seed, straw: '#f2a33a', slice: ['#f2c54a', '#fbe591'] }); }
function matcha(seed) { return glass([['#f4f1e4', 0.3], ['#c3d89a', 0.3], ['#7da34a', 0.4]], { seed, straw: '#e8503a' }); }
function hot(seed, c1 = '#7a3f1c') {
  let g = ell(214, 238, 128, 20, 'rgba(60,35,20,.2)') + ell(200, 228, 124, 18, '#fffaf2') + circ(200, 150, 86, '#fff') + circ(200, 150, 74, c1) + circ(200, 150, 74, 'none', 'stroke="rgba(255,255,255,.35)" stroke-width="3"');
  g += `<path d="M262,136 q42,0 40,22 q-2,22 -40,18" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/>` + `<path d="M168,148 q30,-30 62,-2 q-30,32 -62,2 Z" fill="#f4e7d3"/>`;
  return g;
}

// ---------- Daftar jenis gambar ----------
const KINDS = {
  'nasi-ayam': [['#fbe3c4', '#f3c99c'], nasiAyam], rendang: [['#f7d9bd', '#eab98c'], rendang], 'nasi-goreng': [['#fde6c0', '#f3c98a'], nasiGoreng],
  soto: [['#fdf0c8', '#f3d98a'], soto], bakso: [['#fde3cc', '#f3bf9a'], bakso], 'mie-ayam': [['#fdecc8', '#f2cf90'], mieAyam], sate: [['#f6dcc2', '#e9b98c'], sate],
  'pisang-goreng': [['#fdeccb', '#f4cf8e'], (s) => snack('pisang', s)], risoles: [['#fbe7cd', '#f0c694'], (s) => snack('risoles', s)], 'tahu-crispy': [['#fde8c6', '#f1cb8d'], (s) => snack('tahu', s)],
  bakwan: [['#f9e5c9', '#eec58f'], (s) => snack('bakwan', s)], klepon: [['#e3f1d3', '#c6e0a8'], (s) => snack('klepon', s)], 'dadar-gulung': [['#e6f2d6', '#c9e2ad'], (s) => snack('dadar', s)],
  'lapis-legit': [['#f7e1c6', '#ecc79b'], () => lapis('legit')], 'lapis-pelangi': [['#fde9ea', '#f6cdd2'], () => lapis('pelangi')],
  'martabak-manis': [['#fbe0c3', '#efbf8c'], (s) => martabak('manis', s)], 'martabak-telur': [['#fbe5c8', '#eec48d'], (s) => martabak('telur', s)],
  'es-teh': [['#e0f0ee', '#bfe0db'], (s) => glass([['#b5651d', 0.9], ['#9a4f12', 0.1]], { seed: s })],
  'es-jeruk': [['#fff0cc', '#fbd98a'], (s) => glass([['#f7a52a', 1]], { seed: s, slice: ['#f08a1c', '#ffc65a'], straw: '#4f8a3a' })],
  'es-lemon': [['#f4f7d6', '#e2ebab'], (s) => glass([['#d7a23f', 1]], { seed: s, slice: ['#d9c322', '#f6ec8a'], straw: '#e8503a' })],
  'brown-sugar': [['#f4e3d0', '#e5c7a4'], (s) => glass([['#f7ecdc', 0.55], ['#8a4a1c', 0.2], ['#f2e0c8', 0.1], ['#5a2d10', 0.15]], { seed: s, pearls: true, straw: '#2f7d6b', ice: false })],
  'thai-tea': [['#ffe6cf', '#f8c597'], (s) => glass([['#f3dcc0', 0.3], ['#e8801f', 0.7]], { seed: s, straw: '#8a5fc4' })],
  'kopi-susu': [['#efe0cc', '#dcc09c'], kopiSusu], americano: [['#e8e0d6', '#d0c3b2'], americano], matcha: [['#e4efd3', '#c9deaa'], matcha],
  'es-campur': [['#ffe7ee', '#f8c6d4'], esCampur], kopi: [['#efe3d3', '#d9c2a2'], (s) => hot(s, '#6b3516')], 'teh-hangat': [['#f7e9d2', '#ecd0a6'], (s) => hot(s, '#c98a3a')],
};

function dishSvg(kind, seed = kind) {
  const k = KINDS[kind];
  if (!k) throw new Error('Jenis gambar tidak dikenal: ' + kind);
  const id = String(seed).replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'x';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${scene(k[0][0], k[0][1], k[1](id), id)}</svg>`;
}

// Sampul toko: tiga hidangan berjajar di bawah tenda belang
function coverSvg(kinds, colors = ['#b4501f', '#f2a33a']) {
  const parts = kinds.map((k, i) => {
    const inner = KINDS[k][1](k + i);
    return `<g transform="translate(${20 + i * 392} 70) scale(.96)"><clipPath id="cc${i}"><rect width="${W}" height="${H}" rx="22"/></clipPath><g clip-path="url(#cc${i})"><rect width="${W}" height="${H}" fill="${KINDS[k][0][0]}"/>${inner}</g></g>`;
  }).join('');
  let awning = '';
  for (let i = 0; i < 24; i++) awning += `<path d="M${i * 50},0 h50 v34 q-25,22 -50,0 Z" fill="${i % 2 ? colors[1] : colors[0]}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" width="1200" height="400"><rect width="1200" height="400" fill="#f7ead6"/>${awning}<rect y="34" width="1200" height="12" fill="rgba(60,35,20,.12)"/>${parts}</svg>`;
}

module.exports = { dishSvg, coverSvg, KINDS };
