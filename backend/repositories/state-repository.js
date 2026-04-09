class StateRepository {
  constructor(store) {
    this.store = store;
  }

  async load() {
    return this.store.loadState();
  }

  async save(state) {
    return this.store.saveState(state);
  }

  getMode() {
    return this.store.mode || 'json';
  }

  async close() {
    if (this.store.close) await this.store.close();
  }
}

module.exports = { StateRepository };
