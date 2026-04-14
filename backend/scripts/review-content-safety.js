#!/usr/bin/env node
const { loadEnvFiles } = require('../config/load-env');
const { createStore } = require('../persistence');
const { sanitizeRichHtml, sanitizeUrl } = require('../domain/security');

loadEnvFiles();

const SUSPICIOUS_PATTERN = /<script|javascript:|data:text\/html|on[a-z]+\s*=|<iframe|<object|<embed|<svg|<math|<img/gi;

function scanHtml(findings, carrera, field, value) {
  const raw = String(value || '');
  if (!raw) return;
  const sanitized = sanitizeRichHtml(raw);
  if (raw !== sanitized || SUSPICIOUS_PATTERN.test(raw)) {
    findings.push({
      carreraId: carrera.id,
      carrera: carrera.nombre,
      tipo: 'html',
      field,
      detail: 'El contenido incluye HTML no permitido o fue alterado por el sanitizado.',
    });
  }
}

function scanUrl(findings, carrera, field, value, options) {
  const raw = String(value || '').trim();
  if (!raw) return;
  const sanitized = sanitizeUrl(raw, options);
  if (!sanitized) {
    findings.push({
      carreraId: carrera.id,
      carrera: carrera.nombre,
      tipo: 'url',
      field,
      detail: `URL inválida o bloqueada: ${raw}`,
    });
  }
}

async function main() {
  const store = createStore();
  if (store.runSchema) await store.runSchema();

  try {
    const state = await store.loadState();
    const findings = [];

    for (const carrera of state.carreras || []) {
      scanHtml(findings, carrera, 'descripcion', carrera.descripcion);
      scanHtml(findings, carrera, 'requisitosTexto', carrera.requisitosTexto);
      scanHtml(findings, carrera, 'programa', carrera.programa);
      scanUrl(findings, carrera, 'formularioInscripcion', carrera.formularioInscripcion, { allowRelative: false });
      scanUrl(findings, carrera, 'planEstudiosPDF', carrera.planEstudiosPDF, { allowRelative: true });
      for (const [index, doc] of (carrera.documentos || []).entries()) {
        scanUrl(findings, carrera, `documentos[${index}].pdf`, doc?.pdf, { allowRelative: true });
      }
    }

    if (!findings.length) {
      console.log('Revisión de contenido: sin hallazgos.');
      console.log(`Carreras revisadas: ${(state.carreras || []).length}`);
      return;
    }

    console.log(`Revisión de contenido: ${findings.length} hallazgo(s).`);
    findings.forEach((item) => {
      console.log(`- [${item.tipo}] carrera=${item.carreraId} "${item.carrera}" campo=${item.field} -> ${item.detail}`);
    });
    process.exitCode = 1;
  } finally {
    if (store.close) await store.close();
  }
}

main().catch((err) => {
  console.error('No se pudo revisar el contenido:', err.message);
  process.exit(1);
});
