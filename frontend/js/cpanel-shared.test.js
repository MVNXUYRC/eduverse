const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadShared() {
  const code = fs.readFileSync(path.join(__dirname, 'cpanel-shared.js'), 'utf8');
  const window = {};
  const context = vm.createContext({
    window,
    document: {},
    sessionStorage: { getItem() { return null; } },
    localStorage: { getItem() { return null; } },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    XMLHttpRequest: function XMLHttpRequest() {},
    navigator: {},
    console,
    Date,
    setTimeout,
    clearTimeout,
  });
  window.window = window;
  vm.runInContext(code, context, { filename: 'frontend/js/cpanel-shared.js' });
  return window.CPanelShared;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSharedWithFetch(fetchImpl) {
  const code = fs.readFileSync(path.join(__dirname, 'cpanel-shared.js'), 'utf8');
  const window = {};
  const context = vm.createContext({
    window,
    document: {},
    sessionStorage: { getItem() { return null; } },
    localStorage: { getItem() { return null; } },
    fetch: fetchImpl,
    XMLHttpRequest: function XMLHttpRequest() {},
    navigator: {},
    console,
    Date,
    setTimeout,
    clearTimeout,
  });
  window.window = window;
  vm.runInContext(code, context, { filename: 'frontend/js/cpanel-shared.js' });
  return window.CPanelShared;
}

test('createCPanelState mantiene stores aislados y reiniciables', () => {
  const shared = loadShared();
  const one = shared.createCPanelState();
  const two = shared.createCPanelState();

  one.setMe({ email: 'uno@unam.edu.ar' });
  one.setCfg({ disciplinas: ['Artes'] });
  one.setCareerPage(3);
  one.setCareerFilters({ q: 'doctorado', activo: 'true' });
  one.setCareerDraft({ cTags: ['virtual'], cDis: ['docente'], cDocs: [{ tipo: 'Resolucion' }] });
  one.setUserQuery('root');

  assert.equal(one.getMe().email, 'uno@unam.edu.ar');
  assert.deepEqual(plain(one.getCfg()), { disciplinas: ['Artes'] });
  assert.equal(one.getCareerPage(), 3);
  assert.deepEqual(plain(one.getCareerFilters()), { q: 'doctorado', esCurso: '', activo: 'true' });
  assert.deepEqual(plain(one.getCareerDraft()), {
    cTags: ['virtual'],
    cDis: ['docente'],
    cDocs: [{ tipo: 'Resolucion' }],
  });
  assert.equal(one.getUserQuery(), 'root');

  assert.equal(two.getMe(), null);
  assert.deepEqual(plain(two.getCfg()), {});
  assert.equal(two.getCareerPage(), 1);
  assert.deepEqual(plain(two.getCareerFilters()), { q: '', esCurso: '', activo: '' });
  assert.deepEqual(plain(two.getCareerDraft()), { cTags: [], cDis: [], cDocs: [] });
  assert.equal(two.getUserQuery(), '');

  one.resetNavigationState();
  one.resetCareerDraft();

  assert.equal(one.getCareerPage(), 1);
  assert.deepEqual(plain(one.getCareerFilters()), { q: '', esCurso: '', activo: '' });
  assert.equal(one.getUserQuery(), '');
  assert.deepEqual(plain(one.getCareerDraft()), { cTags: [], cDis: [], cDocs: [] });
});

test('createCPanelState protege el estado interno con copias', () => {
  const shared = loadShared();
  const store = shared.createCPanelState();
  const source = { cTags: ['a'], cDis: ['b'], cDocs: [{ tipo: 'Resolucion' }] };

  store.setCareerDraft(source);
  source.cTags.push('externo');
  source.cDocs[0].tipo = 'Mutado';

  const firstRead = store.getCareerDraft();
  firstRead.cTags.push('interno');

  assert.deepEqual(plain(store.getCareerDraft()), {
    cTags: ['a'],
    cDis: ['b'],
    cDocs: [{ tipo: 'Mutado' }],
  });
});

test('api parsea JSON valido cuando el backend responde application/json', async () => {
  const shared = loadSharedWithFetch(async () => ({
    ok: true,
    status: 200,
    text: async () => '{"token":"jwt-demo"}',
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : null;
      },
    },
  }));

  const result = await shared.api('/auth/login', { method: 'POST', body: '{}' });
  assert.deepEqual(plain(result), { token: 'jwt-demo' });
});

test('api informa claramente cuando recibe HTML en lugar de JSON', async () => {
  const shared = loadSharedWithFetch(async () => ({
    ok: false,
    status: 500,
    text: async () => '<html><h1>Error</h1></html>',
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null;
      },
    },
  }));

  await assert.rejects(
    shared.api('/auth/login', { method: 'POST', body: '{}' }),
    (error) => {
      assert.equal(error.status, 500);
      assert.match(error.message, /HTML en lugar de JSON/);
      return true;
    },
  );
});
