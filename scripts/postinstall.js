// Membangun CSS Tailwind otomatis setelah `npm install` (dilewati bila tailwind tidak terpasang).
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const bin = path.join(__dirname, '..', 'node_modules', '.bin', process.platform === 'win32' ? 'tailwindcss.cmd' : 'tailwindcss');
if (!fs.existsSync(bin)) {
  console.log('[postinstall] tailwindcss tidak ditemukan, build CSS dilewati.');
  process.exit(0);
}
fs.mkdirSync(path.join(__dirname, '..', 'public', 'css'), { recursive: true });
const r = spawnSync(bin, ['-i', './src/styles/input.css', '-o', './public/css/app.css', '--minify'], { stdio: 'inherit', cwd: path.join(__dirname, '..'), shell: process.platform === 'win32' });
process.exit(0);
