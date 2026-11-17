const fs = require('fs'), path = require('path');
// Pengecekan cepat tanpa menjalankan server: sintaks semua berkas .js dan semua template .ejs.
// Jalankan: npm run check
const { execFileSync } = require('child_process');
function walkJs(d, out = []) {
  for (const f of fs.readdirSync(d)) {
    if (f === 'node_modules' || f === 'uploads' || f === 'data' || f === 'backups') continue;
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walkJs(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
function walk(d, out = []) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p, out) : p.endsWith('.ejs') && out.push(p); } return out; }
let bad = 0;
for (const f of ['src', 'scripts', 'public/js', 'tests'].filter((d) => fs.existsSync(d)).flatMap((d) => walkJs(d))) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { bad++; console.log('SINTAKS SALAH', f, String(e.stderr || e.message).split('\n').slice(0, 3).join(' ')); }
}
for (const f of walk('views')) {
  const src = fs.readFileSync(f, 'utf8');
  let js = '', i = 0;
  const re = /<%([=\-#_]?)([\s\S]*?)-?%>/g; let m, last = 0;
  while ((m = re.exec(src))) {
    js += '__o+=' + JSON.stringify(src.slice(last, m.index)) + ';\n';
    const kind = m[1], code = m[2];
    if (kind === '=' || kind === '-') js += '__o+=(' + code + ');\n';
    else if (kind === '#') {}
    else js += code + '\n';
    last = re.lastIndex;
  }
  js += '__o+=' + JSON.stringify(src.slice(last)) + ';';
  try { new Function('locals', 'include', 'with(locals){var __o="";' + js + '}'); }
  catch (e) { bad++; console.log('SINTAKS SALAH', f, e.message); }
}
console.log(bad ? bad + ' berkas bermasalah' : 'semua berkas .js dan template lolos cek sintaks');
process.exit(bad ? 1 : 0);
