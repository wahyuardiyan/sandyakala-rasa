// Membuat akun admin. Pemakaian:  npm run create-admin -- email@contoh.com "Nama Admin"
const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../src/lib/db');
const { createSchema } = require('../src/lib/schema');
const { isEmail } = require('../src/lib/helpers');

function ask(question, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(s);
        else rl.output.write('*'.repeat(s.replace(/[\r\n]/g, '').length));
      };
    }
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(a);
    });
  });
}

(async () => {
  try {
    await createSchema(db);
    const email = String(process.argv[2] || (await ask('Email admin: '))).trim().toLowerCase();
    const name = String(process.argv[3] || (await ask('Nama admin: '))).trim();
    if (!isEmail(email)) throw new Error('Email tidak valid.');
    if (name.length < 2) throw new Error('Nama terlalu pendek.');
    const pw = await ask('Password (min. 10 karakter): ', true);
    if (pw.length < 10 || pw.length > 72) throw new Error('Password harus 10 sampai 72 karakter.');
    if (pw !== (await ask('Ulangi password: ', true))) throw new Error('Password tidak sama.');
    const now = new Date();
    const existing = await db('users').where({ email }).first();
    const hash = await bcrypt.hash(pw, 12);
    if (existing) {
      await db('users').where({ id: existing.id }).update({ role: 'admin', name, password_hash: hash, is_active: 1, updated_at: now });
      console.log('Akun yang sudah ada dijadikan admin dengan password baru.');
    } else {
      await db('users').insert({ name, email, password_hash: hash, role: 'admin', is_active: 1, created_at: now, updated_at: now });
      console.log('Akun admin dibuat.');
    }
  } catch (e) {
    console.error('GAGAL:', e.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
})();
