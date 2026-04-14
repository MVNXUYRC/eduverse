#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadEnvFiles } = require('../config/load-env');
const { createStore } = require('../persistence');
const { buildBackupPayload, applyBackupPayload } = require('../admin/backup-utils');

loadEnvFiles();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    throw new Error('Indicá el archivo de backup a restaurar. Ejemplo: npm run backup:restore -- backups/ead-backup.json');
  }

  const inputPath = path.resolve(process.cwd(), input);
  if (!fs.existsSync(inputPath)) throw new Error(`No existe el archivo ${inputPath}`);

  const store = createStore();
  if (store.runSchema) await store.runSchema();

  try {
    const currentState = await store.loadState();
    const rollbackPayload = buildBackupPayload(currentState);
    const rollbackPath = path.resolve(process.cwd(), 'backups', `rollback-before-restore-${timestamp()}.json`);
    fs.mkdirSync(path.dirname(rollbackPath), { recursive: true });
    fs.writeFileSync(rollbackPath, `${JSON.stringify(rollbackPayload, null, 2)}\n`, 'utf8');

    const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const nextState = applyBackupPayload(clone(currentState), payload);
    await store.saveState(nextState);

    console.log(`Backup restaurado desde: ${inputPath}`);
    console.log(`Rollback automático guardado en: ${rollbackPath}`);
    console.log(`Modo de persistencia: ${store.mode}`);
  } finally {
    if (store.close) await store.close();
  }
}

main().catch((err) => {
  console.error('No se pudo restaurar el backup:', err.message);
  process.exit(1);
});
