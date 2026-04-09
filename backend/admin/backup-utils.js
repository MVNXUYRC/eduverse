function buildBackupPayload(state) {
  return {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    carreras: state.carreras || [],
    usuarios: (state.usuarios || []).map((u) => {
      const { passwordHash, ...rest } = u;
      return rest;
    }),
    config: state.config || {},
    auditLog: state.auditLog || [],
    unidadesAcademicas: state.unidadesAcademicas || [],
    regionales: state.regionales || [],
    localidades: state.localidades || [],
    disciplinas: state.disciplinas || [],
    tiposDocumento: state.tiposDocumento || ['Resolución', 'Disposición', 'Ordenanza'],
    organismos: state.organismos || ['Consejo Superior', 'Ministerial', 'SPU', 'SSPU', 'CONEAU'],
  };
}

function hasImportableData(payload) {
  return !!(
    payload &&
    (
      payload.carreras || payload.usuarios || payload.config || payload.auditLog ||
      payload.unidadesAcademicas || payload.regionales || payload.localidades ||
      payload.disciplinas || payload.tiposDocumento || payload.organismos
    )
  );
}

function applyBackupPayload(state, payload) {
  if (!hasImportableData(payload)) {
    const err = new Error('Formato inválido');
    err.status = 400;
    throw err;
  }

  if (payload.carreras) state.carreras = payload.carreras;

  if (payload.usuarios) {
    // Merge by email and preserve existing passwordHash when present.
    const existing = state.usuarios || [];
    payload.usuarios.forEach((u) => {
      const idx = existing.findIndex((e) => e.email === u.email);
      if (idx === -1) {
        existing.push({ ...u, passwordHash: '', mustChangePassword: true });
      } else {
        existing[idx] = { ...existing[idx], ...u, passwordHash: existing[idx].passwordHash };
      }
    });
    state.usuarios = existing;
  }

  if (payload.config && typeof payload.config === 'object') state.config = payload.config;
  if (Array.isArray(payload.auditLog)) state.auditLog = payload.auditLog.slice(0, 500);
  if (Array.isArray(payload.unidadesAcademicas)) state.unidadesAcademicas = payload.unidadesAcademicas;
  if (Array.isArray(payload.regionales)) state.regionales = payload.regionales;
  if (Array.isArray(payload.localidades)) state.localidades = payload.localidades;
  if (Array.isArray(payload.disciplinas)) state.disciplinas = payload.disciplinas;
  if (Array.isArray(payload.tiposDocumento)) state.tiposDocumento = payload.tiposDocumento;
  if (Array.isArray(payload.organismos)) state.organismos = payload.organismos;

  return state;
}

module.exports = { buildBackupPayload, hasImportableData, applyBackupPayload };
