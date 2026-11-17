require('dotenv').config();
const fs = require('fs');
const path = require('path');
const knex = require('knex');

const client = (process.env.DB_CLIENT || 'sqlite').toLowerCase();
const isMysql = client === 'mysql';

function build() {
  if (isMysql) {
    return knex({
      client: 'mysql2',
      connection: {
        host: process.env.MYSQL_HOST || '127.0.0.1',
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'sandyakala_rasa',
        charset: 'utf8mb4',
        timezone: 'Z', // semua waktu disimpan sebagai UTC
      },
      pool: { min: 0, max: 10 },
    });
  }
  const file = path.resolve(process.env.SQLITE_FILE || path.join(__dirname, '..', '..', 'data', 'sandyakala.sqlite'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return knex({
    client: 'better-sqlite3',
    connection: { filename: file },
    useNullAsDefault: true,
    pool: {
      afterCreate(conn, done) {
        conn.pragma('foreign_keys = ON');
        conn.pragma('journal_mode = WAL');
        done(null, conn);
      },
    },
  });
}

const db = build();
db.isMysql = isMysql;
module.exports = db;
