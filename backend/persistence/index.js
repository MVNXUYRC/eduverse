const path = require('path');
const { JsonStore } = require('./json-store');
const { PgStore } = require('./pg-store');

function createStore() {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    return new PgStore(dbUrl);
  }
  return new JsonStore(path.join(__dirname, '../data/db.json'));
}

module.exports = { createStore };
