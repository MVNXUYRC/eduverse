#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadEnvFiles } = require('../config/load-env');
const { createStore } = require('../persistence');
const { buildBackupPayload } = require('../admin/backup-utils');

loadEnvFiles();

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  const outputArg = process.argv[2];
  const outputPath = outputArg
    ? path.resolve(process.cwd(), outputArg)
    : path.resolve(process.cwd(), 'backups', `ead-backup-${timestamp()}.json`);

  const store = createStore();
  if (store.runSchema) await store.runSchema();

  try {
    const state = await store.loadState();
    const payload = buildBackupPayload(state);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

    console.log(`Backup exportado en: ${outputPath}`);
    console.log(`Modo de persistencia: ${store.mode}`);
    console.log(`Carreras: ${(payload.carreras || []).length}`);
    console.log(`Usuarios: ${(payload.usuarios || []).length}`);
    console.log(`Logs: ${(payload.auditLog || []).length}`);
  } finally {
    if (store.close) await store.close();
  }
}

main().catch((err) => {
  console.error('No se pudo exportar el backup:', err.message);
  process.exit(1);
});
