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
  const detail = lastError ? ` Último error: ${lastError.message}` : '';
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

async function multipartRequest(method, apiPath, formData, token) {
  const res = await fetch(`${baseUrl}${apiPath}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
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
  assert.ok(data.token, 'La autenticación root debe devolver token');
  return data.token;
}

test.before(async () => {
  if (!ENABLE_HTTP_INTEGRATION) return;
  const port = 3200 + Math.floor(Math.random() * 1000);
  baseUrl = `http://127.0.0.1:${port}`;
  serverOutput = '';
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ead-api-int-'));
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
  }, { label: 'backend integration test server' });
});

test.after(async () => {
  if (!ENABLE_HTTP_INTEGRATION) return;
  await stopProcess(serverProc);
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

testHttp('API pública expone health, filtros, listado y detalle consistentes', async () => {
  const health = await apiRequest('GET', '/api/health');
  assert.equal(health.res.status, 200);
  assert.equal(health.data.status, 'OK');

  const filters = await apiRequest('GET', '/api/careers/filters');
  assert.equal(filters.res.status, 200);
  assert.ok(Array.isArray(filters.data.tipos));
  assert.ok(Array.isArray(filters.data.disciplinas));

  const list = await apiRequest('GET', '/api/careers?limit=10&page=1');
  assert.equal(list.res.status, 200);
  assert.ok(Array.isArray(list.data.data));
  assert.ok(list.data.meta);
  assert.equal(list.data.meta.page, 1);
  assert.equal(list.data.meta.limit, 10);
  assert.ok(list.data.data.length >= 1);

  const first = list.data.data[0];
  const detail = await apiRequest('GET', `/api/careers/${first.id}`);
  assert.equal(detail.res.status, 200);
  assert.equal(detail.data.id, first.id);
  assert.equal(detail.data.nombre, first.nombre);
  assert.ok(Array.isArray(detail.data.documentos));

  const search = await apiRequest('GET', `/api/careers?limit=10&page=1&q=${encodeURIComponent(first.nombre.split(' ')[0])}`);
  assert.equal(search.res.status, 200);
  assert.ok(search.data.data.some((item) => item.id === first.id));

  const missing = await apiRequest('GET', '/api/careers/999999');
  assert.equal(missing.res.status, 404);
  assert.match(missing.data.error, /No encontrada/);
});

testHttp('CRUD admin de carreras se refleja en la API pública', async () => {
  const token = await loginRoot();
  const unique = Date.now();

  const createPayload = {
    nombre: `Carrera QA ${unique}`,
    esCurso: false,
    tipo: 'Grado',
    subtipo: '',
    unidadesAcademicas: ['Facultad de Ingeniería'],
    regional: 'Oberá',
    disciplina: 'Ciencias Aplicadas',
    modalidad: '100% Virtual',
    duracion: '3 años',
    descripcion: '<p><strong>QA</strong> integración</p><ul><li>uno</li><li>dos</li></ul>',
    contacto: 'qa@unam.edu.ar',
    telefonoContacto: '+54 3764 000000',
    requisitosTexto: '<p>Requisitos QA</p>',
    formularioInscripcion: '',
    programa: '',
    tags: ['qa', 'regresion'],
    disertantes: [],
    documentos: [{ tipo: 'Resolución', organismo: 'Consejo Superior', numero: '321', anio: '2026', pdf: null }],
    nueva: true,
    inscripcionAbiertaValor: false,
    inscripcionAbiertaFecha: '',
    activoValor: true,
    activoFecha: '',
  };

  const created = await apiRequest('POST', '/admin/api/carreras', createPayload, token);
  assert.equal(created.res.status, 201, created.data.error || 'No se pudo crear carrera');
  assert.ok(created.data.id);
  assert.equal(created.data.nombre, createPayload.nombre);
  assert.equal(created.data.documentos.length, 1);
  assert.equal(created.data.documentos[0].numero, '321');
  assert.equal(created.data.documentos[0].anio, '2026');

  const detailAfterCreate = await apiRequest('GET', `/api/careers/${created.data.id}`);
  assert.equal(detailAfterCreate.res.status, 200);
  assert.equal(detailAfterCreate.data.nombre, createPayload.nombre);
  assert.match(detailAfterCreate.data.descripcion, /strong/i);
  assert.match(detailAfterCreate.data.descripcion, /ul/i);

  const updated = await apiRequest('PUT', `/admin/api/carreras/${created.data.id}`, {
    ...createPayload,
    nombre: `${createPayload.nombre} Editada`,
    requisitosTexto: '<p><em>Requisitos actualizados</em></p>',
  }, token);
  assert.equal(updated.res.status, 200, updated.data.error || 'No se pudo editar carrera');
  assert.equal(updated.data.nombre, `${createPayload.nombre} Editada`);

  const patch = await apiRequest('PATCH', `/admin/api/carreras/${created.data.id}`, {
    activo: false,
  }, token);
  assert.equal(patch.res.status, 200);
  assert.equal(patch.data.activo.valor, false);
  assert.equal(patch.data.inscripcionAbierta.valor, false);

  const softDeletedDetail = await apiRequest('GET', `/api/careers/${created.data.id}`);
  assert.equal(softDeletedDetail.res.status, 200);
  assert.equal(softDeletedDetail.data._activo, false);

  const hardDelete = await apiRequest('DELETE', `/admin/api/carreras/${created.data.id}?hard=true`, undefined, token);
  assert.equal(hardDelete.res.status, 200);
  assert.equal(hardDelete.data.deleted, true);

  const missing = await apiRequest('GET', `/api/careers/${created.data.id}`);
  assert.equal(missing.res.status, 404);
});

testHttp('Próximamente: registro de interés por carrera y transición obligatoria de estados al desmarcar', async () => {
  const token = await loginRoot();
  const unique = Date.now();
  const createPayload = {
    nombre: `Carrera Prox QA ${unique}`,
    esCurso: false,
    tipo: 'Grado',
    subtipo: '',
    unidadesAcademicas: ['Facultad de Ingeniería'],
    regional: 'Oberá',
    disciplina: 'Ciencias Aplicadas',
    modalidad: '100% Virtual',
    duracion: '3 años',
    descripcion: '<p>Carrera en estado Próximamente para QA</p>',
    contacto: 'qa.prox@unam.edu.ar',
    telefonoContacto: '+54 3764 111111',
    requisitosTexto: '<p>Requisitos QA</p>',
    formularioInscripcion: '',
    programa: '',
    tags: ['qa', 'proximamente'],
    disertantes: [],
    documentos: [],
    nueva: false,
    proximamente: true,
    inscripcionAbiertaValor: false,
    inscripcionAbiertaFecha: '',
    activoValor: false,
    activoFecha: '',
  };

  const created = await apiRequest('POST', '/admin/api/carreras', createPayload, token);
  assert.equal(created.res.status, 201, created.data.error || 'No se pudo crear carrera Próximamente');
  const careerId = created.data.id;
  assert.equal(created.data.proximamente, true);

  const featured = await apiRequest('GET', '/api/careers/featured');
  assert.equal(featured.res.status, 200);
  assert.ok(Array.isArray(featured.data.proximamente));
  assert.ok(featured.data.proximamente.some((c) => c.id === careerId));

  const subscribe = await apiRequest('POST', `/api/careers/${careerId}/interesados`, {
    email: `interesado.${unique}@unam.edu.ar`,
  });
  assert.equal(subscribe.res.status, 201, subscribe.data.error || 'No se pudo registrar interés');
  assert.equal(subscribe.data.success, true);

  const duplicate = await apiRequest('POST', `/api/careers/${careerId}/interesados`, {
    email: `interesado.${unique}@unam.edu.ar`,
  });
  assert.equal(duplicate.res.status, 409);
  assert.match(duplicate.data.error, /ya está registrado/i);

  const updated = await apiRequest('PUT', `/admin/api/carreras/${careerId}`, {
    ...createPayload,
    proximamente: false,
    nueva: false,
    activoValor: false,
    inscripcionAbiertaValor: false,
    inscripcionAbiertaFecha: '',
  }, token);
  assert.equal(updated.res.status, 200, updated.data.error || 'No se pudo actualizar carrera Próximamente');
  assert.equal(updated.data.proximamente, false);
  assert.equal(updated.data.nueva, true);
  assert.equal(updated.data.activo?.valor, true);
  assert.equal(updated.data.inscripcionAbierta?.valor, true);

  const subscribeAfterOpen = await apiRequest('POST', `/api/careers/${careerId}/interesados`, {
    email: `otro.${unique}@unam.edu.ar`,
  });
  assert.equal(subscribeAfterOpen.res.status, 400);
  assert.match(subscribeAfterOpen.data.error, /Próximamente/i);

  const removed = await apiRequest('DELETE', `/admin/api/carreras/${careerId}?hard=true`, undefined, token);
  assert.equal(removed.res.status, 200);
});

testHttp('CRUD admin de usuarios valida duplicados y persiste cambios', async () => {
  const token = await loginRoot();
  const unique = Date.now();
  const email = `qa.${unique}@unam.edu.ar`;

  const created = await apiRequest('POST', '/admin/api/usuarios', {
    nombre: 'QA',
    apellido: 'Automation',
    dni: '30111222',
    email,
    telefono: '+54 3764 111222',
    rol: 'institucional',
    login: `qa.${unique}`,
    unidades: [],
  }, token);
  assert.equal(created.res.status, 201, created.data.error || 'No se pudo crear usuario');
  assert.ok(created.data.generatedPassword);
  const userId = created.data.id;

  const duplicate = await apiRequest('POST', '/admin/api/usuarios', {
    nombre: 'QA',
    apellido: 'Duplicado',
    dni: '30111223',
    email,
    telefono: '+54 3764 111223',
    rol: 'institucional',
    login: `qa.alt.${unique}`,
    unidades: [],
  }, token);
  assert.equal(duplicate.res.status, 409);
  assert.match(duplicate.data.error, /correo ya está registrado/i);

  const list = await apiRequest('GET', '/admin/api/usuarios', undefined, token);
  assert.equal(list.res.status, 200);
  assert.ok(list.data.data.some((item) => item.id === userId));

  const updated = await apiRequest('PUT', `/admin/api/usuarios/${userId}`, {
    telefono: '+54 3764 999888',
    activo: false,
  }, token);
  assert.equal(updated.res.status, 200);
  assert.equal(updated.data.activo, false);

  const removed = await apiRequest('DELETE', `/admin/api/usuarios/${userId}`, undefined, token);
  assert.equal(removed.res.status, 200);
  assert.equal(removed.data.success, true);
});

testHttp('la carga de documentación PDF queda asociada y visible en la API pública', async () => {
  const token = await loginRoot();
  const unique = Date.now();
  const form = new FormData();

  form.append('nombre', `Carrera Docs QA ${unique}`);
  form.append('esCurso', 'false');
  form.append('tipo', 'Grado');
  form.append('subtipo', '');
  form.append('unidadesAcademicas', JSON.stringify(['Facultad de Ingeniería']));
  form.append('regional', 'Oberá');
  form.append('disciplina', 'Ciencias Aplicadas');
  form.append('modalidad', '100% Virtual');
  form.append('duracion', '2 años');
  form.append('descripcion', '<p><strong>Documentación</strong> QA</p>');
  form.append('contacto', 'docs.qa@unam.edu.ar');
  form.append('telefonoContacto', '+54 3764 222333');
  form.append('requisitosTexto', '<p>Requiere documentación adjunta</p>');
  form.append('formularioInscripcion', '');
  form.append('programa', '');
  form.append('tags', JSON.stringify(['pdf', 'qa']));
  form.append('disertantes', JSON.stringify([]));
  form.append('documentos', JSON.stringify([
    { tipo: 'Resolución', organismo: 'Consejo Superior', numero: '654', anio: '2026', pdf: null },
  ]));
  form.append('nueva', 'false');
  form.append('inscripcionAbiertaValor', 'false');
  form.append('inscripcionAbiertaFecha', '');
  form.append('activoValor', 'true');
  form.append('activoFecha', '');
  form.append('planEstudiosPDF', new Blob(['%PDF-1.4\n% qa plan\n'], { type: 'application/pdf' }), 'plan-qa.pdf');
  form.append('doc_pdf_0', new Blob(['%PDF-1.4\n% qa doc\n'], { type: 'application/pdf' }), 'doc-qa.pdf');

  const created = await multipartRequest('POST', '/admin/api/carreras', form, token);
  assert.equal(created.res.status, 201, created.data.error || 'No se pudo crear carrera con documentación');
  assert.ok(created.data.planEstudiosPDF);
  assert.equal(created.data.documentos.length, 1);
  assert.ok(created.data.documentos[0].pdf);

  const detail = await apiRequest('GET', `/api/careers/${created.data.id}`);
  assert.equal(detail.res.status, 200);
  assert.equal(detail.data.planEstudiosPDF, created.data.planEstudiosPDF);
  assert.equal(detail.data.documentos[0].pdf, created.data.documentos[0].pdf);

  const planRes = await fetch(`${baseUrl}${detail.data.planEstudiosPDF}`);
  assert.equal(planRes.status, 200);
  assert.match(String(planRes.headers.get('content-type') || ''), /pdf/i);

  const docRes = await fetch(`${baseUrl}${detail.data.documentos[0].pdf}`);
  assert.equal(docRes.status, 200);
  assert.match(String(docRes.headers.get('content-type') || ''), /pdf/i);

  const search = await apiRequest('GET', `/api/careers?limit=10&page=1&q=${encodeURIComponent(`Docs QA ${unique}`)}`);
  assert.equal(search.res.status, 200);
  assert.ok(search.data.data.some((item) => item.id === created.data.id));

  const removed = await apiRequest('DELETE', `/admin/api/carreras/${created.data.id}?hard=true`, undefined, token);
  assert.equal(removed.res.status, 200);
});
