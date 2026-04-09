const { PgStore } = require('./pg-store');
const { createPgConnectionConfig } = require('./db-config');

function createStore() {
  const connectionConfig = createPgConnectionConfig(process.env);
  return new PgStore(connectionConfig);
}

module.exports = { createStore };
