const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const router = require('./router');

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
