const test = require('node:test');
const assert = require('node:assert/strict');

const { createPgConnectionConfig } = require('./db-config');

test('usa DATABASE_URL cuando está definida', () => {
  const cfg = createPgConnectionConfig({
    DATABASE_URL: 'postgres://user:pass@localhost:5432/ead',
    PGSSL_DISABLE: 'true',
  });
  assert.equal(cfg.connectionString, 'postgres://user:pass@localhost:5432/ead');
  assert.equal(cfg.ssl, false);
});

test('usa DB_* cuando no hay DATABASE_URL', () => {
  const cfg = createPgConnectionConfig({
    DB_HOST: '127.0.0.1',
    DB_PORT: '5432',
    DB_NAME: 'ead',
    DB_USER: 'postgres',
    DB_PASSWORD: 'postgres',
  });
  assert.equal(cfg.host, '127.0.0.1');
  assert.equal(cfg.port, 5432);
  assert.equal(cfg.database, 'ead');
  assert.equal(cfg.user, 'postgres');
  assert.equal(cfg.password, 'postgres');
});

test('falla si no hay configuración suficiente de PostgreSQL', () => {
  assert.throws(() => createPgConnectionConfig({}), /Configuración PostgreSQL incompleta/);
});
