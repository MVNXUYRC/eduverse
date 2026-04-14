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
    this.name = options.name || '';
    this.type = options.type || '';
    this.files = options.files || [];
    this.textContent = options.textContent || '';
    this._innerHTML = options.innerHTML || '';
    this.style = { display: options.display || '', cssText: options.cssText || '', opacity: options.opacity || '' };
    this.dataset = { ...(options.dataset || {}) };
    this.classList = new FakeClassList(options.classes || []);
    this.children = [];
    this.listeners = {};
    this.parentNode = options.parentNode || null;
    this._closestMap = options.closestMap || {};
    this.focused = false;
    this.removed = false;
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value || '');
    if (this.tagName === 'div' && this._innerHTML) {
      this.firstElementChild = new FakeElement(`${this.id || 'tmp'}-child`, { parentNode: this });
      this.firstElementChild.innerHTML = this._innerHTML;
    }
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  remove() {
    this.removed = true;
    if (this.parentNode?.children) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    }
  }

  focus() {
    this.focused = true;
  }

  before(node) {
    if (!this.parentNode?.children) return;
    const idx = this.parentNode.children.indexOf(this);
    if (idx === -1) return;
    this.parentNode.children.splice(idx, 0, node);
    node.parentNode = this.parentNode;
  }

  select() {}

  querySelector(selector) {
    if (selector === '.mact') return this.mact || null;
    return null;
  }

  querySelectorAll() {
    return [];
  }

  closest(selector) {
    return this._closestMap[selector] || null;
  }
}

class FakeFormData {
  constructor() {
    this.entries = [];
  }

  append(key, value, filename) {
    this.entries.push({ key, value, filename });
  }
}

function makeRadio(value, checked = false) {
  return new FakeElement(`radio-${value}`, {
    name: 'fc-tipo',
    type: 'radio',
    value,
    checked,
  });
}

function makeUnit(value, checked = false) {
  const label = new FakeElement(`label-${value}`, { classes: checked ? ['unit-item', 'sel'] : ['unit-item'] });
  const input = new FakeElement(`unit-${value}`, {
    name: 'fc-u',
    type: 'checkbox',
    value,
    checked,
    closestMap: { '.unit-item': label },
  });
  label.querySelector = (selector) => (selector === 'input' ? input : null);
  return { label, input };
}

function createHarness(options = {}) {
  const toasts = [];
  const apiCalls = [];
  const confirmCalls = [];
  let careerDraft = options.initialDraft || { cTags: [], cDis: [], cDocs: [] };
  let careerPage = options.initialPage || 3;
  let careerFilters = options.initialFilters || { q: 'abc', esCurso: 'false', activo: 'true' };

  const modal = new FakeElement('modal');
  const modalActions = new FakeElement('mact', { parentNode: modal });
  modal.mact = modalActions;
  modal.children.push(modalActions);

  const elements = {
    'fc-n': new FakeElement('fc-n'),
    'fc-nivel': new FakeElement('fc-nivel'),
    'fc-subtipo': new FakeElement('fc-subtipo'),
    'fc-subtipo-grp': new FakeElement('fc-subtipo-grp', { display: 'none' }),
    'fc-dis-grp': new FakeElement('fc-dis-grp', { display: 'none' }),
    'fc-form-grp': new FakeElement('fc-form-grp', { display: 'none' }),
    'fc-insc-fecha-grp': new FakeElement('fc-insc-fecha-grp', { display: 'none' }),
    'fc-plan-grp': new FakeElement('fc-plan-grp', { display: '' }),
    'fc-prog-grp': new FakeElement('fc-prog-grp', { display: 'none' }),
    'fc-nivel-grp': new FakeElement('fc-nivel-grp', { display: '' }),
    'fc-reg': new FakeElement('fc-reg'),
    'fc-ead-hint': new FakeElement('fc-ead-hint', { display: 'none' }),
    'fc-mod': new FakeElement('fc-mod'),
    'fc-dur': new FakeElement('fc-dur'),
    'fc-disc': new FakeElement('fc-disc'),
    'fc-desc-ed': new FakeElement('fc-desc-ed', { innerHTML: '<p>Descripcion</p>' }),
    'fc-req-ed': new FakeElement('fc-req-ed', { innerHTML: '<p>Requisitos</p>' }),
    'fc-prog': new FakeElement('fc-prog', { innerHTML: '<p>Programa</p>' }),
    'fc-cont': new FakeElement('fc-cont'),
    'fc-tel-cont': new FakeElement('fc-tel-cont'),
    'fc-form': new FakeElement('fc-form'),
    'fc-insc-fecha': new FakeElement('fc-insc-fecha'),
    'fc-ia-v': new FakeElement('fc-ia-v', { checked: true }),
    'fc-ia-d': new FakeElement('fc-ia-d'),
    'fc-act-v': new FakeElement('fc-act-v', { checked: true }),
    'fc-act-d': new FakeElement('fc-act-d'),
    'fc-nv': new FakeElement('fc-nv', { checked: false }),
    'fc-plan': new FakeElement('fc-plan', { files: [] }),
    'carr-save-btn': new FakeElement('carr-save-btn'),
    'save-progress': null,
    'doc-list': new FakeElement('doc-list'),
    'fc-tags': new FakeElement('fc-tags'),
    'fc-dis': new FakeElement('fc-dis'),
    ct: new FakeElement('ct'),
  };

  const radios = [makeRadio('false', true), makeRadio('true', false)];
  const units = [
    makeUnit('Facultad de Arte y Diseño', false),
    makeUnit('Educación a Distancia', false),
  ];

  const allInputsByName = {
    'fc-tipo': radios.map((radio) => radio),
    'fc-u': units.map((unit) => unit.input),
  };

  const document = {
    body: new FakeElement('body'),
    getElementById(id) {
      return elements[id] || null;
    },
    querySelector(selector) {
      if (selector === 'input[name="fc-tipo"]:checked') {
        return radios.find((radio) => radio.checked) || null;
      }
      if (selector === '.modal') return modal;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'input[name="fc-u"]') return allInputsByName['fc-u'];
      if (selector === 'input[name="fc-u"]:checked') return allInputsByName['fc-u'].filter((input) => input.checked);
      if (selector === 'input[name="fc-tipo"]') return allInputsByName['fc-tipo'];
      return [];
    },
    createElement(tagName) {
      const el = new FakeElement(`${tagName}-${Math.random().toString(16).slice(2)}`);
      el.tagName = tagName;
      return el;
    },
    execCommand() {
      return true;
    },
  };

  const contextWindow = {
    window: null,
    getSelection() {
      return {
        rangeCount: 0,
        removeAllRanges() {},
        addRange() {},
      };
    },
  };
  contextWindow.window = contextWindow;

  const deps = {
    BASE: '/admin/api',
    TK: 'unam_atk',
    EAD: 'Educación a Distancia',
    UNIDAD_REGIONAL: {
      'Facultad de Arte y Diseño': 'Oberá',
      'Educación a Distancia': '',
    },
    MAX_UPLOAD_BYTES: 20 * 1024 * 1024,
    api: async (endpoint, requestOptions = {}) => {
      apiCalls.push({ endpoint, options: requestOptions });
      if (options.api) return options.api(endpoint, requestOptions);
      if (endpoint.startsWith('/carreras?')) return { data: [], meta: { totalPages: 1, page: 1 } };
      if (endpoint === '/carreras/99') return { id: 99, telefonoContacto: elements['fc-tel-cont'].value.trim() };
      return { id: 99 };
    },
    isActive: () => true,
    toast: (message, type = 'info') => {
      toasts.push({ message, type });
    },
    esc: (value) => String(value || ''),
    showModal: () => {},
    cm: () => {
      harness.closed = true;
    },
    properName: (value) => String(value || '').trim().toLowerCase().split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
    getOrgsForTipo: (tipo, allOrgs) => (tipo === 'Disposición' ? ['SPU', 'SSPU'] : allOrgs),
    compactRichHtml: (value) => String(value || '').replace(/\s+/g, ' ').trim(),
    plainFromHtml: (value) => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    getMe: () => ({ rol: 'root', unidades: [] }),
    getCfg: () => ({
      unidadesAcademicas: ['Facultad de Arte y Diseño', 'Educación a Distancia'],
      disciplinas: ['Artes', 'Ciencias'],
      tiposDocumento: ['Resolución', 'Disposición'],
      organismos: ['Consejo Superior', 'SPU', 'SSPU'],
    }),
    getCp: () => careerPage,
    setCp: (value) => { careerPage = value; },
    getCf: () => ({ ...careerFilters }),
    setCf: (value) => { careerFilters = { ...value }; },
    getCareerDraft: () => JSON.parse(JSON.stringify(careerDraft)),
    setCareerDraft: (value) => { careerDraft = JSON.parse(JSON.stringify(value)); },
  };

  const context = vm.createContext({
    window: contextWindow,
    document,
    console,
    Date,
    URLSearchParams,
    setTimeout(fn) {
      fn();
      return 1;
    },
    clearTimeout() {},
    confirm: (message) => {
      confirmCalls.push(String(message || ''));
      return options.confirmResponse !== undefined ? !!options.confirmResponse : true;
    },
    sessionStorage: { getItem() { return 'jwt-demo'; } },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    FormData: FakeFormData,
    XMLHttpRequest: function XMLHttpRequest() {},
  });

  const code = fs.readFileSync(path.join(__dirname, 'cpanel-careers.js'), 'utf8');
  vm.runInContext(code, context, { filename: 'frontend/js/cpanel-careers.js' });
  const careers = contextWindow.createCPanelCareers(deps);

  const harness = {
    careers,
    elements,
    radios,
    units,
    toasts,
    apiCalls,
    confirmCalls,
    getCareerDraft() {
      return JSON.parse(JSON.stringify(careerDraft));
    },
    getCareerFilters() {
      return { ...careerFilters };
    },
    getCareerPage() {
      return careerPage;
    },
    closed: false,
  };

  return harness;
}

test('autoNivel infiere nivel y subtipo desde la denominacion', () => {
  const harness = createHarness();

  harness.careers.autoNivel('Maestría en Educación');
  assert.equal(harness.elements['fc-nivel'].value, 'Posgrado');
  assert.equal(harness.elements['fc-subtipo'].value, 'Maestría');
  assert.equal(harness.elements['fc-subtipo-grp'].style.display, '');

  harness.elements['fc-nivel'].value = '';
  harness.elements['fc-subtipo'].value = '';
  harness.careers.autoNivel('Licenciatura en Diseño');
  assert.equal(harness.elements['fc-nivel'].value, 'Grado');
  assert.equal(harness.elements['fc-subtipo-grp'].style.display, 'none');
});

test('onTipoCh para curso no altera unidades y mantiene visibilidad correcta', () => {
  const harness = createHarness();
  harness.radios[0].checked = false;
  harness.radios[1].checked = true;
  harness.units[0].input.checked = true;
  harness.units[0].label.classList.add('sel');

  harness.careers.onTipoCh();

  assert.equal(harness.elements['fc-dis-grp'].style.display, '');
  assert.equal(harness.elements['fc-form-grp'].style.display, '');
  assert.equal(harness.elements['fc-insc-fecha-grp'].style.display, '');
  assert.equal(harness.elements['fc-plan-grp'].style.display, 'none');
  assert.equal(harness.elements['fc-prog-grp'].style.display, '');
  assert.equal(harness.elements['fc-nivel-grp'].style.display, 'none');
  assert.equal(harness.units[0].input.checked, true);
  assert.equal(harness.units[1].input.checked, false);
  assert.equal(harness.elements['fc-mod'].value, '100% Virtual');
});

test('toggleUnitSel con EaD fuerza tipo curso y actualiza regional primaria', () => {
  const harness = createHarness();
  harness.units[0].input.checked = true;
  harness.units[0].label.classList.add('sel');

  harness.careers.toggleUnitSel(harness.units[1].label);

  assert.equal(harness.units[1].input.checked, true);
  assert.equal(harness.radios[1].checked, true);
  assert.equal(harness.elements['fc-reg'].value, 'Oberá');
});

test('addT y rmT normalizan tags y disertantes sin duplicados', () => {
  const harness = createHarness({ initialDraft: { cTags: ['virtual'], cDis: ['Ana Maria'], cDocs: [] } });
  const tagsInput = { value: 'Virtual;Gestion', focus() {} };
  const disInput = { value: 'juan perez;ana maria', focus() {} };

  harness.careers.addT({ key: 'Enter', preventDefault() {}, target: tagsInput }, 'tags');
  harness.careers.addT({ key: 'Enter', preventDefault() {}, target: disInput }, 'dis');

  assert.deepEqual(harness.getCareerDraft().cTags, ['virtual', 'gestion']);
  assert.deepEqual(harness.getCareerDraft().cDis, ['Ana Maria', 'Juan Perez']);

  harness.careers.rmT('gestion', 'tags');
  harness.careers.rmT('Juan Perez', 'dis');

  assert.deepEqual(harness.getCareerDraft().cTags, ['virtual']);
  assert.deepEqual(harness.getCareerDraft().cDis, ['Ana Maria']);
});

test('addDoc y rmDoc actualizan el borrador de documentos', () => {
  const harness = createHarness({
    initialDraft: {
      cTags: [],
      cDis: [],
      cDocs: [{ tipo: 'Resolución', organismo: 'Consejo Superior', numero: '1', anio: '2024', pdf: null, _i: 0 }],
    },
  });

  harness.careers.addDoc();
  assert.equal(harness.getCareerDraft().cDocs.length, 2);
  assert.equal(harness.getCareerDraft().cDocs[1].tipo, 'Disposición');

  harness.careers.rmDoc(0);
  assert.equal(harness.getCareerDraft().cDocs.length, 1);
  assert.equal(harness.elements['doc-list'].innerHTML.includes('Documento 1'), true);
});

test('saveCarr valida reglas criticas antes de guardar', async () => {
  const harness = createHarness();
  harness.elements['fc-n'].value = 'Curso de prueba';
  harness.elements['fc-dur'].value = '40 horas';
  harness.elements['fc-mod'].value = '100% Virtual';
  harness.units[1].input.checked = true;
  harness.radios[0].checked = true;
  harness.radios[1].checked = false;

  await harness.careers.saveCarr(null);

  assert.deepEqual(harness.toasts[0], {
    message: 'Seleccioná el nivel académico',
    type: 'error',
  });

  harness.elements['fc-nivel'].value = 'Grado';
  await harness.careers.saveCarr(null);

  assert.deepEqual(harness.toasts[1], {
    message: 'Educación a Distancia solo admite Cursos',
    type: 'error',
  });
});

test('saveCarr arma payload JSON, normaliza disertantes y resetea filtros al guardar', async () => {
  const harness = createHarness({
    initialDraft: {
      cTags: ['virtual'],
      cDis: ['juan perez'],
      cDocs: [{ tipo: 'Resolución', organismo: 'Consejo Superior', numero: '15', anio: '2026', pdf: null, _i: 0 }],
    },
  });

  harness.elements['fc-n'].value = 'Curso de Curaduría';
  harness.elements['fc-dur'].value = '40 horas';
  harness.elements['fc-mod'].value = '100% Virtual';
  harness.elements['fc-disc'].value = 'Artes';
  harness.elements['fc-cont'].value = 'info@unam.edu.ar';
  harness.elements['fc-tel-cont'].value = '3764123456';
  harness.elements['fc-form'].value = 'https://inscripciones.unam.edu.ar';
  harness.elements['fc-insc-fecha'].value = '2026-05-10';
  harness.elements['fc-ia-v'].checked = true;
  harness.elements['fc-act-v'].checked = true;
  harness.radios[0].checked = false;
  harness.radios[1].checked = true;
  harness.units[1].input.checked = true;
  harness.units[1].label.classList.add('sel');
  harness.elements['doc-tipo-0'] = new FakeElement('doc-tipo-0', { value: 'Resolución' });
  harness.elements['doc-org-0'] = new FakeElement('doc-org-0', { value: 'Consejo Superior' });
  harness.elements['doc-num-0'] = new FakeElement('doc-num-0', { value: '15' });
  harness.elements['doc-anio-0'] = new FakeElement('doc-anio-0', { value: '2026' });
  harness.elements['doc-pdf-0'] = new FakeElement('doc-pdf-0', { files: [] });

  await harness.careers.saveCarr(null);

  const createCall = harness.apiCalls.find((call) => call.endpoint === '/carreras');
  assert.equal(!!createCall, true);
  const body = JSON.parse(createCall.options.body);
  assert.equal(body.nombre, 'Curso de Curaduría');
  assert.equal(body.esCurso, true);
  assert.equal(body.tipo, 'Curso');
  assert.deepEqual(body.unidadesAcademicas, ['Educación a Distancia']);
  assert.deepEqual(body.tags, ['virtual']);
  assert.deepEqual(body.disertantes, ['Juan Perez']);
  assert.equal(body.documentos.length, 1);
  assert.deepEqual(harness.toasts.at(-1), { message: 'Propuesta creada', type: 'success' });
  assert.equal(harness.closed, true);
  assert.equal(harness.getCareerPage(), 1);
  assert.deepEqual(harness.getCareerFilters(), { q: '', esCurso: '', activo: '' });
});

test('saveCarr exige numero y anio cuando se adjunta PDF de documento administrativo', async () => {
  const harness = createHarness({
    initialDraft: {
      cTags: [],
      cDis: [],
      cDocs: [{ tipo: 'Resolución', organismo: 'Consejo Superior', numero: '', anio: '', pdf: null, _i: 0 }],
    },
  });

  harness.elements['fc-n'].value = 'Curso con PDF';
  harness.elements['fc-dur'].value = '40 horas';
  harness.elements['fc-mod'].value = '100% Virtual';
  harness.radios[0].checked = false;
  harness.radios[1].checked = true;
  harness.units[1].input.checked = true;
  harness.units[1].label.classList.add('sel');
  harness.elements['doc-tipo-0'] = new FakeElement('doc-tipo-0', { value: 'Resolución' });
  harness.elements['doc-org-0'] = new FakeElement('doc-org-0', { value: 'Consejo Superior' });
  harness.elements['doc-num-0'] = new FakeElement('doc-num-0', { value: '' });
  harness.elements['doc-anio-0'] = new FakeElement('doc-anio-0', { value: '2026' });
  harness.elements['doc-pdf-0'] = new FakeElement('doc-pdf-0', { files: [{ name: 'doc.pdf', size: 1024 }] });

  await harness.careers.saveCarr(null);

  assert.deepEqual(harness.toasts.at(-1), {
    message: 'Completá número y año del Documento 1 antes de subir el PDF.',
    type: 'error',
  });
  assert.equal(harness.apiCalls.some((call) => call.endpoint === '/carreras'), false);
});

test('saveCarr advierte cuando hay numero y anio sin PDF y permite continuar', async () => {
  const harness = createHarness({
    initialDraft: {
      cTags: [],
      cDis: [],
      cDocs: [{ tipo: 'Resolución', organismo: 'Consejo Superior', numero: '15', anio: '2026', pdf: null, _i: 0 }],
    },
  });

  harness.elements['fc-n'].value = 'Curso sin PDF';
  harness.elements['fc-dur'].value = '40 horas';
  harness.elements['fc-mod'].value = '100% Virtual';
  harness.radios[0].checked = false;
  harness.radios[1].checked = true;
  harness.units[1].input.checked = true;
  harness.units[1].label.classList.add('sel');
  harness.elements['doc-tipo-0'] = new FakeElement('doc-tipo-0', { value: 'Resolución' });
  harness.elements['doc-org-0'] = new FakeElement('doc-org-0', { value: 'Consejo Superior' });
  harness.elements['doc-num-0'] = new FakeElement('doc-num-0', { value: '15' });
  harness.elements['doc-anio-0'] = new FakeElement('doc-anio-0', { value: '2026' });
  harness.elements['doc-pdf-0'] = new FakeElement('doc-pdf-0', { files: [] });

  await harness.careers.saveCarr(null);

  assert.equal(harness.confirmCalls.length, 1);
  assert.match(harness.confirmCalls[0], /guardar igual/i);
  assert.equal(harness.apiCalls.some((call) => call.endpoint === '/carreras'), true);
});
