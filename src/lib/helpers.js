const TZ = 'Asia/Jakarta';

class UserError extends Error {} // pesan aman untuk ditampilkan ke pengguna

const rp = (n) => 'Rp\u00a0' + Number(n || 0).toLocaleString('id-ID'); // spasi tak terpisah agar "Rp 5.000" tidak terpecah baris

const toDate = (v) => (v instanceof Date ? v : new Date(v));

const fmtDateTime = (v) =>
  v
    ? new Intl.DateTimeFormat('id-ID', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(toDate(v))
    : '-';

const fmtDate = (v) =>
  v ? new Intl.DateTimeFormat('id-ID', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(toDate(v)) : '-';

// Kunci hari "YYYY-MM-DD" menurut WIB
const dayKey = (v) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(toDate(v));
const monthKey = (v) => dayKey(v).slice(0, 7);
const shortDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(y, m - 1, d)));
};

function lastDays(n) {
  const out = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(new Date(now - i * 86400000)));
  return out;
}

function slugify(s) {
  return (
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'toko'
  );
}

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 150;

// Mengubah "+62 812-3456-7890" / "62812..." / "0812..." menjadi "0812..."; null bila tidak valid
function normalizePhone(input) {
  let d = String(input || '').replace(/[^\d+]/g, '');
  d = d.replace(/^\+/, '');
  if (d.startsWith('62')) d = '0' + d.slice(2);
  else if (d.startsWith('8')) d = '0' + d;
  if (!/^0\d{8,13}$/.test(d)) return null;
  return d;
}

// Nomor lokal (08...) -> format internasional untuk wa.me (62...). null bila tidak valid.
function waNumber(input) {
  const d = normalizePhone(input);
  return d ? '62' + d.slice(1) : null;
}
function waLink(input, text) {
  const n = waNumber(input);
  return n ? 'https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : '') : null;
}

const ORDER_STATUS = {
  pending_payment: { label: 'Menunggu Pembayaran', cls: 'bg-amber-100 text-amber-700' },
  processing: { label: 'Diproses', cls: 'bg-sky-100 text-sky-700' },
  delivering: { label: 'Dikirim / Siap Diambil', cls: 'bg-indigo-100 text-indigo-700' },
  completed: { label: 'Selesai', cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Dibatalkan', cls: 'bg-red-100 text-red-700' },
};
const PAYMENT_STATUS = {
  unpaid: { label: 'Belum dibayar', cls: 'bg-amber-100 text-amber-700' },
  claimed: { label: 'Menunggu konfirmasi merchant', cls: 'bg-sky-100 text-sky-700' },
  confirmed: { label: 'Lunas (dikonfirmasi merchant)', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Ditolak merchant', cls: 'bg-red-100 text-red-700' },
  void: { label: 'Dibatalkan', cls: 'bg-stone-200 text-stone-600' },
};
const STORE_STATUS = {
  pending: { label: 'Menunggu verifikasi', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Aktif', cls: 'bg-emerald-100 text-emerald-700' },
  suspended: { label: 'Ditangguhkan', cls: 'bg-red-100 text-red-700' },
  rejected: { label: 'Ditolak', cls: 'bg-red-100 text-red-700' },
};
const QRIS_STATUS = {
  none: { label: 'Belum ada QRIS', cls: 'bg-stone-200 text-stone-600' },
  pending: { label: 'QRIS menunggu verifikasi', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'QRIS terverifikasi', cls: 'bg-emerald-100 text-emerald-700' },
};

function minutesOf(hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return h * 60 + (m || 0);
}
// Apakah toko sedang dalam jam operasional (WIB). Mendukung jam tutup lewat tengah malam.
function isOpenNow(store) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const now = Number(parts.find((p) => p.type === 'hour').value) * 60 + Number(parts.find((p) => p.type === 'minute').value);
  const o = minutesOf(store.open_time);
  const c = minutesOf(store.close_time);
  if (o === c) return true;
  return o < c ? now >= o && now < c : now >= o || now < c;
}

// Buka 24 jam bila jam buka dan jam tutup sama
const isAllDay = (store) => store.open_time === store.close_time;
// Jam tutup 00:00 (tengah malam) ditampilkan sebagai 24:00
const closeText = (store) => (store.close_time === '00:00' && store.open_time !== '00:00' ? '24:00' : store.close_time);
const hoursText = (store) => (isAllDay(store) ? 'Buka 24 jam' : store.open_time + ' sampai ' + closeText(store));

// Sapaan menurut jam di WIB
function greeting(date = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(date)) % 24;
  if (h >= 4 && h < 11) return 'Selamat pagi';
  if (h >= 11 && h < 15) return 'Selamat siang';
  if (h >= 15 && h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function stars(avg) {
  return avg ? Number(avg).toFixed(1) : '–';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Batas atas sumbu dengan kelipatan bulat (1, 2, 5 x 10^n), dibagi empat garis.
function niceMax(max, whole) {
  const raw = Math.max(max, 1) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  let step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  if (whole) step = Math.max(1, Math.ceil(step));
  return step * 4;
}

// Grafik SVG. points: [{label, value}]
const CH = { ink: '#33201a', muted: '#6a5242', grid: '#eadcc8', base: '#cdb89d', ember: '#b4501f' };
const shortMoney = (v) => (v >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',').replace(',0', '') + ' jt' : v >= 1e3 ? Math.round(v / 1e3) + ' rb' : String(v));
let chartSeq = 0;

// Garis kisi + angka sumbu Y. Mengembalikan fungsi y(v) dan markup-nya.
function chartAxis(points, { w, h, money, pad }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const axisMax = niceMax(max, !money);
  const ih = h - pad.t - pad.b;
  const y = (v) => pad.t + ih - (v / axisMax) * ih;
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const v = (axisMax * k) / 4;
    const label = money ? shortMoney(v) : String(v);
    g += `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${k === 0 ? CH.base : CH.grid}" stroke-width="1"/>`
      + `<text x="${pad.l - 10}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="${CH.muted}">${label}</text>`;
  }
  return { y, g, axisMax };
}

// Label sumbu X dijarangkan supaya tidak bertumpuk (maksimal sekitar 7), label terakhir selalu tampil.
function chartLabels(points, xAt, y0, maxLabels = 7) {
  const n = points.length;
  const step = Math.max(1, Math.ceil(n / maxLabels));
  return points.map((p, i) => ((n - 1 - i) % step === 0
    ? `<text x="${xAt(i).toFixed(1)}" y="${y0}" text-anchor="middle" font-size="12" fill="${CH.muted}">${esc(p.label)}</text>` : '')).join('');
}

function emptyChart(w, h, msg) {
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto" role="img" aria-label="${msg}"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="12" fill="none" stroke="${CH.grid}" stroke-dasharray="4 5"/><text x="${w / 2}" y="${h / 2 + 5}" text-anchor="middle" font-size="14" fill="${CH.muted}">${msg}</text></svg>`;
}

// Kurva halus yang tidak melampaui data (monotone cubic)
function smoothPath(pts) {
  const n = pts.length;
  if (n === 1) return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s2 = a * a + b * b;
    if (s2 > 9) { const k = 3 / Math.sqrt(s2); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h3 = dx[i] / 3;
    d += ` C${(pts[i][0] + h3).toFixed(1)},${(pts[i][1] + t[i] * h3).toFixed(1)} ${(pts[i + 1][0] - h3).toFixed(1)},${(pts[i + 1][1] - t[i + 1] * h3).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

function lineChartRaw(points, { w = 640, h = 260, money = true, maxLabels = 7 } = {}) {
  if (!points.length || points.every((p) => !p.value)) return emptyChart(w, 170, 'Belum ada data untuk ditampilkan');
  const pad = { l: money ? 58 : 40, r: 30, t: 28, b: 34 };
  const { y, g } = chartAxis(points, { w, h, money, pad });
  const iw = w - pad.l - pad.r;
  const n = points.length;
  const x = (i) => pad.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const xy = points.map((p, i) => [x(i), y(p.value)]);
  const line = smoothPath(xy);
  const id = 'lc' + (++chartSeq);
  const area = `${line} L${xy[n - 1][0].toFixed(1)},${y(0).toFixed(1)} L${xy[0][0].toFixed(1)},${y(0).toFixed(1)} Z`;
  const val = (p) => (money ? rp(p.value) : p.value);
  let top = 0;
  points.forEach((p, i) => { if (p.value > points[top].value) top = i; });
  const showDots = n <= 14;
  const mark = new Set([n - 1, top]);
  const dots = points.map((p, i) => {
    const big = mark.has(i);
    if (!showDots && !big) return '';
    return `<circle cx="${xy[i][0].toFixed(1)}" cy="${xy[i][1].toFixed(1)}" r="${big ? 5 : 3.5}" fill="${big ? CH.ember : '#fff'}" stroke="${CH.ember}" stroke-width="2.5"/>`;
  }).join('');
  const tags = [...mark].filter((i) => points[i].value > 0).map((i) => {
    const text = money ? shortMoney(points[i].value) : String(points[i].value);
    const tw = text.length * 7.5 + 16;
    const cx = Math.min(Math.max(xy[i][0], pad.l + tw / 2), w - pad.r - tw / 2);
    const near = i !== top && Math.abs(xy[i][0] - xy[top][0]) < tw + 10;
    const cy = near ? xy[i][1] + 12 : Math.max(xy[i][1] - 24, 4);
    return `<g><rect x="${(cx - tw / 2).toFixed(1)}" y="${cy.toFixed(1)}" width="${tw.toFixed(1)}" height="20" rx="10" fill="${CH.ink}"/><text x="${cx.toFixed(1)}" y="${(cy + 14).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="600" fill="#fff">${text}</text></g>`;
  }).join('');
  const hits = points.map((p, i) => `<circle cx="${xy[i][0].toFixed(1)}" cy="${xy[i][1].toFixed(1)}" r="${Math.max(8, Math.min(18, iw / n / 2))}" fill="transparent"><title>${esc(p.label)}: ${val(p)}</title></circle>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto" role="img" aria-label="Grafik garis"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CH.ember}" stop-opacity=".28"/><stop offset="1" stop-color="${CH.ember}" stop-opacity="0"/></linearGradient></defs>${g}`
    + (n > 1 ? `<path d="${area}" fill="url(#${id})"/>` : '')
    + `<path d="${line}" fill="none" stroke="${CH.ember}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${dots}${tags}${chartLabels(points, x, h - 10, maxLabels)}${hits}</svg>`;
}

function barChartRaw(points, { w = 640, h = 260, money = false } = {}) {
  if (!points.length || points.every((p) => !p.value)) return emptyChart(w, 170, 'Belum ada data untuk ditampilkan');
  const pad = { l: money ? 58 : 40, r: 14, t: 28, b: 34 };
  const { y, g } = chartAxis(points, { w, h, money, pad });
  const iw = w - pad.l - pad.r;
  const slot = iw / points.length;
  const bw = Math.min(48, slot * 0.58);
  const bars = points.map((p, i) => {
    const cx = pad.l + slot * i + slot / 2;
    const topY = y(p.value);
    const bh = Math.max(0, y(0) - topY);
    const r = Math.min(8, bw / 2, bh);
    const x0 = cx - bw / 2, x1 = cx + bw / 2, yb = y(0);
    const d = bh <= 0 ? '' : `M${x0.toFixed(1)},${yb.toFixed(1)} V${(topY + r).toFixed(1)} Q${x0.toFixed(1)},${topY.toFixed(1)} ${(x0 + r).toFixed(1)},${topY.toFixed(1)} H${(x1 - r).toFixed(1)} Q${x1.toFixed(1)},${topY.toFixed(1)} ${x1.toFixed(1)},${(topY + r).toFixed(1)} V${yb.toFixed(1)} Z`;
    const val = p.value > 0 ? `<text x="${cx.toFixed(1)}" y="${(topY - 7).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="600" fill="${CH.ink}">${money ? shortMoney(p.value) : p.value}</text>` : '';
    return `<g><path d="${d}" fill="${CH.ember}" opacity="${i === points.length - 1 ? 1 : 0.78}"><title>${esc(p.label)}: ${money ? rp(p.value) : p.value}</title></path>${val}</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto" role="img" aria-label="Grafik batang">${g}${bars}${chartLabels(points, (i) => pad.l + slot * i + slot / 2, h - 10, 12)}</svg>`;
}

// Dua ukuran: lebar untuk layar besar, ramping untuk HP (supaya tulisan tetap terbaca). CSS memilih yang tampil.
const twin = (raw) => (points, o = {}) => `<div class="ch-d">${raw(points, o)}</div><div class="ch-m">${raw(points, { ...o, w: 380, h: 250, maxLabels: 5 })}</div>`;
const lineChart = twin(lineChartRaw);
const barChart = twin(barChartRaw);

const ICONS = {
  home: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10',
  store: 'M3 9l1.5-5h15L21 9M3 9v1a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0V9M3 9h18M5 21V12m14 9V12M9 21v-5h6v5',
  cart: 'M3 3h2l.4 2M7 13h10l3-8H5.4M7 13L5.4 5M7 13l-2 4h13M9 21a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z',
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21a8 8 0 0116 0',
  search: 'M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  menu: 'M4 6h16M4 12h16M4 18h16',
  x: 'M6 18L18 6M6 6l12 12',
  plus: 'M12 4v16m8-8H4',
  check: 'M5 13l4 4L19 7',
  chart: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  users: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 014-4h2a4 4 0 014 4v2zM12 7a3 3 0 11-6 0 3 3 0 016 0zm8 2a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z',
  tag: 'M7 7h.01M3 11V5a2 2 0 012-2h6l9 9a2 2 0 010 2.83l-6.17 6.17a2 2 0 01-2.83 0L3 11z',
  cog: 'M10.3 4.3a1.7 1.7 0 013.4 0 1.7 1.7 0 002.5 1l.1-.1a1.7 1.7 0 012.4 2.4l-.1.1a1.7 1.7 0 001 2.5 1.7 1.7 0 010 3.4 1.7 1.7 0 00-1 2.5l.1.1a1.7 1.7 0 01-2.4 2.4l-.1-.1a1.7 1.7 0 00-2.5 1 1.7 1.7 0 01-3.4 0 1.7 1.7 0 00-2.5-1l-.1.1a1.7 1.7 0 01-2.4-2.4l.1-.1a1.7 1.7 0 00-1-2.5 1.7 1.7 0 010-3.4 1.7 1.7 0 001-2.5l-.1-.1A1.7 1.7 0 017.7 5.2l.1.1a1.7 1.7 0 002.5-1zM12 9a3 3 0 100 6 3 3 0 000-6z',
  receipt: 'M9 14l2 2 4-4M7 3h10a2 2 0 012 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5a2 2 0 012-2z',
  star: 'M12 17.3l-5.6 3 1.1-6.2L2.9 9.7l6.3-.9L12 3l2.8 5.8 6.3.9-4.6 4.4 1.1 6.2z',
  pin: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zm0-8.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  clock: 'M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zm-3 9l2 2 4-4',
  qr: 'M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v2h-2v-2z',
  trash: 'M19 7l-.9 12.1A2 2 0 0116.1 21H7.9a2 2 0 01-2-1.9L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16',
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.4-9.6a2 2 0 112.8 2.8L12 15l-4 1 1-4 8.6-8.6z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z',
};
function icon(name, cls = 'w-5 h-5') {
  const d = ICONS[name] || ICONS.list;
  return `<svg class="${cls}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
}

module.exports = {
  TZ, UserError, rp, toDate, fmtDateTime, fmtDate, dayKey, monthKey, shortDay, lastDays, slugify, isEmail, normalizePhone, waNumber, waLink,
  ORDER_STATUS, PAYMENT_STATUS, STORE_STATUS, QRIS_STATUS, isOpenNow, isAllDay, closeText, hoursText, greeting, stars, esc, lineChart, barChart, icon,
};
