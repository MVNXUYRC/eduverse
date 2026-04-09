function toInt(value, fallback) {
  const n = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function sslConfigFromEnv(env = process.env) {
  return env.PGSSL_DISABLE === 'true' ? false : { rejectUnauthorized: false };
}

function createPgConnectionConfig(env = process.env) {
  const databaseUrl = String(env.DATABASE_URL || '').trim();
  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      ssl: sslConfigFromEnv(env),
    };
  }

  const host = String(env.DB_HOST || '').trim();
  const name = String(env.DB_NAME || '').trim();
  const user = String(env.DB_USER || '').trim();

  if (!host || !name || !user) {
    throw new Error(
      'Configuración PostgreSQL incompleta. Definí DATABASE_URL o DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD.'
    );
  }

  return {
    host,
    port: toInt(env.DB_PORT, 5432),
    database: name,
    user,
    password: String(env.DB_PASSWORD || ''),
    ssl: sslConfigFromEnv(env),
  };
}

module.exports = { createPgConnectionConfig };
