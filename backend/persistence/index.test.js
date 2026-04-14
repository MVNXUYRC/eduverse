const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createStore, hasPgConfiguration } = require('./index');

test('detecta configuración PostgreSQL válida', () => {
  assert.equal(hasPgConfiguration({ DATABASE_URL: 'postgres://user:pass@localhost:5432/ead' }), true);
  assert.equal(hasPgConfiguration({ DB_HOST: '127.0.0.1', DB_NAME: 'ead', DB_USER: 'postgres' }), true);
  assert.equal(hasPgConfiguration({}), false);
});

test('usa JsonStore cuando no hay configuración PostgreSQL', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ead-json-store-'));
  const jsonPath = path.join(tmpDir, 'db.json');
  const store = createStore({ JSON_DB_PATH: jsonPath });

  assert.equal(store.mode, 'json');
  await store.saveState({ carreras: [{ id: 1, nombre: 'Test' }] });
  const loaded = await store.loadState();
  assert.equal(loaded.carreras.length, 1);
  assert.equal(loaded.carreras[0].nombre, 'Test');
});

test('permite forzar JsonStore aunque exista configuración PostgreSQL', () => {
  const store = createStore({
    PERSISTENCE_MODE: 'json',
    DATABASE_URL: 'postgres://user:pass@localhost:5432/ead',
    JSON_DB_PATH: path.join(os.tmpdir(), 'ead-json-force-test.json'),
  });

  assert.equal(store.mode, 'json');
});
