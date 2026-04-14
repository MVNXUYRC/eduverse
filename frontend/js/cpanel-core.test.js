const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class FakeClassList {
  constructor(initial = []) {
    this.set = new Set(initial);
  }

  add(...tokens) {
    tokens.forEach((token) => this.set.add(token));
  }

  remove(...tokens) {
    tokens.forEach((token) => this.set.delete(token));
  }

  contains(token) {
    return this.set.has(token);
  }

  toggle(token, force) {
    if (force === true) {
      this.set.add(token);
      return true;
    }
    if (force === false) {
      this.set.delete(token);
      return false;
    }
    if (this.set.has(token)) {
      this.set.delete(token);
      return false;
    }
    this.set.add(token);
    return true;
  }
}

class FakeElement {
  constructor(id, options = {}) {
    this.id = id;
    this.value = options.value || '';
    this.checked = options.checked || false;
    this.disabled = options.disabled || false;
    this.textContent = options.textContent || '';
    this.innerHTML = options.innerHTML || '';
    this.style = { display: options.display || '' };
    this.dataset = { ...(options.dataset || {}) };
    this.classList = new FakeClassList(options.classes || []);
    this.listeners = {};
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  dispatch(type, event = {}) {
    const handler = this.listeners[type];
    if (handler) handler(event);
  }

  closest(selector) {
    if (selector === '.sb-foot' && this.id === 'sbu') return this;
    return null;
  }
}

function createStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    dump() {
      return Object.fromEntries(store.entries());
    },
  };
}

function createSharedStub() {
  function createCareerFilters(overrides = {}) {
    return { q: '', esCurso: '', activo: '', ...overrides };
  }

  function createCareerDraft(overrides = {}) {
    return {
      cTags: [...(overrides.cTags || [])],
      cDis: [...(overrides.cDis || [])],
      cDocs: [...(overrides.cDocs || [])],
    };
  }

  function createCPanelState(seed = {}) {
    let me = seed.me || null;
    let cfg = seed.cfg || {};
    let careerPage = 1;
    let careerFilters = createCareerFilters(seed.careerFilters);
    let careerDraft = createCareerDraft(seed.careerDraft);
    let userQuery = String(seed.userQuery || '');
    return {
      getMe() { return me; },
      setMe(value) { me = value || null; },
      getCfg() { return cfg; },
      setCfg(value) { cfg = value || {}; },
      getCareerPage() { return careerPage; },
      setCareerPage(value) { careerPage = value; },
      getCareerFilters() { return { ...careerFilters }; },
      setCareerFilters(value) { careerFilters = createCareerFilters(value); },
      getCareerDraft() { return createCareerDraft(careerDraft); },
      setCareerDraft(value) { careerDraft = createCareerDraft(value); },
      getUserQuery() { return userQuery; },
      setUserQuery(value) { userQuery = String(value || ''); },
      resetNavigationState() {
        careerPage = 1;
        careerFilters = createCareerFilters();
        userQuery = '';
      },
    };
  }

  return {
    BASE: '/admin/api',
    TK: 'unam_atk',
    UK: 'unam_au',
    RE: 'unam_remembered_email',
    RL: {
      root: 'root',
      institucional: 'Administrador Institucional',
      unidades: 'Administrador de Unidades',
    },
    EAD: 'Educación a Distancia',
    UNIDAD_REGIONAL: {},
    MAX_UPLOAD_BYTES: 20 * 1024 * 1024,
    api: async () => ({}),
    isActive: (state) => state?.valor !== false && state?.activo !== false,
    fmtD: () => '09/04/2026',
    eye: () => {},
    pstr: () => {},
    showModal: () => {},
    cm: () => {},
    bgc: () => {},
    toast: () => {},
    esc: (value) => String(value || ''),
    properName: (value) => String(value || ''),
    getOrgsForTipo: () => [],
    compactRichHtml: (value) => value,
    plainFromHtml: (value) => value,
    createCPanelState,
  };
}

function createHarness(options = {}) {
  const timers = [];
  const toasts = [];
  const apiCalls = [];
  const moduleCalls = {
    careers: [],
    users: [],
    config: [],
    logs: [],
    backup: [],
  };

  const elements = {
    le: new FakeElement('le'),
    lp: new FakeElement('lp'),
    lr: new FakeElement('lr'),
    lerr: new FakeElement('lerr'),
    lbtn: new FakeElement('lbtn', { textContent: 'Ingresar' }),
    cp1: new FakeElement('cp1'),
    cp2: new FakeElement('cp2'),
    cp3: new FakeElement('cp3'),
    cpe: new FakeElement('cpe'),
    's-login': new FakeElement('s-login', { classes: ['on'] }),
    's-cp': new FakeElement('s-cp'),
    app: new FakeElement('app', { display: 'none' }),
    sbav: new FakeElement('sbav'),
    sbn: new FakeElement('sbn'),
    sbe: new FakeElement('sbe'),
    sbr: new FakeElement('sbr'),
    'nav-usr': new FakeElement('nav-usr', { display: 'none', classes: ['ni'], dataset: { page: 'usr' } }),
    'nav-cfg': new FakeElement('nav-cfg', { display: 'none', classes: ['ni'], dataset: { page: 'cfg' } }),
    'nav-log': new FakeElement('nav-log', { display: 'none', classes: ['ni'], dataset: { page: 'log' } }),
    'nav-bkp': new FakeElement('nav-bkp', { display: 'none', classes: ['ni'], dataset: { page: 'bkp' } }),
    navDash: new FakeElement('navDash', { classes: ['ni', 'active'], dataset: { page: 'dash' } }),
    navCarr: new FakeElement('navCarr', { classes: ['ni'], dataset: { page: 'carr' } }),
    tbt: new FakeElement('tbt', { textContent: 'Dashboard' }),
    ct: new FakeElement('ct'),
    udrop: new FakeElement('udrop', { classes: ['hidden'] }),
    sbcv: new FakeElement('sbcv'),
    sbu: new FakeElement('sbu'),
    mr: new FakeElement('mr'),
    tc: new FakeElement('tc'),
  };

  const navItems = [
    elements.navDash,
    elements.navCarr,
    elements['nav-usr'],
    elements['nav-cfg'],
    elements['nav-log'],
    elements['nav-bkp'],
  ];

  const documentListeners = {};
  const document = {
    getElementById(id) {
      return elements[id] || null;
    },
    querySelectorAll(selector) {
      if (selector === '.ni') return navItems;
      return [];
    },
    querySelector(selector) {
      const match = selector.match(/^\[data-page="(.+)"\]$/);
      if (!match) return null;
      return navItems.find((item) => item.dataset.page === match[1]) || null;
    },
    addEventListener(type, handler) {
      documentListeners[type] = handler;
    },
  };

  const localStorage = createStorage(options.localStorage || {});
  const sessionStorage = createStorage(options.sessionStorage || {});

  const window = {
    CPanelShared: createSharedStub(),
    window: null,
    document,
    navigator: {},
    localStorage,
    sessionStorage,
    fetch: options.fetch || (async () => ({ ok: true, json: async () => ({}) })),
  };
  window.window = window;

  window.CPanelShared.toast = (message, type = 'info') => {
    toasts.push({ message, type });
  };
  window.CPanelShared.showModal = (html) => {
    elements.mr.innerHTML = html;
  };
  window.CPanelShared.api = async (endpoint, requestOptions = {}) => {
    apiCalls.push({ endpoint, options: requestOptions });
    if (options.api) return options.api(endpoint, requestOptions);
    return {};
  };

  window.createCPanelCareers = () => ({
    rcarr() { moduleCalls.careers.push('rcarr'); },
  });
  window.createCPanelUsers = () => ({
    rusr() { moduleCalls.users.push('rusr'); },
  });
  window.createCPanelConfig = () => ({
    rcfg() { moduleCalls.config.push('rcfg'); },
  });
  window.createCPanelLogs = () => ({
    rlog() { moduleCalls.logs.push('rlog'); },
  });
  window.createCPanelBackup = () => ({
    rbkp() { moduleCalls.backup.push('rbkp'); },
  });

  const context = vm.createContext({
    window,
    document,
    navigator: window.navigator,
    localStorage,
    sessionStorage,
    fetch: window.fetch,
    console,
    Date,
    URLSearchParams,
    setTimeout(fn, delay) {
      timers.push({ fn, delay });
      return timers.length;
    },
    clearTimeout() {},
  });

  const code = fs.readFileSync(path.join(__dirname, 'cpanel-core.js'), 'utf8');
  vm.runInContext(code, context, { filename: 'frontend/js/cpanel-core.js' });

  return {
    window,
    document,
    elements,
    localStorage,
    sessionStorage,
    apiCalls,
    toasts,
    moduleCalls,
    timers,
    runTimers() {
      while (timers.length) {
        const timer = timers.shift();
        timer.fn();
      }
    },
    plain(value) {
      return JSON.parse(JSON.stringify(value));
    },
    documentListeners,
  };
}

test('doLogin valida credenciales vacias sin llamar API', async () => {
  const harness = createHarness();

  await harness.window.doLogin();

  assert.equal(harness.apiCalls.length, 0);
  assert.equal(harness.elements.lerr.textContent, 'Ingresá usuario o correo.');
  assert.equal(harness.elements.lerr.classList.contains('login-alert'), true);
});

test('doLogin autentica, persiste sesion y abre dashboard', async () => {
  const harness = createHarness({
    api: async (endpoint, requestOptions) => {
      if (endpoint === '/auth/login') {
        assert.equal(requestOptions.method, 'POST');
        assert.match(requestOptions.body, /root-unam/);
        return { token: 'jwt-demo' };
      }
      if (endpoint === '/auth/me') {
        return { user: { nombre: 'Rocio', login: 'root-unam', email: 'root@unam.edu.ar', rol: 'root', unidades: [] } };
      }
      if (endpoint === '/config') {
        return { disciplinas: ['Artes'] };
      }
      if (endpoint === '/carreras?limit=200') {
        return { data: [{ nombre: 'Licenciatura', esCurso: false, unidadAcademica: 'FAyD', activo: { valor: true }, inscripcionAbierta: { valor: true } }] };
      }
      if (endpoint === '/usuarios') {
        return { data: [{ email: 'root@unam.edu.ar' }] };
      }
      throw new Error(`Unexpected endpoint ${endpoint}`);
    },
  });

  harness.elements.le.value = 'root-unam';
  harness.elements.lp.value = 'Secret#123';
  harness.elements.lr.checked = true;

  await harness.window.doLogin();
  await Promise.resolve();

  assert.equal(harness.sessionStorage.getItem('unam_atk'), 'jwt-demo');
  assert.match(harness.sessionStorage.getItem('unam_au'), /root@unam\.edu\.ar/);
  assert.equal(harness.localStorage.getItem('unam_remembered_email'), 'root-unam');
  assert.equal(harness.elements.app.style.display, 'flex');
  assert.equal(harness.elements['nav-usr'].style.display, 'flex');
  assert.equal(harness.elements['nav-cfg'].style.display, 'flex');
  assert.equal(harness.elements['nav-log'].style.display, 'flex');
  assert.equal(harness.elements['nav-bkp'].style.display, 'flex');
  assert.equal(harness.elements.sbe.textContent, '');
  assert.equal(harness.elements.sbe.style.display, 'none');
  assert.equal(harness.elements.tbt.textContent, 'Dashboard');
  assert.equal(harness.elements.navDash.classList.contains('active'), true);
  assert.equal(harness.apiCalls.some((call) => call.endpoint === '/carreras?limit=200'), true);
  assert.equal(harness.apiCalls.some((call) => call.endpoint === '/usuarios'), true);
});

test('doLogin aplica permisos por rol institucional y de unidades', async () => {
  const makeHarness = (role) => createHarness({
    api: async (endpoint) => {
      if (endpoint === '/auth/login') return { token: `${role}-jwt` };
      if (endpoint === '/auth/me') {
        return { user: { nombre: 'Ana', email: `${role}@unam.edu.ar`, rol: role, unidades: ['FAyD'] } };
      }
      if (endpoint === '/config') return {};
      if (endpoint === '/carreras?limit=200') return { data: [] };
      if (endpoint === '/usuarios') return { data: [] };
      throw new Error(`Unexpected endpoint ${endpoint}`);
    },
  });

  const institucional = makeHarness('institucional');
  institucional.elements.le.value = 'institucional@unam.edu.ar';
  institucional.elements.lp.value = 'Secret#123';
  await institucional.window.doLogin();

  assert.equal(institucional.elements['nav-usr'].style.display, 'flex');
  assert.equal(institucional.elements['nav-cfg'].style.display, 'none');
  assert.equal(institucional.elements['nav-log'].style.display, 'none');
  assert.equal(institucional.elements['nav-bkp'].style.display, 'none');
  assert.equal(institucional.elements.sbe.textContent, '');
  assert.equal(institucional.elements.sbe.style.display, 'none');

  const unidades = makeHarness('unidades');
  unidades.elements.le.value = 'unidades@unam.edu.ar';
  unidades.elements.lp.value = 'Secret#123';
  await unidades.window.doLogin();

  assert.equal(unidades.elements['nav-usr'].style.display, 'none');
  assert.equal(unidades.elements['nav-cfg'].style.display, 'none');
  assert.equal(unidades.elements['nav-log'].style.display, 'none');
  assert.equal(unidades.elements['nav-bkp'].style.display, 'none');
  assert.equal(unidades.elements.sbe.textContent, '');
  assert.equal(unidades.elements.sbe.style.display, 'none');
});

test('submitCP valida coincidencia y en exito cierra sesion', async () => {
  const harness = createHarness({
    api: async (endpoint, requestOptions) => {
      assert.equal(endpoint, '/auth/change-password');
      assert.equal(requestOptions.method, 'POST');
      assert.match(requestOptions.body, /Nueva#123/);
      return { ok: true };
    },
  });

  harness.sessionStorage.setItem('unam_atk', 'jwt-demo');
  harness.sessionStorage.setItem('unam_au', JSON.stringify({ email: 'root@unam.edu.ar' }));

  harness.elements.cp1.value = 'Anterior#123';
  harness.elements.cp2.value = 'Nueva#123';
  harness.elements.cp3.value = 'Otra#123';

  await harness.window.submitCP();
  assert.equal(harness.elements.cpe.textContent, 'Las contraseñas no coinciden.');
  assert.equal(harness.apiCalls.length, 0);

  harness.elements.cp3.value = 'Nueva#123';
  await harness.window.submitCP();

  assert.deepEqual(harness.toasts[0], { message: 'Contraseña actualizada. Iniciá sesión nuevamente.', type: 'success' });
  assert.equal(harness.timers.length, 1);
  harness.runTimers();
  assert.equal(harness.sessionStorage.getItem('unam_atk'), null);
  assert.equal(harness.sessionStorage.getItem('unam_au'), null);
  assert.equal(harness.elements['s-login'].classList.contains('on'), true);
  assert.equal(harness.elements.app.style.display, 'none');
});

test('nav despacha a cada modulo y actualiza titulo', () => {
  const harness = createHarness();

  harness.window.nav('carr');
  harness.window.nav('usr');
  harness.window.nav('cfg');
  harness.window.nav('log');
  harness.window.nav('bkp');

  assert.deepEqual(harness.moduleCalls.careers, ['rcarr']);
  assert.deepEqual(harness.moduleCalls.users, ['rusr']);
  assert.deepEqual(harness.moduleCalls.config, ['rcfg']);
  assert.deepEqual(harness.moduleCalls.logs, ['rlog']);
  assert.deepEqual(harness.moduleCalls.backup, ['rbkp']);
  assert.equal(harness.elements.tbt.textContent, 'Backup');
  assert.equal(harness.elements['nav-bkp'].classList.contains('active'), true);
});
