// Legacy entrypoint kept for backwards compatibility.
// The standalone server is the canonical runtime and uses PostgreSQL persistence.
module.exports = require('./server-standalone');
