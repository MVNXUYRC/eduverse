/**
 * UNaM — Admin API Router v6
 * Docs múltiples (tipo+organismo+numero+anio+pdf)
 * Carreras interinstitucionales (múltiples unidades)
 * Programa como texto (WYSIWYG)
 * activo → visibility with "Propuesta finalizada" label
 */
const fs   = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const {
  ROOT_EMAIL, ROOT_LOGIN, ROLES, CAN_CREATE, EAD_UNIT,
  signJWT, requireAuth, requireRole,
  isActiveState, normalizeState,
  toProperCase, resolveLogin, normalizeLogin, publicAdminIdentity, maskRootEmailInText,
  formatPhone, formatDNI, hashPassword, verifyPasswordHash, isLegacyPasswordHash,
  validateEmail, validateDNI, validatePassword, generatePassword, validateLogin,
} = require('./auth');
const { buildBackupPayload, applyBackupPayload } = require('./backup-utils');
const { sendInterestedNotification, hasMailConfig } = require('./mailer');
const { ALLOWED_DISCIPLINAS, UNIDAD_REGIONAL_MAP } = require('../domain/constants');
const { sanitizeText, sanitizeUrl, sanitizeRichHtml } = require('../domain/security');
const DEFAULT_CONSTRUCTION_IMAGE = '/public/site-under-construction.svg';
const MAX_UPLOAD_MB = Number.parseInt(String(process.env.ADMIN_MAX_UPLOAD_MB || ''), 10);
const MAX_REQUEST_MB = Number.parseInt(String(process.env.ADMIN_MAX_REQUEST_MB || ''), 10);
const MAX_UPLOAD_BYTES = (Number.isFinite(MAX_UPLOAD_MB) && MAX_UPLOAD_MB > 0 ? MAX_UPLOAD_MB : 20) * 1024 * 1024;
const MAX_REQUEST_BYTES = (Number.isFinite(MAX_REQUEST_MB) && MAX_REQUEST_MB > 0 ? MAX_REQUEST_MB : 50) * 1024 * 1024;
const MAX_UPLOAD_MB_EFFECTIVE = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
const ROOT_PASSWORD = String(process.env.ROOT_PASSWORD || '');
const ALLOW_LOCAL_PASSWORDLESS_ROOT = process.env.NODE_ENV !== 'production'
  && String(process.env.ALLOW_LOCAL_PASSWORDLESS_ROOT || '').trim().toLowerCase() === 'true';
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const loginAttempts = new Map();

const UPLOADS_DIR = path.join(__dirname, '../../frontend/uploads');
const CHUNK_UPLOAD_DIR = path.join(process.env.TMPDIR || '/tmp', 'ead-upload-chunks');
const MAX_CHUNK_MB = Number.parseInt(String(process.env.ADMIN_MAX_CHUNK_MB || ''), 10);
const MAX_CHUNK_BYTES = (Number.isFinite(MAX_CHUNK_MB) && MAX_CHUNK_MB > 0 ? MAX_CHUNK_MB : 6) * 1024 * 1024;

let _db, _save, _sendManualDigest, _getManualDigestPreview;
function init(db, save, helpers) {
  _db = db;
  if (typeof save === 'function') _save = save;
  if (helpers && typeof helpers.sendManualDigest === 'function') _sendManualDigest = helpers.sendManualDigest;
  if (helpers && typeof helpers.getManualDigestPreview === 'function') _getManualDigestPreview = helpers.getManualDigestPreview;
}
// Called after server reloads db, without replacing save function
function updateDb(db) { _db = db; }

// Audit log helper
function audit(action, entity, detail, user) {
  if (!db().auditLog) db().auditLog = [];
  db().auditLog.unshift({
    ts: new Date().toISOString(),
    action, entity, detail,
    user: publicAdminIdentity(user),
    rol: user?.rol || '?',
  });
  // Keep last 500 entries
  if (db().auditLog.length > 500) db().auditLog = db().auditLog.slice(0,500);
}
function normalizeRootAuditLabel(value) {
  const masked = maskRootEmailInText(value);
  return String(masked || '').split(ROOT_LOGIN).join('root');
}
function securityEvent(action, detail, req, user = null) {
  const ip = getClientIp(req);
  const actor = user ? publicAdminIdentity(user) : 'anon';
  console.warn(`[security] ${action} ip=${ip} actor=${actor} detail=${detail}`);
}
function db()   { return _db; }
async function save() {
  if (typeof _save === 'function') await _save();
  else console.error('[router] save() called but no save function registered!');
}

function nextId(arr) {
  return (arr||[]).length > 0 ? Math.max(...arr.map(x=>x.id||0))+1 : 1;
}

function canonicalEmail(email) {
  const raw = String(email || '').trim().toLowerCase();
  const [localPart, domainPart] = raw.split('@');
  if (!localPart || !domainPart) return raw;
  if (domainPart === 'gmail.com' || domainPart === 'googlemail.com') {
    const local = localPart.split('+')[0].replace(/\./g, '');
    return `${local}@gmail.com`;
  }
  return `${localPart}@${domainPart}`;
}

function canonicalLogin(login) {
  return normalizeLogin(login);
}

function rootMatchesUser(user) {
  if (!user) return false;
  return canonicalEmail(user.email) === canonicalEmail(ROOT_EMAIL)
    || canonicalLogin(user.login) === canonicalLogin(ROOT_LOGIN);
}

function canManageUser(actor, targetUser) {
  if (!actor || !targetUser) return false;
  if (actor.rol === ROLES.ROOT) return true;
  if (actor.rol === ROLES.INSTITUCIONAL) return targetUser.rol === ROLES.UNIDADES;
  return false;
}

function ensureUserLogin(user) {
  if (!user || typeof user !== 'object') return user;
  const nextLogin = resolveLogin(user.login, user.email);
  if (user.login !== nextLogin) user.login = nextLogin;
  return user;
}

function getRootUser() {
  return {
    id: 'root',
    login: ROOT_LOGIN,
    email: ROOT_EMAIL,
    nombre: 'Administrador',
    apellido: 'Root',
    rol: ROLES.ROOT,
    unidades: db().unidadesAcademicas || [],
  };
}

function isPdfBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 5) return false;
  const head = buf.slice(0, 1024).toString('latin1');
  return head.includes('%PDF-');
}

function findInvalidUpload(body) {
  if (!body || typeof body !== 'object') return null;
  for (const [field, part] of Object.entries(body)) {
    if (!part || !part.filename || !Buffer.isBuffer(part.data)) continue;
    const filename = String(part.filename || '');
    const extOk = /\.pdf$/i.test(filename);
    const mime = String(part.contentType || '').toLowerCase();
    const mimeOk = !mime || mime === 'application/pdf' || mime.includes('pdf');
    const magicOk = isPdfBuffer(part.data);
    if (!extOk || !mimeOk || !magicOk) {
      return { field, filename, reason: 'Solo se permiten archivos PDF válidos.' };
    }
  }
  return null;
}

function getClientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

function getLoginKey(emailKey, ip) {
  return `${emailKey}|${ip}`;
}

function getAttemptInfo(key) {
  const now = Date.now();
  const info = loginAttempts.get(key);
  if (!info) return { attempts: 0, lockedUntil: 0 };
  if (info.lockedUntil && info.lockedUntil < now) {
    loginAttempts.delete(key);
    return { attempts: 0, lockedUntil: 0 };
  }
  return info;
}

function registerLoginFailure(key) {
  const now = Date.now();
  const current = getAttemptInfo(key);
  const nextAttempts = (current.attempts || 0) + 1;
  const next = { attempts: nextAttempts, lockedUntil: 0 };
  if (nextAttempts >= MAX_LOGIN_ATTEMPTS) {
    next.lockedUntil = now + LOGIN_LOCK_MS;
  }
  loginAttempts.set(key, next);
  return next;
}

function clearLoginAttempts(key) {
  loginAttempts.delete(key);
}

function ensureConfig() {
  if (!db().config || typeof db().config !== 'object') db().config = {};
  return db().config;
}

function getRootPasswordHash() {
  return String(db().config?.root_password_hash || '');
}

function verifyRootPassword(password) {
  const storedHash = getRootPasswordHash();
  if (storedHash) return verifyPasswordHash(password, storedHash);
  if (!ROOT_PASSWORD) return null;
  return password === ROOT_PASSWORD;
}

async function handlePlatformReset(req, body) {
  const auth = requireRole(req, ROLES.ROOT);
  if (!auth.ok) return { status: auth.status, data: { error: auth.error } };
  if (auth.user.rol !== ROLES.ROOT) return { status: 403, data: { error: 'Solo root puede realizar esta acción' } };

  const password = String(body?.password || '').trim();
  if (!password) return { status: 400, data: { error: 'Debés ingresar la contraseña root para confirmar.' } };

  const resetCarreras = body?.resetCarreras === true;
  const resetUsuarios = body?.resetUsuarios === true;
  const resetLogs = body?.resetLogs === true;
  if (!resetCarreras && !resetUsuarios && !resetLogs) {
    return { status: 400, data: { error: 'Seleccioná al menos un tipo de dato para borrar.' } };
  }

  const rootPasswordValid = verifyRootPassword(password);
  if (rootPasswordValid === null) return { status: 500, data: { error: 'ROOT_PASSWORD no configurada en el servidor.' } };
  if (!rootPasswordValid) {
    securityEvent('PLATFORM_RESET_DENIED', 'Contraseña root inválida', req, auth.user);
    return { status: 401, data: { error: 'Contraseña root inválida.' } };
  }

  const carrerasPrevias = resetCarreras ? (db().carreras || []).length : 0;
  const contactosPrevios = resetCarreras ? (db().interesados || []).length : 0;
  const usuariosPrevios = resetUsuarios ? (db().usuarios || []).length : 0;
  const logsPrevios = resetLogs ? (db().auditLog || []).length : 0;
  const config = ensureConfig();

  if (resetCarreras) {
    db().carreras = [];
    db().interesados = [];
  }
  if (resetUsuarios) db().usuarios = [];
  if (resetLogs) db().auditLog = [];
  config.platform_reset_at = new Date().toISOString();
  config.platform_reset_by = publicAdminIdentity(auth.user);
  config.platform_reset_summary = {
    carrerasEliminadas: carrerasPrevias,
    contactosEliminados: contactosPrevios,
    usuariosEliminados: usuariosPrevios,
    logsEliminados: logsPrevios,
    resetCarreras,
    resetUsuarios,
    resetLogs,
  };
  const resetAuditDetail = `carreras: ${carrerasPrevias}, contactos: ${contactosPrevios}, logs: ${logsPrevios}`;
  audit('ELIMINAR_DATOS', 'config', resetAuditDetail, auth.user);
  securityEvent('PLATFORM_RESET', resetAuditDetail, req, auth.user);

  await save();
  return {
    status: 200,
    data: {
      success: true,
      carrerasEliminadas: carrerasPrevias,
      contactosEliminados: contactosPrevios,
      usuariosEliminados: usuariosPrevios,
      logsEliminados: logsPrevios,
    },
  };
}

// Carrera tiene unidadesAcademicas[] (array) — soporte interinstitucional
function canManageCarrera(user, unidades) {
  if (user.rol===ROLES.ROOT||user.rol===ROLES.INSTITUCIONAL) return true;
  const uArr = Array.isArray(unidades) ? unidades : [unidades];
  return uArr.some(u => (user.unidades||[]).includes(u));
}
function boolFromBody(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  return ['true', '1', 'si', 'yes', 'on'].includes(normalized);
}
function applyProximamenteRules(carrera, previous = null) {
  if (!carrera) return carrera;
  const wasInitialProximamente = carrera.proximamenteInicial === true
    || previous?.proximamenteInicial === true;
  if (wasInitialProximamente) carrera.proximamenteInicial = true;

  if (carrera.proximamente === true) {
    carrera.inscripcionAbierta = normalizeState({ valor: false, fechaHasta: null });
    carrera.activo = normalizeState({ valor: false, fechaHasta: null });
    carrera.nueva = false;
    return carrera;
  }

  const transitionedFromProximamente = previous?.proximamente === true && carrera.proximamente !== true;
  if (transitionedFromProximamente && carrera.proximamenteInicial === true) {
    carrera.nueva = true;
    carrera.activo = normalizeState({ valor: true, fechaHasta: null });
    carrera.inscripcionAbierta = normalizeState({ valor: true, fechaHasta: null });
  }
  return carrera;
}
function visibleUnitsForUser(user) {
  if (!user) return [];
  if (user.rol === ROLES.ROOT || user.rol === ROLES.INSTITUCIONAL) return db().unidadesAcademicas || [];
  return user.unidades || [];
}

function safeUser(u) {
  if (!u) return null;
  ensureUserLogin(u);
  const {passwordHash,...r} = u;
  return r;
}

// ── Multipart parser ──────────────────────────────────────
function parseMultipart(body, boundary) {
  const parts = {}, sep = Buffer.from('--' + boundary);
  let start = 0;
  while (start < body.length) {
    const idx = body.indexOf(sep, start);
    if (idx === -1) break;
    const ps = idx + sep.length;
    if (body[ps]===45 && body[ps+1]===45) break;
    const he = body.indexOf(Buffer.from('\r\n\r\n'), ps);
    if (he === -1) break;
    const hs = body.slice(ps+2, he).toString();
    const ns = body.indexOf(sep, he+4);
    const de = ns === -1 ? body.length : ns - 2;
    const data = body.slice(he+4, de);
    const nm = hs.match(/name="([^"]+)"/);
    const fm = hs.match(/filename="([^"]+)"/);
    const ct = (hs.match(/Content-Type:\s*(.+)/i)||[])[1]?.trim();
    if (nm) {
      const n = nm[1];
      parts[n] = fm ? {filename:fm[1],data,contentType:ct||'application/octet-stream'} : data.toString();
    }
    start = ns === -1 ? body.length : ns;
  }
  return parts;
}
function readBodyRaw(req) {
  return new Promise((resolve,reject)=>{
    const c=[]; let size = 0;
    req.on('data',(ch)=>{
      size += ch.length;
      if (size > MAX_REQUEST_BYTES) {
        reject({ status: 413, message: 'El contenido a guardar es demasiado grande (HTTP 413).' });
        req.destroy();
        return;
      }
      c.push(ch);
    });
    req.on('end',()=>resolve(Buffer.concat(c)));
    req.on('error',reject);
  });
}
async function parseRequest(req) {
  const ct = req.headers['content-type']||'';
  const raw = await readBodyRaw(req);
  if (ct.includes('multipart/form-data')) {
    const bm = ct.match(/boundary=([^;\s]+)/);
    if (!bm) return {};
    // Remove surrounding quotes if present
    const boundary = bm[1].replace(/^["']|["']$/g, '');
    return parseMultipart(raw, boundary);
  }
  try { return JSON.parse(raw.toString()); } catch { return {}; }
}
function readRawWithLimit(req, maxBytes, limitMessage) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (ch) => {
      size += ch.length;
      if (size > maxBytes) {
        reject({ status: 413, message: limitMessage });
        req.destroy();
        return;
      }
      chunks.push(ch);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function handleChunkUpload(req, params) {
  const auth = requireRole(req, ROLES.UNIDADES);
  if (!auth.ok) return { status: auth.status, data: { error: auth.error } };

  const uploadId = sanitizeText(params.get('uploadId'), 120);
  const target = sanitizeText(params.get('target'), 20);
  const filename = sanitizeText(params.get('filename'), 220) || 'archivo.pdf';
  const careerId = Number.parseInt(String(params.get('careerId') || ''), 10);
  const docIndex = Number.parseInt(String(params.get('docIndex') || ''), 10);
  const chunkIndex = Number.parseInt(String(params.get('chunkIndex') || ''), 10);
  const totalChunks = Number.parseInt(String(params.get('totalChunks') || ''), 10);
  const finalize = String(params.get('finalize') || '').toLowerCase() === 'true';

  if (!uploadId || !careerId || !Number.isFinite(chunkIndex) || !Number.isFinite(totalChunks) || totalChunks <= 0) {
    return { status: 400, data: { error: 'Parámetros de chunk inválidos.' } };
  }
  if (target !== 'plan' && target !== 'doc') {
    return { status: 400, data: { error: 'Target de chunk inválido.' } };
  }
  if (target === 'doc' && (!Number.isFinite(docIndex) || docIndex < 0)) {
    return { status: 400, data: { error: 'Índice de documento inválido.' } };
  }

  const idx = (db().carreras || []).findIndex((c) => c.id === careerId);
  if (idx === -1) return { status: 404, data: { error: 'Carrera no encontrada' } };
  const existing = db().carreras[idx];
  if (!canManageCarrera(auth.user, existing.unidadesAcademicas || [existing.unidadAcademica])) {
    return { status: 403, data: { error: 'Sin permiso para esta carrera' } };
  }

  let chunkData;
  try {
    chunkData = await readRawWithLimit(req, MAX_CHUNK_BYTES, `Chunk demasiado grande (máximo ${Math.round(MAX_CHUNK_BYTES / (1024 * 1024))} MB).`);
  } catch (e) {
    return { status: e.status || 400, data: { error: e.message || 'No se pudo leer el chunk.' } };
  }
  if (!chunkData || !chunkData.length) return { status: 400, data: { error: 'Chunk vacío.' } };

  const uploadDir = path.join(CHUNK_UPLOAD_DIR, uploadId);
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, `${chunkIndex}.part`), chunkData);

  if (!finalize) {
    return { status: 200, data: { success: true, chunkIndex, totalChunks } };
  }

  const orderedParts = [];
  for (let i = 0; i < totalChunks; i += 1) {
    const partPath = path.join(uploadDir, `${i}.part`);
    if (!fs.existsSync(partPath)) {
      return { status: 400, data: { error: `Falta chunk ${i + 1}/${totalChunks}.` } };
    }
    orderedParts.push(fs.readFileSync(partPath));
  }
  const merged = Buffer.concat(orderedParts);
  if (!isPdfBuffer(merged) || !/\.pdf$/i.test(filename)) {
    fs.rmSync(uploadDir, { recursive: true, force: true });
    return { status: 400, data: { error: 'Solo se permiten archivos PDF válidos.' } };
  }
  if (merged.length > MAX_UPLOAD_BYTES) {
    fs.rmSync(uploadDir, { recursive: true, force: true });
    return { status: 413, data: { error: `El archivo "${filename}" supera el máximo de ${MAX_UPLOAD_MB_EFFECTIVE} MB por archivo.` } };
  }

  if (!Array.isArray(existing.documentos)) existing.documentos = [];
  if (target === 'plan') {
    existing.planEstudiosPDF = saveFile(merged, 'planes', filename);
  } else {
    while (existing.documentos.length <= docIndex) {
      existing.documentos.push({ tipo: '', organismo: '', numero: '', anio: '', pdf: null });
    }
    existing.documentos[docIndex] = {
      ...existing.documentos[docIndex],
      pdf: saveFile(merged, 'resoluciones', filename),
    };
  }

  existing.modificadoPor = publicAdminIdentity(auth.user);
  existing.modificadoEn = new Date().toISOString();
  audit('EDITAR', 'carrera', existing.nombre, auth.user);
  await save();
  fs.rmSync(uploadDir, { recursive: true, force: true });
  return { status: 200, data: { success: true, carrera: existing } };
}
function saveFile(fileData, subdir, filename) {
  const dir = path.join(UPLOADS_DIR, subdir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});
  const safe = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  fs.writeFileSync(path.join(dir, safe), fileData);
  return `/uploads/${subdir}/${safe}`;
}
function parseTags(val) {
  if (Array.isArray(val)) return val;
  if (typeof val==='string') {
    try { const p=JSON.parse(val); if(Array.isArray(p))return p; } catch {}
    return val.split(',').map(s=>s.trim()).filter(Boolean);
  }
  return [];
}
function findOversizedUpload(body) {
  if (!body || typeof body !== 'object') return null;
  for (const [field, part] of Object.entries(body)) {
    if (!part || !part.filename || !Buffer.isBuffer(part.data)) continue;
    if (part.data.length > MAX_UPLOAD_BYTES) {
      return { field, filename: part.filename, size: part.data.length };
    }
  }
  return null;
}

// ── AUTH ──────────────────────────────────────────────────
async function handleLogin(req, body) {
  const rawIdentifier = String(body.identifier || body.login || body.email || '').trim();
  const password = String(body.password || '');
  if (!rawIdentifier) return { status: 400, data: { error: 'Usuario/correo obligatorio.' } };

  const identifier = rawIdentifier.toLowerCase();
  const emailKey = canonicalEmail(identifier);
  const loginKey = canonicalLogin(identifier);
  const passwordlessRootLogin = ALLOW_LOCAL_PASSWORDLESS_ROOT
    && !password
    && loginKey === canonicalLogin(ROOT_LOGIN);
  if (!password && !passwordlessRootLogin) {
    return { status: 400, data: { error: 'Contraseña obligatoria.' } };
  }
  const ip = getClientIp(req);
  const attemptKey = getLoginKey(loginKey || emailKey, ip);
  const attempts = getAttemptInfo(attemptKey);
  if (attempts.lockedUntil && attempts.lockedUntil > Date.now()) {
    const mins = Math.max(1, Math.ceil((attempts.lockedUntil - Date.now()) / 60000));
    securityEvent('LOGIN_LOCKED', `identifier=${loginKey || emailKey}`, req);
    return { status: 429, data: { error: `Demasiados intentos fallidos. Reintentá en ${mins} minuto(s).` } };
  }

  if (loginKey === canonicalLogin(ROOT_LOGIN)) {
    if (passwordlessRootLogin) {
      clearLoginAttempts(attemptKey);
      const rootUser = getRootUser();
      const token = signJWT(rootUser);
      audit('LOGIN', 'sesion', `Acceso local sin contraseña desde IP ${ip}`, rootUser);
      await save();
      return { status: 200, data: { token, rol: ROLES.ROOT, nombre: 'Administrador Root', login: ROOT_LOGIN } };
    }
    const rootPasswordValid = verifyRootPassword(password);
    if (rootPasswordValid === null) {
      return { status: 500, data: { error: 'ROOT_PASSWORD no configurada en el servidor.' } };
    }
    if (!rootPasswordValid) {
      registerLoginFailure(attemptKey);
      securityEvent('LOGIN_FAILURE_ROOT', `identifier=${loginKey}`, req);
      return { status: 401, data: { error: 'Credenciales inválidas.' } };
    }
    clearLoginAttempts(attemptKey);
    const config = ensureConfig();
    if (!getRootPasswordHash()) {
      config.root_password_hash = hashPassword(password);
      config.root_password_changed_at = new Date().toISOString();
      config.root_password_changed_by = 'auto-rotation-on-login';
    }
    const rootUser = getRootUser();
    const token = signJWT(rootUser);
    audit('LOGIN', 'sesion', `Acceso al panel desde IP ${ip}`, rootUser);
    await save();
    return {status:200,data:{token,rol:ROLES.ROOT,nombre:'Administrador Root',login:ROOT_LOGIN}};
  }

  const user = (db().usuarios || [])
    .map(ensureUserLogin)
    .find((u) => canonicalLogin(u.login) === loginKey || canonicalEmail(u.email) === emailKey);
  if (!user || user.activo===false || !user.passwordHash) {
    registerLoginFailure(attemptKey);
    securityEvent('LOGIN_FAILURE_UNKNOWN', `identifier=${loginKey || emailKey}`, req);
    return {status:401,data:{error:'Credenciales inválidas.'}};
  }
  if (!verifyPasswordHash(password, user.passwordHash)) {
    registerLoginFailure(attemptKey);
    securityEvent('LOGIN_FAILURE_BAD_PASSWORD', `identifier=${user.login || user.email}`, req, user);
    return {status:401,data:{error:'Credenciales inválidas.'}};
  }

  clearLoginAttempts(attemptKey);
  const token = signJWT({id:user.id,login:user.login,email:user.email,nombre:user.nombre,apellido:user.apellido,rol:user.rol,unidades:user.unidades||[]});
  const idx = db().usuarios.findIndex(u=>u.id===user.id);
  audit('LOGIN', 'sesion', `Acceso al panel desde IP ${ip}`, user);
  if (idx!==-1) {
    db().usuarios[idx].ultimoAcceso=new Date().toISOString();
    if (isLegacyPasswordHash(user.passwordHash)) {
      db().usuarios[idx].passwordHash = hashPassword(password);
      db().usuarios[idx].passwordChangedAt = new Date().toISOString();
      db().usuarios[idx].mustChangePassword = false;
      securityEvent('PASSWORD_REHASH', `Migración automática de hash legacy para ${user.login || user.email}`, req, user);
    }
  }
  await save();
  return {status:200,data:{token,rol:user.rol,nombre:`${user.nombre} ${user.apellido}`,login:user.login}};
}

async function handleChangePassword(req, body) {
  const auth = requireAuth(req);
  if (!auth.ok) return {status:auth.status,data:{error:auth.error}};
  const {currentPassword,newPassword} = body;
  if (!currentPassword||!newPassword) return {status:400,data:{error:'Ambas contraseñas son obligatorias'}};
  const err = validatePassword(newPassword);
  if (err) return {status:400,data:{error:err}};
  if (auth.user.rol===ROLES.ROOT) {
    const rootPasswordValid = verifyRootPassword(String(currentPassword));
    if (rootPasswordValid === null) return {status:500,data:{error:'ROOT_PASSWORD no configurada en el servidor.'}};
    if (!rootPasswordValid) return {status:401,data:{error:'Contraseña actual incorrecta'}};
    if (verifyPasswordHash(String(newPassword), getRootPasswordHash())) {
      return {status:400,data:{error:'La nueva contraseña debe ser diferente'}};
    }
    const config = ensureConfig();
    config.root_password_hash = hashPassword(String(newPassword));
    config.root_password_changed_at = new Date().toISOString();
    config.root_password_changed_by = publicAdminIdentity(auth.user);
    await save();
    return {status:200,data:{success:true}};
  }
  const idx = (db().usuarios||[]).findIndex(u=>u.id===auth.user.id);
  if (idx===-1) return {status:404,data:{error:'Usuario no encontrado'}};
  const user = db().usuarios[idx];
  if (!verifyPasswordHash(currentPassword, user.passwordHash)) return {status:401,data:{error:'Contraseña actual incorrecta'}};
  if (verifyPasswordHash(newPassword, user.passwordHash)) return {status:400,data:{error:'La nueva contraseña debe ser diferente'}};
  db().usuarios[idx].passwordHash=hashPassword(newPassword);
  db().usuarios[idx].mustChangePassword=false;
  db().usuarios[idx].passwordChangedAt=new Date().toISOString();
  await save();
  return {status:200,data:{success:true}};
}

// ── USUARIOS ──────────────────────────────────────────────
function handleGetUsuarios(req) {
  const auth = requireRole(req, ROLES.INSTITUCIONAL);
  if (!auth.ok) return {status:auth.status,data:{error:auth.error}};
  let rows = (db().usuarios || []).map(safeUser);
  if (auth.user.rol === ROLES.INSTITUCIONAL) {
    rows = rows.filter((u) => u.rol === ROLES.UNIDADES);
  }
  return {status:200,data:{data:rows,total:rows.length}};
}

async function handleCreateUsuario(req, body) {
  const auth = requireRole(req, ROLES.INSTITUCIONAL);
  if (!auth.ok) return {status:auth.status,data:{error:auth.error}};
  const cr = auth.user;
  const {nombre,apellido,dni,email,telefono,unidades,rol} = body;
  const rawLogin = String(body.login || '').trim();
  const login = rol === ROLES.ROOT ? normalizeLogin(rawLogin) : resolveLogin('', email);
  if (!nombre?.trim())   return {status:400,data:{error:'Nombre obligatorio'}};
  if (!apellido?.trim()) return {status:400,data:{error:'Apellido obligatorio'}};
  if (!dni)              return {status:400,data:{error:'Documento obligatorio'}};
  if (!email)            return {status:400,data:{error:'Correo obligatorio'}};
  if (rol === ROLES.ROOT) {
    const loginErr = validateLogin(login);
    if (loginErr) return {status:400,data:{error:loginErr}};
  } else if (rawLogin) {
    return {status:400,data:{error:'El usuario de acceso solo aplica para el rol root'}};
  }
  if (!telefono?.trim()) return {status:400,data:{error:'Teléfono obligatorio'}};
  if (!rol)              return {status:400,data:{error:'Rol obligatorio'}};
  if (!validateEmail(email))  return {status:400,data:{error:'Formato de correo inválido'}};
  if (!validateDNI(dni))      return {status:400,data:{error:'DNI inválido (7-8 dígitos)'}};
  if (canonicalLogin(login) === canonicalLogin(ROOT_LOGIN)) return {status:409,data:{error:'El usuario de acceso está reservado para root'}};
  if (canonicalEmail(email) === canonicalEmail(ROOT_EMAIL)) return {status:409,data:{error:'El correo está reservado para root'}};
  if (!CAN_CREATE[cr.rol]?.includes(rol)) return {status:403,data:{error:`No podés crear usuarios con rol "${rol}"`}};
  if (rol===ROLES.UNIDADES&&(!unidades||!unidades.length))
    return {status:400,data:{error:'El Administrador de Unidades debe tener al menos una unidad académica asignada'}};
  const dniClean = String(dni).replace(/\D/g,'');
  if ((db().usuarios||[]).find(u=>canonicalEmail(u.email)===canonicalEmail(email)))
    return {status:409,data:{error:'El correo ya está registrado'}};
  if ((db().usuarios||[]).map(ensureUserLogin).find(u=>canonicalLogin(u.login)===canonicalLogin(login)))
    return {status:409,data:{error:'El usuario de acceso ya está registrado'}};
  if ((db().usuarios||[]).find(u=>String(u.dni).replace(/\D/g,'')===dniClean))
    return {status:409,data:{error:'El documento ya está registrado'}};
  const plainPassword = generatePassword();
  const nuevo = {
    id:nextId(db().usuarios||[]),
    login,
    nombre:toProperCase(nombre),apellido:toProperCase(apellido),
    dni:formatDNI(dniClean),email:email.trim(),
    telefono:formatPhone(telefono),rol,unidades:unidades||[],
    activo:true,creadoPor:publicAdminIdentity(cr),creadoEn:new Date().toISOString(),
    ultimoAcceso:null,
    passwordHash:hashPassword(plainPassword),
    mustChangePassword:true,
    passwordChangedAt:null,
  };
  if (!db().usuarios) db().usuarios=[];
  db().usuarios.push(nuevo);
  audit('CREAR', 'usuario', `${nuevo.login} <${nuevo.email}>`, auth.user);
  await save();
  return {status:201,data:{...safeUser(nuevo),generatedPassword:plainPassword}};
}

async function handleUpdateUsuario(req, body, id) {
  const auth = requireRole(req, ROLES.INSTITUCIONAL);
  if (!auth.ok) return {status:auth.status,data:{error:auth.error}};
  const idx = (db().usuarios||[]).findIndex(u=>u.id===parseInt(id));
  if (idx===-1) return {status:404,data:{error:'Usuario no encontrado'}};
  const user = ensureUserLogin(db().usuarios[idx]);
  if (!canManageUser(auth.user, user)) {
    return {status:403,data:{error:'No tenés permisos para modificar este usuario'}};
  }
  if (rootMatchesUser(user)) return {status:403,data:{error:'No se puede modificar al root'}};
  if (body.rol&&body.rol!==user.rol&&auth.user.rol!==ROLES.ROOT) return {status:403,data:{error:'Solo root puede cambiar roles'}};
  const nextRole = body.rol || user.rol;
  if (nextRole !== ROLES.ROOT && body.login !== undefined && String(body.login || '').trim() !== '') {
    return {status:400,data:{error:'El usuario de acceso solo aplica para el rol root'}};
  }
  if (nextRole === ROLES.ROOT && body.login !== undefined) {
    const nextLogin = resolveLogin(body.login, body.email || user.email);
    const loginErr = validateLogin(nextLogin);
    if (loginErr) return {status:400,data:{error:loginErr}};
    if (canonicalLogin(nextLogin) === canonicalLogin(ROOT_LOGIN)) return {status:409,data:{error:'El usuario de acceso está reservado para root'}};
    if ((db().usuarios||[]).map(ensureUserLogin).find(u=>canonicalLogin(u.login)===canonicalLogin(nextLogin)&&u.id!==user.id))
      return {status:409,data:{error:'Usuario de acceso ya registrado'}};
    user.login = nextLogin;
  }
  if (body.email&&body.email.toLowerCase()!==user.email.toLowerCase()) {
    if (!validateEmail(body.email)) return {status:400,data:{error:'Correo inválido'}};
    if (canonicalEmail(body.email) === canonicalEmail(ROOT_EMAIL)) return {status:409,data:{error:'El correo está reservado para root'}};
    if ((db().usuarios||[]).find(u=>canonicalEmail(u.email)===canonicalEmail(body.email)&&u.id!==user.id))
      return {status:409,data:{error:'Correo ya registrado'}};
    if (nextRole !== ROLES.ROOT) user.login = resolveLogin('', body.email);
    if (nextRole === ROLES.ROOT && body.login === undefined) user.login = resolveLogin(user.login, body.email);
  }
  if (body.dni) {
    const dc=String(body.dni).replace(/\D/g,'');
    if (!validateDNI(dc)) return {status:400,data:{error:'DNI inválido'}};
    if ((db().usuarios||[]).find(u=>String(u.dni).replace(/\D/g,'')===dc&&u.id!==user.id))
      return {status:409,data:{error:'Documento ya registrado'}};
    body.dni=formatDNI(dc);
  }
  if (body.nombre)   user.nombre=toProperCase(body.nombre);
  if (body.apellido) user.apellido=toProperCase(body.apellido);
  if (body.dni)      user.dni=body.dni;
  if (body.telefono) user.telefono=formatPhone(body.telefono);
  if (body.email)    user.email=body.email.trim();
  if (body.rol)      user.rol=body.rol;
  if (body.rol && body.rol !== ROLES.ROOT) {
    user.login = resolveLogin('', body.email || user.email);
  }
  if (body.unidades) user.unidades=body.unidades;
  if (body.activo!==undefined) user.activo=body.activo;
  let generatedPassword = null;
  if (body.resetPassword === true) {
    generatedPassword = generatePassword();
    user.passwordHash = hashPassword(generatedPassword);
    user.mustChangePassword = true;
    user.passwordChangedAt = null;
  }
  if (body.newPassword) {
    const err = validatePassword(String(body.newPassword));
    if (err) return {status:400,data:{error:err}};
    user.passwordHash = hashPassword(String(body.newPassword));
    user.mustChangePassword = true;
    user.passwordChangedAt = null;
  }
  user.modificadoPor=publicAdminIdentity(auth.user);
  user.modificadoEn=new Date().toISOString();
  db().usuarios[idx]=user;
  await save();
  const payload = safeUser(user);
  if (generatedPassword) payload.generatedPassword = generatedPassword;
  return {status:200,data:payload};
}

async function handleDeleteUsuario(req, id, params) {
  const auth = requireRole(req, ROLES.INSTITUCIONAL);
  if (!auth.ok) return {status:auth.status,data:{error:auth.error}};
  if (auth.user.rol !== ROLES.ROOT) return {status:403,data:{error:'Solo el usuario root puede realizar esta acción'}};
  const idx = (db().usuarios||[]).findIndex(u=>u.id===parseInt(id));
  if (idx===-1) return {status:404,data:{error:'Usuario no encontrado'}};
  ensureUserLogin(db().usuarios[idx]);
  if (rootMatchesUser(db().usuarios[idx]))
    return {status:403,data:{error:'No se puede eliminar al root'}};
  const detail = `${db().usuarios[idx].login} <${db().usuarios[idx].email}>`;
  const hard = params && params.get('hard')==='true';
  if (hard) {
    db().usuarios.splice(idx, 1);
    audit('ELIMINAR', 'usuario', detail, auth.user);
    await save();
    return {status:200,data:{success:true,deleted:true,id:parseInt(id)}};
  }
  db().usuarios[idx].activo=false;
  db().usuarios[idx].desactivadoPor=publicAdminIdentity(auth.user);
  db().usuarios[idx].desactivadoEn=new Date().toISOString();
  audit('BAJA', 'usuario', detail, auth.user);
  await save();
  return {status:200,data:{success:true,id:parseInt(id)}};
}

// ── CARRERAS ──────────────────────────────────────────────
function handleGetCarrerasAdmin(req, params) {
  const auth = requireRole(req, ROLES.UNIDADES);
  if (!auth.ok) return {status:auth.status,data:{error:auth.error}};

  let rows = [...(db().carreras||[])];
  if (auth.user.rol===ROLES.UNIDADES) {
    rows = rows.filter(c => {
      const uArr = c.unidadesAcademicas||[c.unidadAcademica].filter(Boolean);
      return uArr.some(u=>(auth.user.unidades||[]).includes(u));
    });
  }

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
    rows=rows.filter(c=>
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
      // Estado
      textIncludes(c.proximamente ? 'proximamente' : (isActiveState(c.activo) ? 'disponible' : 'finalizada')) ||
      // Inscripción
      textIncludes(isActiveState(c.inscripcionAbierta) ? 'abierta' : 'cerrada') ||
      // Palabras clave
      listIncludes(c.tags) ||
      // Disertantes (incluye campo legacy speakers)
      listIncludes(c.disertantes) ||
      listIncludes(c.speakers)
    );
  }
  const esCurso=params.get('esCurso');
  if (esCurso!==null&&esCurso!==''&&esCurso!=='undefined') rows=rows.filter(c=>String(!!c.esCurso)===esCurso);
  const activo=params.get('activo');
  if (activo!==null&&activo!=='') {
    rows=rows.filter(c=>{
      const a=isActiveState(c.activo);
      return activo==='true'?a:!a;
    });
  }
  const unidad = params.get('unidad');
  if (unidad) {
    const allowedUnits = unidad.split(',').map((u) => u.trim()).filter(Boolean);
    rows = rows.filter((c) => (c.unidadesAcademicas || [c.unidadAcademica]).some((u) => allowedUnits.includes(u)));
  }
  const regional = params.get('regional');
  if (regional) {
    const wanted = regional.split(',').map((r) => r.trim()).filter(Boolean);
    const wantsNone = wanted.includes('__none__');
    const wantedSet = new Set(wanted.filter((r) => r !== '__none__'));
    rows = rows.filter((c) => {
      const value = String(c.regional || '').trim();
      if (!value) return wantsNone;
      return wantedSet.has(value);
    });
  }
  const inscripcionAbierta = params.get('inscripcionAbierta');
  if (inscripcionAbierta !== null && inscripcionAbierta !== '') {
    const inscBool = ['true', '1', 'yes', 'si'].includes(String(inscripcionAbierta).toLowerCase());
    rows = rows.filter((c) => !!isActiveState(c.inscripcionAbierta) === inscBool);
  }

  const sortBy = String(params.get('sortBy') || 'nombre').trim();
  const sortDir = String(params.get('sortDir') || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
  const allowedSorts = new Set(['nombre', 'tipo', 'unidad', 'regional', 'estado', 'inscripcion']);
  const safeSortBy = allowedSorts.has(sortBy) ? sortBy : 'nombre';
  const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const sortValue = (c) => {
    if (safeSortBy === 'tipo') return c.esCurso ? 'curso' : 'carrera';
    if (safeSortBy === 'unidad') return (c.unidadesAcademicas || [c.unidadAcademica]).filter(Boolean).join(', ');
    if (safeSortBy === 'regional') return c.regional || '';
    if (safeSortBy === 'estado') {
      if (c.proximamente) return 'proximamente';
      return isActiveState(c.activo) ? 'disponible' : 'finalizada';
    }
    if (safeSortBy === 'inscripcion') return isActiveState(c.inscripcionAbierta) ? 'abierta' : 'cerrada';
    return c.nombre || '';
  };
  rows.sort((a,b)=>{
    const av = norm(sortValue(a));
    const bv = norm(sortValue(b));
    const cmp = av.localeCompare(bv, 'es', { sensitivity: 'base', numeric: true });
    if (cmp !== 0) return sortDir === 'desc' ? -cmp : cmp;
    const nameCmp = norm(a.nombre || '').localeCompare(norm(b.nombre || ''), 'es', { sensitivity: 'base', numeric: true });
    return sortDir === 'desc' ? -nameCmp : nameCmp;
  });
  const limit=Math.min(parseInt(params.get('limit')||'20'),200);
  const page=Math.max(parseInt(params.get('page')||'1'),1);
  const total=rows.length;
  return {status:200,data:{data:rows.slice((page-1)*limit,page*limit),meta:{total,page,limit,totalPages:Math.ceil(total/limit)||1,sortBy:safeSortBy,sortDir}}};
}

function handleGetCarreraAdmin(req, id) {
  const auth = requireRole(req, ROLES.UNIDADES);
  if (!auth.ok) return {status:auth.status,data:{error:auth.error}};
  const row = (db().carreras||[]).find(c=>c.id===parseInt(id));
  if (!row) return {status:404,data:{error:'Carrera no encontrada'}};
  if (!canManageCarrera(auth.user, row.unidadesAcademicas||[row.unidadAcademica])) {
    return {status:403,data:{error:'Sin permiso para esta carrera'}};
  }
  return {status:200,data:row};
}

async function buildCarreraFromBody(body, existing) {
  const esCurso = boolFromBody(body.esCurso, existing?.esCurso === true);
  const proximamente = boolFromBody(body.proximamente, existing?.proximamente === true);
  const existingProximamenteInicial = existing?.proximamenteInicial === true
    || (existing && existing.proximamenteInicial === undefined && existing.proximamente === true);
  const proximamenteInicial = existing ? existingProximamenteInicial : proximamente;

  // unidadesAcademicas: support array (interinstitucional) + single value
  let unidades;
  if (body.unidadesAcademicas) {
    try { unidades=JSON.parse(body.unidadesAcademicas); } catch { unidades=parseTags(body.unidadesAcademicas); }
  } else if (body.unidadAcademica) {
    unidades=[body.unidadAcademica];
  } else {
    unidades=existing?.unidadesAcademicas||[];
  }
  unidades=Array.isArray(unidades)?unidades:[unidades];
  const primaryUnidad=unidades[0]||'';

  // EaD rule
  if (unidades.includes(EAD_UNIT) && !esCurso) {
    throw {status:400,message:'La Educación a Distancia solo admite Cursos'};
  }

  // Auto-calculate regional from primary unit
  const autoRegional = UNIDAD_REGIONAL_MAP[primaryUnidad] ?? (body.regional || '');

  // documentos: array [{tipo,organismo,numero,anio,pdf}]
  let documentos;
  if (body.documentos !== undefined) {
    if (Array.isArray(body.documentos)) documentos = body.documentos;
    else if (typeof body.documentos === 'string') {
      try { documentos = JSON.parse(body.documentos); } catch { documentos = []; }
    } else {
      documentos = [];
    }
  } else {
    documentos = existing?.documentos || [];
  }
  const hasDocUploads = Object.keys(body || {}).some((k) => /^doc_pdf_\d+$/.test(k) && body[k]?.filename);
  if (existing?.documentos && Array.isArray(existing.documentos) && Array.isArray(documentos)) {
    if (!documentos.length && !hasDocUploads) {
      documentos = existing.documentos.map((d) => ({ ...d }));
    } else if (documentos.length < existing.documentos.length) {
      // Defensive merge: avoid accidental truncation in partial updates.
      for (let i = documentos.length; i < existing.documentos.length; i += 1) {
        documentos.push({ ...existing.documentos[i] });
      }
    }
  }
  // Attach uploaded PDFs for each doc
  documentos = documentos.map((d,i)=>{
    const base = (existing?.documentos && Array.isArray(existing.documentos) && existing.documentos[i]) ? existing.documentos[i] : {};
    const fk=`doc_pdf_${i}`;
    const next = {
      tipo: sanitizeText(d?.tipo !== undefined ? d.tipo : base.tipo, 80),
      organismo: sanitizeText(d?.organismo !== undefined ? d.organismo : base.organismo, 120),
      numero: sanitizeText(d?.numero !== undefined ? d.numero : base.numero, 40),
      anio: sanitizeText(d?.anio !== undefined ? d.anio : base.anio, 10),
      pdf: null,
    };
    const incomingPdf = d?.pdf !== undefined ? d.pdf : base.pdf;
    const safeIncomingPdf = sanitizeUrl(incomingPdf, { allowRelative: true }) || '';
    next.pdf = safeIncomingPdf || null;
    if (body[fk]?.filename) next.pdf = saveFile(body[fk].data,'resoluciones',body[fk].filename);
    return next;
  });

  const tipoSource = esCurso
    ? 'Curso'
    : sanitizeText(body.tipo !== undefined ? body.tipo : (existing?.tipo || ''), 80);
  const rawAlcances = body.alcancesTitulo !== undefined
    ? body.alcancesTitulo
    : (body.alcancesDelTitulo !== undefined
      ? body.alcancesDelTitulo
      : (body.alcances !== undefined ? body.alcances : (existing?.alcancesTitulo || '')));

  const carrera = {
    nombre:               sanitizeText(body.nombre !== undefined ? body.nombre : (existing?.nombre || ''), 220),
    esCurso,
    tipo:                 tipoSource,
    subtipo:              (!esCurso && ((body.tipo !== undefined ? body.tipo : existing?.tipo) === 'Posgrado'))
      ? sanitizeText(body.subtipo !== undefined ? body.subtipo : (existing?.subtipo || ''), 80)
      : '',
    disciplina:           sanitizeText(body.disciplina !== undefined ? body.disciplina : (existing?.disciplina || ''), 120),
    modalidad:            sanitizeText(body.modalidad !== undefined ? body.modalidad : (existing?.modalidad || 'Híbrida'), 120) || 'Híbrida',
    duracion:             sanitizeText(body.duracion !== undefined ? body.duracion : (existing?.duracion || ''), 80),
    tags:                 (body.tags !== undefined ? parseTags(body.tags) : (existing?.tags || [])).map((t)=>sanitizeText(t,80)).filter(Boolean).slice(0,25),
    disertantes:          (body.disertantes !== undefined ? parseTags(body.disertantes) : (existing?.disertantes || [])).map((d)=>sanitizeText(d,120)).filter(Boolean).slice(0,25),
    unidadesAcademicas:   unidades,
    unidadAcademica:      primaryUnidad, // backwards compat for public search
    regional:             sanitizeText(autoRegional, 120),
    descripcion:          sanitizeRichHtml(body.descripcion !== undefined ? body.descripcion : (existing?.descripcion || '')),
    contacto:             sanitizeText(body.contacto !== undefined ? body.contacto : (existing?.contacto || ''), 180),
    telefonoContacto:     sanitizeText(body.telefonoContacto !== undefined ? body.telefonoContacto : (existing?.telefonoContacto || ''), 60),
    requisitosTexto:      sanitizeRichHtml(body.requisitosTexto !== undefined ? body.requisitosTexto : (existing?.requisitosTexto || '')),
    alcancesTitulo:       !esCurso
      ? sanitizeRichHtml(rawAlcances)
      : '',
    formularioInscripcion: esCurso ? sanitizeUrl(body.formularioInscripcion !== undefined ? body.formularioInscripcion : (existing?.formularioInscripcion || ''), { allowRelative: false }) : '',
    programa:             esCurso ? sanitizeRichHtml(body.programa !== undefined ? body.programa : (existing?.programa || '')) : '', // rich text for cursos
    documentos,
    inscripcionAbierta:   normalizeState((() => {
      if (body.inscripcionAbiertaValor!==undefined) {
        return {valor:body.inscripcionAbiertaValor==='true'||body.inscripcionAbiertaValor===true, fechaHasta:body.inscripcionAbiertaFecha||null};
      }
      return existing?.inscripcionAbierta||{valor:false,fechaHasta:null};
    })()),
    activo: normalizeState((() => {
      if (body.activoValor!==undefined) {
        return {valor:body.activoValor==='true'||body.activoValor===true, fechaHasta:body.activoFecha||null};
      }
      return existing?.activo||{valor:true,fechaHasta:null};
    })()),
    nueva:      boolFromBody(body.nueva, existing?.nueva === true),
    proximamente,
    proximamenteInicial,
    popular:    body.popular==='true'||body.popular===true||(existing?.popular||false),
    planEstudiosPDF: existing?.planEstudiosPDF||null,
  };
  return applyProximamenteRules(carrera, existing || null);
}

async function handleCreateCarrera(req) {
  const auth = requireRole(req, ROLES.UNIDADES);
  if (!auth.ok) return {status:auth.status,data:{error:auth.error}};
  let body;
  try { body = await parseRequest(req); }
  catch (e) { return { status: e.status || 400, data: { error: e.message || 'No se pudo procesar la solicitud.' } }; }
  const oversized = findOversizedUpload(body);
  if (oversized) {
    return {
      status: 413,
      data: { error: `El archivo "${oversized.filename}" supera el máximo de ${MAX_UPLOAD_MB_EFFECTIVE} MB por archivo.` },
    };
  }
  const invalidUpload = findInvalidUpload(body);
  if (invalidUpload) return { status: 400, data: { error: `Archivo inválido "${invalidUpload.filename}". ${invalidUpload.reason}` } };

  if (!String(body.nombre||'').trim()) return {status:400,data:{error:'Nombre obligatorio'}};
  // Regional is auto-calculated from unit, no validation needed

  let fields;
  try { fields = await buildCarreraFromBody(body, null); }
  catch(e) { return {status:e.status||400,data:{error:e.message||e}}; }

  if (!fields.unidadesAcademicas?.length) return {status:400,data:{error:'Debe asignar al menos una unidad académica'}};
  if (!canManageCarrera(auth.user, fields.unidadesAcademicas)) return {status:403,data:{error:'Sin permiso para alguna de las unidades seleccionadas'}};

  const nueva = {
    id:nextId(db().carreras||[]),
    ...fields,
    creadoPor:publicAdminIdentity(auth.user),
    creadoEn:new Date().toISOString(),
  };

  if (body.planEstudiosPDF?.filename) nueva.planEstudiosPDF=saveFile(body.planEstudiosPDF.data,'planes',body.planEstudiosPDF.filename);

  if (!db().carreras) db().carreras=[];
  db().carreras.push(nueva);
  audit('CREAR', 'carrera', nueva.nombre, auth.user);
  await save();
  return {status:201,data:nueva};
}

async function handleUpdateCarrera(req, id) {
  const auth = requireRole(req, ROLES.UNIDADES);
  if (!auth.ok) return {status:auth.status,data:{error:auth.error}};

  const idx = (db().carreras||[]).findIndex(c=>c.id===parseInt(id));
  if (idx===-1) return {status:404,data:{error:'Carrera no encontrada'}};
  const existing = db().carreras[idx];
  if (!canManageCarrera(auth.user, existing.unidadesAcademicas||[existing.unidadAcademica]))
    return {status:403,data:{error:'Sin permiso para esta carrera'}};

  let body;
  try { body = await parseRequest(req); }
  catch (e) { return { status: e.status || 400, data: { error: e.message || 'No se pudo procesar la solicitud.' } }; }
  const oversized = findOversizedUpload(body);
  if (oversized) {
    return {
      status: 413,
      data: { error: `El archivo "${oversized.filename}" supera el máximo de ${MAX_UPLOAD_MB_EFFECTIVE} MB por archivo.` },
    };
  }
  const invalidUpload = findInvalidUpload(body);
  if (invalidUpload) return { status: 400, data: { error: `Archivo inválido "${invalidUpload.filename}". ${invalidUpload.reason}` } };
  // Regional auto-calculated from unit

  let fields;
  try { fields = await buildCarreraFromBody({...body}, existing); }
  catch(e) { return {status:e.status||400,data:{error:e.message||e}}; }

  if (!canManageCarrera(auth.user, fields.unidadesAcademicas))
    return {status:403,data:{error:'Sin permiso para alguna de las unidades seleccionadas'}};

  const updated = {
    ...existing, ...fields,
    id:existing.id,
    modificadoPor:publicAdminIdentity(auth.user),
    modificadoEn:new Date().toISOString(),
  };
  if (body.planEstudiosPDF?.filename)
    updated.planEstudiosPDF=saveFile(body.planEstudiosPDF.data,'planes',body.planEstudiosPDF.filename);

  const transicionaADisponible = existing.proximamente === true && updated.proximamente !== true;
  db().carreras[idx]=updated;
  audit('EDITAR', 'carrera', updated.nombre, auth.user);
  await save();

  if (transicionaADisponible && hasMailConfig()) {
    const interesadosPendientes = (db().interesados || []).filter(
      (i) => Number(i.carreraId) === Number(updated.id) && i.informadoManual !== true
    );
    if (interesadosPendientes.length > 0) {
      console.log(`[interesados] Disparando ${interesadosPendientes.length} notificaciones para "${updated.nombre}"`);
      for (const interesado of interesadosPendientes) {
        sendInterestedNotification(interesado, updated)
          .then((r) => {
            if (r.sent) console.log(`[interesados] Email enviado a ${interesado.email}`);
            else console.warn(`[interesados] Falló envío a ${interesado.email}: ${r.error}`);
          })
          .catch((err) => console.error(`[interesados] Error enviando a ${interesado.email}:`, err));
      }
    }
  }

  return {status:200,data:updated};
}

async function handlePatchCarrera(req, body, id) {
  const auth = requireRole(req, ROLES.UNIDADES);
  if (!auth.ok) return {status:auth.status,data:{error:auth.error}};
  const idx = (db().carreras||[]).findIndex(c=>c.id===parseInt(id));
  if (idx===-1) return {status:404,data:{error:'Carrera no encontrada'}};
  const c = db().carreras[idx];
  const previousState = {
    proximamente: c.proximamente === true,
    proximamenteInicial: c.proximamenteInicial === true
      || (c.proximamenteInicial === undefined && c.proximamente === true),
  };
  if (previousState.proximamenteInicial) c.proximamenteInicial = true;
  if (!canManageCarrera(auth.user, c.unidadesAcademicas||[c.unidadAcademica]))
    return {status:403,data:{error:'Sin permiso para esta carrera'}};
  if (body.proximamente !== undefined) {
    c.proximamente = !!body.proximamente;
    audit(c.proximamente ? 'MARCAR_PROXIMAMENTE' : 'QUITAR_PROXIMAMENTE', 'carrera', c.nombre, auth.user);
  }
  if (body.activo !== undefined) {
    if (c.proximamente && !!body.activo) return {status:400,data:{error:'Una propuesta en estado Próximamente no puede estar visible/activa.'}};
    c.activo = normalizeState({valor:!!body.activo, fechaHasta:null});
    if (!body.activo) c.inscripcionAbierta = normalizeState({valor:false, fechaHasta:null});
    audit(body.activo?'ACTIVAR':'DESACTIVAR','carrera',c.nombre,auth.user);
  }
  if (body.inscripcionAbierta !== undefined) {
    if (c.proximamente && !!body.inscripcionAbierta) return {status:400,data:{error:'Una propuesta en estado Próximamente no puede tener inscripción abierta.'}};
    c.inscripcionAbierta = normalizeState({valor:!!body.inscripcionAbierta, fechaHasta:null});
    if (body.inscripcionAbierta && !isActiveState(c.activo)) {
      c.activo = normalizeState({valor:true, fechaHasta:null});
    }
    audit(body.inscripcionAbierta?'ABRIR_INSCRIPCION':'CERRAR_INSCRIPCION','carrera',c.nombre,auth.user);
  }
  const transicionaADisponible = previousState.proximamente === true && c.proximamente !== true;
  applyProximamenteRules(c, previousState);
  c.modificadoPor = publicAdminIdentity(auth.user);
  c.modificadoEn  = new Date().toISOString();
  await save();

  if (transicionaADisponible && hasMailConfig()) {
    const interesadosPendientes = (db().interesados || []).filter(
      (i) => Number(i.carreraId) === Number(c.id) && i.informadoManual !== true
    );
    for (const interesado of interesadosPendientes) {
      sendInterestedNotification(interesado, c)
        .then((r) => {
          if (r.sent) console.log(`[interesados] Email enviado a ${interesado.email} (carrera: ${c.nombre})`);
          else console.warn(`[interesados] Falló envío a ${interesado.email}: ${r.error}`);
        })
        .catch((err) => console.error(`[interesados] Error enviando a ${interesado.email}:`, err));
    }
    if (interesadosPendientes.length > 0) {
      console.log(`[interesados] Disparando ${interesadosPendientes.length} notificaciones para "${c.nombre}"`);
    }
  }

  return {status:200, data:c};
}

async function handleDeleteCarrera(req, id, params) {
  const auth = requireRole(req, ROLES.UNIDADES);
  if (!auth.ok) return {status:auth.status,data:{error:auth.error}};
  if (auth.user.rol !== ROLES.ROOT) return {status:403,data:{error:'Solo el usuario root puede realizar esta acción'}};
  const idx = (db().carreras||[]).findIndex(c=>c.id===parseInt(id));
  if (idx===-1) return {status:404,data:{error:'Carrera no encontrada'}};
  const nombre = db().carreras[idx].nombre;
  const hard = params && params.get('hard')==='true';
  if (hard) {
    // Permanent delete
    if (Array.isArray(db().interesados)) {
      db().interesados = db().interesados.filter((i) => Number(i.carreraId) !== Number(id));
    }
    db().carreras.splice(idx, 1);
    audit('ELIMINAR', 'carrera', nombre, auth.user);
    await save();
    return {status:200,data:{success:true,deleted:true,id:parseInt(id)}};
  }
  // Soft delete (deactivate)
  db().carreras[idx].activo=normalizeState({valor:false,fechaHasta:null});
  db().carreras[idx].inscripcionAbierta=normalizeState({valor:false,fechaHasta:null});
  db().carreras[idx].desactivadoPor=publicAdminIdentity(auth.user);
  db().carreras[idx].desactivadoEn=new Date().toISOString();
  audit('BAJA', 'carrera', nombre, auth.user);
  await save();
  return {status:200,data:{success:true,id:parseInt(id)}};
}

function handleGetNovedades(req, params) {
  const auth = requireRole(req, ROLES.UNIDADES);
  if (!auth.ok) return { status: auth.status, data: { error: auth.error } };

  const visibles = new Set(visibleUnitsForUser(auth.user));
  const allCarreras = db().carreras || [];
  const careerById = new Map(allCarreras.map((c) => [Number(c.id), c]));
  const canSeeInterested = (row) => {
    if (auth.user.rol === ROLES.ROOT || auth.user.rol === ROLES.INSTITUCIONAL) return true;
    const unidad = String(row?.unidadAcademica || '').trim();
    if (unidad && visibles.has(unidad)) return true;
    const career = careerById.get(Number(row?.carreraId || 0));
    if (!career) return false;
    return canManageCarrera(auth.user, career.unidadesAcademicas || [career.unidadAcademica]);
  };

  let rows = (db().interesados || [])
    .filter(canSeeInterested)
    .map((row) => {
      const career = careerById.get(Number(row.carreraId));
      const informado = row?.informadoManual === true || (career ? career.proximamente !== true : false);
      return {
        id: Number(row.id || 0),
        email: String(row.email || '').toLowerCase(),
        carreraId: Number(row.carreraId || 0),
        carrera: career?.nombre || 'Carrera eliminada',
        fecha: row.fechaCreacion || null,
        unidadAcademica: row.unidadAcademica || career?.unidadAcademica || '',
        notificado: informado,
        estado: informado ? 'INFORMADO' : 'PENDIENTE',
        informadoManual: row?.informadoManual === true,
        informadoEn: row?.informadoEn || null,
        informadoPor: row?.informadoPor || null,
      };
    });

  const carreraId = Number(params.get('careerId') || 0);
  const unidad = String(params.get('unidad') || '').trim();
  if (carreraId) rows = rows.filter((r) => r.carreraId === carreraId);
  if (unidad) rows = rows.filter((r) => r.unidadAcademica === unidad);
  rows.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));

  const carrerasVisibles = allCarreras
    .filter((c) => canManageCarrera(auth.user, c.unidadesAcademicas || [c.unidadAcademica]))
    .map((c) => ({ id: Number(c.id), nombre: c.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return {
    status: 200,
    data: {
      data: rows,
      filtros: {
        carreras: carrerasVisibles,
        unidades: [...visibles].sort((a, b) => a.localeCompare(b)),
      },
    },
  };
}

async function handleMarkInterestedAsInformed(req, id) {
  const auth = requireRole(req, ROLES.UNIDADES);
  if (!auth.ok) return { status: auth.status, data: { error: auth.error } };

  const itemId = Number.parseInt(String(id || ''), 10);
  if (!Number.isFinite(itemId)) return { status: 400, data: { error: 'ID inválido.' } };
  if (!Array.isArray(db().interesados)) db().interesados = [];
  const idx = db().interesados.findIndex((row) => Number(row.id) === itemId);
  if (idx < 0) return { status: 404, data: { error: 'Registro no encontrado.' } };

  const row = db().interesados[idx];
  if (auth.user.rol === ROLES.UNIDADES) {
    const visibles = new Set(visibleUnitsForUser(auth.user));
    if (!visibles.has(String(row.unidadAcademica || ''))) {
      return { status: 403, data: { error: 'Sin permiso para este registro.' } };
    }
  }
  if (row.informadoManual !== true) {
    row.informadoManual = true;
    row.informadoEn = new Date().toISOString();
    row.informadoPor = publicAdminIdentity(auth.user);
    db().interesados[idx] = row;
    audit('EDITAR', 'interesado', `${row.email} → INFORMADO`, auth.user);
    await save();
  }
  return {
    status: 200,
    data: {
      success: true,
      data: {
        id: Number(row.id || 0),
        informadoManual: row.informadoManual === true,
        informadoEn: row.informadoEn || null,
        informadoPor: row.informadoPor || null,
      },
    },
  };
}

async function handleDeleteInterested(req, id) {
  const auth = requireRole(req, ROLES.ROOT);
  if (!auth.ok) return { status: auth.status, data: { error: auth.error } };
  if (auth.user.rol !== ROLES.ROOT) return { status: 403, data: { error: 'Solo root puede realizar esta acción' } };

  const itemId = Number.parseInt(String(id || ''), 10);
  if (!Number.isFinite(itemId)) return { status: 400, data: { error: 'ID inválido.' } };
  if (!Array.isArray(db().interesados)) db().interesados = [];
  const idx = db().interesados.findIndex((row) => Number(row.id) === itemId);
  if (idx < 0) return { status: 404, data: { error: 'Registro no encontrado.' } };

  const [deleted] = db().interesados.splice(idx, 1);
  audit('ELIMINAR', 'interesado', String(deleted?.email || `id:${itemId}`), auth.user);
  await save();
  return { status: 200, data: { success: true, id: itemId } };
}

function ensureNewsletterState() {
  if (!Array.isArray(db().newsletterSubscriptions)) db().newsletterSubscriptions = [];
  if (!Array.isArray(db().newsletterDispatchLog)) db().newsletterDispatchLog = [];
  const config = ensureConfig();
  if (!config.newsletterDigest || typeof config.newsletterDigest !== 'object') {
    config.newsletterDigest = {
      enabled: true,
      weekdayUtc: 1,
      hourUtc: 11,
      minuteUtc: 0,
      lastRunAt: null,
      lastSentAt: null,
      lastContentHash: '',
      lastCarrerasSnapshot: null,
    };
  }
  return config.newsletterDigest;
}

function normalizeNewsletterEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function inferDispatchType(logRow) {
  const explicit = String(logRow?.dispatchType || '').trim().toLowerCase();
  if (explicit === 'manual' || explicit === 'automatico') return explicit;
  const status = String(logRow?.status || '').trim().toLowerCase();
  if (status.startsWith('manual')) return 'manual';
  return 'automatico';
}

function normalizeDispatchRecipients(logRow, recipientsTotal, fallbackRunAt = null) {
  const raw = Array.isArray(logRow?.recipients) ? logRow.recipients : [];
  const out = [];
  const seen = new Set();

  for (const item of raw) {
    const email = normalizeNewsletterEmail(
      typeof item === 'string'
        ? item
        : (item?.email || item?.to || item?.recipient || '')
    );
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({
      email,
      sentAt: item?.sentAt || null,
      status: String(item?.status || 'omitido'),
      error: item?.error || null,
      newsCount: Number(item?.newsCount || 0),
    });
  }

  // Compatibilidad logs legacy: si faltan recipients detallados, no inventamos correos.
  // Devolvemos vacío y frontend mantiene fallback visual sin romper registros previos.
  if (!out.length && Number(recipientsTotal || 0) > 0) {
    return [];
  }
  return out;
}

function mapDispatchLogRow(logRow, includeDetail = false) {
  const recipientsTotal = Number(logRow?.recipientsTotal || 0);
  const sentCount = Number(logRow?.sentCount || 0);
  const hasExplicitFail = logRow?.failCount !== undefined && logRow?.failCount !== null;
  const failRaw = Number(logRow?.failCount || 0);
  const failCount = hasExplicitFail
    ? (Number.isFinite(failRaw) && failRaw >= 0 ? failRaw : 0)
    : Math.max(0, recipientsTotal - sentCount);
  const diffTotal = Number(logRow?.diffTotal || 0);
  const mapped = {
    id: Number(logRow?.id || 0),
    dispatchType: inferDispatchType(logRow),
    scheduledFor: logRow?.scheduledFor || null,
    runAt: logRow?.runAt || null,
    windowStart: logRow?.windowStart || null,
    windowEnd: logRow?.windowEnd || null,
    status: String(logRow?.status || 'unknown'),
    changesDetected: logRow?.changesDetected === true,
    recipientsTotal,
    sentCount,
    failCount,
    diffTotal,
    message: String(logRow?.message || ''),
  };
  if (includeDetail) {
    mapped.sections = logRow?.sections && typeof logRow.sections === 'object' ? logRow.sections : null;
    mapped.diff = logRow?.diff && typeof logRow.diff === 'object' ? logRow.diff : null;
    mapped.recipients = normalizeDispatchRecipients(logRow, recipientsTotal, mapped.runAt || null);
    mapped.newsletterHtml = typeof logRow?.newsletterHtml === 'string' ? logRow.newsletterHtml : '';
  }
  return mapped;
}

function parseIsoDateStart(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseIsoDateEnd(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T23:59:59.999Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseManualEmailsInput(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  return String(value || '')
    .split(/[\n,; \t]+/)
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}

function addNewsletterEmailsBatch(inputEmails, sourceRaw) {
  ensureNewsletterState();
  const source = sanitizeText(sourceRaw || 'manual', 60) || 'manual';
  const now = new Date().toISOString();
  const existingSet = new Set((db().newsletterSubscriptions || []).map((row) => normalizeNewsletterEmail(row?.email)));
  const seenInput = new Set();
  const added = [];
  const duplicated = [];
  const invalid = [];
  const received = Array.isArray(inputEmails) ? inputEmails.length : 0;

  for (const raw of (inputEmails || [])) {
    const email = normalizeNewsletterEmail(raw);
    if (!email) continue;
    if (!validateEmail(email)) {
      invalid.push(email);
      continue;
    }
    if (seenInput.has(email) || existingSet.has(email)) {
      duplicated.push(email);
      seenInput.add(email);
      continue;
    }
    const row = {
      id: nextId(db().newsletterSubscriptions),
      email,
      source,
      activo: true,
      fechaAlta: now,
      actualizadoEn: now,
      ultimoEnvio: null,
    };
    db().newsletterSubscriptions.push(row);
    existingSet.add(email);
    seenInput.add(email);
    added.push(email);
  }

  return {
    source,
    received,
    added,
    duplicated,
    invalid,
    stats: {
      recibidos: received,
      agregados: added.length,
      duplicados: duplicated.length,
      invalidos: invalid.length,
    },
  };
}

function parseNewsletterEmailsFromWorkbook(filePart) {
  const filename = String(filePart?.filename || '').trim();
  const ext = path.extname(filename).toLowerCase();
  if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
    const error = new Error('Formato no soportado. Usá .xlsx, .xls o .csv.');
    error.status = 400;
    throw error;
  }
  const workbook = XLSX.read(filePart?.data || Buffer.alloc(0), { type: 'buffer', raw: false });
  const firstSheetName = workbook?.SheetNames?.[0];
  if (!firstSheetName) return { emails: [], readCount: 0, filename, ext };
  const firstSheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, defval: '' });
  const colValues = rows
    .map((row) => (Array.isArray(row) ? row[0] : ''))
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (!colValues.length) return { emails: [], readCount: 0, filename, ext };
  const firstValue = String(colValues[0] || '').trim().toLowerCase();
  const shouldSkipHeader = !validateEmail(firstValue) && /(correo|mail|email|e-mail)/i.test(firstValue);
  const emails = shouldSkipHeader ? colValues.slice(1) : colValues;
  return { emails, readCount: emails.length, filename, ext };
}

async function handleNewsletterManualSubscriptions(req, body) {
  const auth = requireRole(req, ROLES.ROOT);
  if (!auth.ok) return { status: auth.status, data: { error: auth.error } };
  if (auth.user.rol !== ROLES.ROOT) return { status: 403, data: { error: 'Solo root puede realizar esta acción' } };

  const input = parseManualEmailsInput(body?.emails);
  if (!input.length) return { status: 400, data: { error: 'Ingresá al menos un correo electrónico.' } };
  const result = addNewsletterEmailsBatch(input, body?.source || 'manual');
  if (result.stats.agregados > 0) {
    audit('CREAR', 'newsletter', `Alta manual: ${result.stats.agregados} agregado(s), ${result.stats.duplicados} duplicado(s), ${result.stats.invalidos} inválido(s).`, auth.user);
    await save();
  }

  return {
    status: 200,
    data: {
      success: true,
      source: result.source,
      stats: result.stats,
      added: result.added,
      duplicated: result.duplicated,
      invalid: result.invalid,
    },
  };
}

async function handleNewsletterImport(req) {
  const auth = requireRole(req, ROLES.ROOT);
  if (!auth.ok) return { status: auth.status, data: { error: auth.error } };
  if (auth.user.rol !== ROLES.ROOT) return { status: 403, data: { error: 'Solo root puede realizar esta acción' } };

  let body;
  try {
    body = await parseRequest(req);
  } catch (err) {
    return { status: err?.status || 400, data: { error: err?.message || 'No se pudo procesar el archivo.' } };
  }

  const filePart = body?.file
    || body?.archivo
    || body?.import
    || Object.values(body || {}).find((entry) => entry && entry.filename && Buffer.isBuffer(entry.data));
  if (!filePart || !filePart.filename || !Buffer.isBuffer(filePart.data)) {
    return { status: 400, data: { error: 'Adjuntá un archivo válido para importar.' } };
  }

  let parsed;
  try {
    parsed = parseNewsletterEmailsFromWorkbook(filePart);
  } catch (err) {
    return { status: err?.status || 400, data: { error: err?.message || 'No se pudo leer el archivo.' } };
  }

  if (parsed.readCount === 0) {
    return {
      status: 200,
      data: {
        success: true,
        filename: parsed.filename,
        stats: {
          leidos: 0,
          validos: 0,
          importados: 0,
          duplicados: 0,
          invalidos: 0,
        },
      },
    };
  }

  const existingSet = new Set((db().newsletterSubscriptions || []).map((row) => normalizeNewsletterEmail(row?.email)));
  const seenInFile = new Set();
  const toImport = [];
  let validCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  for (const raw of parsed.emails) {
    const email = normalizeNewsletterEmail(raw);
    if (!email) continue;
    if (!validateEmail(email)) {
      invalidCount += 1;
      continue;
    }
    validCount += 1;
    if (seenInFile.has(email) || existingSet.has(email)) {
      duplicateCount += 1;
      seenInFile.add(email);
      continue;
    }
    seenInFile.add(email);
    toImport.push(email);
  }

  const batchResult = addNewsletterEmailsBatch(toImport, 'import');
  if (batchResult.stats.agregados > 0) {
    audit('IMPORT', 'newsletter', `Importación newsletter (${parsed.filename}): ${batchResult.stats.agregados} agregado(s), ${duplicateCount} duplicado(s), ${invalidCount} inválido(s).`, auth.user);
    await save();
  }

  return {
    status: 200,
    data: {
      success: true,
      filename: parsed.filename,
      stats: {
        leidos: parsed.readCount,
        validos: validCount,
        importados: batchResult.stats.agregados,
        duplicados: duplicateCount,
        invalidos: invalidCount,
      },
    },
  };
}

function filterNewsletterSubscriptions(params) {
  const q = String(params?.get('q') || '').trim().toLowerCase();
  const status = String(params?.get('status') || '').trim().toLowerCase();
  const source = sanitizeText(params?.get('source') || '', 60).toLowerCase();
  const lastSentDate = String(params?.get('lastSentDate') || '').trim();
  const lastSentFrom = String(params?.get('lastSentFrom') || '').trim();
  const lastSentTo = String(params?.get('lastSentTo') || '').trim();
  const fromDate = parseIsoDateStart(lastSentFrom || lastSentDate);
  const toDate = parseIsoDateEnd(lastSentTo || lastSentDate);

  let rows = (db().newsletterSubscriptions || []).map((row) => ({
    id: Number(row.id || 0),
    email: String(row.email || '').trim().toLowerCase(),
    source: sanitizeText(row.source || 'sitio', 60) || 'sitio',
    activo: row.activo !== false,
    fechaAlta: row.fechaAlta || row.actualizadoEn || null,
    actualizadoEn: row.actualizadoEn || row.fechaAlta || null,
    ultimoEnvio: row.ultimoEnvio || null,
  }));

  if (q) rows = rows.filter((row) => row.email.includes(q));
  if (status === 'active') rows = rows.filter((row) => row.activo);
  if (status === 'inactive') rows = rows.filter((row) => !row.activo);
  if (source) rows = rows.filter((row) => String(row.source || '').toLowerCase() === source);
  if (fromDate || toDate) {
    rows = rows.filter((row) => {
      if (!row.ultimoEnvio) return false;
      const ts = new Date(row.ultimoEnvio);
      if (Number.isNaN(ts.getTime())) return false;
      if (fromDate && ts < fromDate) return false;
      if (toDate && ts > toDate) return false;
      return true;
    });
  }
  rows.sort((a, b) => new Date(b.fechaAlta || 0) - new Date(a.fechaAlta || 0));
  return rows;
}

function handleNewsletterExport(req, params) {
  const auth = requireRole(req, ROLES.ROOT);
  if (!auth.ok) return { status: auth.status, data: { error: auth.error } };
  if (auth.user.rol !== ROLES.ROOT) return { status: 403, data: { error: 'Solo root puede realizar esta acción' } };

  ensureNewsletterState();
  const rows = filterNewsletterSubscriptions(params)
    .map((row) => ({
      correo: normalizeNewsletterEmail(row.email),
      origen: sanitizeText(row?.source || 'sitio', 60) || 'sitio',
      estado: row?.activo !== false ? 'Activo' : 'Inactivo',
      activo: row?.activo !== false ? 'Sí' : 'No',
      fechaAlta: row?.fechaAlta || row?.actualizadoEn || '',
      ultimoEnvio: row?.ultimoEnvio || '',
    }))
    .filter((row) => row.correo);

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 38 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
    { wch: 20 },
    { wch: 20 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contactos');
  const fileBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    status: 200,
    data: {
      success: true,
      filename: `newsletter-contactos-${stamp}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileBase64: fileBuffer.toString('base64'),
      total: rows.length,
    },
  };
}

function handleGetNewsletterDispatchLogs(req) {
  const auth = requireRole(req, ROLES.ROOT);
  if (!auth.ok) return { status: auth.status, data: { error: auth.error } };
  ensureNewsletterState();
  const rows = (db().newsletterDispatchLog || []).map((row) => mapDispatchLogRow(row, false))
    .sort((a, b) => new Date(b.runAt || 0) - new Date(a.runAt || 0));
  return {
    status: 200,
    data: {
      data: rows,
      summary: {
        total: rows.length,
        manuales: rows.filter((row) => row.dispatchType === 'manual').length,
        automaticos: rows.filter((row) => row.dispatchType === 'automatico').length,
      },
    },
  };
}

function handleGetNewsletterDispatchDetail(req, id) {
  const auth = requireRole(req, ROLES.ROOT);
  if (!auth.ok) return { status: auth.status, data: { error: auth.error } };
  ensureNewsletterState();
  const targetId = Number.parseInt(String(id || ''), 10);
  if (!Number.isFinite(targetId)) return { status: 400, data: { error: 'ID inválido.' } };
  const row = (db().newsletterDispatchLog || []).find((item) => Number(item?.id) === targetId);
  if (!row) return { status: 404, data: { error: 'Envío no encontrado.' } };
  const mapped = mapDispatchLogRow(row, true);
  return {
    status: 200,
    data: {
      data: mapped,
      detail: {
        newsletterHtml: mapped.newsletterHtml || '',
        diff: mapped.diff || null,
        recipients: Array.isArray(mapped.recipients) ? mapped.recipients : [],
        sections: mapped.sections || null,
      },
    },
  };
}

function nextWeeklyRunUtc(baseDate, digestCfg) {
  const now = new Date(baseDate || Date.now());
  const weekday = Number.isInteger(digestCfg?.weekdayUtc) ? digestCfg.weekdayUtc : 1;
  const hour = Number.isInteger(digestCfg?.hourUtc) ? digestCfg.hourUtc : 12;
  const minute = Number.isInteger(digestCfg?.minuteUtc) ? digestCfg.minuteUtc : 0;

  const currentDay = now.getUTCDay();
  const daysAheadRaw = (weekday - currentDay + 7) % 7;
  const scheduled = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hour,
    minute,
    0,
    0
  ));
  scheduled.setUTCDate(scheduled.getUTCDate() + daysAheadRaw);
  if (scheduled.getTime() <= now.getTime()) scheduled.setUTCDate(scheduled.getUTCDate() + 7);
  return scheduled.toISOString();
}

function latestDispatchByType(type) {
  const rows = (db().newsletterDispatchLog || [])
    .map((row) => mapDispatchLogRow(row, false))
    .filter((row) => row.dispatchType === type && row.sentCount > 0 && row.runAt);
  if (!rows.length) return null;
  rows.sort((a, b) => new Date(b.runAt || 0) - new Date(a.runAt || 0));
  return rows[0];
}

function handleGetNewsletterSubscriptions(req, params) {
  const auth = requireRole(req, ROLES.ROOT);
  if (!auth.ok) return { status: auth.status, data: { error: auth.error } };

  const digestCfg = ensureNewsletterState();
  const rows = filterNewsletterSubscriptions(params);
  const allRows = filterNewsletterSubscriptions(new URLSearchParams());
  const sourceOptions = [...new Set(allRows.map((r) => String(r.source || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const lastManual = latestDispatchByType('manual');
  const lastWeekly = latestDispatchByType('automatico');
  const lastManualSentAt = lastManual?.runAt || null;

  return {
    status: 200,
    data: {
      data: rows,
      summary: {
        total: rows.length,
        active: rows.filter((r) => r.activo).length,
        inactive: rows.filter((r) => !r.activo).length,
        nextRunAt: nextWeeklyRunUtc(new Date(), digestCfg),
        lastRunAt: digestCfg.lastRunAt || null,
        lastSentAt: digestCfg.lastSentAt || null,
        lastManualSentAt,
        lastWeeklyDispatch: lastWeekly ? {
          runAt: lastWeekly.runAt || null,
          windowStart: lastWeekly.windowStart || null,
          windowEnd: lastWeekly.windowEnd || null,
        } : null,
        lastManualDispatch: lastManual ? {
          runAt: lastManual.runAt || null,
          windowStart: lastManual.windowStart || null,
          windowEnd: lastManual.windowEnd || null,
        } : null,
      },
      sourceOptions,
      digest: {
        enabled: digestCfg.enabled,
        weekdayUtc: digestCfg.weekdayUtc,
        hourUtc: digestCfg.hourUtc,
        minuteUtc: digestCfg.minuteUtc,
        lastRunAt: digestCfg.lastRunAt || null,
        lastSentAt: digestCfg.lastSentAt || null,
        lastContentHash: digestCfg.lastContentHash || '',
      },
      dispatchLog: (db().newsletterDispatchLog || []).slice(0, 50).map(mapDispatchLogRow),
    },
  };
}

async function handlePatchNewsletterSubscription(req, body, id) {
  const auth = requireRole(req, ROLES.ROOT);
  if (!auth.ok) return { status: auth.status, data: { error: auth.error } };
  ensureNewsletterState();

  const itemId = Number.parseInt(String(id || ''), 10);
  if (!Number.isFinite(itemId)) return { status: 400, data: { error: 'ID inválido.' } };
  const idx = (db().newsletterSubscriptions || []).findIndex((s) => Number(s.id) === itemId);
  if (idx < 0) return { status: 404, data: { error: 'Suscripción no encontrada.' } };

  if (body.activo === undefined) return { status: 400, data: { error: 'El campo activo es obligatorio.' } };
  const current = db().newsletterSubscriptions[idx];
  current.activo = !!body.activo;
  current.actualizadoEn = new Date().toISOString();
  db().newsletterSubscriptions[idx] = current;

  audit('EDITAR', 'newsletter', `${current.email} → ${current.activo ? 'Activo' : 'Inactivo'}`, auth.user);
  await save();
  return { status: 200, data: { success: true, data: current } };
}

async function handleDeleteNewsletterSubscription(req, id) {
  const auth = requireRole(req, ROLES.ROOT);
  if (!auth.ok) return { status: auth.status, data: { error: auth.error } };
  ensureNewsletterState();

  const itemId = Number.parseInt(String(id || ''), 10);
  if (!Number.isFinite(itemId)) return { status: 400, data: { error: 'ID inválido.' } };
  const idx = (db().newsletterSubscriptions || []).findIndex((s) => Number(s.id) === itemId);
  if (idx < 0) return { status: 404, data: { error: 'Suscripción no encontrada.' } };

  const item = db().newsletterSubscriptions[idx];
  db().newsletterSubscriptions.splice(idx, 1);
  audit('ELIMINAR', 'newsletter', String(item?.email || `id:${itemId}`), auth.user);
  await save();
  return { status: 200, data: { success: true, id: itemId } };
}

function handleManualNewsletterPreview(req) {
  const auth = requireRole(req, ROLES.ROOT);
  if (!auth.ok) return { status: auth.status, data: { error: auth.error } };
  if (auth.user.rol !== ROLES.ROOT) return { status: 403, data: { error: 'Solo root puede realizar esta acción' } };
  if (typeof _getManualDigestPreview !== 'function') {
    return { status: 503, data: { error: 'La vista previa manual no está disponible. Reiniciá el servidor.' } };
  }
  try {
    const preview = _getManualDigestPreview();
    return { status: 200, data: { success: true, preview } };
  } catch (err) {
    return { status: 500, data: { error: err.message || 'No se pudo generar la vista previa.' } };
  }
}

async function handleManualNewsletterSend(req, body = {}) {
  const auth = requireRole(req, ROLES.ROOT);
  if (!auth.ok) return { status: auth.status, data: { error: auth.error } };
  if (auth.user.rol !== ROLES.ROOT) return { status: 403, data: { error: 'Solo root puede realizar esta acción' } };
  if (typeof _sendManualDigest !== 'function') {
    return { status: 503, data: { error: 'El módulo de envío no está disponible. Reiniciá el servidor.' } };
  }
  const selectedKeys = Array.isArray(body?.selectedKeys)
    ? body.selectedKeys.map((key) => String(key || '').trim()).filter(Boolean)
    : [];
  const recipientModeRaw = String(body?.recipientMode || '').trim().toLowerCase();
  const selectedEmailsRaw = Array.isArray(body?.selectedEmails)
    ? body.selectedEmails.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean)
    : null;
  const recipientMode = recipientModeRaw === 'custom'
    ? 'custom'
    : ((recipientModeRaw === 'all')
      ? 'all'
      : ((selectedEmailsRaw && selectedEmailsRaw.length) ? 'custom' : 'all'));
  const selectedEmails = recipientMode === 'custom'
    ? (selectedEmailsRaw && selectedEmailsRaw.length ? selectedEmailsRaw : [])
    : null;
  try {
    const result = await _sendManualDigest({ selectedKeys, selectedEmails, recipientMode });
    if (result?.blocked === true) {
      return {
        status: 409,
        data: {
          error: result?.message || 'No hay novedades para enviar.',
          status: result?.status || 'manual-sin-novedades',
          selection: result?.selection || { selectedTotal: 0, excludedTotal: 0 },
          diff: { total: Number(result?.diffTotal || 0) },
        },
      };
    }
    const sentCount = Number(result?.sentCount || 0);
    const failCount = Number(result?.failCount || 0);
    const recipientsTotal = Number(result?.recipientsTotal || 0);
    const sections = (result?.secciones && typeof result.secciones === 'object')
      ? result.secciones
      : ((result?.sections && typeof result.sections === 'object') ? result.sections : {});
    const diffTotalRaw = result?.diff?.total ?? result?.diffTotal ?? result?.totalChanges;
    const diffTotal = Number(diffTotalRaw || 0);
    return {
      status: 200,
      data: {
        success: true,
        sentCount,
        failCount,
        recipientsTotal,
        diff: { total: diffTotal },
        secciones: sections,
        sections,
        status: result?.status || null,
        message: result?.message || '',
        windowStart: result?.windowStart || null,
        windowEnd: result?.windowEnd || null,
        selection: result?.selection || { selectedTotal: diffTotal, excludedTotal: 0 },
      },
    };
  } catch (err) {
    const code = err.code;
    if (code === 'IN_FLIGHT') return { status: 409, data: { error: err.message } };
    return { status: 500, data: { error: err.message || 'Error interno al enviar el digest.' } };
  }
}

// ── ROUTER ────────────────────────────────────────────────
async function handleAdminAPI(req, res, pathname, params, jsonResponse, readBody) {
  const base=pathname.replace('/admin/api','');
  const segs=base.split('/').filter(Boolean);
  const r0=segs[0], id=segs[1], m=req.method;

  // Ruta canónica explícita para evitar desalineaciones de parsing/path en runtime.
  if (m === 'GET' && /^\/admin\/api\/newsletter\/preview-manual\/?$/.test(String(pathname || ''))) {
    const r = handleManualNewsletterPreview(req);
    return jsonResponse(res, r.data, r.status);
  }

  if (r0==='auth') {
    if (segs[1]==='login'&&m==='POST')           {const b=await readBody(req);const r=await handleLogin(req,b);return jsonResponse(res,r.data,r.status);}
    if (segs[1]==='change-password'&&m==='POST') {const b=await readBody(req);const r=await handleChangePassword(req,b);return jsonResponse(res,r.data,r.status);}
    if (segs[1]==='me'&&m==='GET')               {const a=requireAuth(req);return a.ok?jsonResponse(res,{user:a.user}):jsonResponse(res,{error:a.error},a.status);}
    if (segs[1]==='logout'&&m==='POST')          return jsonResponse(res,{success:true});
    return jsonResponse(res,{error:'Not found'},404);
  }
  if (r0==='usuarios') {
    if (!id&&m==='GET')   {const r=handleGetUsuarios(req);return jsonResponse(res,r.data,r.status);}
    if (!id&&m==='POST')  {const b=await readBody(req);const r=await handleCreateUsuario(req,b);return jsonResponse(res,r.data,r.status);}
    if (id&&m==='PUT')    {const b=await readBody(req);const r=await handleUpdateUsuario(req,b,id);return jsonResponse(res,r.data,r.status);}
    if (id&&m==='DELETE') {const r=await handleDeleteUsuario(req,id,params);return jsonResponse(res,r.data,r.status);}
  }
  if (r0==='carreras') {
    if (!id&&m==='GET')   {const r=handleGetCarrerasAdmin(req,params);return jsonResponse(res,r.data,r.status);}
    if (id&&m==='GET')    {const r=handleGetCarreraAdmin(req,id);return jsonResponse(res,r.data,r.status);}
    if (!id&&m==='POST')  {const r=await handleCreateCarrera(req);return jsonResponse(res,r.data,r.status);}
    if (id&&m==='PUT')    {const r=await handleUpdateCarrera(req,id);return jsonResponse(res,r.data,r.status);}
    if (id&&m==='PATCH')  {const b=await readBody(req);const r=await handlePatchCarrera(req,b,id);return jsonResponse(res,r.data,r.status);}
    if (id&&m==='DELETE') {const r=await handleDeleteCarrera(req,id,params);return jsonResponse(res,r.data,r.status);}
  }
  if (r0==='uploads'&&segs[1]==='chunk'&&m==='POST') {
    const r = await handleChunkUpload(req, params);
    return jsonResponse(res, r.data, r.status);
  }
  if (r0==='novedades' || r0==='interesados') {
    if (!id && m==='GET') {
      const r = handleGetNovedades(req, params);
      return jsonResponse(res, r.data, r.status);
    }
    if (!id && m==='DELETE') {
      const qId = Number.parseInt(String(params.get('id') || params.get('interesadoId') || ''), 10);
      if (Number.isFinite(qId)) {
        const r = await handleDeleteInterested(req, qId);
        return jsonResponse(res, r.data, r.status);
      }
    }
    if (id && !segs[2] && m==='DELETE') {
      const r = await handleDeleteInterested(req, id);
      return jsonResponse(res, r.data, r.status);
    }
    if (id && !segs[2] && m==='POST') {
      const b = await readBody(req).catch(() => ({}));
      if (b?.action === 'informar' || b?.informado === true) {
        const r = await handleMarkInterestedAsInformed(req, id);
        return jsonResponse(res, r.data, r.status);
      }
    }
    if (id && segs[2] === 'informar' && m==='POST') {
      const r = await handleMarkInterestedAsInformed(req, id);
      return jsonResponse(res, r.data, r.status);
    }
    if (segs[1] === 'informar' && segs[2] && m==='POST') {
      const r = await handleMarkInterestedAsInformed(req, segs[2]);
      return jsonResponse(res, r.data, r.status);
    }
    if (!id && m==='POST') {
      const qId = Number.parseInt(String(params.get('id') || params.get('interesadoId') || ''), 10);
      const action = String(params.get('action') || '').trim().toLowerCase();
      if (Number.isFinite(qId) && (action === 'informar' || params.get('informar') === 'true')) {
        const r = await handleMarkInterestedAsInformed(req, qId);
        return jsonResponse(res, r.data, r.status);
      }
    }
  }
  if (r0==='newsletter') {
    const isPreviewManualRoute = m === 'GET' && (
      (segs[1] === 'preview-manual' && !segs[2])
      || (segs[1] === 'preview' && !segs[2]) // alias legacy
      || (segs[1] === 'manual-preview' && !segs[2]) // alias legacy
      || (segs[1] === 'preview' && segs[2] === 'manual' && !segs[3]) // alias legacy
    );
    if (isPreviewManualRoute) {
      const r = handleManualNewsletterPreview(req);
      return jsonResponse(res, r.data, r.status);
    }
    if (segs[1]==='logs' && !segs[2] && m==='GET') {
      const queryId = Number.parseInt(String(params.get('id') || ''), 10);
      if (Number.isFinite(queryId)) {
        const r = handleGetNewsletterDispatchDetail(req, queryId);
        return jsonResponse(res, r.data, r.status);
      }
      const r = handleGetNewsletterDispatchLogs(req);
      return jsonResponse(res, r.data, r.status);
    }
    if (segs[1]==='logs' && segs[2] && m==='GET') {
      const r = handleGetNewsletterDispatchDetail(req, segs[2]);
      return jsonResponse(res, r.data, r.status);
    }
    if (segs[1]==='subscriptions' && !segs[2] && m==='GET') {
      const r = handleGetNewsletterSubscriptions(req, params);
      return jsonResponse(res, r.data, r.status);
    }
    if (segs[1]==='subscriptions' && segs[2]==='manual' && m==='POST') {
      const b = await readBody(req);
      const r = await handleNewsletterManualSubscriptions(req, b);
      return jsonResponse(res, r.data, r.status);
    }
    if (segs[1]==='subscriptions' && segs[2]==='import' && m==='POST') {
      const r = await handleNewsletterImport(req);
      return jsonResponse(res, r.data, r.status);
    }
    if (segs[1]==='subscriptions' && segs[2]==='export' && m==='GET') {
      const r = handleNewsletterExport(req, params);
      return jsonResponse(res, r.data, r.status);
    }
    if (segs[1]==='subscriptions' && segs[2] && m==='PATCH') {
      const b = await readBody(req);
      const r = await handlePatchNewsletterSubscription(req, b, segs[2]);
      return jsonResponse(res, r.data, r.status);
    }
    if (segs[1]==='subscriptions' && segs[2] && m==='DELETE') {
      const r = await handleDeleteNewsletterSubscription(req, segs[2]);
      return jsonResponse(res, r.data, r.status);
    }
    if (segs[1]==='send' && !segs[2] && m==='POST') {
      const b = await readBody(req).catch(() => ({}));
      const r = await handleManualNewsletterSend(req, b);
      return jsonResponse(res, r.data, r.status);
    }
  }
  if (r0==='unidades'&&m==='GET') {
    const a=requireAuth(req);
    if (!a.ok) return jsonResponse(res,{error:a.error},a.status);
    return jsonResponse(res,{data:db().unidadesAcademicas||[],eadUnit:EAD_UNIT});
  }
  if (r0==='config'&&m==='GET') {
    const a=requireAuth(req);
    if (!a.ok) return jsonResponse(res,{error:a.error},a.status);
    const newsletterCfg = ensureNewsletterState();
    return jsonResponse(res,{
      unidadesAcademicas:db().unidadesAcademicas||[],
      regionales:db().regionales||[],
      disciplinas:ALLOWED_DISCIPLINAS,
      tiposDocumento:db().tiposDocumento||['Resolución','Disposición','Ordenanza'],
      organismos:db().organismos||['Consejo Superior','Ministerial','SPU','SSPU','CONEAU'],
      eadUnit:EAD_UNIT,
      accesoPublico: db().config?.acceso_publico !== false,
      sitioEnConstruccion: db().config?.sitio_en_construccion === true,
      imagenConstruccion: db().config?.imagen_construccion || DEFAULT_CONSTRUCTION_IMAGE,
      newsletterOperativo: newsletterCfg.enabled === true,
    });
  }

  // Config: toggle public access (root only)
  if (r0==='config'&&segs[1]==='acceso-publico'&&m==='POST') {
    const a=requireAuth(req);
    if (!a.ok) return jsonResponse(res,{error:a.error},a.status);
    if (a.user.rol!==ROLES.ROOT) return jsonResponse(res,{error:'Solo root puede cambiar esta configuración'},403);
    const b=await readBody(req);
    const config = ensureConfig();
    config.acceso_publico = b.value !== false;
    config.acceso_publico_modificado_por = publicAdminIdentity(a.user);
    config.acceso_publico_modificado_en  = new Date().toISOString();
    await save();
    return jsonResponse(res,{success:true, acceso_publico: config.acceso_publico});
  }

  // Config: toggle "sitio en construcción" (root only)
  if (r0==='config'&&segs[1]==='sitio-en-construccion'&&m==='POST') {
    const a=requireAuth(req);
    if (!a.ok) return jsonResponse(res,{error:a.error},a.status);
    if (a.user.rol!==ROLES.ROOT) return jsonResponse(res,{error:'Solo root puede cambiar esta configuración'},403);
    const b=await readBody(req);
    const config = ensureConfig();
    config.sitio_en_construccion = b.value === true;
    const img = String(b.imageUrl || '').trim();
    config.imagen_construccion = img || DEFAULT_CONSTRUCTION_IMAGE;
    config.sitio_en_construccion_modificado_por = publicAdminIdentity(a.user);
    config.sitio_en_construccion_modificado_en  = new Date().toISOString();
    await save();
    return jsonResponse(res,{
      success:true,
      sitio_en_construccion: config.sitio_en_construccion,
      imagen_construccion: config.imagen_construccion,
    });
  }

  // Config: toggle newsletter operativo (root only)
  if (r0==='config'&&segs[1]==='newsletter-operativo'&&m==='POST') {
    const a=requireAuth(req);
    if (!a.ok) return jsonResponse(res,{error:a.error},a.status);
    if (a.user.rol!==ROLES.ROOT) return jsonResponse(res,{error:'Solo root puede cambiar esta configuración'},403);
    const b=await readBody(req);
    const digestCfg = ensureNewsletterState();
    digestCfg.enabled = b.value === true;
    digestCfg.updatedBy = publicAdminIdentity(a.user);
    digestCfg.updatedAt = new Date().toISOString();
    await save();
    return jsonResponse(res,{
      success:true,
      newsletter_operativo: digestCfg.enabled === true,
    });
  }

  if (r0==='config'&&segs[1]==='reset-platform'&&m==='POST') {
    const b = await readBody(req);
    const r = await handlePlatformReset(req, b);
    return jsonResponse(res, r.data, r.status);
  }

  // Audit log
  if (r0==='audit'&&m==='GET') {
    const a=requireAuth(req);if(!a.ok)return jsonResponse(res,{error:a.error},a.status);
    if(a.user.rol!==ROLES.ROOT)return jsonResponse(res,{error:'Solo root'},403);
    return jsonResponse(res,{logs:(db().auditLog||[]).map((l)=>({
      ...l,
      user: normalizeRootAuditLabel(l.user),
      detail: normalizeRootAuditLabel(l.detail),
    }))});
  }
  if (r0==='audit'&&segs[1]==='clear'&&m==='POST') {
    const a=requireAuth(req);if(!a.ok)return jsonResponse(res,{error:a.error},a.status);
    if(a.user.rol!==ROLES.ROOT)return jsonResponse(res,{error:'Solo root'},403);
    db().auditLog=[];
    await save();
    return jsonResponse(res,{success:true,logs:0});
  }

  // Backup export
  if (r0==='backup'&&segs[1]==='export'&&m==='GET') {
    const a=requireAuth(req);if(!a.ok)return jsonResponse(res,{error:a.error},a.status);
    if(a.user.rol!==ROLES.ROOT)return jsonResponse(res,{error:'Solo root'},403);
    audit('EXPORT','backup','Exportación completa',a.user);await save();
    return jsonResponse(res, buildBackupPayload(db()));
  }

  // Backup import
  if (r0==='backup'&&segs[1]==='import'&&m==='POST') {
    const a=requireAuth(req);if(!a.ok)return jsonResponse(res,{error:a.error},a.status);
    if(a.user.rol!==ROLES.ROOT)return jsonResponse(res,{error:'Solo root'},403);
    const b=await readBody(req);
    try {
      applyBackupPayload(db(), b);
    } catch (err) {
      return jsonResponse(res,{error:err.message||'Formato inválido'},err.status||400);
    }
    audit('IMPORT','backup','Importación de datos',a.user);await save();
    return jsonResponse(res,{success:true,carreras:(db().carreras||[]).length,usuarios:(db().usuarios||[]).length});
  }

  return jsonResponse(res,{error:'Endpoint no encontrado'},404);
}

module.exports = {
  init,
  updateDb,
  handleAdminAPI,
  __test: {
    buildCarreraFromBody,
    handleLogin,
    handlePlatformReset,
    safeUser,
    ensureUserLogin,
    addNewsletterEmailsBatch,
    parseNewsletterEmailsFromWorkbook,
    mapDispatchLogRow,
    handleNewsletterExport,
  },
};
