// Pembuat tabel. Aman dijalankan berulang kali (hanya membuat tabel yang belum ada).
async function make(db, name, cb) {
  if (!(await db.schema.hasTable(name))) {
    await db.schema.createTable(name, cb);
    console.log(`  + tabel ${name} dibuat`);
  }
}

async function createSchema(db) {
  await make(db, 'users', (t) => {
    t.increments('id');
    t.string('name', 100).notNullable();
    t.string('email', 150).nullable().unique();
    t.string('phone', 20).nullable().unique();
    t.string('password_hash', 100).notNullable();
    t.string('role', 20).notNullable().defaultTo('customer'); // customer | merchant | admin
    t.boolean('is_active').notNullable().defaultTo(true);
    t.text('address').nullable();
    t.dateTime('created_at').notNullable();
    t.dateTime('updated_at').notNullable();
  });

  await make(db, 'categories', (t) => {
    t.increments('id');
    t.string('name', 60).notNullable();
    t.string('slug', 80).notNullable().unique();
    t.string('emoji', 8).nullable();
    t.integer('sort').notNullable().defaultTo(0);
  });

  await make(db, 'stores', (t) => {
    t.increments('id');
    t.integer('user_id').unsigned().notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
    t.integer('category_id').unsigned().nullable().references('id').inTable('categories').onDelete('SET NULL');
    t.string('name', 100).notNullable();
    t.string('slug', 120).notNullable().unique();
    t.text('description').nullable();
    t.text('address').nullable();
    t.string('city', 80).nullable();
    t.string('whatsapp', 20).nullable();
    t.string('open_time', 5).notNullable().defaultTo('08:00');
    t.string('close_time', 5).notNullable().defaultTo('21:00');
    t.integer('delivery_fee').unsigned().notNullable().defaultTo(5000);
    t.boolean('is_accepting').notNullable().defaultTo(true);
    t.string('logo', 200).nullable();
    t.string('cover', 200).nullable();
    t.string('qris_image', 200).nullable();
    t.string('qris_name', 100).nullable();
    t.string('qris_status', 20).notNullable().defaultTo('none'); // none | pending | approved
    t.string('status', 20).notNullable().defaultTo('pending'); // pending | approved | suspended | rejected
    t.dateTime('created_at').notNullable();
    t.dateTime('updated_at').notNullable();
  });

  await make(db, 'products', (t) => {
    t.increments('id');
    t.integer('store_id').unsigned().notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.integer('category_id').unsigned().nullable().references('id').inTable('categories').onDelete('SET NULL');
    t.string('name', 120).notNullable();
    t.text('description').nullable();
    t.integer('price').unsigned().notNullable();
    t.integer('stock').unsigned().nullable(); // null = tidak terbatas
    t.string('image', 200).nullable();
    t.boolean('is_available').notNullable().defaultTo(true);
    t.dateTime('created_at').notNullable();
    t.dateTime('updated_at').notNullable();
    t.index(['store_id']);
  });

  await make(db, 'carts', (t) => {
    t.increments('id');
    t.integer('user_id').unsigned().notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
    t.integer('store_id').unsigned().nullable().references('id').inTable('stores').onDelete('SET NULL');
    t.dateTime('updated_at').notNullable();
  });

  await make(db, 'cart_items', (t) => {
    t.increments('id');
    t.integer('cart_id').unsigned().notNullable().references('id').inTable('carts').onDelete('CASCADE');
    t.integer('product_id').unsigned().notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.integer('qty').unsigned().notNullable().defaultTo(1);
    t.unique(['cart_id', 'product_id']);
  });

  await make(db, 'orders', (t) => {
    t.increments('id');
    t.string('code', 20).notNullable().unique();
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users');
    t.integer('store_id').unsigned().notNullable().references('id').inTable('stores');
    t.string('customer_name', 100).notNullable();
    t.string('customer_phone', 20).notNullable();
    t.string('fulfillment', 20).notNullable().defaultTo('delivery'); // delivery | pickup
    t.text('address').nullable();
    t.text('note').nullable();
    t.integer('subtotal').unsigned().notNullable();
    t.integer('delivery_fee').unsigned().notNullable().defaultTo(0);
    t.integer('discount').unsigned().notNullable().defaultTo(0);
    t.string('voucher_code', 30).nullable();
    t.string('delivery_zone', 60).nullable();
    t.integer('total').unsigned().notNullable();
    // pending_payment | processing | delivering | completed | cancelled
    t.string('status', 24).notNullable().defaultTo('pending_payment');
    t.string('cancelled_reason', 255).nullable();
    t.dateTime('expires_at').nullable();
    t.dateTime('created_at').notNullable();
    t.dateTime('updated_at').notNullable();
    t.index(['user_id']);
    t.index(['store_id', 'status']);
  });

  await make(db, 'order_items', (t) => {
    t.increments('id');
    t.integer('order_id').unsigned().notNullable().references('id').inTable('orders').onDelete('CASCADE');
    t.integer('product_id').unsigned().nullable().references('id').inTable('products').onDelete('SET NULL');
    t.string('name', 120).notNullable(); // salinan nama saat checkout
    t.integer('price').unsigned().notNullable(); // salinan harga saat checkout
    t.integer('qty').unsigned().notNullable();
  });

  await make(db, 'payments', (t) => {
    t.increments('id');
    t.integer('order_id').unsigned().notNullable().unique().references('id').inTable('orders').onDelete('CASCADE');
    t.string('method', 20).notNullable().defaultTo('qris');
    t.integer('amount').unsigned().notNullable();
    // unpaid | claimed (pelanggan klik "sudah bayar") | confirmed (merchant) | rejected | void
    t.string('status', 20).notNullable().defaultTo('unpaid');
    t.dateTime('claimed_at').nullable();
    t.integer('confirmed_by').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
    t.dateTime('confirmed_at').nullable();
    t.string('reject_reason', 255).nullable();
    t.string('proof_image', 255).nullable();
    t.dateTime('created_at').notNullable();
    t.dateTime('updated_at').notNullable();
  });

  await make(db, 'reviews', (t) => {
    t.increments('id');
    t.integer('order_id').unsigned().notNullable().unique().references('id').inTable('orders').onDelete('CASCADE');
    t.integer('store_id').unsigned().notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('rating').unsigned().notNullable();
    t.text('comment').nullable();
    t.text('reply').nullable();
    t.dateTime('reply_at').nullable();
    t.boolean('hidden').notNullable().defaultTo(false);
    t.string('hidden_reason', 200).nullable();
    t.string('report_reason', 200).nullable();
    t.dateTime('created_at').notNullable();
    t.index(['store_id']);
  });

  // Tabel tautan atur ulang password (dibuat admin, berlaku satu jam, sekali pakai)
  await make(db, 'password_resets', (t) => {
    t.increments('id');
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('token_hash', 64).notNullable().unique();
    t.dateTime('expires_at').notNullable();
    t.dateTime('used_at').nullable();
    t.dateTime('created_at').notNullable();
    t.index(['user_id']);
  });

  // Notifikasi di dalam aplikasi (lonceng) dan langganan notifikasi browser (Web Push)
  await make(db, 'notifications', (t) => {
    t.increments('id');
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('title', 150).notNullable();
    t.string('body', 400).nullable();
    t.string('url', 200).nullable();
    t.dateTime('read_at').nullable();
    t.dateTime('created_at').notNullable();
    t.index(['user_id', 'read_at']);
  });
  await make(db, 'push_subs', (t) => {
    t.increments('id');
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('endpoint', 600).notNullable().unique();
    t.string('p256dh', 200).notNullable();
    t.string('auth', 100).notNullable();
    t.dateTime('created_at').notNullable();
    t.index(['user_id']);
  });

  await make(db, 'store_zones', (t) => {
    t.increments('id');
    t.integer('store_id').unsigned().notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.string('name', 60).notNullable();
    t.integer('fee').unsigned().notNullable().defaultTo(0);
    t.index(['store_id']);
  });
  await make(db, 'vouchers', (t) => {
    t.increments('id');
    t.integer('store_id').unsigned().notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.string('code', 30).notNullable();
    t.string('type', 10).notNullable().defaultTo('percent'); // percent | fixed
    t.integer('value').unsigned().notNullable();
    t.integer('min_order').unsigned().notNullable().defaultTo(0);
    t.integer('max_discount').unsigned().nullable();
    t.string('ends_on', 10).nullable(); // YYYY-MM-DD (WIB)
    t.integer('usage_limit').unsigned().nullable();
    t.boolean('active').notNullable().defaultTo(true);
    t.dateTime('created_at').notNullable();
    t.unique(['store_id', 'code']);
  });
  await make(db, 'voucher_claims', (t) => {
    t.increments('id');
    t.integer('voucher_id').unsigned().notNullable().references('id').inTable('vouchers').onDelete('CASCADE');
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.dateTime('claimed_at').notNullable();
    t.unique(['voucher_id', 'user_id']);
  });
  await make(db, 'invoices', (t) => {
    t.increments('id');
    t.integer('store_id').unsigned().notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.string('period', 7).notNullable(); // YYYY-MM
    t.integer('order_count').unsigned().notNullable().defaultTo(0);
    t.integer('base_total').unsigned().notNullable().defaultTo(0);
    t.float('pct').notNullable().defaultTo(0);
    t.integer('amount').unsigned().notNullable().defaultTo(0);
    t.string('status', 12).notNullable().defaultTo('unpaid'); // unpaid | submitted | paid | waived
    t.dateTime('due_at').nullable();
    t.string('proof_image', 255).nullable();
    t.dateTime('submitted_at').nullable();
    t.dateTime('paid_at').nullable();
    t.dateTime('reminded_at').nullable();
    t.string('note', 255).nullable();
    t.dateTime('created_at').notNullable();
    t.dateTime('updated_at').notNullable();
    t.unique(['store_id', 'period']);
  });

  await make(db, 'settings', (t) => {
    t.string('key', 60).primary();
    t.text('value').nullable();
    t.dateTime('updated_at').notNullable();
  });
  await make(db, 'favorites', (t) => {
    t.increments('id');
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('store_id').unsigned().notNullable().references('id').inTable('stores').onDelete('CASCADE');
    t.dateTime('created_at').notNullable();
    t.unique(['user_id', 'store_id']);
  });

  // Kolom baru untuk database yang sudah ada sebelum fitur ini
  if (!(await db.schema.hasColumn('stores', 'whatsapp'))) {
    await db.schema.alterTable('stores', (t) => t.string('whatsapp', 20).nullable());
    console.log('  + kolom stores.whatsapp dibuat');
  }
  if (!(await db.schema.hasColumn('stores', 'notify_email'))) {
    await db.schema.alterTable('stores', (t) => t.boolean('notify_email').notNullable().defaultTo(true));
    console.log('  + kolom stores.notify_email dibuat');
  }
  if (!(await db.schema.hasColumn('stores', 'notify_wa'))) {
    await db.schema.alterTable('stores', (t) => t.boolean('notify_wa').notNullable().defaultTo(true));
    console.log('  + kolom stores.notify_wa dibuat');
  }
  if (!(await db.schema.hasColumn('payments', 'proof_image'))) {
    await db.schema.alterTable('payments', (t) => t.string('proof_image', 255).nullable());
    console.log('  + kolom payments.proof_image dibuat');
  }
  if (!(await db.schema.hasColumn('orders', 'voucher_code'))) {
    await db.schema.alterTable('orders', (t) => {
      t.integer('discount').unsigned().notNullable().defaultTo(0);
      t.string('voucher_code', 30).nullable();
      t.string('delivery_zone', 60).nullable();
    });
    console.log('  + kolom diskon dan zona pada orders dibuat');
  }
  if (!(await db.schema.hasColumn('orders', 'invoice_id'))) {
    await db.schema.alterTable('orders', (t) => {
      t.integer('invoice_id').unsigned().nullable();
      t.dateTime('completed_at').nullable();
    });
    console.log('  + kolom orders.invoice_id dan completed_at dibuat');
  }
  if (!(await db.schema.hasColumn('stores', 'commission_free_until'))) {
    await db.schema.alterTable('stores', (t) => t.dateTime('commission_free_until').nullable());
    console.log('  + kolom stores.commission_free_until dibuat');
  }
  if (!(await db.schema.hasColumn('reviews', 'hidden'))) {
    await db.schema.alterTable('reviews', (t) => {
      t.boolean('hidden').notNullable().defaultTo(false);
      t.string('hidden_reason', 200).nullable();
    });
    console.log('  + kolom reviews.hidden dibuat');
  }
  if (!(await db.schema.hasColumn('reviews', 'report_reason'))) {
    await db.schema.alterTable('reviews', (t) => t.string('report_reason', 200).nullable());
    console.log('  + kolom reviews.report_reason dibuat');
  }
  if (!(await db.schema.hasColumn('reviews', 'reply'))) {
    await db.schema.alterTable('reviews', (t) => {
      t.text('reply').nullable();
      t.dateTime('reply_at').nullable();
    });
    console.log('  + kolom reviews.reply dan reviews.reply_at dibuat');
  }
}

const DEFAULT_CATEGORIES = [
  { name: 'Makanan Berat', slug: 'makanan-berat', emoji: '🍛', sort: 1 },
  { name: 'Camilan', slug: 'camilan', emoji: '🥟', sort: 2 },
  { name: 'Minuman', slug: 'minuman', emoji: '🧋', sort: 3 },
  { name: 'Jajanan Tradisional', slug: 'jajanan-tradisional', emoji: '🍢', sort: 4 },
  { name: 'Dessert', slug: 'dessert', emoji: '🍰', sort: 5 },
];

async function ensureCategories(db) {
  const n = await db('categories').count({ c: '*' }).first();
  if (Number(n.c) === 0) {
    await db('categories').insert(DEFAULT_CATEGORIES);
    console.log('  + kategori bawaan dibuat');
  }
}

module.exports = { createSchema, ensureCategories, DEFAULT_CATEGORIES };
