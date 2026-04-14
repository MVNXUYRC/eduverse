/**
 * UNaM Académica — Servidor Principal v6
 * Sin dependencias externas. Compatible con Railway, Render, Fly.io.
 * Rutas públicas:  /api/*   → buscador de carreras
 * Rutas privadas:  /admin/* → panel administrativo interno
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');
const crypto = require('crypto');
const { loadEnvFiles } = require('./config/load-env');
const { createStore } = require('./persistence');
const { StateRepository } = require('./repositories/state-repository');
const { ALLOWED_DISCIPLINAS } = require('./domain/constants');
const { sanitizeText, sanitizeRichHtml, sanitizeUrl } = require('./domain/security');

loadEnvFiles();

const PORT         = process.env.PORT || 3000;
const NODE_ENV     = process.env.NODE_ENV || 'development';
const FRONTEND_DIR = path.join(__dirname, '../frontend');
const MAX_JSON_BODY_BYTES = 1 * 1024 * 1024; // 1 MB
const MAX_REQUEST_MB = Number.parseInt(String(process.env.MAX_REQUEST_MB || process.env.ADMIN_MAX_REQUEST_MB || ''), 10);
const MAX_REQUEST_BYTES = (Number.isFinite(MAX_REQUEST_MB) && MAX_REQUEST_MB > 0 ? MAX_REQUEST_MB : 50) * 1024 * 1024;
const REQUIRE_HTTPS = String(process.env.REQUIRE_HTTPS || '').trim().toLowerCase() === 'true';
const TRUST_PROXY_HEADERS = String(process.env.TRUST_PROXY_HEADERS || 'true').trim().toLowerCase() !== 'false';
const NEWSLETTER_TICK_MS = 60 * 1000;
const NEWSLETTER_DEFAULT_CFG = Object.freeze({
  enabled: true,
  weekdayUtc: 1,
  hourUtc: 11,
  minuteUtc: 0,
  lastRunAt: null,
  lastSentAt: null,
  lastContentHash: '',
  lastCarrerasSnapshot: null,
});
// ── DB ────────────────────────────────────────────────────
const store = createStore();
const stateRepo = new StateRepository(store);
let db = {};
let dbReady = false;
let newsletterDigestInFlight = false;

function ensureNewsletterState() {
  if (!db || typeof db !== 'object') return { ...NEWSLETTER_DEFAULT_CFG };
  if (!Array.isArray(db.newsletterSubscriptions)) db.newsletterSubscriptions = [];
  if (!Array.isArray(db.newsletterDispatchLog)) db.newsletterDispatchLog = [];
  if (!db.config || typeof db.config !== 'object') db.config = {};
  if (!db.config.newsletterDigest || typeof db.config.newsletterDigest !== 'object') {
    db.config.newsletterDigest = { ...NEWSLETTER_DEFAULT_CFG };
  } else {
    db.config.newsletterDigest = { ...NEWSLETTER_DEFAULT_CFG, ...db.config.newsletterDigest };
  }
  return db.config.newsletterDigest;
}

async function initStore() {
  if (store.runSchema) await store.runSchema();
  db = await stateRepo.load();
  ensureNewsletterState();
  dbReady = true;
}

async function saveDB() {
  await stateRepo.save(db);
  // Recarga para mantener referencias consistentes (normalización postgres)
  db = await stateRepo.load();
  // Mantiene sincronizado el snapshot que usa el router admin
  // también cuando se escribe desde endpoints públicos.
  if (typeof adminRouter?.updateDb === 'function') {
    adminRouter.updateDb(db);
  }
}
const initPromise = initStore();

// ── Admin module ──────────────────────────────────────────
const adminRouter = require('./admin/router');
const { sendInterestedNotification, hasMailConfig, sendNewsletterDigest, hasNewsletterMailConfig } = require('./admin/mailer');

// Proper save: persist, reload db reference, then UPDATE the router's db reference
// without replacing the save function (that would break subsequent saves)
async function adminSave() {
  await saveDB();
  // Update router's db reference WITHOUT replacing its save function
  adminRouter.updateDb(db);
}
initPromise
  .then(() => adminRouter.init(db, adminSave, { sendManualDigest: sendManualNewsletterDigest }))
  .catch((err) => {
    console.error('Error inicializando storage:', err.message);
    process.exit(1);
  });

const { isActiveState } = require('./admin/auth');
const { requireRole, ROLES, publicAdminIdentity } = require('./admin/auth');
const { ALLOWED_EMAILS } = require('./auth-config');
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || process.env.PUBLIC_GOOGLE_CLIENT_ID || '').trim();

// ── MIME ──────────────────────────────────────────────────
const MIME = {
  '.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.ico':'image/x-icon','.pdf':'application/pdf',
};

// ── Helpers ───────────────────────────────────────────────
function securityHeaders(contentType, { allowSameOriginFrame = false } = {}) {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://accounts.google.com https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://oauth2.googleapis.com",
    "frame-src https://accounts.google.com",
    "base-uri 'self'",
    "form-action 'self'",
    allowSameOriginFrame ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
  ].join('; ');
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': contentType.startsWith('application/json') ? 'no-store' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': allowSameOriginFrame ? 'SAMEORIGIN' : 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Origin-Agent-Cluster': '?1',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'Content-Security-Policy': csp,
  };
  if (NODE_ENV === 'production') {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }
  return headers;
}

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, {
    ...securityHeaders('application/json'),
  });
  res.end(JSON.stringify(data));
}

function requestIsHttps(req) {
  if (req.socket?.encrypted) return true;
  if (!TRUST_PROXY_HEADERS) return false;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

function maybeRedirectToHttps(req, res) {
  if (!REQUIRE_HTTPS || requestIsHttps(req)) return false;
  const host = String(req.headers.host || '').trim();
  if (!host) return false;
  const location = `https://${host}${req.url || '/'}`;
  res.writeHead(308, {
    Location: location,
    'Cache-Control': 'no-store',
  });
  res.end();
  return true;
}

function resolveStaticPath(pathname) {
  let decoded = pathname || '/';
  try { decoded = decodeURIComponent(decoded); } catch { return null; }
  const normalized = path.posix.normalize(decoded === '/' ? '/index.html' : decoded);
  const target = path.resolve(FRONTEND_DIR, `.${normalized}`);
  const base = path.resolve(FRONTEND_DIR);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) return null;
  return target;
}

function serveStatic(res, filePath) {
  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const content = fs.readFileSync(filePath);
    const headers = securityHeaders(mime, { allowSameOriginFrame: ext === '.pdf' });
    if (ext==='.pdf') {
      headers['Content-Disposition'] = 'inline';
    }
    res.writeHead(200, headers);
    res.end(content);
  } catch {
    // For non-HTML files (PDF, images etc), return 404 — don't fall back to index.html
    if (ext && ext !== '.html' && ext !== '') {
      res.writeHead(404,{'Content-Type':'text/plain'});
      return res.end('File not found');
    }
    try {
      const index = fs.readFileSync(path.join(FRONTEND_DIR,'index.html'));
      res.writeHead(200, securityHeaders('text/html; charset=utf-8'));
      res.end(index);
    } catch { res.writeHead(404); res.end('Not found'); }
  }
}

function readBody(req) {
  return new Promise((resolve,reject)=>{
    let body=''; let size = 0;
    req.on('data',(chunk)=>{
      size += chunk.length;
      if (size > MAX_JSON_BODY_BYTES) {
        reject({ status: 413, message: 'JSON demasiado grande (máximo 1 MB).' });
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
    req.on('end',()=>{ try{resolve(JSON.parse(body));}catch{resolve({});} });
    req.on('error',reject);
  });
}

// ── State helpers ─────────────────────────────────────────
function carreraIsActive(c) {
  return isActiveState(typeof c.activo==='object' ? c.activo : {valor:c.activo!==false,fechaHasta:null});
}
function carreraIsInscripcionAbierta(c) {
  return isActiveState(typeof c.inscripcionAbierta==='object' ? c.inscripcionAbierta : {valor:!!c.inscripcionAbierta,fechaHasta:null});
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}
function nextInterestedId(items) {
  return (items || []).length > 0 ? Math.max(...items.map((x) => Number(x.id || 0))) + 1 : 1;
}
function nextSubscriptionId(items) {
  return (items || []).length > 0 ? Math.max(...items.map((x) => Number(x.id || 0))) + 1 : 1;
}
function nextDispatchId(items) {
  return (items || []).length > 0 ? Math.max(...items.map((x) => Number(x.id || 0))) + 1 : 1;
}
function normalizeDigestNumber(value, min, max, fallback) {
  const num = Number.parseInt(String(value), 10);
  if (!Number.isFinite(num) || num < min || num > max) return fallback;
  return num;
}
function toUtcIsoDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
function getWeekStartArgentinaUtc(now) {
  const argentinaOffsetMinutes = -3 * 60; // UTC-3
  const localMs = now.getTime() + (argentinaOffsetMinutes * 60 * 1000);
  const local = new Date(localMs);
  const day = local.getUTCDay(); // 0=Dom … 6=Sáb (sobre reloj "local Argentina")
  const daysBack = day === 0 ? 6 : day - 1; // retroceder hasta lunes
  const mondayLocalMidnightMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - daysBack,
    0,
    0,
    0,
    0
  );
  const mondayUtcMs = mondayLocalMidnightMs - (argentinaOffsetMinutes * 60 * 1000);
  return new Date(mondayUtcMs);
}
function getLastWeeklyOccurrenceUtc(now, cfg) {
  const weekday = normalizeDigestNumber(cfg.weekdayUtc, 0, 6, NEWSLETTER_DEFAULT_CFG.weekdayUtc);
  const hour = normalizeDigestNumber(cfg.hourUtc, 0, 23, NEWSLETTER_DEFAULT_CFG.hourUtc);
  const minute = normalizeDigestNumber(cfg.minuteUtc, 0, 59, NEWSLETTER_DEFAULT_CFG.minuteUtc);
  const currentDay = now.getUTCDay();
  const daysBack = (currentDay - weekday + 7) % 7;
  const scheduled = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hour,
    minute,
    0,
    0
  ));
  scheduled.setUTCDate(scheduled.getUTCDate() - daysBack);
  if (scheduled.getTime() > now.getTime()) scheduled.setUTCDate(scheduled.getUTCDate() - 7);
  return scheduled;
}
function carreraContentHash(c) {
  const fields = [
    c.nombre, c.tipo, c.esCurso, c.modalidad, c.duracion, c.descripcion,
    c.subtipo, c.disciplina, c.contacto, c.requisitosTexto, c.alcancesTitulo,
    c.formularioInscripcion, c.programa, c.unidadAcademica, c.regional,
    JSON.stringify((Array.isArray(c.unidadesAcademicas) ? c.unidadesAcademicas : []).slice().sort()),
  ];
  return crypto.createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

function buildCarrerasSnapshotEntries() {
  return (db.carreras || []).map((c) => {
    const inscObj = typeof c.inscripcionAbierta === 'object' && c.inscripcionAbierta !== null
      ? c.inscripcionAbierta
      : { valor: !!c.inscripcionAbierta, fechaHasta: null };
    return {
      id: Number(c.id || 0),
      nombre: String(c.nombre || ''),
      tipo: String(c.tipo || ''),
      esCurso: !!c.esCurso,
      activo: typeof c.activo === 'object' ? !!c.activo?.valor : c.activo !== false,
      inscripcionAbierta: isActiveState(inscObj),
      inscripcionFechaHasta: inscObj.fechaHasta || null,
      proximamente: c.proximamente === true,
      modificadoEn: c.modificadoEn || null,
      contentHash: carreraContentHash(c),
      formularioInscripcion: String(c.formularioInscripcion || '').trim() || null,
      modalidad: String(c.modalidad || '').trim() || null,
    };
  }).sort((a, b) => a.id - b.id);
}

function buildNewsletterDigestSnapshot() {
  const carreras = buildCarrerasSnapshotEntries();
  const payload = JSON.stringify(carreras);
  const contentHash = crypto.createHash('sha256').update(payload).digest('hex');
  return { contentHash, total: carreras.length, carreras };
}

/**
 * Clasifica cambios entre dos snapshots de carreras.
 * Prioridad: A(nueva) > C(inscripcionAbierta) > B(proximamente) > D(cierreProximo) > E(cierreReciente) > F(actualizada)
 * @param {Array} currentCarreras  — snapshot actual (buildCarrerasSnapshotEntries)
 * @param {Array|null} lastCarreras — snapshot del run anterior (null = primer run)
 * @param {Date} windowStart
 * @param {Date} windowEnd
 * @returns {{ nueva, inscripcionAbierta, proximamente, cierreProximo, cierreReciente, actualizadas, total }}
 */
function buildNewsletterDiff(currentCarreras, lastCarreras, windowStart, windowEnd) {
  const lastById = new Map((lastCarreras || []).map((c) => [c.id, c]));
  const now = new Date();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const windowStartMs = windowStart instanceof Date ? windowStart.getTime() : new Date(windowStart).getTime();
  const windowEndMs = windowEnd instanceof Date ? windowEnd.getTime() : new Date(windowEnd).getTime();

  function isUpdatedInWindow(curr, prev) {
    if (!prev) return false;
    if (curr.contentHash === prev.contentHash || !curr.modificadoEn) return false;
    const modMs = new Date(curr.modificadoEn).getTime();
    if (!Number.isFinite(modMs) || !Number.isFinite(windowStartMs) || !Number.isFinite(windowEndMs)) return false;
    return modMs >= windowStartMs && modMs <= windowEndMs;
  }

  function withUpdateFlag(curr, updatedInWindow) {
    if (!updatedInWindow) return curr;
    return { ...curr, actualizadaEnVentana: true };
  }

  const result = {
    nueva: [],
    inscripcionAbierta: [],
    proximamente: [],
    cierreProximo: [],
    cierreReciente: [],
    actualizadas: [],
  };

  for (const curr of currentCarreras) {
    const prev = lastById.get(curr.id);
    const updatedInWindow = isUpdatedInWindow(curr, prev);

    // A — Nueva: no existía en el snapshot anterior
    if (!prev) {
      result.nueva.push(curr);
      continue;
    }

    // C — Inscripción abierta: pasó de cerrada a abierta
    if (curr.inscripcionAbierta && !prev.inscripcionAbierta) {
      result.inscripcionAbierta.push(withUpdateFlag(curr, updatedInWindow));
      continue;
    }

    // B — Próximamente: acaba de aparecer en estado próximamente
    if (curr.proximamente && !prev.proximamente) {
      result.proximamente.push(withUpdateFlag(curr, updatedInWindow));
      continue;
    }

    // D — Cierre próximo: inscripción abierta cuyo cierre se volvió relevante (sin repetir semana a semana sin cambios)
    if (curr.inscripcionAbierta && curr.inscripcionFechaHasta) {
      const cierre = new Date(curr.inscripcionFechaHasta);
      const prevCierre = prev?.inscripcionFechaHasta ? new Date(prev.inscripcionFechaHasta) : null;
      const prevEsValido = !!prevCierre && !Number.isNaN(prevCierre.getTime());
      const currEsValido = !Number.isNaN(cierre.getTime());
      const currEsCierreProximo = currEsValido && cierre >= now && cierre <= new Date(now.getTime() + sevenDays);
      const prevEsCierreProximo = prevEsValido && prev.inscripcionAbierta === true && prevCierre >= now && prevCierre <= new Date(now.getTime() + sevenDays);
      const fechaCierreCambio = prev.inscripcionFechaHasta !== curr.inscripcionFechaHasta;
      if (currEsCierreProximo && (!prevEsCierreProximo || fechaCierreCambio)) {
        result.cierreProximo.push(withUpdateFlag(curr, updatedInWindow));
        continue;
      }
    }

    // E — Cierre reciente: inscripción cerrada y (antes estaba abierta O fechaHasta cayó dentro de la ventana)
    if (!curr.inscripcionAbierta) {
      const wasOpen = prev.inscripcionAbierta;
      let closedInWindow = false;
      if (curr.inscripcionFechaHasta) {
        const cierre = new Date(curr.inscripcionFechaHasta);
        if (!Number.isNaN(cierre.getTime()) && cierre >= windowStart && cierre <= windowEnd) {
          closedInWindow = true;
        }
      }
      if (wasOpen || closedInWindow) {
        result.cierreReciente.push(withUpdateFlag(curr, updatedInWindow));
        continue;
      }
    }

    // F — Actualizada: modificadoEn dentro de la ventana y contentHash cambió
    if (updatedInWindow) {
      result.actualizadas.push(withUpdateFlag(curr, true));
      continue;
    }
  }

  result.total = result.nueva.length + result.inscripcionAbierta.length + result.proximamente.length
    + result.cierreProximo.length + result.cierreReciente.length + result.actualizadas.length;
  return result;
}

function appendNewsletterDispatchLog(entry) {
  ensureNewsletterState();
  const log = {
    id: nextDispatchId(db.newsletterDispatchLog),
    scheduledFor: toUtcIsoDate(entry.scheduledFor) || new Date().toISOString(),
    runAt: new Date().toISOString(),
    status: String(entry.status || 'unknown'),
    changesDetected: !!entry.changesDetected,
    recipientsTotal: Number(entry.recipientsTotal || 0),
    sentCount: Number(entry.sentCount || 0),
    message: String(entry.message || ''),
  };
  db.newsletterDispatchLog.unshift(log);
  if (db.newsletterDispatchLog.length > 200) db.newsletterDispatchLog = db.newsletterDispatchLog.slice(0, 200);
}
// All carreras are public (active or not — see spec: inactive = "Propuesta finalizada")
// But filter still exists for search — return all, mark status
function enrichCarrera(c) {
  const sanitized = {
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
    alcancesTitulo: sanitizeRichHtml(c.alcancesTitulo),
    programa: sanitizeRichHtml(c.programa),
    formularioInscripcion: sanitizeUrl(c.formularioInscripcion, { allowRelative: false }),
    planEstudiosPDF: sanitizeUrl(c.planEstudiosPDF, { allowRelative: true }) || null,
    tags: (Array.isArray(c.tags) ? c.tags : []).map((t)=>sanitizeText(t,80)).filter(Boolean).slice(0, 40),
    disertantes: (Array.isArray(c.disertantes) ? c.disertantes : []).map((d)=>sanitizeText(d,120)).filter(Boolean).slice(0, 40),
    unidadesAcademicas: (Array.isArray(c.unidadesAcademicas) ? c.unidadesAcademicas : []).map((u)=>sanitizeText(u,180)).filter(Boolean),
    documentos: (Array.isArray(c.documentos) ? c.documentos : []).map((d)=>({
      ...d,
      tipo: sanitizeText(d?.tipo, 80),
      organismo: sanitizeText(d?.organismo, 120),
      numero: sanitizeText(d?.numero, 40),
      anio: sanitizeText(d?.anio, 10),
      pdf: sanitizeUrl(d?.pdf, { allowRelative: true }) || null,
    })),
  };
  return {
    ...sanitized,
    _activo:             carreraIsActive(c),
    _inscripcionAbierta: carreraIsInscripcionAbierta(c),
    proximamente: c?.proximamente === true,
  };
}

// ── Public Auth (Google) ──────────────────────────────────
async function handlePublicAuth(req, res, pathname) {
  if (pathname==='/api/auth/verify'&&req.method==='POST') {
    let body = {};
    try { body = await readBody(req); }
    catch (e) { return jsonResponse(res, { allowed: false, error: e.message || 'Solicitud inválida' }, e.status || 400); }
    const email=(body.email||'').toLowerCase().trim();
    if (!email) return jsonResponse(res,{allowed:false},400);
    // Check 1: static allow-list (auth-config.js)
    const inStaticList = ALLOWED_EMAILS.map(e=>e.toLowerCase().trim()).includes(email);
    if (inStaticList) return jsonResponse(res,{allowed:true,email,source:'static'});
    // Check 2: registered users in persistent store (active users)
    const dbUser = (db.usuarios||[]).find(u=>
      String(u.email || '').toLowerCase()===email && u.activo!==false
    );
    if (dbUser) return jsonResponse(res,{allowed:true,email,source:'db',user:{nombre:dbUser.nombre,apellido:dbUser.apellido,rol:dbUser.rol}});
    // Not found anywhere -> denied
    return jsonResponse(res,{allowed:false,email,restricted:true});
  }
  return jsonResponse(res,{error:'Not found'},404);
}

// ── Search ────────────────────────────────────────────────
function handleSearch(res, params) {
  // Return ALL carreras (active and inactive) — inactive = "Propuesta finalizada"
  // Frontend differentiates by _activo
  let results = (db.carreras||[]).map(enrichCarrera);

  const q=params.get('q');
  if (q) {
    const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const ql=norm(q);
    const toList = (value) => {
      if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean);
      if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean);
      return [];
    };
    const textIncludes = (value) => norm(value).includes(ql);
    const listIncludes = (value) => toList(value).some((v) => textIncludes(v));
    results=results.filter(c=>
      // Denominación
      textIncludes(c.nombre) ||
      // Tipo (Carrera / Curso)
      textIncludes(c.esCurso ? 'curso' : 'carrera') ||
      // Nivel académico
      textIncludes(c.tipo) ||
      // Tipo de posgrado
      textIncludes(c.subtipo) ||
      // Unidades académicas
      listIncludes(c.unidadesAcademicas) ||
      textIncludes(c.unidadAcademica) ||
      // Disciplina
      textIncludes(c.disciplina) ||
      // Modalidad
      textIncludes(c.modalidad) ||
      // Duración
      textIncludes(c.duracion) ||
      // Palabras clave
      listIncludes(c.tags) ||
      // Disertantes (incluye campo legacy speakers)
      listIncludes(c.disertantes) ||
      listIncludes(c.speakers) ||
      // Estado
      textIncludes(c.proximamente ? 'proximamente' : (c._activo ? 'disponible' : 'finalizada')) ||
      // Inscripción
      textIncludes(c._inscripcionAbierta ? 'abierta' : 'cerrada') ||
      // Compatibilidad: mantener descripción en búsqueda libre
      textIncludes(c.descripcion)
    );
  }
  const esCurso=params.get('esCurso');
  if (esCurso!==null&&esCurso!=='') {
    const esCursoBool = ['true', '1', 'yes', 'si'].includes(String(esCurso).toLowerCase());
    results = results.filter(c => !!c.esCurso === esCursoBool);
  }
  const tipo=params.get('tipo');
  if (tipo) {
    const l=tipo.split(',').map(t=>t.trim()).filter(Boolean);
    results=results.filter(c=>l.includes(c.tipo));
  }
  const subtipo=params.get('subtipo');
  if (subtipo) {
    const l=subtipo.split(',').map(s=>s.trim()).filter(Boolean);
    results=results.filter(c=>l.includes(c.subtipo));
  }
  const disciplina=params.get('disciplina');
  if (disciplina) { const l=disciplina.split(',').map(d=>d.trim()); results=results.filter(c=>l.includes(c.disciplina)); }
  const modalidad=params.get('modalidad');
  if (modalidad) { const l=modalidad.split(',').map(m=>m.trim()); results=results.filter(c=>l.includes(c.modalidad)); }
  const unidad=params.get('unidad');
  if (unidad) { const l=unidad.split(',').map(u=>u.trim()); results=results.filter(c=>(c.unidadesAcademicas||[c.unidadAcademica]).some(u2=>l.includes(u2))); }
  const regional=params.get('regional');
  if (regional) { const l=regional.split(',').map(r=>r.trim()); results=results.filter(c=>l.includes(c.regional)); }
  // activo filter for search page
  const activo=params.get('activo');
  if (activo!==null&&activo!=='') results=results.filter(c=>String(c._activo)===(activo));
  const inscripcionAbierta=params.get('inscripcionAbierta');
  if (inscripcionAbierta!==null&&inscripcionAbierta!=='') {
    const inscBool = ['true', '1', 'yes', 'si'].includes(String(inscripcionAbierta).toLowerCase());
    results = results.filter(c => !!c._inscripcionAbierta === inscBool);
  }

  if (params.get('sort')==='nombre') results.sort((a,b)=>a.nombre.localeCompare(b.nombre));
  else if (params.get('sort')==='reciente') results.sort((a,b)=>Number(b.id)-Number(a.id));

  const limit=Math.min(parseInt(params.get('limit')||'12'),100);
  const page=Math.max(parseInt(params.get('page')||'1'),1);
  const total=results.length;

  return jsonResponse(res,{
    data:results.slice((page-1)*limit,page*limit),
    meta:{total,page,limit,totalPages:Math.ceil(total/limit)||1,hasNext:page<Math.ceil(total/limit),hasPrev:page>1},
  });
}

function handleFeatured(res) {
  const all  = (db.carreras||[]).map(enrichCarrera);
  const active = all.filter(c=>c._activo);

  const proximamente = all.filter(c=>c.proximamente === true).slice(0,6);
  const cursos  = active.filter(c=>c.esCurso).slice(0,6);
  // Prioriza nuevas activas, pero incluye nuevas no activas para evitar que desaparezcan del Home.
  const nuevas  = all
    .filter(c=>c.nueva)
    .sort((a,b)=>Number(b._activo)-Number(a._activo))
    .slice(0,6);
  const inscripcionAbierta = active.filter(c=>carreraIsInscripcionAbierta(c)).slice(0,6);

  // Disciplinas: restringidas temporalmente a las categorías institucionales definidas
  const discCount = all.reduce((acc,c)=>{
    if (c.disciplina && ALLOWED_DISCIPLINAS.includes(c.disciplina)) {
      acc[c.disciplina] = (acc[c.disciplina] || 0) + 1;
    }
    return acc;
  },{});
  const disciplinas = ALLOWED_DISCIPLINAS
    .map(nombre => ({ nombre, cantidad: discCount[nombre] || 0 }))
    .filter(d => d.cantidad > 0);

  // Stats for hero
  const facultadesActivas = new Set(
    active.filter(c=>(c.unidadesAcademicas||[c.unidadAcademica]).some(u=>u?.startsWith('Facultad')))
      .flatMap(c=>c.unidadesAcademicas||[c.unidadAcademica])
      .filter(u=>u?.startsWith('Facultad'))
  ).size;
  const regionalesActivas = new Set(active.map(c=>c.regional).filter(Boolean)).size;
  const tiene100Virtual   = active.some(c=>c.modalidad==='100% Virtual');

  const totalCarreras = active.filter(c=>!c.esCurso).length;
  const totalCursos   = active.filter(c=>c.esCurso).length;
  return jsonResponse(res,{proximamente,cursos,nuevas,disciplinas,inscripcionAbierta,stats:{facultades:facultadesActivas,regionales:regionalesActivas,tiene100Virtual,total:active.length,carreras:totalCarreras,cursos:totalCursos}});
}

async function handleCreateInterested(req, res, careerId) {
  let body = {};
  try { body = await readBody(req); }
  catch (e) { return jsonResponse(res, { error: e.message || 'Solicitud inválida' }, e.status || 400); }

  const id = parseInt(careerId, 10);
  if (!Number.isFinite(id)) return jsonResponse(res, { error: 'Carrera inválida' }, 400);
  const career = (db.carreras || []).find((c) => c.id === id);
  if (!career) return jsonResponse(res, { error: 'Carrera no encontrada' }, 404);
  if (career.proximamente !== true) return jsonResponse(res, { error: 'Solo se permite registrar interés en propuestas Próximamente.' }, 400);

  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !isValidEmail(email)) return jsonResponse(res, { error: 'Ingresá un correo válido.' }, 400);

  if (!Array.isArray(db.interesados)) db.interesados = [];
  const existing = db.interesados.find((item) =>
    Number(item.carreraId) === id && String(item.email || '').trim().toLowerCase() === email
  );
  if (existing) {
    if (existing.informadoManual === true) {
      return jsonResponse(res, {
        error: 'Ya te enviamos un correo con la información de esta propuesta. Si no lo recibiste, revisá tu carpeta de spam o contactanos en ead@unam.edu.ar',
        errorCode: 'ALREADY_INFORMED',
      }, 409);
    }
    return jsonResponse(res, { error: 'Ese correo ya está registrado para esta propuesta.' }, 409);
  }

  const unidadAcademica = (Array.isArray(career.unidadesAcademicas) && career.unidadesAcademicas.length
    ? career.unidadesAcademicas[0]
    : career.unidadAcademica) || '';
  const registro = {
    id: nextInterestedId(db.interesados),
    email,
    carreraId: id,
    unidadAcademica,
    fechaCreacion: new Date().toISOString(),
    informadoManual: false,
    informadoEn: null,
    informadoPor: null,
  };
  db.interesados.push(registro);
  await saveDB();
  return jsonResponse(res, { success: true }, 201);
}

function canManageInterestedRecord(user, row) {
  if (!user || !row) return false;
  if (user.rol === ROLES.ROOT || user.rol === ROLES.INSTITUCIONAL) return true;
  const unidades = new Set(Array.isArray(user.unidades) ? user.unidades : []);
  const unidad = String(row.unidadAcademica || '').trim();
  if (unidad && unidades.has(unidad)) return true;
  const career = (db.carreras || []).find((c) => Number(c.id) === Number(row.carreraId || 0));
  if (!career) return false;
  const careerUnits = career.unidadesAcademicas || [career.unidadAcademica];
  return (careerUnits || []).some((u) => unidades.has(String(u || '').trim()));
}

function auditInterestedAction(action, detail, user) {
  if (!Array.isArray(db.auditLog)) db.auditLog = [];
  db.auditLog.unshift({
    ts: new Date().toISOString(),
    action,
    entity: 'interesado',
    detail: String(detail || ''),
    user: publicAdminIdentity(user),
    rol: user?.rol || '?',
  });
  if (db.auditLog.length > 500) db.auditLog = db.auditLog.slice(0, 500);
}

async function handleAdminInterestedCompat(req, res, pathname, params) {
  const base = pathname.startsWith('/cpanel/api')
    ? pathname.replace('/cpanel/api', '/admin/api')
    : pathname;
  const local = base.replace('/admin/api', '');
  const seg = local.split('/').filter(Boolean);
  const r0 = seg[0];
  if (r0 !== 'novedades' && r0 !== 'interesados') return false;

  const parseId = (value) => {
    const id = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(id) ? id : null;
  };
  const body = async () => readBody(req).catch(() => ({}));

  const directId = parseId(seg[1]);
  const altInformId = seg[1] === 'informar' ? parseId(seg[2]) : null;
  const queryId = parseId(params.get('id') || params.get('interesadoId'));

  const deleteId = req.method === 'DELETE' ? (directId ?? queryId) : null;
  if (deleteId !== null) {
    const auth = requireRole(req, ROLES.ROOT);
    if (!auth.ok) { jsonResponse(res, { error: auth.error }, auth.status); return true; }
    if (!Array.isArray(db.interesados)) db.interesados = [];
    const idx = db.interesados.findIndex((row) => Number(row.id) === deleteId);
    if (idx < 0) { jsonResponse(res, { error: 'Registro no encontrado.' }, 404); return true; }
    const [deleted] = db.interesados.splice(idx, 1);
    auditInterestedAction('ELIMINAR', String(deleted?.email || `id:${deleteId}`), auth.user);
    await saveDB();
    jsonResponse(res, { success: true, id: deleteId }, 200);
    return true;
  }

  const maybePatchInform = req.method === 'PATCH' && directId !== null;
  const maybePostInform = req.method === 'POST'
    && (
      (directId !== null && seg[2] === 'informar')
      || altInformId !== null
      || queryId !== null
      || directId !== null
    );
  if (!(maybePatchInform || maybePostInform)) return false;

  let informId = null;
  if (seg[2] === 'informar' && directId !== null) informId = directId;
  else if (altInformId !== null) informId = altInformId;
  else if (req.method === 'PATCH' && directId !== null) informId = directId;
  else if (queryId !== null) informId = queryId;
  else if (directId !== null) {
    const payload = await body();
    const action = String(payload?.action || '').trim().toLowerCase();
    const flag = payload?.informado === true || payload?.informar === true;
    if (action === 'informar' || flag) informId = directId;
  }
  if (informId === null) return false;

  const auth = requireRole(req, ROLES.UNIDADES);
  if (!auth.ok) { jsonResponse(res, { error: auth.error }, auth.status); return true; }
  if (!Array.isArray(db.interesados)) db.interesados = [];
  const idx = db.interesados.findIndex((row) => Number(row.id) === informId);
  if (idx < 0) { jsonResponse(res, { error: 'Registro no encontrado.' }, 404); return true; }
  const row = db.interesados[idx];
  if (!canManageInterestedRecord(auth.user, row)) {
    jsonResponse(res, { error: 'Sin permiso para este registro.' }, 403);
    return true;
  }
  if (row.informadoManual !== true) {
    row.informadoManual = true;
    row.informadoEn = new Date().toISOString();
    row.informadoPor = publicAdminIdentity(auth.user);
    db.interesados[idx] = row;
    auditInterestedAction('EDITAR', `${row.email} → INFORMADO`, auth.user);
    await saveDB();
  }
  jsonResponse(res, {
    success: true,
    data: {
      id: Number(row.id || 0),
      informadoManual: row.informadoManual === true,
      informadoEn: row.informadoEn || null,
      informadoPor: row.informadoPor || null,
    },
  }, 200);
  return true;
}

async function handleNewsletterSubscribe(req, res) {
  let body = {};
  try { body = await readBody(req); }
  catch (e) { return jsonResponse(res, { error: e.message || 'Solicitud inválida' }, e.status || 400); }

  ensureNewsletterState();

  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !isValidEmail(email)) return jsonResponse(res, { error: 'Ingresá un correo electrónico válido.' }, 400);

  const sourceRaw = String(body.source || 'sitio').trim().toLowerCase();
  const source = (sourceRaw || 'sitio').slice(0, 60);
  const idx = db.newsletterSubscriptions.findIndex((s) => String(s.email || '').trim().toLowerCase() === email);
  if (idx >= 0) {
    return jsonResponse(res, { error: 'Ese correo ya está registrado.' }, 409);
  }

  const now = new Date().toISOString();
  db.newsletterSubscriptions.push({
    id: nextSubscriptionId(db.newsletterSubscriptions),
    email,
    source,
    activo: true,
    fechaAlta: now,
    actualizadoEn: now,
    ultimoEnvio: null,
  });
  await saveDB();
  return jsonResponse(res, { success: true, subscribed: true }, 201);
}

async function runWeeklyNewsletterDigestIfNeeded(now = new Date()) {
  if (!dbReady || newsletterDigestInFlight) return;
  const cfg = ensureNewsletterState();
  if (cfg.enabled !== true) return;

  const scheduledFor = getLastWeeklyOccurrenceUtc(now, cfg);
  const lastRun = cfg.lastRunAt ? new Date(cfg.lastRunAt) : null;
  if (lastRun && !Number.isNaN(lastRun.getTime()) && lastRun.getTime() >= scheduledFor.getTime()) return;

  newsletterDigestInFlight = true;
  try {
    const snapshot = buildNewsletterDigestSnapshot();
    const lastCarreras = Array.isArray(cfg.lastCarrerasSnapshot) ? cfg.lastCarrerasSnapshot : null;
    const changesDetected = snapshot.contentHash !== String(cfg.lastContentHash || '');
    const recipients = (db.newsletterSubscriptions || []).filter((s) => s && s.activo !== false && isValidEmail(s.email));
    const recipientsTotal = recipients.length;

    if (!changesDetected) {
      cfg.lastRunAt = new Date().toISOString();
      appendNewsletterDispatchLog({
        scheduledFor,
        status: 'sin-cambios',
        changesDetected: false,
        recipientsTotal,
        sentCount: 0,
        message: 'No hubo actualizaciones en la oferta académica desde el último envío semanal.',
      });
      await saveDB();
      return;
    }

    const windowStart = lastRun || scheduledFor;
    const windowEnd = now;
    const diff = buildNewsletterDiff(snapshot.carreras, lastCarreras, windowStart, windowEnd);

    const diffSummary = [
      diff.nueva.length && `${diff.nueva.length} nueva(s)`,
      diff.inscripcionAbierta.length && `${diff.inscripcionAbierta.length} inscripción abierta`,
      diff.proximamente.length && `${diff.proximamente.length} próximamente`,
      diff.cierreProximo.length && `${diff.cierreProximo.length} cierre próximo`,
      diff.cierreReciente.length && `${diff.cierreReciente.length} cierre reciente`,
      diff.actualizadas.length && `${diff.actualizadas.length} actualizada(s)`,
    ].filter(Boolean).join(', ');

    let status = 'pendiente-configuracion';
    let message = `${diff.total} propuesta(s) con cambios (${diffSummary}). Sin SMTP configurado.`;
    let sentCount = 0;

    const nowIso = now.toISOString();

    if (recipientsTotal === 0) {
      status = 'sin-destinatarios';
      message = `${diff.total} propuesta(s) con cambios (${diffSummary}). Sin suscriptores activos.`;
    } else if (hasNewsletterMailConfig()) {
      const siteUrl = String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
      const emails = recipients.map((s) => String(s.email || '').trim().toLowerCase()).filter(Boolean);
      const sendResult = await sendNewsletterDigest(emails, diff, siteUrl);
      sentCount = sendResult.sentCount;

      if (sentCount > 0) {
        cfg.lastSentAt = nowIso;
        const sentSet = new Set(sendResult.sentEmails || []);
        db.newsletterSubscriptions.forEach((s, i) => {
          if (sentSet.has(String(s.email || '').trim().toLowerCase())) {
            db.newsletterSubscriptions[i] = { ...s, ultimoEnvio: nowIso };
          }
        });
      }

      if (sentCount === recipientsTotal) {
        status = 'enviado';
        message = `Digest enviado a ${sentCount} suscriptor(es). Cambios: ${diffSummary}.`;
      } else if (sentCount > 0) {
        status = 'enviado-parcial';
        message = `Digest enviado a ${sentCount}/${recipientsTotal} suscriptor(es). ${sendResult.failed?.length || 0} error(es). Cambios: ${diffSummary}.`;
        if (sendResult.failed?.length) {
          console.warn('[newsletter] Envíos fallidos:', sendResult.failed.map((f) => `${f.email}: ${f.error}`).join('; '));
        }
      } else {
        status = 'error-envio';
        message = `No se pudo enviar a ningún suscriptor. ${sendResult.error || ''}`;
        console.error('[newsletter] Todos los envíos fallaron:', sendResult.failed);
      }
    }

    cfg.lastRunAt = nowIso;
    cfg.lastContentHash = snapshot.contentHash;
    cfg.lastCarrerasSnapshot = snapshot.carreras;
    appendNewsletterDispatchLog({
      scheduledFor,
      status,
      changesDetected: true,
      recipientsTotal,
      sentCount,
      message,
    });
    await saveDB();
  } catch (err) {
    console.error('[newsletter] Error en digest semanal:', err);
  } finally {
    newsletterDigestInFlight = false;
  }
}

/**
 * Envío manual del digest desde el cPanel (ROOT).
 * Ventana: lunes 00:00:00 hora Argentina (UTC-3) de la semana actual → ahora.
 * No requiere cfg.enabled; sí respeta newsletterDigestInFlight.
 * @returns {Promise<{sentCount,failCount,recipientsTotal,diffTotal,sections,status,message}>}
 */
async function sendManualNewsletterDigest() {
  if (!dbReady) throw new Error('El store aún no está listo.');
  if (newsletterDigestInFlight) throw Object.assign(new Error('Ya hay un envío en curso. Intentá en un momento.'), { code: 'IN_FLIGHT' });

  newsletterDigestInFlight = true;
  try {
    const now = new Date();
    const cfg = ensureNewsletterState();
    const windowStart = getWeekStartArgentinaUtc(now);
    const windowEnd = now;

    const snapshot = buildNewsletterDigestSnapshot();
    const lastCarreras = Array.isArray(cfg.lastCarrerasSnapshot) ? cfg.lastCarrerasSnapshot : null;
    const recipients = (db.newsletterSubscriptions || []).filter((s) => s && s.activo !== false && isValidEmail(s.email));
    const recipientsTotal = recipients.length;

    const diff = buildNewsletterDiff(snapshot.carreras, lastCarreras, windowStart, windowEnd);
    const diffSummary = [
      diff.nueva.length && `${diff.nueva.length} nueva(s)`,
      diff.inscripcionAbierta.length && `${diff.inscripcionAbierta.length} inscripción abierta`,
      diff.proximamente.length && `${diff.proximamente.length} próximamente`,
      diff.cierreProximo.length && `${diff.cierreProximo.length} cierre próximo`,
      diff.cierreReciente.length && `${diff.cierreReciente.length} cierre reciente`,
      diff.actualizadas.length && `${diff.actualizadas.length} actualizada(s)`,
    ].filter(Boolean).join(', ') || 'sin cambios';

    const nowIso = now.toISOString();
    let sentCount = 0;
    let failCount = 0;
    let status = 'manual-pendiente-configuracion';
    let message = `Envío manual: ${diff.total} propuesta(s) (${diffSummary}). Sin SMTP configurado.`;

    if (diff.total === 0) {
      status = 'manual-sin-novedades';
      message = 'Envío manual: sin novedades en la ventana. No se enviaron correos.';
    } else if (recipientsTotal === 0) {
      status = 'manual-sin-destinatarios';
      message = `Envío manual: ${diff.total} propuesta(s) (${diffSummary}). Sin suscriptores activos.`;
    } else if (hasNewsletterMailConfig()) {
      const siteUrl = String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
      const emails = recipients.map((s) => String(s.email || '').trim().toLowerCase()).filter(Boolean);
      const sendResult = await sendNewsletterDigest(emails, diff, siteUrl);
      sentCount = sendResult.sentCount;
      failCount = sendResult.failed ? sendResult.failed.length : 0;

      if (sentCount > 0) {
        cfg.lastSentAt = nowIso;
        const sentSet = new Set(sendResult.sentEmails || []);
        db.newsletterSubscriptions.forEach((s, i) => {
          if (sentSet.has(String(s.email || '').trim().toLowerCase())) {
            db.newsletterSubscriptions[i] = { ...s, ultimoEnvio: nowIso };
          }
        });
      }

      if (sendResult.error && sentCount === 0) {
        status = 'manual-error-envio';
        message = `Envío manual fallido: ${sendResult.error}`;
      } else if (sentCount === recipientsTotal) {
        status = 'manual-enviado';
        message = `Envío manual a ${sentCount} suscriptor(es). Cambios: ${diffSummary}.`;
      } else {
        status = 'manual-enviado-parcial';
        message = `Envío manual a ${sentCount}/${recipientsTotal} suscriptor(es) (${failCount} error(es)). Cambios: ${diffSummary}.`;
        if (sendResult.failed?.length) {
          console.warn('[newsletter][manual] Envíos fallidos:', sendResult.failed.map((f) => `${f.email}: ${f.error}`).join('; '));
        }
      }
    }

    cfg.lastRunAt = nowIso;
    cfg.lastContentHash = snapshot.contentHash;
    cfg.lastCarrerasSnapshot = snapshot.carreras;
    appendNewsletterDispatchLog({
      scheduledFor: now,
      status,
      changesDetected: diff.total > 0,
      recipientsTotal,
      sentCount,
      message,
    });
    await saveDB();

    return {
      sentCount,
      failCount,
      recipientsTotal,
      diffTotal: diff.total,
      sections: {
        nueva: diff.nueva.length,
        inscripcionAbierta: diff.inscripcionAbierta.length,
        proximamente: diff.proximamente.length,
        cierreProximo: diff.cierreProximo.length,
        cierreReciente: diff.cierreReciente.length,
        actualizadas: diff.actualizadas.length,
      },
      status,
      message,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    };
  } finally {
    newsletterDigestInFlight = false;
  }
}

function handleFilters(res) {
  const all = (db.carreras||[]).map(enrichCarrera);
  return jsonResponse(res,{
    tipos:          ['Pregrado','Grado','Posgrado','Curso'],
    subtipos:       ['Especialización','Maestría','Doctorado'],
    disciplinas:    ALLOWED_DISCIPLINAS,
    modalidades:    [...new Set(all.map(c=>c.modalidad).filter(Boolean))].sort(),
    unidadesAcademicas: db.unidadesAcademicas||[],
    regionales:     db.regionales||[],
  });
}

// ── Public access check ──────────────────────────────────
function isPublicAccessMode() {
  return db.config?.acceso_publico !== false; // default: open
}
function isSiteUnderConstruction() {
  return db.config?.sitio_en_construccion === true;
}
function constructionImageUrl() {
  return db.config?.imagen_construccion || '/public/site-under-construction.svg';
}

function checkPublicAccess(req, pathname) {
  // Admin routes: never affected by public access mode
  if (pathname.startsWith('/admin')) return true;
  if (pathname.startsWith('/api/auth')) return true;
  if (pathname === '/api/health') return true;

  // Public API: check mode
  if (pathname.startsWith('/api/')) {
    if (isPublicAccessMode()) return true;
    // Restricted mode: check Authorization header
    const { requireAuth } = require('./admin/auth');
    const authResult = requireAuth(req);
    return authResult.ok;
  }

  // Static files: always allowed (login page needs CSS/JS)
  return true;
}

// ── Router ────────────────────────────────────────────────
async function router(req, res) {
  await initPromise;
  if (!dbReady) return jsonResponse(res, { error: 'Storage no inicializado' }, 500);
  if (maybeRedirectToHttps(req, res)) return;
  const cl = parseInt(req.headers['content-length'] || '0', 10);
  if (Number.isFinite(cl) && cl > MAX_REQUEST_BYTES) {
    return jsonResponse(res, { error: 'Request demasiado grande (HTTP 413).' }, 413);
  }
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const params   = new URLSearchParams(parsed.query);
  const segments = pathname.split('/').filter(Boolean);
  if (req.method==='OPTIONS') {
    res.writeHead(204,{
      ...securityHeaders('text/plain; charset=utf-8'),
    });
    return res.end();
  }

  if (pathname==='/api/health') {
    return jsonResponse(res,{status:'OK',env:NODE_ENV,timestamp:new Date().toISOString(),carreras:(db.carreras||[]).length});
  }

  // Public site access mode (for frontend to know if login required)
  if (pathname==='/api/access-mode') {
    return jsonResponse(res,{
      open: isPublicAccessMode(),
      siteUnderConstruction: isSiteUnderConstruction(),
      constructionImage: constructionImageUrl(),
      googleClientId: GOOGLE_CLIENT_ID || null,
      restrictedAccess: !isPublicAccessMode(),
    });
  }

  // Enforce public access mode on API routes
  if (pathname.startsWith('/api/') && !isPublicAccessMode()) {
    const { requireAuth } = require('./admin/auth');
    const authResult = requireAuth(req);
    if (!authResult.ok) {
      return jsonResponse(res,{error:'Acceso restringido. Autenticación requerida.',restricted:true},401);
    }
  }

  // CPanel
  if (pathname==='/cpanel'||pathname==='/cpanel/'||pathname==='/admin'||pathname==='/admin/') {
    try {
      const html=fs.readFileSync(path.join(FRONTEND_DIR,'cpanel.html'));
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      return res.end(html);
    } catch { res.writeHead(404); return res.end('CPanel no encontrado'); }
  }
  if ((pathname.startsWith('/admin/api') || pathname.startsWith('/cpanel/api'))
    && (req.method === 'DELETE' || req.method === 'POST' || req.method === 'PATCH')) {
    const handled = await handleAdminInterestedCompat(req, res, pathname, params);
    if (handled) return;
  }
  if (pathname.startsWith('/admin/api')) {
    try {
      return await adminRouter.handleAdminAPI(req,res,pathname,params,jsonResponse,readBody);
    } catch (err) {
      console.error('[admin/api] Unhandled error:', err);
      if (err?.code === 'ECONNREFUSED' && String(err?.address || '') === '127.0.0.1' && Number(err?.port) === 5433) {
        return jsonResponse(res,{error:'PostgreSQL local no disponible (127.0.0.1:5433). Iniciá el contenedor ead-postgres y reintentá.'},503);
      }
      return jsonResponse(res,{error:'Error interno del servidor (admin).'},500);
    }
  }
  if (pathname.startsWith('/cpanel/api')) {
    const rewrittenPath = pathname.replace('/cpanel/api', '/admin/api');
    try {
      return await adminRouter.handleAdminAPI(req,res,rewrittenPath,params,jsonResponse,readBody);
    } catch (err) {
      console.error('[cpanel/api] Unhandled error:', err);
      if (err?.code === 'ECONNREFUSED' && String(err?.address || '') === '127.0.0.1' && Number(err?.port) === 5433) {
        return jsonResponse(res,{error:'PostgreSQL local no disponible (127.0.0.1:5433). Iniciá el contenedor ead-postgres y reintentá.'},503);
      }
      return jsonResponse(res,{error:'Error interno del servidor (cpanel).'},500);
    }
  }

  // Public auth
  if (pathname.startsWith('/api/auth')) return handlePublicAuth(req,res,pathname);

  // Audit log (root only — served as static file read)
  if (pathname === '/api/admin/audit') {
    const { requireAuth } = require('./admin/auth');
    const auth = requireAuth(req);
    if (!auth.ok || auth.user.rol !== 'root') return jsonResponse(res,{error:'Solo root'},403);
    return jsonResponse(res,{logs: db.auditLog||[]});
  }

  // Public careers API
  if (pathname === '/api/newsletter/subscribe' && req.method === 'POST') {
    return handleNewsletterSubscribe(req, res);
  }
  if (pathname==='/api/careers/featured') return handleFeatured(res);
  if (pathname==='/api/careers/filters')  return handleFilters(res);
  if (pathname.startsWith('/api/careers')) {
    const sub=segments[2];
    if (sub && !isNaN(parseInt(sub)) && segments[3] === 'interesados' && req.method === 'POST') {
      return handleCreateInterested(req, res, sub);
    }
    if (sub&&!isNaN(parseInt(sub))) {
      const career=(db.carreras||[]).find(c=>c.id===parseInt(sub));
      if (!career) return jsonResponse(res,{error:'No encontrada'},404);
      return jsonResponse(res,enrichCarrera(career));
    }
    return handleSearch(res,params);
  }

  // Block direct access to html files
  if (pathname.includes('admin.html')||pathname.includes('cpanel.html')) { res.writeHead(404); return res.end('Not found'); }

  const staticPath = resolveStaticPath(pathname);
  if (!staticPath) return jsonResponse(res, { error: 'Ruta inválida' }, 403);
  serveStatic(res, staticPath);
}

const server = http.createServer({ maxHeaderSize: 16 * 1024 }, router);
server.requestTimeout = 30 * 1000;
server.headersTimeout = 35 * 1000;
server.keepAliveTimeout = 5 * 1000;
const newsletterTimer = setInterval(() => {
  runWeeklyNewsletterDigestIfNeeded().catch((err) => {
    console.error('[newsletter] Tick error:', err);
  });
}, NEWSLETTER_TICK_MS);
newsletterTimer.unref?.();
initPromise
  .then(() => runWeeklyNewsletterDigestIfNeeded())
  .catch((err) => console.error('[newsletter] Init error:', err));

server.listen(PORT,'0.0.0.0',()=>{
  console.log(`\nEAD — Educación a Distancia [${NODE_ENV}] → http://localhost:${PORT}`);
  console.log(`HTTPS requerido: ${REQUIRE_HTTPS ? 'sí' : 'no'}`);
  console.log(`Storage mode: ${stateRepo.getMode()}`);
  console.log(`Propuestas: ${(db.carreras||[]).length} registros`);
  console.log(`CPanel: http://localhost:${PORT}/cpanel`);
  const authCfg = require('./admin/auth');
  console.log(`Root login: ${authCfg.ROOT_LOGIN}`);
  console.log(`Root email: ${authCfg.ROOT_EMAIL}\n`);
});
process.on('SIGTERM',()=>{ clearInterval(newsletterTimer); server.close(async ()=>{ await stateRepo.close(); process.exit(0); }); });
process.on('SIGINT', ()=>{ clearInterval(newsletterTimer); server.close(async ()=>{ await stateRepo.close(); process.exit(0); }); });
module.exports = server;
