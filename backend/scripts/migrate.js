#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadEnvFiles } = require('../config/load-env');
const { createPgConnectionConfig } = require('../persistence/db-config');

loadEnvFiles();

async function main() {
  const { Pool } = require('pg');
  const pool = new Pool(createPgConnectionConfig(process.env));
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
