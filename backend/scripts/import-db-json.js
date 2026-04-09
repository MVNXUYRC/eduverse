#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { PgStore } = require('../persistence/pg-store');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL no está definido.');
  process.exit(1);
}

async function main() {
  const input = process.argv[2] || path.join(__dirname, '../data/db.json');
  const raw = fs.readFileSync(input, 'utf8');
  const state = JSON.parse(raw);

  const store = new PgStore(process.env.DATABASE_URL);
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
