// Mengisi data contoh untuk mencoba aplikasi. JANGAN dipakai di server publik (password-nya terbuka).
const path = require('path');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const db = require('../src/lib/db');
const { createSchema, ensureCategories } = require('../src/lib/schema');
const { UPLOAD_DIR } = require('../src/lib/upload');

const rnd = () => require('crypto').randomBytes(9).toString('base64url') + 'A1#';
const PW = { admin: process.env.SEED_ADMIN_PASSWORD || rnd(), customer: process.env.SEED_CUSTOMER_PASSWORD || rnd(), merchant: process.env.SEED_MERCHANT_PASSWORD || rnd() };
const daysAgo = (n, h = 12) => new Date(Date.now() - n * 86400000 - (12 - h) * 3600000);
const pick = (a, i) => a[i % a.length];

const STORES = [
  { owner: 'Bu Sari', email: 'sari@example.test', name: 'Warung Nasi Bu Sari', slug: 'warung-nasi-bu-sari', cat: 'makanan-berat', city: 'Jakarta Selatan', open: '08:00', close: '21:00', fee: 5000,
    desc: 'Masakan rumahan khas Nusantara dengan sambal uleg buatan sendiri. Porsi pas, rasa bikin kangen rumah.',
    menu: [['Nasi Ayam Geprek', 15000, 'Ayam crispy dengan sambal bawang pedas, nasi hangat, lalapan.', 'makanan-berat'], ['Nasi Rendang', 18000, 'Rendang sapi empuk dengan bumbu meresap.', 'makanan-berat'], ['Nasi Goreng Spesial', 16000, 'Nasi goreng telur, ayam suwir, dan kerupuk.', 'makanan-berat'], ['Soto Ayam', 14000, 'Kuah kuning gurih, suwiran ayam, telur rebus.', 'makanan-berat'], ['Es Jeruk', 8000, 'Jeruk peras segar.', 'minuman'], ['Es Teh Manis', 5000, 'Teh manis dingin.', 'minuman']] },
  { owner: 'Mak Rini', email: 'rini@example.test', name: 'Dapur Mak Rini', slug: 'dapur-mak-rini', cat: 'camilan', city: 'Jakarta Selatan', open: '09:00', close: '20:00', fee: 6000,
    desc: 'Camilan dan gorengan hangat, dibuat segar setiap hari.',
    menu: [['Pisang Goreng Keju', 12000, '5 potong pisang goreng renyah dengan topping keju.', 'camilan'], ['Risoles Mayo', 10000, 'Isi 3, kulit tipis isi sayur dan mayo.', 'camilan'], ['Tahu Crispy', 8000, 'Tahu goreng tepung bumbu pedas.', 'camilan'], ['Bakwan Sayur', 7000, 'Isi 4 bakwan sayur garing.', 'jajanan-tradisional']] },
  { owner: 'Mas Tito', email: 'tito@example.test', name: 'Es Teh Kita', slug: 'es-teh-kita', cat: 'minuman', city: 'Depok', open: '10:00', close: '22:00', fee: 4000,
    desc: 'Minuman segar kekinian dengan teh pilihan.',
    menu: [['Es Teh Original', 6000, 'Teh melati dingin.', 'minuman'], ['Es Teh Lemon', 9000, 'Teh dengan perasan lemon segar.', 'minuman'], ['Es Teh Susu Brown Sugar', 14000, 'Susu segar dengan gula aren.', 'minuman'], ['Thai Tea', 13000, 'Thai tea creamy.', 'minuman']] },
  { owner: 'Bu Laksmi', email: 'laksmi@example.test', name: 'Kue Lapis Jaya', slug: 'kue-lapis-jaya', cat: 'dessert', city: 'Bekasi', open: '07:00', close: '19:00', fee: 7000,
    desc: 'Kue lapis dan jajanan pasar tradisional, lembut dan manis pas.',
    menu: [['Kue Lapis Legit (Potong)', 20000, 'Lapis legit aroma rempah.', 'dessert'], ['Kue Lapis Pelangi', 15000, 'Lapis kenyal berwarna cantik.', 'dessert'], ['Klepon (isi 6)', 10000, 'Klepon isi gula merah, kelapa parut.', 'jajanan-tradisional'], ['Dadar Gulung', 11000, 'Isi 4, isian kelapa gula merah.', 'jajanan-tradisional']] },
];
const REVIEWS = ['Enak banget, porsinya pas!', 'Pengiriman cepat dan makanan masih hangat.', 'Rasanya autentik, pasti pesan lagi.', 'Recommended!', 'Sambalnya mantap.', null];

(async () => {
  if (process.env.NODE_ENV === 'production') { console.error('Seed ditolak di mode production.'); process.exit(1); }
  try {
    await createSchema(db);
    await ensureCategories(db);
    const hasUsers = await db('users').count({ n: '*' }).first();
    if (Number(hasUsers.n) > 0 && !process.argv.includes('--force')) {
      console.log('Database sudah berisi pengguna, seed dilewati. Pakai "npm run seed -- --force" bila yakin.');
      return;
    }
    const cats = Object.fromEntries((await db('categories')).map((c) => [c.slug, c.id]));
    const now = new Date();
    const hash = (p) => bcrypt.hashSync(p, 10);

    await db('users').insert({ name: 'Admin Sandyakala', email: 'admin@sandyakala.test', password_hash: hash(PW.admin), role: 'admin', is_active: 1, created_at: now, updated_at: now });
    await db('users').insert({ name: 'Budi Santoso', email: 'budi@example.test', phone: '081234567890', address: 'Jl. Melati No. 12, Jakarta Selatan', password_hash: hash(PW.customer), role: 'customer', is_active: 1, created_at: now, updated_at: now });
    await db('users').insert({ name: 'Ani Wulandari', email: 'ani@example.test', password_hash: hash(PW.customer), role: 'customer', is_active: 1, created_at: now, updated_at: now });
    const customers = await db('users').where({ role: 'customer' });

    const storeRows = [];
    for (const s of STORES) {
      const [uid] = await db('users').insert({ name: s.owner, email: s.email, password_hash: hash(PW.merchant), role: 'merchant', is_active: 1, created_at: now, updated_at: now });
      const qrFile = `demo-qris-${s.slug}.png`;
      await QRCode.toFile(path.join(UPLOAD_DIR, qrFile), `DEMO SANDYAKALA RASA - BUKAN QRIS ASLI - ${s.name}`, { width: 520, margin: 2, color: { dark: '#3B2418', light: '#FFFFFF' } });
      const [sid] = await db('stores').insert({
        user_id: uid, category_id: cats[s.cat], name: s.name, slug: s.slug, description: s.desc, address: `Jl. Contoh No. ${10 + storeRows.length * 7}`, city: s.city, whatsapp: '08120000' + String(1000 + storeRows.length),
        open_time: s.open, close_time: s.close, delivery_fee: s.fee, is_accepting: 1, qris_image: '/uploads/' + qrFile, qris_name: s.name.toUpperCase(),
        qris_status: 'approved', status: 'approved', created_at: now, updated_at: now,
      });
      const products = [];
      for (const [name, price, description, cat] of s.menu) {
        const [pid] = await db('products').insert({ store_id: sid, category_id: cats[cat], name, price, description, stock: null, is_available: 1, created_at: now, updated_at: now });
        products.push({ id: pid, name, price });
      }
      storeRows.push({ id: sid, products, fee: s.fee });
    }

    // Pesanan selesai selama 14 hari terakhir + ulasan, supaya grafik dan rating terisi
    let n = 0;
    for (const [si, st] of storeRows.entries()) {
      for (let d = 13; d >= 0; d--) {
        const count = (d + si) % 3 === 0 ? 0 : 1 + ((d * 7 + si) % 3);
        for (let k = 0; k < count; k++) {
          const cu = pick(customers, d + k);
          const picks = [pick(st.products, d + k), pick(st.products, d + k + 1)];
          const items = picks.map((p, i) => ({ ...p, qty: 1 + ((d + i) % 2) }));
          const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
          const created = daysAgo(d, 9 + ((k * 3 + si) % 10));
          const code = `SR${String(created.getFullYear()).slice(2)}${String(created.getMonth() + 1).padStart(2, '0')}${String(created.getDate()).padStart(2, '0')}D${si}${k}${d}`.slice(0, 18);
          const [oid] = await db('orders').insert({
            code, user_id: cu.id, store_id: st.id, customer_name: cu.name, customer_phone: cu.phone || '081200000000', fulfillment: 'delivery', address: cu.address || 'Jl. Contoh No. 1',
            subtotal, delivery_fee: st.fee, total: subtotal + st.fee, status: 'completed', created_at: created, updated_at: created,
          });
          await db('order_items').insert(items.map((i) => ({ order_id: oid, product_id: i.id, name: i.name, price: i.price, qty: i.qty })));
          await db('payments').insert({ order_id: oid, amount: subtotal + st.fee, status: 'confirmed', confirmed_at: created, created_at: created, updated_at: created });
          const rv = pick(REVIEWS, n);
          if (n % 2 === 0) await db('reviews').insert({ order_id: oid, store_id: st.id, user_id: cu.id, rating: 4 + (n % 3 === 0 ? 0 : 1), comment: rv, created_at: created });
          n++;
        }
      }
    }

    // Satu pesanan "menunggu konfirmasi" untuk mencoba alur konfirmasi merchant
    const budi = customers.find((c) => c.email === 'budi@example.test');
    const st0 = storeRows[0];
    const p0 = st0.products[0];
    const exp = new Date(Date.now() + 10 * 60000);
    const [oid] = await db('orders').insert({ code: 'SRDEMO00001', user_id: budi.id, store_id: st0.id, customer_name: budi.name, customer_phone: budi.phone, fulfillment: 'delivery', address: budi.address, subtotal: p0.price * 2, delivery_fee: st0.fee, total: p0.price * 2 + st0.fee, status: 'pending_payment', expires_at: exp, created_at: now, updated_at: now });
    await db('order_items').insert({ order_id: oid, product_id: p0.id, name: p0.name, price: p0.price, qty: 2 });
    await db('payments').insert({ order_id: oid, amount: p0.price * 2 + st0.fee, status: 'claimed', claimed_at: now, created_at: now, updated_at: now });

    console.log('\nData contoh dibuat. Akun untuk mencoba:');
    console.log(`  Admin     : admin@sandyakala.test   / ${PW.admin}`);
    console.log(`  Pelanggan : budi@example.test       / ${PW.customer}`);
    console.log(`  Merchant  : sari@example.test       / ${PW.merchant}  (juga rini@, tito@, laksmi@example.test)`);
    console.log('\nCatatan: QRIS di data contoh hanya QR palsu untuk demo.');
  } catch (e) {
    console.error('GAGAL seed:', e);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
