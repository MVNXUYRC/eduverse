const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const router = require('./router');
const {
  hashPassword, legacyPasswordHash, verifyPasswordHash, signJWT,
} = require('./auth');

const uploadsRoot = path.join(__dirname, '../../frontend/uploads/resoluciones');

function cleanupTestArtifacts() {
  if (!fs.existsSync(uploadsRoot)) return;
  for (const file of fs.readdirSync(uploadsRoot)) {
    if (file.includes('test_doc_assoc')) {
      fs.unlinkSync(path.join(uploadsRoot, file));
    }
  }
}

test.afterEach(() => {
  cleanupTestArtifacts();
});

test('asocia PDF de documentación a carrera nueva', async () => {
  router.init({ carreras: [] }, async () => {});

  const body = {
    nombre: 'Carrera Nueva Test',
    esCurso: 'false',
    tipo: 'Grado',
    disciplina: 'Ciencias Sociales',
    modalidad: '100% Virtual',
    duracion: '4 años',
    unidadesAcademicas: JSON.stringify(['Facultad de Humanidades y Ciencias Sociales']),
    descripcion: '<p>Descripcion</p>',
    requisitosTexto: '<p>Requisitos</p>',
    documentos: JSON.stringify([
      { tipo: 'Resolución', organismo: 'CONEAU', numero: '123', anio: '2026', pdf: null },
    ]),
    doc_pdf_0: {
      filename: 'test_doc_assoc_new.pdf',
      data: Buffer.from('%PDF-1.4\n% test\n'),
      contentType: 'application/pdf',
    },
  };

  const fields = await router.__test.buildCarreraFromBody(body, null);

  assert.equal(fields.documentos.length, 1);
  assert.ok(fields.documentos[0].pdf, 'Debe asignar URL PDF');
  assert.match(fields.documentos[0].pdf, /^\/uploads\/resoluciones\//);
});

test('en actualización parcial conserva datos y mantiene asociación de documentación', async () => {
  router.init({ carreras: [] }, async () => {});

  const existing = {
    id: 42,
    nombre: 'Carrera Persistente',
    esCurso: false,
    tipo: 'Grado',
    subtipo: '',
    disciplina: 'Ciencias Sociales',
    modalidad: '100% Virtual',
    duracion: '3 años',
    unidadesAcademicas: ['Facultad de Humanidades y Ciencias Sociales'],
    unidadAcademica: 'Facultad de Humanidades y Ciencias Sociales',
    regional: 'Posadas',
    descripcion: '<p>Descripcion previa</p>',
    requisitosTexto: '<p>Req previos</p>',
    formularioInscripcion: '',
    programa: '',
    documentos: [{ tipo: 'Resolución', organismo: 'SPU', numero: '1', anio: '2025', pdf: null }],
    inscripcionAbierta: { valor: false, fechaHasta: null },
    activo: { valor: true, fechaHasta: null },
    nueva: true,
    popular: false,
    planEstudiosPDF: null,
  };

  const partialBody = {
    documentos: JSON.stringify(existing.documentos),
    doc_pdf_0: {
      filename: 'test_doc_assoc_update.pdf',
      data: Buffer.from('%PDF-1.4\n% update\n'),
      contentType: 'application/pdf',
    },
  };

  const updated = await router.__test.buildCarreraFromBody(partialBody, existing);

  assert.equal(updated.nombre, existing.nombre, 'No debe perder nombre en actualización parcial');
  assert.equal(updated.disciplina, existing.disciplina, 'No debe perder disciplina en actualización parcial');
  assert.equal(updated.unidadAcademica, existing.unidadAcademica, 'No debe perder unidad académica');
  assert.equal(updated.documentos.length, 1);
  assert.ok(updated.documentos[0].pdf, 'Debe conservar asociación del PDF');
  assert.match(updated.documentos[0].pdf, /^\/uploads\/resoluciones\//);
});

test('en JSON acepta documentos como array y conserva numero/anio al adjuntar PDF', async () => {
  router.init({ carreras: [] }, async () => {});

  const existing = {
    id: 77,
    nombre: 'Carrera Docs Array',
    esCurso: false,
    tipo: 'Grado',
    subtipo: '',
    disciplina: 'Ciencias Sociales',
    modalidad: '100% Virtual',
    duracion: '3 años',
    unidadesAcademicas: ['Facultad de Humanidades y Ciencias Sociales'],
    unidadAcademica: 'Facultad de Humanidades y Ciencias Sociales',
    regional: 'Posadas',
    descripcion: '<p>Descripcion previa</p>',
    requisitosTexto: '<p>Req previos</p>',
    formularioInscripcion: '',
    programa: '',
    documentos: [
      { tipo: 'Resolución', organismo: 'SPU', numero: '111', anio: '2025', pdf: null },
      { tipo: 'Disposición', organismo: 'SSPU', numero: '222', anio: '2026', pdf: null },
    ],
    inscripcionAbierta: { valor: false, fechaHasta: null },
    activo: { valor: true, fechaHasta: null },
    nueva: false,
    popular: false,
    planEstudiosPDF: null,
  };

  const partialBody = {
    documentos: [
      { tipo: 'Resolución', organismo: 'SPU', numero: '111', anio: '2025', pdf: null },
      { tipo: 'Disposición', organismo: 'SSPU', numero: '222', anio: '2026', pdf: null },
    ],
    doc_pdf_1: {
      filename: 'test_doc_assoc_json_array.pdf',
      data: Buffer.from('%PDF-1.4\n% update array\n'),
      contentType: 'application/pdf',
    },
  };

  const updated = await router.__test.buildCarreraFromBody(partialBody, existing);

  assert.equal(updated.documentos.length, 2);
  assert.equal(updated.documentos[0].numero, '111');
  assert.equal(updated.documentos[0].anio, '2025');
  assert.equal(updated.documentos[1].numero, '222');
  assert.equal(updated.documentos[1].anio, '2026');
  assert.ok(updated.documentos[1].pdf, 'Debe asignar PDF al segundo documento');
  assert.match(updated.documentos[1].pdf, /^\/uploads\/resoluciones\//);
});

test('en edición parcial no borra PDFs de documentación existentes', async () => {
  router.init({ carreras: [] }, async () => {});

  const existing = {
    id: 88,
    nombre: 'Carrera Docs Persistencia',
    esCurso: false,
    tipo: 'Grado',
    subtipo: '',
    disciplina: 'Ciencias Sociales',
    modalidad: '100% Virtual',
    duracion: '4 años',
    unidadesAcademicas: ['Facultad de Humanidades y Ciencias Sociales'],
    unidadAcademica: 'Facultad de Humanidades y Ciencias Sociales',
    regional: 'Posadas',
    descripcion: '<p>Descripcion previa</p>',
    requisitosTexto: '<p>Req previos</p>',
    formularioInscripcion: '',
    programa: '',
    documentos: [
      { tipo: 'Resolución', organismo: 'SPU', numero: '10', anio: '2024', pdf: '/uploads/resoluciones/doc-a.pdf' },
      { tipo: 'Disposición', organismo: 'SSPU', numero: '11', anio: '2025', pdf: '/uploads/resoluciones/doc-b.pdf' },
    ],
    inscripcionAbierta: { valor: false, fechaHasta: null },
    activo: { valor: true, fechaHasta: null },
    nueva: false,
    popular: false,
    planEstudiosPDF: null,
  };

  const partialBody = {
    nombre: 'Carrera Docs Persistencia Editada',
    documentos: [],
  };

  const updated = await router.__test.buildCarreraFromBody(partialBody, existing);

  assert.equal(updated.documentos.length, 2);
  assert.equal(updated.documentos[0].pdf, '/uploads/resoluciones/doc-a.pdf');
  assert.equal(updated.documentos[1].pdf, '/uploads/resoluciones/doc-b.pdf');
  assert.equal(updated.documentos[0].numero, '10');
  assert.equal(updated.documentos[1].numero, '11');
});

test('al quitar Próximamente de una carrera creada inicialmente en ese estado activa nueva/disponible/inscripción', async () => {
  router.init({ carreras: [] }, async () => {});

  const existing = {
    id: 99,
    nombre: 'Carrera Próximamente Inicial',
    esCurso: false,
    tipo: 'Grado',
    subtipo: '',
    disciplina: 'Ciencias Sociales',
    modalidad: '100% Virtual',
    duracion: '4 años',
    unidadesAcademicas: ['Facultad de Humanidades y Ciencias Sociales'],
    unidadAcademica: 'Facultad de Humanidades y Ciencias Sociales',
    regional: 'Posadas',
    descripcion: '<p>Descripción</p>',
    requisitosTexto: '<p>Requisitos</p>',
    formularioInscripcion: '',
    programa: '',
    documentos: [],
    inscripcionAbierta: { valor: false, fechaHasta: null },
    activo: { valor: false, fechaHasta: null },
    nueva: false,
    proximamente: true,
    proximamenteInicial: true,
    popular: false,
    planEstudiosPDF: null,
  };

  const edited = await router.__test.buildCarreraFromBody({
    nombre: existing.nombre,
    esCurso: 'false',
    tipo: 'Grado',
    disciplina: existing.disciplina,
    modalidad: existing.modalidad,
    duracion: existing.duracion,
    unidadesAcademicas: JSON.stringify(existing.unidadesAcademicas),
    descripcion: existing.descripcion,
    requisitosTexto: existing.requisitosTexto,
    proximamente: 'false',
    nueva: 'false',
    activoValor: 'false',
    inscripcionAbiertaValor: 'false',
    inscripcionAbiertaFecha: '',
  }, existing);

  assert.equal(edited.proximamente, false);
  assert.equal(edited.proximamenteInicial, true);
  assert.equal(edited.nueva, true);
  assert.equal(edited.activo.valor, true);
  assert.equal(edited.inscripcionAbierta.valor, true);
});

test('root autentica con login tecnico en lugar de correo', async () => {
  router.init({ carreras: [], usuarios: [], unidadesAcademicas: [], config: { root_password_hash: hashPassword('Root#12345') } }, async () => {});

  const req = {
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  };
  const result = await router.__test.handleLogin(req, { identifier: 'root-unam', password: 'Root#12345' });

  assert.equal(result.status, 200);
  assert.equal(result.data.rol, 'root');
  assert.equal(result.data.login, 'root-unam');
});

test('verifyPasswordHash mantiene compatibilidad con hashes legacy y nuevos', () => {
  const legacy = legacyPasswordHash('Root#12345');
  const modern = hashPassword('Root#12345');
  assert.equal(verifyPasswordHash('Root#12345', legacy), true);
  assert.equal(verifyPasswordHash('Root#12345', modern), true);
  assert.equal(verifyPasswordHash('Bad#12345', legacy), false);
});

test('safeUser expone login derivado si el usuario legado no lo tiene', () => {
  const safe = router.__test.safeUser({
    id: 7,
    nombre: 'Ana',
    apellido: 'Perez',
    email: 'ana.perez@unam.edu.ar',
    rol: 'institucional',
    passwordHash: 'secret',
  });

  assert.equal(safe.login, 'ana.perez');
  assert.equal('passwordHash' in safe, false);
});

test('reset-platform borra solo los bloques seleccionados con confirmacion root', async () => {
  const state = {
    carreras: [{ id: 1, nombre: 'Carrera demo' }, { id: 2, nombre: 'Curso demo' }],
    interesados: [{ id: 1, email: 'test@unam.edu.ar', carreraId: 1, unidadAcademica: 'Facultad demo' }],
    usuarios: [{ id: 10, login: 'ana', email: 'ana@unam.edu.ar', rol: 'institucional' }],
    auditLog: [{ action: 'LOGIN' }, { action: 'EDITAR' }],
    unidadesAcademicas: [],
    config: { root_password_hash: hashPassword('Root#12345') },
  };
  let saved = 0;
  router.init(state, async () => { saved += 1; });

  const result = await router.__test.handlePlatformReset(
    { headers: { authorization: `Bearer ${require('./auth').signJWT({ id: 'root', login: 'root-unam', email: 'root@unam.edu.ar', rol: 'root', unidades: [] })}` } },
    { password: 'Root#12345', resetCarreras: true, resetUsuarios: false, resetLogs: true },
  );

  assert.equal(result.status, 200);
  assert.equal(result.data.success, true);
  assert.equal(result.data.carrerasEliminadas, 2);
  assert.equal(result.data.contactosEliminados, 1);
  assert.equal(result.data.usuariosEliminados, 0);
  assert.equal(result.data.logsEliminados, 2);
  assert.deepEqual(state.carreras, []);
  assert.deepEqual(state.interesados, []);
  assert.equal(state.usuarios.length, 1);
  assert.equal(state.auditLog.length, 1);
  assert.equal(state.auditLog[0].action, 'ELIMINAR_DATOS');
  assert.equal(state.auditLog[0].detail, 'carreras: 2, contactos: 1, logs: 2');
  assert.equal(saved, 1);
  assert.equal(state.config.platform_reset_by, 'root-unam');
});

test('reset-platform rechaza contraseña root inválida', async () => {
  router.init({
    carreras: [{ id: 1 }],
    usuarios: [{ id: 2 }],
    auditLog: [{ action: 'LOGIN' }],
    unidadesAcademicas: [],
    config: { root_password_hash: hashPassword('Root#12345') },
  }, async () => {});

  const result = await router.__test.handlePlatformReset(
    { headers: { authorization: `Bearer ${require('./auth').signJWT({ id: 'root', login: 'root-unam', email: 'root@unam.edu.ar', rol: 'root', unidades: [] })}` } },
    { password: 'Bad#12345', resetCarreras: true },
  );

  assert.equal(result.status, 401);
  assert.match(result.data.error, /Contraseña root inválida/);
});

test('reset-platform exige seleccionar al menos un bloque a borrar', async () => {
  router.init({
    carreras: [{ id: 1 }],
    usuarios: [{ id: 2 }],
    auditLog: [{ action: 'LOGIN' }],
    unidadesAcademicas: [],
    config: { root_password_hash: hashPassword('Root#12345') },
  }, async () => {});

  const result = await router.__test.handlePlatformReset(
    { headers: { authorization: `Bearer ${require('./auth').signJWT({ id: 'root', login: 'root-unam', email: 'root@unam.edu.ar', rol: 'root', unidades: [] })}` } },
    { password: 'Root#12345' },
  );

  assert.equal(result.status, 400);
  assert.match(result.data.error, /Seleccioná al menos un tipo de dato/);
});

test('newsletter alta manual clasifica agregados, duplicados e inválidos', () => {
  const state = {
    newsletterSubscriptions: [
      {
        id: 1,
        email: 'existente@unam.edu.ar',
        source: 'sitio',
        activo: true,
        fechaAlta: new Date().toISOString(),
      },
    ],
    newsletterDispatchLog: [],
    config: {},
  };
  router.init(state, async () => {});

  const result = router.__test.addNewsletterEmailsBatch(
    [
      'nuevo@unam.edu.ar',
      'existente@unam.edu.ar',
      'invalido',
      'nuevo@unam.edu.ar',
      'otro@unam.edu.ar',
    ],
    'manual',
  );

  assert.equal(result.stats.recibidos, 5);
  assert.equal(result.stats.agregados, 2);
  assert.equal(result.stats.duplicados, 2);
  assert.equal(result.stats.invalidos, 1);
  assert.equal(state.newsletterSubscriptions.length, 3);
});

test('newsletter importa primera hoja y primera columna desde xlsx con encabezado', () => {
  router.init({ newsletterSubscriptions: [], newsletterDispatchLog: [], config: {} }, async () => {});
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['correo'],
    ['valido@unam.edu.ar'],
    ['invalido'],
    ['valido@unam.edu.ar'],
    [''],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const parsed = router.__test.parseNewsletterEmailsFromWorkbook({
    filename: 'newsletter.xlsx',
    data: buf,
  });
  assert.equal(parsed.readCount, 3);
  assert.deepEqual(parsed.emails, ['valido@unam.edu.ar', 'invalido', 'valido@unam.edu.ar']);

  const result = router.__test.addNewsletterEmailsBatch(parsed.emails, 'import');
  assert.equal(result.stats.agregados, 1);
  assert.equal(result.stats.duplicados, 1);
  assert.equal(result.stats.invalidos, 1);
});

test('newsletter export genera archivo xlsx con nombre esperado', () => {
  const state = {
    newsletterSubscriptions: [
      {
        id: 1,
        email: 'a@unam.edu.ar',
        source: 'manual',
        activo: true,
        fechaAlta: '2026-01-10T10:00:00.000Z',
        ultimoEnvio: null,
      },
      {
        id: 2,
        email: 'b@unam.edu.ar',
        source: 'import',
        activo: false,
        fechaAlta: '2026-01-11T10:00:00.000Z',
        ultimoEnvio: '2026-01-20T10:00:00.000Z',
      },
    ],
    newsletterDispatchLog: [],
    config: {},
  };
  router.init(state, async () => {});

  const req = {
    headers: {
      authorization: `Bearer ${signJWT({
        id: 'root',
        login: 'root-unam',
        email: 'root@unam.edu.ar',
        rol: 'root',
        unidades: [],
      })}`,
    },
  };

  const result = router.__test.handleNewsletterExport(req);
  assert.equal(result.status, 200);
  assert.match(result.data.filename, /^newsletter-contactos-\d{4}-\d{2}-\d{2}\.xlsx$/);
  assert.ok(result.data.fileBase64);

  const wb = XLSX.read(Buffer.from(result.data.fileBase64, 'base64'), { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].correo, 'b@unam.edu.ar');
});

test('newsletter log infiere tipo manual desde status legacy', () => {
  const mapped = router.__test.mapDispatchLogRow({
    id: 44,
    status: 'manual-enviado',
    recipientsTotal: 10,
    sentCount: 8,
  });
  assert.equal(mapped.dispatchType, 'manual');
  assert.equal(mapped.recipientsTotal, 10);
  assert.equal(mapped.sentCount, 8);
});

test('admin api expone ruta canonica GET /admin/api/newsletter/preview-manual', async () => {
  const state = { newsletterSubscriptions: [], newsletterDispatchLog: [], config: {} };
  router.init(
    state,
    async () => {},
    { getManualDigestPreview: () => ({ generatedAt: new Date().toISOString(), diff: { total: 1 }, sections: { actualizadas: 1 } }) }
  );

  const req = {
    method: 'GET',
    headers: {
      authorization: `Bearer ${signJWT({
        id: 'root',
        login: 'root-unam',
        email: 'root@unam.edu.ar',
        rol: 'root',
        unidades: [],
      })}`,
    },
  };

  const params = new URLSearchParams();
  let response = null;
  const jsonResponse = (_res, data, status = 200) => {
    response = { status, data };
    return response;
  };

  await router.handleAdminAPI(req, {}, '/admin/api/newsletter/preview-manual', params, jsonResponse, async () => ({}));
  assert.equal(response?.status, 200);
  assert.equal(response?.data?.success, true);
  assert.ok(response?.data?.preview);
});

test('newsletter send manual acepta selectedEmails y los propaga al helper', async () => {
  const captured = { payload: null };
  router.init(
    { newsletterSubscriptions: [], newsletterDispatchLog: [], config: {} },
    async () => {},
    {
      sendManualDigest: async (payload) => {
        captured.payload = payload;
        return {
          sentCount: 1,
          failCount: 0,
          recipientsTotal: 1,
          diffTotal: 1,
          sections: { actualizadas: 1 },
          status: 'manual-enviado',
          message: 'ok',
          windowStart: new Date().toISOString(),
          windowEnd: new Date().toISOString(),
          selection: { selectedTotal: 1, excludedTotal: 0 },
        };
      },
    }
  );

  const req = {
    method: 'POST',
    headers: {
      authorization: `Bearer ${signJWT({
        id: 'root',
        login: 'root-unam',
        email: 'root@unam.edu.ar',
        rol: 'root',
        unidades: [],
      })}`,
    },
  };
  const params = new URLSearchParams();
  let response = null;
  const jsonResponse = (_res, data, status = 200) => {
    response = { status, data };
    return response;
  };

  await router.handleAdminAPI(
    req,
    {},
    '/admin/api/newsletter/send',
    params,
    jsonResponse,
    async () => ({ selectedKeys: ['actualizadas:1:hash'], selectedEmails: ['A@unam.edu.ar', 'b@unam.edu.ar'] })
  );

  assert.equal(response?.status, 200);
  assert.deepEqual(captured.payload?.selectedKeys, ['actualizadas:1:hash']);
  assert.deepEqual(captured.payload?.selectedEmails, ['a@unam.edu.ar', 'b@unam.edu.ar']);
});

test('newsletter detalle normaliza destinatarios legacy/mixtos sin duplicar', () => {
  const mapped = router.__test.mapDispatchLogRow({
    id: 99,
    dispatchType: 'manual',
    runAt: '2026-04-15T10:00:00.000Z',
    recipientsTotal: 3,
    recipients: [
      { email: 'A@unam.edu.ar', status: 'enviado', sentAt: '2026-04-15T10:00:00.000Z', newsCount: 2 },
      { to: 'b@unam.edu.ar', status: 'fallido', error: 'smtp' },
      'a@unam.edu.ar',
      { recipient: 'c@unam.edu.ar' },
    ],
  }, true);

  assert.equal(Array.isArray(mapped.recipients), true);
  assert.deepEqual(
    mapped.recipients.map((item) => item.email),
    ['a@unam.edu.ar', 'b@unam.edu.ar', 'c@unam.edu.ar']
  );
  assert.equal(mapped.recipients[1].status, 'fallido');
});
