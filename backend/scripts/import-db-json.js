#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadEnvFiles } = require('../config/load-env');
const { PgStore } = require('../persistence/pg-store');
const { createPgConnectionConfig } = require('../persistence/db-config');

loadEnvFiles();

async function main() {
  const input = process.argv[2] || path.join(__dirname, '../data/db.json');
  const raw = fs.readFileSync(input, 'utf8');
  const state = JSON.parse(raw);

  const store = new PgStore(createPgConnectionConfig(process.env));
  try {
    await store.runSchema();
    await store.saveState(state);
    console.log(`Importación completada desde ${input}`);
    console.log(`Carreras: ${(state.carreras || []).length}`);
    console.log(`Usuarios: ${(state.usuarios || []).length}`);
  } finally {
    await store.close();
  }
}

main().catch((err) => {
  console.error('Error al importar:', err.message);
  process.exit(1);
});
