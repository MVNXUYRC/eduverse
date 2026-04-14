const { PgStore } = require('./pg-store');
const { createPgConnectionConfig } = require('./db-config');
const { JsonStore } = require('./json-store');
const path = require('path');

function hasPgConfiguration(env = process.env) {
  const databaseUrl = String(env.DATABASE_URL || '').trim();
  if (databaseUrl) return true;

  const host = String(env.DB_HOST || '').trim();
  const name = String(env.DB_NAME || '').trim();
  const user = String(env.DB_USER || '').trim();
  return !!(host && name && user);
}

function resolveJsonPath(env = process.env) {
  const customPath = String(env.JSON_DB_PATH || '').trim();
  if (customPath) return customPath;
  return path.join(__dirname, '../data/db.json');
}

function createStore(env = process.env) {
  const mode = String(env.PERSISTENCE_MODE || 'auto').trim().toLowerCase();

  if (mode === 'json') {
    return new JsonStore(resolveJsonPath(env));
  }

  if (mode === 'postgres' || mode === 'postgresql') {
    return new PgStore(createPgConnectionConfig(env));
  }

  if (hasPgConfiguration(env)) {
    return new PgStore(createPgConnectionConfig(env));
  }

  return new JsonStore(resolveJsonPath(env));
}

module.exports = { createStore, hasPgConfiguration, resolveJsonPath };
