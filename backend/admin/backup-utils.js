const { maskRootEmailInText } = require('./auth');
const { sanitizeText, sanitizeRichHtml, sanitizeUrl } = require('../domain/security');

function maskRootIdentityInValue(value) {
  if (typeof value === 'string') return maskRootEmailInText(value);
  if (Array.isArray(value)) return value.map(maskRootIdentityInValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, maskRootIdentityInValue(val)]));
  }
  return value;
}

function buildBackupPayload(state) {
  return {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    carreras: maskRootIdentityInValue(state.carreras || []),
    usuarios: (state.usuarios || []).map((u) => ({
      ...maskRootIdentityInValue(u),
      passwordHash: u.passwordHash || '',
      mustChangePassword: u.mustChangePassword !== undefined ? !!u.mustChangePassword : true,
      passwordChangedAt: u.passwordChangedAt || null,
    })),
    config: maskRootIdentityInValue(state.config || {}),
    auditLog: maskRootIdentityInValue(state.auditLog || []),
    newsletterSubscriptions: maskRootIdentityInValue(state.newsletterSubscriptions || []),
    newsletterDispatchLog: maskRootIdentityInValue(state.newsletterDispatchLog || []),
    unidadesAcademicas: maskRootIdentityInValue(state.unidadesAcademicas || []),
    regionales: maskRootIdentityInValue(state.regionales || []),
    localidades: maskRootIdentityInValue(state.localidades || []),
    disciplinas: maskRootIdentityInValue(state.disciplinas || []),
    tiposDocumento: maskRootIdentityInValue(state.tiposDocumento || ['Resolución', 'Disposición', 'Ordenanza']),
    organismos: maskRootIdentityInValue(state.organismos || ['Consejo Superior', 'Ministerial', 'SPU', 'SSPU', 'CONEAU']),
  };
}

function hasImportableData(payload) {
  return !!(
    payload &&
    (
      payload.carreras || payload.usuarios || payload.config || payload.auditLog ||
      payload.newsletterSubscriptions || payload.newsletterDispatchLog ||
      payload.unidadesAcademicas || payload.regionales || payload.localidades ||
      payload.disciplinas || payload.tiposDocumento || payload.organismos
    )
  );
}

function sanitizeImportedCarrera(carrera) {
  const c = carrera && typeof carrera === 'object' ? carrera : {};
  return {
    ...c,
    nombre: sanitizeText(c.nombre, 240),
    tipo: sanitizeText(c.tipo, 80),
    subtipo: sanitizeText(c.subtipo, 80),
    disciplina: sanitizeText(c.disciplina, 120),
    modalidad: sanitizeText(c.modalidad, 120),
    duracion: sanitizeText(c.duracion, 80),
    unidadAcademica: sanitizeText(c.unidadAcademica, 180),
    regional: sanitizeText(c.regional, 120),
    contacto: sanitizeText(c.contacto, 220),
    telefonoContacto: sanitizeText(c.telefonoContacto, 80),
    descripcion: sanitizeRichHtml(c.descripcion),
    requisitosTexto: sanitizeRichHtml(c.requisitosTexto),
    programa: sanitizeRichHtml(c.programa),
    formularioInscripcion: sanitizeUrl(c.formularioInscripcion, { allowRelative: false }),
    planEstudiosPDF: sanitizeUrl(c.planEstudiosPDF, { allowRelative: true }) || null,
    tags: Array.isArray(c.tags) ? c.tags.map((t) => sanitizeText(t, 80)).filter(Boolean).slice(0, 40) : [],
    disertantes: Array.isArray(c.disertantes) ? c.disertantes.map((d) => sanitizeText(d, 120)).filter(Boolean).slice(0, 40) : [],
    unidadesAcademicas: Array.isArray(c.unidadesAcademicas) ? c.unidadesAcademicas.map((u) => sanitizeText(u, 180)).filter(Boolean) : [],
    documentos: Array.isArray(c.documentos) ? c.documentos.map((d) => ({
      tipo: sanitizeText(d?.tipo, 80),
      organismo: sanitizeText(d?.organismo, 120),
      numero: sanitizeText(d?.numero, 40),
      anio: sanitizeText(d?.anio, 10),
      pdf: sanitizeUrl(d?.pdf, { allowRelative: true }) || null,
    })) : [],
  };
}

function sanitizeImportedUser(user) {
  const u = user && typeof user === 'object' ? user : {};
  return {
    ...u,
    nombre: sanitizeText(u.nombre, 120),
    apellido: sanitizeText(u.apellido, 120),
    dni: sanitizeText(u.dni, 32),
    email: sanitizeText(u.email, 220),
    telefono: sanitizeText(u.telefono, 80),
    login: sanitizeText(u.login, 80) || null,
    rol: sanitizeText(u.rol, 40),
    unidades: Array.isArray(u.unidades) ? u.unidades.map((x) => sanitizeText(x, 180)).filter(Boolean) : [],
  };
}

function applyBackupPayload(state, payload) {
  if (!hasImportableData(payload)) {
    const err = new Error('Formato inválido');
    err.status = 400;
    throw err;
  }

  if (payload.carreras) state.carreras = Array.isArray(payload.carreras) ? payload.carreras.map(sanitizeImportedCarrera) : state.carreras;

  if (payload.usuarios) {
    // Merge by login/email and preserve imported auth data when available.
    const existing = state.usuarios || [];
    payload.usuarios.map(sanitizeImportedUser).forEach((u) => {
      const idx = existing.findIndex((e) =>
        (u.login && e.login === u.login) ||
        (u.email && e.email === u.email)
      );
      if (idx === -1) {
        existing.push({
          ...u,
          passwordHash: u.passwordHash || '',
          mustChangePassword: u.mustChangePassword !== undefined ? !!u.mustChangePassword : true,
          passwordChangedAt: u.passwordChangedAt || null,
        });
      } else {
        existing[idx] = {
          ...existing[idx],
          ...u,
          passwordHash: u.passwordHash !== undefined ? u.passwordHash : existing[idx].passwordHash,
          mustChangePassword: u.mustChangePassword !== undefined ? !!u.mustChangePassword : existing[idx].mustChangePassword,
          passwordChangedAt: u.passwordChangedAt !== undefined ? u.passwordChangedAt : existing[idx].passwordChangedAt,
        };
      }
    });
    state.usuarios = existing;
  }

  if (payload.config && typeof payload.config === 'object') state.config = payload.config;
  if (Array.isArray(payload.auditLog)) state.auditLog = payload.auditLog.slice(0, 500).map((l) => ({
    ts: sanitizeText(l?.ts, 64),
    action: sanitizeText(l?.action, 80),
    entity: sanitizeText(l?.entity, 80),
    detail: sanitizeText(l?.detail, 500),
    user: sanitizeText(l?.user, 220),
    rol: sanitizeText(l?.rol, 40),
  }));
  if (Array.isArray(payload.newsletterSubscriptions)) {
    state.newsletterSubscriptions = payload.newsletterSubscriptions.map((row, idx) => ({
      id: Number(row?.id || idx + 1),
      email: sanitizeText(row?.email, 220).toLowerCase(),
      source: sanitizeText(row?.source, 60) || 'sitio',
      activo: row?.activo !== false,
      fechaAlta: sanitizeText(row?.fechaAlta, 64) || null,
      actualizadoEn: sanitizeText(row?.actualizadoEn, 64) || null,
      ultimoEnvio: sanitizeText(row?.ultimoEnvio, 64) || null,
    })).filter((row) => row.email);
  }
  if (Array.isArray(payload.newsletterDispatchLog)) {
    state.newsletterDispatchLog = payload.newsletterDispatchLog.slice(0, 200).map((row, idx) => ({
      id: Number(row?.id || idx + 1),
      scheduledFor: sanitizeText(row?.scheduledFor, 64) || null,
      runAt: sanitizeText(row?.runAt, 64) || null,
      status: sanitizeText(row?.status, 80) || 'unknown',
      changesDetected: row?.changesDetected === true,
      recipientsTotal: Number(row?.recipientsTotal || 0),
      sentCount: Number(row?.sentCount || 0),
      message: sanitizeText(row?.message, 400),
    }));
  }
  if (Array.isArray(payload.unidadesAcademicas)) state.unidadesAcademicas = payload.unidadesAcademicas.map((v) => sanitizeText(v, 180)).filter(Boolean);
  if (Array.isArray(payload.regionales)) state.regionales = payload.regionales.map((v) => sanitizeText(v, 120)).filter(Boolean);
  if (Array.isArray(payload.localidades)) state.localidades = payload.localidades.map((v) => sanitizeText(v, 120)).filter(Boolean);
  if (Array.isArray(payload.disciplinas)) state.disciplinas = payload.disciplinas.map((v) => sanitizeText(v, 120)).filter(Boolean);
  if (Array.isArray(payload.tiposDocumento)) state.tiposDocumento = payload.tiposDocumento.map((v) => sanitizeText(v, 80)).filter(Boolean);
  if (Array.isArray(payload.organismos)) state.organismos = payload.organismos.map((v) => sanitizeText(v, 120)).filter(Boolean);

  return state;
}

module.exports = { buildBackupPayload, hasImportableData, applyBackupPayload };
