#!/usr/bin/env node
const { createStore } = require('../persistence');
const { buildBackupPayload, applyBackupPayload } = require('../admin/backup-utils');

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const store = createStore();
  if (store.runSchema) await store.runSchema();

  const original = await store.loadState();
  const snapshot = clone(original);

  try {
    const payload = buildBackupPayload(snapshot);
    assert(Array.isArray(payload.carreras), 'Export inválido: carreras no es array');
    assert(Array.isArray(payload.usuarios), 'Export inválido: usuarios no es array');

    const imported = applyBackupPayload(clone(snapshot), payload);
    await store.saveState(imported);
    const reloaded = await store.loadState();

    assert((reloaded.carreras || []).length === (snapshot.carreras || []).length, 'Mismatch carreras');
    assert((reloaded.usuarios || []).length >= (snapshot.usuarios || []).length, 'Mismatch usuarios');
    assert(!!reloaded.config, 'Config no disponible tras import');
    assert(Array.isArray(reloaded.unidadesAcademicas || []), 'Lookup unidades inválido');

    console.log('Backup smoke: OK');
    console.log(`Mode: ${store.mode}`);
    console.log(`Carreras: ${(reloaded.carreras || []).length}`);
    console.log(`Usuarios: ${(reloaded.usuarios || []).length}`);
  } finally {
    // Restore original state so smoke test is non-destructive.
    await store.saveState(original);
    if (store.close) await store.close();
  }
}

main().catch((err) => {
  console.error('Backup smoke: ERROR -', err.message);
  process.exit(1);
});
