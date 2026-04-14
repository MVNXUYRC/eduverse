const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const ROOT_LOGIN = 'root-unam';
const ROOT_PASSWORD = 'Root#12345';
const ADMIN_SECRET = 'integration-test-secret-strong';
const ENABLE_HTTP_INTEGRATION = process.env.ENABLE_INTEGRATION_HTTP_TESTS === 'true';
const testHttp = ENABLE_HTTP_INTEGRATION ? test : test.skip;

let serverProc;
let tempDir;
let tempDbPath;
let baseUrl;
let serverOutput = '';

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
  const detail = lastError ? ` Ultimo error: ${lastError.message}` : '';
  const outputDetail = serverOutput ? ` Log servidor: ${serverOutput.slice(-1200)}` : '';
  throw new Error(`Timeout esperando ${label}.${detail}${outputDetail}`);
}

function startProcess(command, args, options = {}) {
  const proc = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  proc.stdout?.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  proc.stderr?.on('data', (chunk) => {
    serverOutput += chunk.toString();
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

async function apiRequest(method, apiPath, body, token) {
  const res = await fetch(`${baseUrl}${apiPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { res, data };
}

async function loginRoot() {
  const { res, data } = await apiRequest('POST', '/admin/api/auth/login', {
    identifier: ROOT_LOGIN,
    password: ROOT_PASSWORD,
  });
  assert.equal(res.status, 200, data.error || 'No se pudo autenticar root');
  assert.ok(data.token, 'La autenticacion root debe devolver token');
  return data.token;
}

function argentinaWeekStartUtc(referenceDate) {
  const argentinaOffsetMinutes = -3 * 60; // UTC-3
  const localMs = referenceDate.getTime() + (argentinaOffsetMinutes * 60 * 1000);
  const local = new Date(localMs);
  const day = local.getUTCDay();
  const daysBack = day === 0 ? 6 : day - 1;
  const mondayLocalMidnightMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - daysBack,
    0,
    0,
    0,
    0
  );
  return new Date(mondayLocalMidnightMs - (argentinaOffsetMinutes * 60 * 1000));
}

test.before(async () => {
  if (!ENABLE_HTTP_INTEGRATION) return;
  const port = 3200 + Math.floor(Math.random() * 1000);
  baseUrl = `http://127.0.0.1:${port}`;
  serverOutput = '';
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ead-newsletter-int-'));
  tempDbPath = path.join(tempDir, 'db.json');
  await fs.copyFile(path.join(process.cwd(), 'backend/data/db.json'), tempDbPath);

  const rawDb = JSON.parse(await fs.readFile(tempDbPath, 'utf8'));
  rawDb.config = rawDb.config || {};
  delete rawDb.config.root_password_hash;
  delete rawDb.config.root_password_changed_at;
  delete rawDb.config.root_password_changed_by;
  await fs.writeFile(tempDbPath, `${JSON.stringify(rawDb, null, 2)}\n`);

  serverProc = startProcess('node', ['backend/server-standalone.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      PERSISTENCE_MODE: 'json',
      JSON_DB_PATH: tempDbPath,
      ROOT_LOGIN,
      ROOT_PASSWORD,
      ADMIN_JWT_SECRET: ADMIN_SECRET,
    },
  });

  await waitFor(async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'OK';
  }, { label: 'backend newsletter integration test server' });
});

test.after(async () => {
  if (!ENABLE_HTTP_INTEGRATION) return;
  await stopProcess(serverProc);
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

testHttp('newsletter manual calcula ventana desde lunes 00:00 hora Argentina y la expresa correctamente en UTC', async () => {
  const token = await loginRoot();
  const before = new Date();
  const sent = await apiRequest('POST', '/admin/api/newsletter/send', {}, token);
  const after = new Date();

  assert.equal(sent.res.status, 200, sent.data.error || 'No se pudo ejecutar envio manual');
  assert.ok(sent.data.windowStart, 'Debe informar windowStart');
  assert.ok(sent.data.windowEnd, 'Debe informar windowEnd');

  const windowStart = new Date(sent.data.windowStart);
  const windowEnd = new Date(sent.data.windowEnd);
  const expectedStart = argentinaWeekStartUtc(windowEnd);

  assert.equal(windowStart.toISOString(), expectedStart.toISOString());
  assert.equal(windowStart.getUTCDay(), 1, 'windowStart debe caer en lunes UTC');
  assert.equal(windowStart.getUTCHours(), 3, 'lunes 00:00 ART equivale a 03:00 UTC');
  assert.equal(windowStart.getUTCMinutes(), 0);
  assert.equal(windowStart.getUTCSeconds(), 0);
  assert.ok(windowEnd >= before, 'windowEnd debe ser >= instante inicial del test');
  assert.ok(windowEnd <= new Date(after.getTime() + 2000), 'windowEnd debe reflejar el momento exacto del envio');
});

testHttp('newsletter consolida Proximamente->Inscripciones abiertas sin duplicar secciones', async () => {
  const token = await loginRoot();
  const unique = Date.now();
  const basePayload = {
    nombre: `Digest Consolidacion ${unique}`,
    esCurso: false,
    tipo: 'Grado',
    subtipo: '',
    unidadesAcademicas: ['Facultad de Ingenieria'],
    regional: 'Obera',
    disciplina: 'Ciencias Aplicadas',
    modalidad: '100% Virtual',
    duracion: '3 anos',
    descripcion: '<p>Carrera para test de consolidacion digest</p>',
    contacto: 'digest.consolidacion@unam.edu.ar',
    telefonoContacto: '+54 3764 555666',
    requisitosTexto: '<p>Requisitos</p>',
    formularioInscripcion: '',
    programa: '',
    tags: ['digest', 'qa'],
    disertantes: [],
    documentos: [],
    nueva: false,
    proximamente: true,
    inscripcionAbiertaValor: false,
    inscripcionAbiertaFecha: '',
    activoValor: false,
    activoFecha: '',
  };

  let careerId = null;
  try {
    const created = await apiRequest('POST', '/admin/api/carreras', basePayload, token);
    assert.equal(created.res.status, 201, created.data.error || 'No se pudo crear carrera para consolidacion');
    careerId = created.data.id;

    const baseline = await apiRequest('POST', '/admin/api/newsletter/send', {}, token);
    assert.equal(baseline.res.status, 200, baseline.data.error || 'No se pudo generar baseline del digest');

    const opened = await apiRequest('PUT', `/admin/api/carreras/${careerId}`, {
      ...basePayload,
      proximamente: false,
      nueva: false,
      activoValor: false,
      inscripcionAbiertaValor: false,
      inscripcionAbiertaFecha: '',
    }, token);
    assert.equal(opened.res.status, 200, opened.data.error || 'No se pudo abrir inscripcion');

    const sent = await apiRequest('POST', '/admin/api/newsletter/send', {}, token);
    assert.equal(sent.res.status, 200, sent.data.error || 'No se pudo ejecutar digest consolidado');

    const secciones = sent.data.secciones || sent.data.sections || {};
    assert.equal(Number(sent.data?.diff?.total || 0), 1, 'Debe reportar exactamente un cambio');
    assert.equal(Number(secciones.inscripcionAbierta || 0), 1);
    assert.equal(Number(secciones.proximamente || 0), 0);
    assert.equal(Number(secciones.actualizadas || 0), 0);
    assert.equal(Number(secciones.nueva || 0), 0);
    assert.equal(Number(secciones.cierreProximo || 0), 0);
    assert.equal(Number(secciones.cierreReciente || 0), 0);
  } finally {
    if (careerId) await apiRequest('DELETE', `/admin/api/carreras/${careerId}?hard=true`, undefined, token);
  }
});

testHttp('newsletter clasifica como actualizada cuando no aplica una categoria superior', async () => {
  const token = await loginRoot();
  const unique = Date.now();
  const basePayload = {
    nombre: `Digest Actualizada ${unique}`,
    esCurso: false,
    tipo: 'Grado',
    subtipo: '',
    unidadesAcademicas: ['Facultad de Ingenieria'],
    regional: 'Obera',
    disciplina: 'Ciencias Aplicadas',
    modalidad: '100% Virtual',
    duracion: '3 anos',
    descripcion: '<p>Version inicial</p>',
    contacto: 'digest.actualizada@unam.edu.ar',
    telefonoContacto: '+54 3764 777888',
    requisitosTexto: '<p>Requisitos</p>',
    formularioInscripcion: '',
    programa: '',
    tags: ['digest', 'qa', 'actualizada'],
    disertantes: [],
    documentos: [],
    nueva: false,
    proximamente: false,
    inscripcionAbiertaValor: false,
    inscripcionAbiertaFecha: '',
    activoValor: true,
    activoFecha: '',
  };

  let careerId = null;
  try {
    const created = await apiRequest('POST', '/admin/api/carreras', basePayload, token);
    assert.equal(created.res.status, 201, created.data.error || 'No se pudo crear carrera para test de actualizada');
    careerId = created.data.id;

    const baseline = await apiRequest('POST', '/admin/api/newsletter/send', {}, token);
    assert.equal(baseline.res.status, 200, baseline.data.error || 'No se pudo generar baseline del digest');

    const updated = await apiRequest('PUT', `/admin/api/carreras/${careerId}`, {
      ...basePayload,
      descripcion: '<p>Version actualizada del contenido</p>',
      proximamente: false,
      inscripcionAbiertaValor: false,
      inscripcionAbiertaFecha: '',
      activoValor: true,
      activoFecha: '',
    }, token);
    assert.equal(updated.res.status, 200, updated.data.error || 'No se pudo actualizar carrera');

    const sent = await apiRequest('POST', '/admin/api/newsletter/send', {}, token);
    assert.equal(sent.res.status, 200, sent.data.error || 'No se pudo ejecutar digest para actualizada');

    const secciones = sent.data.secciones || sent.data.sections || {};
    assert.equal(Number(sent.data?.diff?.total || 0), 1, 'Debe reportar exactamente un cambio');
    assert.equal(Number(secciones.actualizadas || 0), 1);
    assert.equal(Number(secciones.inscripcionAbierta || 0), 0);
    assert.equal(Number(secciones.proximamente || 0), 0);
    assert.equal(Number(secciones.nueva || 0), 0);
    assert.equal(Number(secciones.cierreProximo || 0), 0);
    assert.equal(Number(secciones.cierreReciente || 0), 0);
  } finally {
    if (careerId) await apiRequest('DELETE', `/admin/api/carreras/${careerId}?hard=true`, undefined, token);
  }
});
