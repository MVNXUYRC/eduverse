const fs = require('fs');
const path = require('path');

function defaultState() {
  return {
    carreras: [],
    usuarios: [],
    config: {},
    auditLog: [],
    interesados: [],
    newsletterSubscriptions: [],
    newsletterDispatchLog: [],
    unidadesAcademicas: [],
    regionales: [],
    localidades: [],
    disciplinas: [],
    tiposDocumento: [],
    organismos: [],
  };
}

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.mode = 'json';
  }

  async runSchema() {}

  async close() {}

  async loadState() {
    if (!fs.existsSync(this.filePath)) {
      return defaultState();
    }
    const raw = fs.readFileSync(this.filePath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return {
      ...defaultState(),
      ...parsed,
    };
  }

  async saveState(state) {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(state, null, 2)}\n`);
  }
}

module.exports = { JsonStore };
