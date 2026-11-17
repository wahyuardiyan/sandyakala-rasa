// Menambah toko contoh yang sudah aktif, lengkap dengan foto menu, dan memberi foto pada toko contoh lama.
// Aman dijalankan berulang. Foto contoh (gambar vektor) ditandai awalan "demo-" dan hanya mengganti foto bawaan,
// jadi foto asli yang kamu unggah sendiri tidak ditimpa. JANGAN dipakai di server publik.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const db = require('../src/lib/db');
const { createSchema, ensureCategories } = require('../src/lib/schema');
const { UPLOAD_DIR } = require('../src/lib/upload');
const { dishSvg, coverSvg } = require('./demo-art');

const PASSWORD = process.env.DEMO_PASSWORD || require('crypto').randomBytes(9).toString('base64url') + 'A1#';
// [nama menu, harga, deskripsi, kategori, jenis gambar]
const STORES = [
  { owner: 'Bu Sari', email: 'sari@example.test', name: 'Warung Nasi Bu Sari', slug: 'warung-nasi-bu-sari', cat: 'makanan-berat', city: 'Jakarta Selatan', open: '08:00', close: '21:00', fee: 5000, cover: ['nasi-ayam', 'soto', 'es-jeruk'],
    desc: 'Masakan rumahan khas Nusantara dengan sambal uleg buatan sendiri. Porsi pas, rasa bikin kangen rumah.',
    menu: [['Nasi Ayam Geprek', 15000, 'Ayam crispy dengan sambal bawang pedas, nasi hangat, lalapan.', 'makanan-berat', 'nasi-ayam'], ['Nasi Rendang', 18000, 'Rendang sapi empuk dengan bumbu meresap.', 'makanan-berat', 'rendang'], ['Nasi Goreng Spesial', 16000, 'Nasi goreng telur, ayam suwir, dan kerupuk.', 'makanan-berat', 'nasi-goreng'], ['Soto Ayam', 14000, 'Kuah kuning gurih, suwiran ayam, telur rebus.', 'makanan-berat', 'soto'], ['Es Jeruk', 8000, 'Jeruk peras segar.', 'minuman', 'es-jeruk'], ['Es Teh Manis', 5000, 'Teh manis dingin.', 'minuman', 'es-teh']] },
  { owner: 'Mak Rini', email: 'rini@example.test', name: 'Dapur Mak Rini', slug: 'dapur-mak-rini', cat: 'camilan', city: 'Jakarta Selatan', open: '09:00', close: '20:00', fee: 6000, cover: ['pisang-goreng', 'risoles', 'tahu-crispy'],
    desc: 'Camilan dan gorengan hangat, dibuat segar setiap hari.',
    menu: [['Pisang Goreng Keju', 12000, '5 potong pisang goreng renyah dengan topping keju.', 'camilan', 'pisang-goreng'], ['Risoles Mayo', 10000, 'Isi 3, kulit tipis isi sayur dan mayo.', 'camilan', 'risoles'], ['Tahu Crispy', 8000, 'Tahu goreng tepung bumbu pedas.', 'camilan', 'tahu-crispy'], ['Bakwan Sayur', 7000, 'Isi 4 bakwan sayur garing.', 'jajanan-tradisional', 'bakwan'], ['Teh Hangat', 4000, 'Teh hangat manis, teman gorengan.', 'minuman', 'teh-hangat']] },
  { owner: 'Mas Tito', email: 'tito@example.test', name: 'Es Teh Kita', slug: 'es-teh-kita', cat: 'minuman', city: 'Depok', open: '10:00', close: '22:00', fee: 4000, cover: ['brown-sugar', 'es-teh', 'thai-tea'],
    desc: 'Minuman segar kekinian dengan teh pilihan.',
    menu: [['Es Teh Original', 6000, 'Teh melati dingin.', 'minuman', 'es-teh'], ['Es Teh Lemon', 9000, 'Teh dengan perasan lemon segar.', 'minuman', 'es-lemon'], ['Es Teh Susu Brown Sugar', 14000, 'Susu segar dengan gula aren.', 'minuman', 'brown-sugar'], ['Thai Tea', 13000, 'Thai tea creamy.', 'minuman', 'thai-tea'], ['Matcha Latte', 16000, 'Matcha dengan susu segar.', 'minuman', 'matcha']] },
  { owner: 'Bu Laksmi', email: 'laksmi@example.test', name: 'Kue Lapis Jaya', slug: 'kue-lapis-jaya', cat: 'dessert', city: 'Bekasi', open: '07:00', close: '19:00', fee: 7000, cover: ['lapis-legit', 'lapis-pelangi', 'klepon'],
    desc: 'Kue lapis dan jajanan pasar tradisional, lembut dan manis pas.',
    menu: [['Kue Lapis Legit (Potong)', 20000, 'Lapis legit aroma rempah.', 'dessert', 'lapis-legit'], ['Kue Lapis Pelangi', 15000, 'Lapis kenyal berwarna cantik.', 'dessert', 'lapis-pelangi'], ['Klepon (isi 6)', 10000, 'Klepon isi gula merah, kelapa parut.', 'jajanan-tradisional', 'klepon'], ['Dadar Gulung', 11000, 'Isi 4, isian kelapa gula merah.', 'jajanan-tradisional', 'dadar-gulung']] },
  // --- toko tambahan ---
  { owner: 'Pak Joko', email: 'joko@example.test', name: 'Bakso Pak Joko', slug: 'bakso-pak-joko', cat: 'makanan-berat', city: 'Jakarta Timur', open: '10:00', close: '21:00', fee: 5000, cover: ['bakso', 'mie-ayam', 'es-jeruk'],
    desc: 'Bakso urat kenyal dengan kuah kaldu sapi yang gurih, direbus sejak subuh.',
    menu: [['Bakso Urat Jumbo', 18000, 'Bakso urat besar, bihun, tahu, kuah kaldu.', 'makanan-berat', 'bakso'], ['Bakso Campur', 16000, 'Bakso halus, urat, dan tahu isi.', 'makanan-berat', 'bakso'], ['Mie Ayam Spesial', 15000, 'Mie kenyal, ayam kecap, sawi, kuah terpisah.', 'makanan-berat', 'mie-ayam'], ['Mie Ayam Pangsit', 17000, 'Mie ayam dengan pangsit goreng renyah.', 'makanan-berat', 'mie-ayam'], ['Es Jeruk', 7000, 'Jeruk peras dingin.', 'minuman', 'es-jeruk'], ['Es Teh Manis', 5000, 'Teh manis dingin.', 'minuman', 'es-teh']] },
  { owner: 'Pak Dul', email: 'dul@example.test', name: 'Sate Pak Dul', slug: 'sate-pak-dul', cat: 'makanan-berat', city: 'Tangerang', open: '16:00', close: '23:00', fee: 7000, cover: ['sate', 'sate', 'teh-hangat'],
    desc: 'Sate dibakar arang dengan bumbu kacang kental. Buka mulai sore sampai malam.',
    menu: [['Sate Ayam (10 tusuk)', 22000, 'Sate ayam bumbu kacang, lontong.', 'makanan-berat', 'sate'], ['Sate Kambing (10 tusuk)', 35000, 'Sate kambing empuk, kecap, bawang, tomat.', 'makanan-berat', 'sate'], ['Sate Taichan (10 tusuk)', 24000, 'Tanpa bumbu kacang, sambal pedas.', 'makanan-berat', 'sate'], ['Teh Hangat', 4000, 'Teh hangat manis.', 'minuman', 'teh-hangat'], ['Es Teh Manis', 5000, 'Teh manis dingin.', 'minuman', 'es-teh']] },
  { owner: 'Bang Ucok', email: 'ucok@example.test', name: 'Martabak Bang Ucok', slug: 'martabak-bang-ucok', cat: 'dessert', city: 'Jakarta Barat', open: '15:00', close: '23:30', fee: 8000, cover: ['martabak-manis', 'martabak-telur', 'kopi-susu'],
    desc: 'Martabak manis tebal dan martabak telur gurih, dimasak saat dipesan.',
    menu: [['Martabak Manis Coklat Keju', 35000, 'Adonan tebal lembut, coklat dan keju melimpah.', 'dessert', 'martabak-manis'], ['Martabak Manis Kacang', 30000, 'Taburan kacang dan wijen.', 'dessert', 'martabak-manis'], ['Martabak Telur Spesial', 38000, 'Telur bebek, daging cincang, daun bawang.', 'makanan-berat', 'martabak-telur'], ['Kopi Susu', 12000, 'Kopi susu dingin.', 'minuman', 'kopi-susu']] },
  { owner: 'Kak Dinda', email: 'dinda@example.test', name: 'Kopi Senja', slug: 'kopi-senja', cat: 'minuman', city: 'Jakarta Pusat', open: '08:00', close: '22:00', fee: 6000, cover: ['kopi-susu', 'americano', 'matcha'],
    desc: 'Kopi susu gula aren dan minuman segar lainnya, diseduh dari biji pilihan.',
    menu: [['Kopi Susu Gula Aren', 18000, 'Espresso, susu segar, gula aren.', 'minuman', 'kopi-susu'], ['Es Americano', 16000, 'Espresso dengan air dan es.', 'minuman', 'americano'], ['Matcha Latte', 20000, 'Matcha dan susu dingin.', 'minuman', 'matcha'], ['Kopi Hitam Panas', 12000, 'Kopi tubruk panas.', 'minuman', 'kopi'], ['Martabak Mini Coklat', 15000, 'Pendamping kopi, hangat dan manis.', 'dessert', 'martabak-manis']] },
  { owner: 'Bu Tini', email: 'tini@example.test', name: 'Es Campur Bu Tini', slug: 'es-campur-bu-tini', cat: 'dessert', city: 'Bogor', open: '10:00', close: '19:00', fee: 6000, cover: ['es-campur', 'klepon', 'es-lemon'],
    desc: 'Es campur segar dengan buah, cincau, dan sirup manis, cocok untuk siang yang panas.',
    menu: [['Es Campur Komplit', 15000, 'Buah, cincau, kolang-kaling, susu.', 'dessert', 'es-campur'], ['Es Teler Mini', 12000, 'Alpukat, kelapa, nangka, susu.', 'dessert', 'es-campur'], ['Klepon (isi 6)', 9000, 'Klepon isi gula merah.', 'jajanan-tradisional', 'klepon'], ['Dadar Gulung', 10000, 'Isi 4, kelapa gula merah.', 'jajanan-tradisional', 'dadar-gulung'], ['Es Teh Lemon', 8000, 'Teh dengan lemon.', 'minuman', 'es-lemon']] },
  { owner: 'Mas Bayu', email: 'bayu@example.test', name: 'Nasi Goreng Mas Bayu', slug: 'nasi-goreng-mas-bayu', cat: 'makanan-berat', city: 'Depok', open: '17:00', close: '00:00', fee: 5000, cover: ['nasi-goreng', 'mie-ayam', 'es-teh'],
    desc: 'Nasi goreng gerobakan dengan bumbu wajan panas, harum dan pedasnya pas.',
    menu: [['Nasi Goreng Kampung', 15000, 'Nasi goreng terasi, telur ceplok, kerupuk.', 'makanan-berat', 'nasi-goreng'], ['Nasi Goreng Ayam', 18000, 'Nasi goreng dengan suwiran ayam.', 'makanan-berat', 'nasi-goreng'], ['Mie Goreng Jawa', 16000, 'Mie goreng bumbu manis gurih.', 'makanan-berat', 'mie-ayam'], ['Es Teh Manis', 5000, 'Teh manis dingin.', 'minuman', 'es-teh'], ['Es Jeruk', 7000, 'Jeruk peras dingin.', 'minuman', 'es-jeruk']] },
];
const REVIEWS = ['Enak banget, porsinya pas!', 'Pengiriman cepat dan makanan masih hangat.', 'Rasanya autentik, pasti pesan lagi.', 'Recommended!', 'Harga bersahabat, rasa juara.', null];
const isDemo = (u) => !u || String(u).startsWith('/uploads/demo-');

async function writeSvg(name, svg) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), svg);
  return '/uploads/' + name;
}

(async () => {
  if (process.env.NODE_ENV === 'production') { console.error('Ditolak di mode production.'); process.exit(1); }
  try {
    await createSchema(db);
    await ensureCategories(db);
    const cats = Object.fromEntries((await db('categories')).map((c) => [c.slug, c.id]));
    const now = new Date();
    let created = 0, photos = 0;
    const customers = await db('users').where({ role: 'customer' });

    for (const [si, s] of STORES.entries()) {
      let store = await db('stores').where({ slug: s.slug }).first();
      let isNew = false;
      if (!store) {
        isNew = true;
        let user = await db('users').where({ email: s.email }).first();
        if (!user) {
          const [uid] = await db('users').insert({ name: s.owner, email: s.email, password_hash: bcrypt.hashSync(PASSWORD, 10), role: 'merchant', is_active: 1, created_at: now, updated_at: now });
          user = { id: uid };
        }
        const qrFile = `demo-qris-${s.slug}.png`;
        await QRCode.toFile(path.join(UPLOAD_DIR, qrFile), `DEMO SANDYAKALA RASA - BUKAN QRIS ASLI - ${s.name}`, { width: 520, margin: 2, color: { dark: '#3B2418', light: '#FFFFFF' } });
        const [sid] = await db('stores').insert({
          user_id: user.id, category_id: cats[s.cat], name: s.name, slug: s.slug, description: s.desc, address: `Jl. Contoh No. ${20 + si * 5}`, city: s.city,
          whatsapp: '08120000' + String(2000 + si), open_time: s.open, close_time: s.close, delivery_fee: s.fee, is_accepting: 1,
          qris_image: '/uploads/' + qrFile, qris_name: s.name.toUpperCase(), qris_status: 'approved', status: 'approved', created_at: now, updated_at: now,
        });
        store = await db('stores').where({ id: sid }).first();
        created++;
      }
      // Sampul toko
      if (isDemo(store.cover)) {
        const url = await writeSvg(`demo-${s.slug}-cover.svg`, coverSvg(s.cover));
        await db('stores').where({ id: store.id }).update({ cover: url, updated_at: now });
        photos++;
      }
      // Menu dan fotonya
      const prods = [];
      for (const [i, [name, price, description, cat, kind]] of s.menu.entries()) {
        let p = await db('products').where({ store_id: store.id, name }).first();
        if (!p) {
          const [pid] = await db('products').insert({ store_id: store.id, category_id: cats[cat], name, price, description, stock: null, is_available: 1, created_at: now, updated_at: now });
          p = await db('products').where({ id: pid }).first();
        }
        if (isDemo(p.image)) {
          const url = await writeSvg(`demo-${s.slug}-${i + 1}.svg`, dishSvg(kind, s.slug + i));
          await db('products').where({ id: p.id }).update({ image: url, updated_at: now });
          photos++;
        }
        prods.push({ id: p.id, name, price });
      }
      // Pesanan selesai dan ulasan untuk toko baru, supaya rating dan grafik terisi
      if (isNew && customers.length) {
        let n = 0;
        for (let d = 9; d >= 0; d--) {
          if ((d + si) % 3 === 0) continue;
          const cu = customers[(d + si) % customers.length];
          const items = [prods[d % prods.length], prods[(d + 1) % prods.length]].map((p, i) => ({ ...p, qty: 1 + ((d + i) % 2) }));
          const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
          const created_at = new Date(Date.now() - d * 86400000 - ((si + d) % 6) * 3600000);
          const code = `DM${String(si).padStart(2, '0')}${String(d).padStart(2, '0')}${Date.now().toString(36).slice(-5)}`.toUpperCase();
          const [oid] = await db('orders').insert({ code, user_id: cu.id, store_id: store.id, customer_name: cu.name, customer_phone: cu.phone || '081200000000', fulfillment: 'delivery', address: cu.address || 'Jl. Contoh No. 1', subtotal, delivery_fee: s.fee, total: subtotal + s.fee, status: 'completed', completed_at: created_at, created_at, updated_at: created_at });
          await db('order_items').insert(items.map((i) => ({ order_id: oid, product_id: i.id, name: i.name, price: i.price, qty: i.qty })));
          await db('payments').insert({ order_id: oid, amount: subtotal + s.fee, status: 'confirmed', confirmed_at: created_at, created_at, updated_at: created_at });
          if (n % 2 === 0) await db('reviews').insert({ order_id: oid, store_id: store.id, user_id: cu.id, rating: 4 + (n % 3 === 0 ? 0 : 1), comment: REVIEWS[n % REVIEWS.length], created_at });
          n++;
        }
      }
    }
    console.log(`Selesai. Toko baru: ${created}. Foto diperbarui: ${photos}.`);
    console.log(`Akun penjual contoh memakai kata sandi: ${PASSWORD}`);
    console.log('Email: ' + STORES.map((s) => s.email).join(', '));
  } catch (e) {
    console.error('GAGAL:', e);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
