#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL no está definido.');
  process.exit(1);
}

async function main() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL_DISABLE === 'true' ? false : { rejectUnauthorized: false },
  });
  const sqlPath = path.join(__dirname, '../persistence/schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    await pool.query(sql);
    console.log('Migración aplicada correctamente.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Error al aplicar migración:', err.message);
  process.exit(1);
});
