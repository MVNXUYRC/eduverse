const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createWindow() {
  const window = {
    confirm: () => true,
    alert: () => {},
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    navigator: {},
    sessionStorage: { getItem() { return null; } },
  };
  window.window = window;
  return window;
}

function runScript(window, filename) {
  const code = fs.readFileSync(path.join(__dirname, filename), 'utf8');
  const context = vm.createContext({
    window,
    document: {},
    navigator: window.navigator,
    fetch: window.fetch,
    sessionStorage: window.sessionStorage,
    localStorage: { getItem() { return null; } },
    XMLHttpRequest: function XMLHttpRequest() {},
    console,
    Date,
    setTimeout,
    clearTimeout,
    URLSearchParams,
  });
  vm.runInContext(code, context, { filename });
}

function createCommonDeps() {
  return {
    BASE: '/admin/api',
    TK: 'token',
    RL: { root: 'root', institucional: 'Institucional', unidades: 'Unidades' },
    EAD: 'Educación a Distancia',
    UNIDAD_REGIONAL: {},
    MAX_UPLOAD_BYTES: 1024,
    api: async () => ({ data: [], meta: { totalPages: 1, page: 1 }, logs: [] }),
    isActive: () => true,
    toast: () => {},
    esc: (value) => String(value || ''),
    showModal: () => {},
    cm: () => {},
    properName: (value) => String(value || ''),
    getOrgsForTipo: () => [],
    compactRichHtml: (value) => value,
    plainFromHtml: (value) => value,
    getMe: () => ({ rol: 'root', nombre: 'Root', email: 'root@unam.edu.ar', unidades: [] }),
    getCfg: () => ({ unidadesAcademicas: [], disciplinas: [], tiposDocumento: [], organismos: [] }),
    getCp: () => 1,
    setCp: () => {},
    getCf: () => ({ q: '', esCurso: '', activo: '' }),
    setCf: () => {},
    getCareerDraft: () => ({ cTags: [], cDis: [], cDocs: [] }),
    setCareerDraft: () => {},
    getUserQuery: () => '',
    setUserQuery: () => {},
    fmtD: () => '01/01/2026',
  };
}

test('los modulos del cPanel exponen factories globales', () => {
  const window = createWindow();

  runScript(window, 'cpanel-careers.js');
  runScript(window, 'cpanel-users.js');
  runScript(window, 'cpanel-config.js');
  runScript(window, 'cpanel-logs.js');
  runScript(window, 'cpanel-backup.js');
  runScript(window, 'cpanel-newsletter.js');

  assert.equal(typeof window.createCPanelCareers, 'function');
  assert.equal(typeof window.createCPanelUsers, 'function');
  assert.equal(typeof window.createCPanelConfig, 'function');
  assert.equal(typeof window.createCPanelLogs, 'function');
  assert.equal(typeof window.createCPanelBackup, 'function');
  assert.equal(typeof window.createCPanelNewsletter, 'function');
});

test('las factories devuelven APIs modulares esperadas', () => {
  const window = createWindow();

  runScript(window, 'cpanel-careers.js');
  runScript(window, 'cpanel-users.js');
  runScript(window, 'cpanel-config.js');
  runScript(window, 'cpanel-logs.js');
  runScript(window, 'cpanel-backup.js');
  runScript(window, 'cpanel-newsletter.js');

  const deps = createCommonDeps();
  const careers = window.createCPanelCareers(deps);
  const users = window.createCPanelUsers(deps);
  const config = window.createCPanelConfig(deps);
  const logs = window.createCPanelLogs(deps);
  const backup = window.createCPanelBackup(deps);
  const newsletter = window.createCPanelNewsletter(deps);

  assert.deepEqual(
    Object.keys(careers).sort(),
    [
      'addDoc', 'addT', 'applyLink', 'autoNivel', 'delCarr', 'docRow', 'eliminarCarr',
      'exportCarrerasExcel', 'filtOrgs', 'fnm', 'initWysiwygPaste', 'lcarr', 'onNivelCh', 'onTipoCh', 'openCarrForm',
      'rcarr', 'rdis', 'rmDoc', 'rmT', 'rtags', 'saveCarr', 'setCarrPage', 'sortCarrBy', 'toggleActivarCarr',
      'toggleInscripcion', 'toggleUnitSel', 'wf', 'wf2', 'wfLink', 'wfLinkProg', 'closeCarrForm',
    ].sort(),
  );

  assert.deepEqual(
    Object.keys(users).sort(),
    [
      'copyText', 'cpNew', 'cpP', 'delUsr', 'eliminarUsr', 'exportUsersExcel', 'getRoles', 'lusers', 'onRolCh',
      'openUsrForm', 'regenRootAccessLogin', 'resetUsrPwd', 'rusr', 'saveUsr', 'setUsrPage', 'sortUsrBy',
      'closeUsrForm', 'tgp', 'tgpNew', 'userPassModal',
    ].sort(),
  );

  assert.deepEqual(Object.keys(config).sort(), ['confirmPlatformReset', 'openPlatformResetModal', 'rcfg', 'saveNewsletterOperational', 'saveSiteConstruction'].sort());
  assert.deepEqual(
    Object.keys(logs).sort(),
    ['clearLogDateFilter', 'clearLogFilters', 'exportLogExcel', 'pickLogDate', 'renderLogTable', 'rlog', 'setLogCalendarMonth', 'setLogPage', 'sortLogBy', 'toggleLogDatePicker'].sort(),
  );
  assert.deepEqual(
    Object.keys(backup).sort(),
    ['doExportCarr', 'doExportUsr', 'doImportCarr', 'doImportUsr', 'onFileSelected', 'rbkp', 'resetImportUi', 'setImportMessage', 'setImportProgress'].sort(),
  );
  assert.deepEqual(
    Object.keys(newsletter).sort(),
    [
      'rnwl',
      'setNewsletterPage',
      'setNewsletterLogPage',
      'sortNewsletterBy',
      'sortNewsletterLogBy',
      'clearNewsletterFilters',
      'clearNewsletterLogFilters',
      'exportNewsletterCsv',
      'exportNewsletterXlsx',
      'submitNewsletterManual',
      'importNewsletterFile',
      'toggleNewsletterSubscription',
      'deleteNewsletterSubscription',
      'sendNewsletterDigestNow',
    ].sort(),
  );
});
