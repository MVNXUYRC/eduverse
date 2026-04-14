const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const router = require('./router');
const { hashPassword, legacyPasswordHash, verifyPasswordHash } = require('./auth');

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
