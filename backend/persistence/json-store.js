const fs = require('fs');
const path = require('path');

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath || path.join(__dirname, '../data/db.json');
    this.mode = 'json';
  }

  async loadState() {
    return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
  }

  async saveState(state) {
    fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2));
  }
}

module.exports = { JsonStore };
