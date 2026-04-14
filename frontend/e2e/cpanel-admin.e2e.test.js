const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

let SERVER_PORT = 3210;
let CHROMEDRIVER_PORT = 9515;
let BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;
let WEBDRIVER_URL = `http://127.0.0.1:${CHROMEDRIVER_PORT}`;
const ROOT_LOGIN = 'root-unam';
const ROOT_PASSWORD = 'Root#12345';

let tempDir;
let tempDbPath;
let serverProc;
let chromedriverProc;
let sessionId;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, { timeout = 15000, interval = 200, label = 'condition' } = {}) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeout) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(interval);
  }
  const detail = lastError ? ` Último error: ${lastError.message}` : '';
  throw new Error(`Timeout esperando ${label}.${detail}`);
}

function startProcess(command, args, options = {}) {
  const proc = spawn(command, args, {
    stdio: 'ignore',
    ...options,
  });
  proc.unref();
  return proc;
}

async function stopProcess(proc) {
  if (!proc || proc.exitCode !== null) return;
  try {
    proc.kill('SIGTERM');
  } catch {
    return;
  }
  await Promise.race([
    new Promise((resolve) => proc.once('exit', resolve)),
    sleep(2000).then(() => {
      if (proc.exitCode === null) {
        try { proc.kill('SIGKILL'); } catch {}
      }
    }),
  ]);
}

async function waitForHttpOk(url) {
  return waitFor(async () => {
    const res = await fetch(url);
    if (!res.ok) return false;
    return true;
  }, { label: url });
}

async function webdriverRequest(method, wdPath, body) {
  const res = await fetch(`${WEBDRIVER_URL}${wdPath}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.value?.message || data.message || `WebDriver error ${res.status}`);
  }
  if (data.value?.error) {
    throw new Error(data.value.message || data.value.error);
  }
  return data.value;
}

async function createSession() {
  const value = await webdriverRequest('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        browserName: 'chrome',
        'goog:chromeOptions': {
          binary: '/usr/bin/chromium-browser',
          args: [
            '--headless=new',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--window-size=1440,1200',
          ],
        },
      },
    },
  });
  return value.sessionId || value.capabilities?.sessionId || value['sessionId'] || null;
}

async function wd(method, wdPath, body) {
  return webdriverRequest(method, `/session/${sessionId}${wdPath}`, body);
}

async function execute(script, args = []) {
  return wd('POST', '/execute/sync', { script, args });
}

async function executeAsync(script, args = []) {
  return wd('POST', '/execute/async', { script, args });
}

async function navigate(url) {
  await wd('POST', '/url', { url });
}

async function findElement(selector) {
  const value = await wd('POST', '/element', { using: 'css selector', value: selector });
  return value['element-6066-11e4-a52e-4f735466cecf'];
}

async function clearAndType(selector, text) {
  const elementId = await findElement(selector);
  await wd('POST', `/element/${elementId}/clear`, {});
  await wd('POST', `/element/${elementId}/value`, {
    text,
    value: [...text],
  });
}

async function clickElement(selector) {
  const elementId = await findElement(selector);
  await wd('POST', `/element/${elementId}/click`, {});
}

async function setInputValue(selector, value) {
  await execute(
    `const el = document.querySelector(arguments[0]);
     if (!el) return false;
     el.focus();
     el.value = arguments[1];
     el.dispatchEvent(new Event('input', { bubbles: true }));
     el.dispatchEvent(new Event('change', { bubbles: true }));
     return true;`,
    [selector, value],
  );
}

async function click(selector) {
  await execute(
    `const el = document.querySelector(arguments[0]);
     if (!el) return false;
     el.click();
     return true;`,
    [selector],
  );
}

async function waitForJsTruthy(script, args = [], label = 'browser condition') {
  return waitFor(async () => {
    const value = await execute(script, args);
    return value ? true : false;
  }, { label });
}

async function getText(selector) {
  return execute(
    `const el = document.querySelector(arguments[0]);
     return el ? (el.textContent || '') : null;`,
    [selector],
  );
}

test.before(async () => {
  const seed = Math.floor(Math.random() * 1000);
  SERVER_PORT = 3200 + seed;
  CHROMEDRIVER_PORT = 9500 + seed;
  BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;
  WEBDRIVER_URL = `http://127.0.0.1:${CHROMEDRIVER_PORT}`;

  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ead-e2e-'));
  tempDbPath = path.join(tempDir, 'db.json');
  await fs.copyFile(path.join(process.cwd(), 'backend/data/db.json'), tempDbPath);
  const rawDb = JSON.parse(await fs.readFile(tempDbPath, 'utf8'));
  if (!rawDb.config || typeof rawDb.config !== 'object') rawDb.config = {};
  delete rawDb.config.root_password_hash;
  delete rawDb.config.root_password_changed_at;
  delete rawDb.config.root_password_changed_by;
  await fs.writeFile(tempDbPath, JSON.stringify(rawDb, null, 2));

  serverProc = startProcess('node', ['backend/server-standalone.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      PERSISTENCE_MODE: 'json',
      JSON_DB_PATH: tempDbPath,
      ROOT_LOGIN,
      ROOT_PASSWORD,
      ADMIN_JWT_SECRET: 'e2e-dev-secret-strong',
    },
  });

  chromedriverProc = startProcess('/usr/bin/chromedriver', [`--port=${CHROMEDRIVER_PORT}`], {
    cwd: process.cwd(),
  });

  await waitForHttpOk(`${BASE_URL}/api/health`);
  await waitForHttpOk(`${WEBDRIVER_URL}/status`);

  sessionId = await createSession();
  if (!sessionId) throw new Error('No se pudo crear la sesión WebDriver.');
});

test.after(async () => {
  if (sessionId) {
    try {
      await Promise.race([
        webdriverRequest('DELETE', `/session/${sessionId}`),
        sleep(1000),
      ]);
    } catch {}
  }
  await stopProcess(chromedriverProc);
  await stopProcess(serverProc);
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('login admin, crear curso EaD y verificarlo en el listado', async () => {
  const courseName = `Curso E2E EaD ${Date.now()}`;

  await navigate(`${BASE_URL}/cpanel`);

  await waitForJsTruthy(`return !!document.getElementById('le') && typeof window.doLogin === 'function';`, [], 'pantalla de login');
  const loginRes = await fetch(`${BASE_URL}/admin/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: ROOT_LOGIN, password: ROOT_PASSWORD }),
  });
  const loginData = await loginRes.json();
  assert.equal(loginRes.ok, true, loginData.error || 'No se pudo autenticar contra la API admin');

  const meRes = await fetch(`${BASE_URL}/admin/api/auth/me`, {
    headers: { Authorization: `Bearer ${loginData.token}` },
  });
  const meData = await meRes.json();
  assert.equal(meRes.ok, true, meData.error || 'No se pudo recuperar el usuario admin');

  await execute(
    `sessionStorage.setItem('unam_atk', arguments[0]);
     sessionStorage.setItem('unam_au', arguments[1]);
     return true;`,
    [loginData.token, JSON.stringify(meData.user)],
  );
  await navigate(`${BASE_URL}/cpanel`);

  const loginReachedApp = await waitFor(async () => {
    const state = await execute(
      `return {
        appVisible: document.getElementById('app')?.style.display === 'flex',
        title: document.getElementById('tbt')?.textContent || '',
        error: document.getElementById('lerr')?.textContent || ''
      };`,
    );
    if (state.error) {
      throw new Error(`Login falló en UI: ${state.error}`);
    }
    return state.appVisible && state.title.includes('Dashboard');
  }, { label: 'dashboard admin' });
  assert.equal(loginReachedApp, true);

  await click('[data-page="carr"]');
  await waitForJsTruthy(
    `return document.getElementById('tbt')?.textContent === 'Propuestas Formativas' && !!document.querySelector('.tb .btn.btn-cy');`,
    [],
    'vista de propuestas',
  );

  const modalOpen = await executeAsync(
    `const done = arguments[arguments.length - 1];
     Promise.resolve(openCarrForm(null))
       .then(() => done({
         ok: true,
         hasField: !!document.getElementById('fc-n'),
         modalLength: document.getElementById('mr')?.innerHTML?.length || 0
       }))
       .catch((error) => done({
         ok: false,
         error: String(error && error.message || error),
         modalLength: document.getElementById('mr')?.innerHTML?.length || 0
       }));`,
  );
  assert.equal(modalOpen.ok, true, modalOpen.error || 'No se pudo abrir el modal de propuesta');
  await waitForJsTruthy(`return !!document.getElementById('fc-n') && !!document.getElementById('carr-save-btn');`, [], 'modal de propuesta');

  await setInputValue('#fc-n', courseName);
  await execute(
    `const radio = document.querySelector('input[name="fc-tipo"][value="true"]');
     if (!radio) return false;
     radio.click();
     return true;`,
  );
  await execute(
    `const label = [...document.querySelectorAll('#fc-units .unit-item')]
       .find((el) => el.querySelector('input')?.value === 'Educación a Distancia');
     if (!label) return false;
     label.click();
     return true;`,
  );
  await setInputValue('#fc-dur', '40 horas');
  await setInputValue('#fc-form', 'https://inscripciones.unam.edu.ar/e2e');
  await setInputValue('#fc-insc-fecha', '2026-12-31');

  await click('#carr-save-btn');

  await waitForJsTruthy(
    `return !document.getElementById('fc-n') && [...document.querySelectorAll('#ctb tbody tr td:first-child')].some((el) => (el.textContent || '').includes(${JSON.stringify(courseName)}));`,
    [],
    'curso creado en listado',
  );

  await setInputValue('#cs', courseName);
  await waitForJsTruthy(
    `return [...document.querySelectorAll('#ctb tbody tr td:first-child')].some((el) => (el.textContent || '').trim() === ${JSON.stringify(courseName)});`,
    [],
    'curso filtrado en listado',
  );

  const title = await getText('#tbt');
  const tableText = await getText('#ctb');
  assert.equal(title, 'Propuestas Formativas');
  assert.match(tableText || '', new RegExp(courseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}, {
  timeout: 60000,
});
