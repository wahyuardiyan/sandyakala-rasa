# Menaruh Sandyakala Rasa di internet

Panduan singkat supaya situs bisa diakses orang lain. Cek paket gratis terbaru di tiap penyedia, karena aturannya sering berubah.

## 1. Syarat tempat hosting

Pilih tempat yang punya:

- **Node.js 22** dan bisa menjalankan `npm start` terus-menerus.
- **Penyimpanan tetap** (persistent disk / volume) untuk folder `data/` (database SQLite) dan `uploads/` (foto). Hosting gratis yang hapus file setiap restart **tidak cocok**, karena pesanan dan foto bisa hilang. Kalau terpaksa, pakai database MySQL di luar dan simpan foto di penyimpanan tetap.
- **HTTPS** (sertifikat gratis biasanya otomatis).

## 2. Isi `.env` di server

```
NODE_ENV=production
PORT=3000
SESSION_SECRET=<teks acak panjang, minimal 32 karakter, buat sendiri>
APP_URL=https://alamat-situsmu
CONTACT_WA=08xxxxxxxxxx
CONTACT_EMAIL=emailmu@contoh.com
```

Lalu atur notifikasi di HP penjual: jalankan `npm run vapid` sekali, salin dua kuncinya ke `.env`.

## 3. Langkah pasang

```
npm install
npm run setup
npm run create-admin -- emailkamu@gmail.com "Nama Kamu"
npm start
```

- Jangan jalankan `npm run seed` di server publik (isinya akun contoh dengan password umum).
- `npm run demo` boleh dijalankan sekali bila ingin toko contoh. Hapus atau nonaktifkan toko contoh sebelum membuka untuk umum.

## 4. Cadangan data

- Aplikasi mencadangkan database otomatis ke folder `backups/` (lihat `src/lib/backup.js`). **Salin folder itu keluar dari server** secara rutin, misalnya seminggu sekali ke Google Drive atau flashdisk.
- Salin juga folder `uploads/`.

## 5. Cek setelah online

- Buka `https://alamat-situsmu/healthz`. Harus tampil `{"ok":true}`.
- Buka `/robots.txt` dan `/sitemap.xml`.
- Coba bagikan tautan toko ke WhatsApp: judul dan gambar pratinjau harus muncul.
- Daftar sebagai pelanggan dan penjual percobaan, buat satu pesanan sampai selesai.
- Pasang `https://alamat-situsmu/healthz` di layanan pemantau gratis (misalnya UptimeRobot) supaya kamu tahu kalau situs mati.

## 6. Lupa password admin

Jalankan lagi dengan email yang sama. Password diganti dan akunnya tetap admin:

```
npm run create-admin -- emailkamu@gmail.com "Nama Kamu"
```
