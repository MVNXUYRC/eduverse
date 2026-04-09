/**
 * UNaM — Admin API Router v6
 * Docs múltiples (tipo+organismo+numero+anio+pdf)
 * Carreras interinstitucionales (múltiples unidades)
 * Programa como texto (WYSIWYG)
 * activo → visibility with "Propuesta finalizada" label
 */
const fs   = require('fs');
const path = require('path');
const {
  ROOT_EMAIL, ROLES, CAN_CREATE, EAD_UNIT,
  signJWT, requireAuth, requireRole,
  isActiveState, normalizeState,
  toProperCase,
  formatPhone, formatDNI, hashPassword,
  validateEmail, validateDNI, validatePassword, generatePassword,
} = require('./auth');
const { buildBackupPayload, applyBackupPayload } = require('./backup-utils');
const ALLOWED_DISCIPLINAS = ['Ciencias Sociales', 'Ciencias Aplicadas', 'Artes'];
const DEFAULT_CONSTRUCTION_IMAGE = '/public/site-under-construction.svg';
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB por archivo
const MAX_REQUEST_BYTES = 50 * 1024 * 1024; // 50 MB por request
const ROOT_PASSWORD = String(process.env.ROOT_PASSWORD || '');
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const loginAttempts = new Map();

const UPLOADS_DIR = path.join(__dirname, '../../frontend/uploads');

let _db, _save;
function init(db, save) {
  _db = db;
  if (typeof save === 'function') _save = save;
}
// Called after server reloads db, without replacing save function
function updateDb(db) { _db = db; }

// Audit log helper
function audit(action, entity, detail, user) {
  if (!db().auditLog) db().auditLog = [];
  db().auditLog.unshift({
    ts: new Date().toISOString(),
    action, entity, detail,
    user: user?.email || '?',
    rol: user?.rol || '?',
  });
  // Keep last 500 entries
  if (db().auditLog.length > 500) db().auditLog = db().auditLog.slice(0,500);
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

function sanitizeText(value, max = 5000) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function sanitizeUrl(value, { allowMailto = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const p = u.protocol.toLowerCase();
    if (p === 'http:' || p === 'https:' || (allowMailto && p === 'mailto:')) return raw;
  } catch {
    return '';
  }
  return '';
}

function sanitizeRichHtml(html) {
  let out = String(html || '');
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
  out = out.replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '');
  out = out.replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '');
  out = out.replace(/<embed[\s\S]*?>/gi, '');
  out = out.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '');
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
  out = out.replace(/\shref\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, '');
  out = out.replace(/\ssrc\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, '');
  out = out.replace(/\sstyle\s*=\s*(['"])[\s\S]*?\1/gi, '');
  return out.trim().slice(0, 180000);
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
  if (storedHash) return storedHash === hashPassword(password);
  if (!ROOT_PASSWORD) return null;
  return password === ROOT_PASSWORD;
}

// Carrera tiene unidadesAcademicas[] (array) — soporte interinstitucional
function canManageCarrera(user, unidades) {
  if (user.rol===ROLES.ROOT||user.rol===ROLES.INSTITUCIONAL) return true;
  const uArr = Array.isArray(unidades) ? unidades : [unidades];
  return uArr.some(u => (user.unidades||[]).includes(u));
}

function safeUser(u) {
  if (!u) return null;
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
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return { status: 400, data: { error: 'Correo y contraseña son obligatorios.' } };

  const emailKey = canonicalEmail(email);
  const ip = getClientIp(req);
  const attemptKey = getLoginKey(emailKey, ip);
  const attempts = getAttemptInfo(attemptKey);
  if (attempts.lockedUntil && attempts.lockedUntil > Date.now()) {
    const mins = Math.max(1, Math.ceil((attempts.lockedUntil - Date.now()) / 60000));
    return { status: 429, data: { error: `Demasiados intentos fallidos. Reintentá en ${mins} minuto(s).` } };
  }

  if (emailKey === canonicalEmail(ROOT_EMAIL)) {
    const rootPasswordValid = verifyRootPassword(password);
    if (rootPasswordValid === null) {
      return { status: 500, data: { error: 'ROOT_PASSWORD no configurada en el servidor.' } };
    }
    if (!rootPasswordValid) {
      registerLoginFailure(attemptKey);
      return { status: 401, data: { error: 'Credenciales inválidas.' } };
    }
    clearLoginAttempts(attemptKey);
    const rootUser = { id:'root', email:ROOT_EMAIL, nombre:'Administrador', apellido:'Root', rol:ROLES.ROOT, unidades:db().unidadesAcademicas||[] };
    const token = signJWT(rootUser);
    audit('LOGIN', 'sesion', `Acceso al panel desde IP ${ip}`, rootUser);
    await save();
    return {status:200,data:{token,rol:ROLES.ROOT,nombre:'Administrador Root'}};
  }

  const user = (db().usuarios||[]).find(u=>canonicalEmail(u.email)===emailKey);
  if (!user || user.activo===false || !user.passwordHash) {
    registerLoginFailure(attemptKey);
    return {status:401,data:{error:'Credenciales inválidas.'}};
  }
  if (user.passwordHash !== hashPassword(password)) {
    registerLoginFailure(attemptKey);
    return {status:401,data:{error:'Credenciales inválidas.'}};
  }

  clearLoginAttempts(attemptKey);
  const token = signJWT({id:user.id,email:user.email,nombre:user.nombre,apellido:user.apellido,rol:user.rol,unidades:user.unidades||[]});
  const idx = db().usuarios.findIndex(u=>u.id===user.id);
  audit('LOGIN', 'sesion', `Acceso al panel desde IP ${ip}`, user);
  if (idx!==-1) db().usuarios[idx].ultimoAcceso=new Date().toISOString();
  await save();
  return {status:200,data:{token,rol:user.rol,nombre:`${user.nombre} ${user.apellido}`}};
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
    if (hashPassword(String(newPassword))===getRootPasswordHash()) {
      return {status:400,data:{error:'La nueva contraseña debe ser diferente'}};
    }
    const config = ensureConfig();
    config.root_password_hash = hashPassword(String(newPassword));
    config.root_password_changed_at = new Date().toISOString();
    config.root_password_changed_by = auth.user.email;
    await save();
    return {status:200,data:{success:true}};
  }
  const idx = (db().usuarios||[]).findIndex(u=>u.id===auth.user.id);
  if (idx===-1) return {status:404,data:{error:'Usuario no encontrado'}};
  const user = db().usuarios[idx];
  if (user.passwordHash!==hashPassword(currentPassword)) return {status:401,data:{error:'Contraseña actual incorrecta'}};
  if (hashPassword(newPassword)===user.passwordHash) return {status:400,data:{error:'La nueva contraseña debe ser diferente'}};
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
  return {status:200,data:{data:(db().usuarios||[]).map(safeUser),total:(db().usuarios||[]).length}};
}

async function handleCreateUsuario(req, body) {
  const auth = requireRole(req, ROLES.INSTITUCIONAL);
  if (!auth.ok) return {status:auth.status,data:{error:auth.error}};
  const cr = auth.user;
  const {nombre,apellido,dni,email,telefono,unidades,rol} = body;
  if (!nombre?.trim())   return {status:400,data:{error:'Nombre obligatorio'}};
  if (!apellido?.trim()) return {status:400,data:{error:'Apellido obligatorio'}};
  if (!dni)              return {status:400,data:{error:'Documento obligatorio'}};
  if (!email)            return {status:400,data:{error:'Correo obligatorio'}};
  if (!telefono?.trim()) return {status:400,data:{error:'Teléfono obligatorio'}};
  if (!rol)              return {status:400,data:{error:'Rol obligatorio'}};
  if (!validateEmail(email))  return {status:400,data:{error:'Formato de correo inválido'}};
  if (!validateDNI(dni))      return {status:400,data:{error:'DNI inválido (7-8 dígitos)'}};
  if (!CAN_CREATE[cr.rol]?.includes(rol)) return {status:403,data:{error:`No podés crear usuarios con rol "${rol}"`}};
  if (rol===ROLES.UNIDADES&&(!unidades||!unidades.length))
    return {status:400,data:{error:'El Administrador de Unidades debe tener al menos una unidad académica asignada'}};
  const dniClean = String(dni).replace(/\D/g,'');
  if ((db().usuarios||[]).find(u=>canonicalEmail(u.email)===canonicalEmail(email)))
    return {status:409,data:{error:'El correo ya está registrado'}};
  if ((db().usuarios||[]).find(u=>String(u.dni).replace(/\D/g,'')===dniClean))
    return {status:409,data:{error:'El documento ya está registrado'}};
  const plainPassword = generatePassword();
  const nuevo = {
    id:nextId(db().usuarios||[]),
    nombre:toProperCase(nombre),apellido:toProperCase(apellido),
    dni:formatDNI(dniClean),email:email.trim(),
    telefono:formatPhone(telefono),rol,unidades:unidades||[],
    activo:true,creadoPor:cr.email,creadoEn:new Date().toISOString(),
    ultimoAcceso:null,
    passwordHash:hashPassword(plainPassword),
    mustChangePassword:true,
    passwordChangedAt:null,
  };
  if (!db().usuarios) db().usuarios=[];
  db().usuarios.push(nuevo);
  audit('CREAR', 'usuario', nuevo.email, auth.user);
  await save();
  return {status:201,data:{...safeUser(nuevo),generatedPassword:plainPassword}};
}

async function handleUpdateUsuario(req, body, id) {
  const auth = requireRole(req, ROLES.INSTITUCIONAL);
  if (!auth.ok) return {status:auth.status,data:{error:auth.error}};
  const idx = (db().usuarios||[]).findIndex(u=>u.id===parseInt(id));
  if (idx===-1) return {status:404,data:{error:'Usuario no encontrado'}};
  const user = db().usuarios[idx];
  if (user.email.toLowerCase()===ROOT_EMAIL.toLowerCase()) return {status:403,data:{error:'No se puede modificar al root'}};
  if (body.rol&&body.rol!==user.rol&&auth.user.rol!==ROLES.ROOT) return {status:403,data:{error:'Solo root puede cambiar roles'}};
  if (body.email&&body.email.toLowerCase()!==user.email.toLowerCase()) {
    if (!validateEmail(body.email)) return {status:400,data:{error:'Correo inválido'}};
    if ((db().usuarios||[]).find(u=>canonicalEmail(u.email)===canonicalEmail(body.email)&&u.id!==user.id))
      return {status:409,data:{error:'Correo ya registrado'}};
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
  user.modificadoPor=auth.user.email;
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
  if (db().usuarios[idx].email.toLowerCase()===ROOT_EMAIL.toLowerCase())
    return {status:403,data:{error:'No se puede eliminar al root'}};
  const email = db().usuarios[idx].email;
  const hard = params && params.get('hard')==='true';
  if (hard) {
    db().usuarios.splice(idx, 1);
    audit('ELIMINAR', 'usuario', email, auth.user);
    await save();
    return {status:200,data:{success:true,deleted:true,id:parseInt(id)}};
  }
  db().usuarios[idx].activo=false;
  db().usuarios[idx].desactivadoPor=auth.user.email;
  db().usuarios[idx].desactivadoEn=new Date().toISOString();
  audit('BAJA', 'usuario', email, auth.user);
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
    rows=rows.filter(c=>
      norm(c.nombre).includes(ql)||
      norm(c.disciplina).includes(ql)||
      (c.disertantes||[]).some(d=>norm(d).includes(ql))
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

  rows.sort((a,b)=>a.nombre.localeCompare(b.nombre));
  const limit=Math.min(parseInt(params.get('limit')||'20'),200);
  const page=Math.max(parseInt(params.get('page')||'1'),1);
  const total=rows.length;
  return {status:200,data:{data:rows.slice((page-1)*limit,page*limit),meta:{total,page,limit,totalPages:Math.ceil(total/limit)||1}}};
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
  const esCurso = body.esCurso==='true'||body.esCurso===true;

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
  const UNIDAD_REGIONAL = {
    'Facultad de Arte y Diseño': 'Oberá',
    'Facultad de Ciencias Económicas': 'Posadas',
    'Facultad de Ciencias Exactas, Químicas y Naturales': 'Posadas',
    'Facultad de Ciencias Forestales': 'Eldorado',
    'Facultad de Humanidades y Ciencias Sociales': 'Posadas',
    'Facultad de Ingeniería': 'Oberá',
    'Educación a Distancia': '',
    'Escuela Agrotécnica Eldorado': 'Eldorado',
    'Escuela de Enfermería': 'Posadas',
  };
  const autoRegional = UNIDAD_REGIONAL[primaryUnidad] ?? (body.regional || '');

  // documentos: array [{tipo,organismo,numero,anio,pdf}]
  let documentos;
  if (body.documentos) {
    try { documentos=JSON.parse(body.documentos); } catch { documentos=[]; }
  } else {
    documentos = existing?.documentos||[];
  }
  // Attach uploaded PDFs for each doc
  documentos = documentos.map((d,i)=>{
    const fk=`doc_pdf_${i}`;
    if (body[fk]?.filename) d.pdf=saveFile(body[fk].data,'resoluciones',body[fk].filename);
    d.tipo = sanitizeText(d.tipo, 80);
    d.organismo = sanitizeText(d.organismo, 120);
    d.numero = sanitizeText(d.numero, 40);
    d.anio = sanitizeText(d.anio, 10);
    if (d.pdf) d.pdf = sanitizeUrl(d.pdf) || d.pdf;
    return d;
  });

  return {
    nombre:               sanitizeText(body.nombre !== undefined ? body.nombre : (existing?.nombre || ''), 220),
    esCurso,
    tipo:                 esCurso ? 'Curso' : sanitizeText(body.tipo !== undefined ? body.tipo : (existing?.tipo || ''), 80),
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
    formularioInscripcion: esCurso ? sanitizeUrl(body.formularioInscripcion !== undefined ? body.formularioInscripcion : (existing?.formularioInscripcion || '')) : '',
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
    nueva:      body.nueva==='true'||body.nueva===true||(existing?.nueva||false),
    popular:    body.popular==='true'||body.popular===true||(existing?.popular||false),
    planEstudiosPDF: existing?.planEstudiosPDF||null,
  };
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
      data: { error: `El archivo "${oversized.filename}" supera el máximo de 20 MB por archivo.` },
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
    creadoPor:auth.user.email,
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
      data: { error: `El archivo "${oversized.filename}" supera el máximo de 20 MB por archivo.` },
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
    modificadoPor:auth.user.email,
    modificadoEn:new Date().toISOString(),
  };
  if (body.planEstudiosPDF?.filename)
    updated.planEstudiosPDF=saveFile(body.planEstudiosPDF.data,'planes',body.planEstudiosPDF.filename);

  db().carreras[idx]=updated;
  audit('EDITAR', 'carrera', updated.nombre, auth.user);
  await save();
  return {status:200,data:updated};
}

async function handlePatchCarrera(req, body, id) {
  const auth = requireRole(req, ROLES.UNIDADES);
  if (!auth.ok) return {status:auth.status,data:{error:auth.error}};
  const idx = (db().carreras||[]).findIndex(c=>c.id===parseInt(id));
  if (idx===-1) return {status:404,data:{error:'Carrera no encontrada'}};
  const c = db().carreras[idx];
  if (!canManageCarrera(auth.user, c.unidadesAcademicas||[c.unidadAcademica]))
    return {status:403,data:{error:'Sin permiso para esta carrera'}};
  if (body.activo !== undefined) {
    c.activo = normalizeState({valor:!!body.activo, fechaHasta:null});
    if (!body.activo) c.inscripcionAbierta = normalizeState({valor:false, fechaHasta:null});
    audit(body.activo?'ACTIVAR':'DESACTIVAR','carrera',c.nombre,auth.user);
  }
  if (body.inscripcionAbierta !== undefined) {
    c.inscripcionAbierta = normalizeState({valor:!!body.inscripcionAbierta, fechaHasta:null});
    if (body.inscripcionAbierta && !isActiveState(c.activo)) {
      c.activo = normalizeState({valor:true, fechaHasta:null});
    }
    audit(body.inscripcionAbierta?'ABRIR_INSCRIPCION':'CERRAR_INSCRIPCION','carrera',c.nombre,auth.user);
  }
  c.modificadoPor = auth.user.email;
  c.modificadoEn  = new Date().toISOString();
  await save();
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
    db().carreras.splice(idx, 1);
    audit('ELIMINAR', 'carrera', nombre, auth.user);
    await save();
    return {status:200,data:{success:true,deleted:true,id:parseInt(id)}};
  }
  // Soft delete (deactivate)
  db().carreras[idx].activo=normalizeState({valor:false,fechaHasta:null});
  db().carreras[idx].inscripcionAbierta=normalizeState({valor:false,fechaHasta:null});
  db().carreras[idx].desactivadoPor=auth.user.email;
  db().carreras[idx].desactivadoEn=new Date().toISOString();
  audit('BAJA', 'carrera', nombre, auth.user);
  await save();
  return {status:200,data:{success:true,id:parseInt(id)}};
}

// ── ROUTER ────────────────────────────────────────────────
async function handleAdminAPI(req, res, pathname, params, jsonResponse, readBody) {
  const base=pathname.replace('/admin/api','');
  const segs=base.split('/').filter(Boolean);
  const r0=segs[0], id=segs[1], m=req.method;

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
  if (r0==='unidades'&&m==='GET') {
    const a=requireAuth(req);
    if (!a.ok) return jsonResponse(res,{error:a.error},a.status);
    return jsonResponse(res,{data:db().unidadesAcademicas||[],eadUnit:EAD_UNIT});
  }
  if (r0==='config'&&m==='GET') {
    const a=requireAuth(req);
    if (!a.ok) return jsonResponse(res,{error:a.error},a.status);
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
    config.acceso_publico_modificado_por = a.user.email;
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
    config.sitio_en_construccion_modificado_por = a.user.email;
    config.sitio_en_construccion_modificado_en  = new Date().toISOString();
    await save();
    return jsonResponse(res,{
      success:true,
      sitio_en_construccion: config.sitio_en_construccion,
      imagen_construccion: config.imagen_construccion,
    });
  }

  // Audit log
  if (r0==='audit'&&m==='GET') {
    const a=requireAuth(req);if(!a.ok)return jsonResponse(res,{error:a.error},a.status);
    if(a.user.rol!==ROLES.ROOT)return jsonResponse(res,{error:'Solo root'},403);
    return jsonResponse(res,{logs:db().auditLog||[]});
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
  },
};
