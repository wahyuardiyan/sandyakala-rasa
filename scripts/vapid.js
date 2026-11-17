// Membuat kunci untuk notifikasi browser. Jalankan sekali: npm run vapid
let webpush;
try {
  webpush = require('web-push');
} catch (_) {
  console.error('Paket web-push belum terpasang. Jalankan: npm install');
  process.exit(1);
}
const k = webpush.generateVAPIDKeys();
console.log('\nSalin tiga baris ini ke file .env, lalu restart server:\n');
console.log('VAPID_PUBLIC_KEY=' + k.publicKey);
console.log('VAPID_PRIVATE_KEY=' + k.privateKey);
console.log('VAPID_SUBJECT=mailto:emailkamu@contoh.com\n');
console.log('Simpan kunci privat dengan aman. Kalau diganti, semua penjual harus mengaktifkan notifikasi lagi.');
