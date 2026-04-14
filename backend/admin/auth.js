/**
 * UNaM — Auth Module v4
 * Roles: root > institucional > unidades
 * Labels UI: root / Administrador Institucional / Administrador de Unidades
 */
const crypto = require('crypto');
const { EAD_UNIT } = require('../domain/constants');
const { createPasswordHash, verifyPasswordHash, legacyPasswordHash, isLegacyPasswordHash } = require('../domain/security');

const ROOT_EMAIL = String(process.env.ROOT_EMAIL || 'joel_barrera@outlook.com').trim().toLowerCase();
const ROOT_LOGIN = String(process.env.ROOT_LOGIN || 'root-unam').trim().toLowerCase();
let JWT_SECRET = process.env.ADMIN_JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Falta ADMIN_JWT_SECRET en producción. Definí una clave fuerte para firmar tokens.');
  }
  JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn('[security] ADMIN_JWT_SECRET no definido. Se usa clave efímera solo para desarrollo local.');
}
if (process.env.NODE_ENV === 'production' && String(JWT_SECRET).length < 32) {
  throw new Error('ADMIN_JWT_SECRET es demasiado corto para producción. Usá al menos 32 caracteres aleatorios.');
}
const TOKEN_TTL  = 8 * 60 * 60 * 1000; // 8h

const ROLES      = { ROOT: 'root', INSTITUCIONAL: 'institucional', UNIDADES: 'unidades' };
const ROLE_LEVEL = { root: 3, institucional: 2, unidades: 1 };

// Labels para la UI
const ROLE_LABELS = {
  root:          'root',
  institucional: 'Administrador Institucional',
  unidades:      'Administrador de Unidades',
};

const CAN_CREATE = {
  root:          ['root', 'institucional', 'unidades'],
  institucional: ['unidades'],
  unidades:      [],
};

// ── JWT ──────────────────────────────────────────────────
function b64url(s) {
  return Buffer.from(s).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
function signJWT(payload) {
  const h = b64url(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const b = b64url(JSON.stringify({...payload, iat:Date.now(), exp:Date.now()+TOKEN_TTL}));
  const s = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url');
  return `${h}.${b}.${s}`;
}
function verifyJWT(token) {
  try {
    const [h,b,s] = (token||'').split('.');
    const e = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url');
    if (s!==e) return null;
    const p = JSON.parse(Buffer.from(b,'base64url').toString());
    if (p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
}
function extractToken(req) {
  const a = req.headers['authorization']||'';
  return a.startsWith('Bearer ') ? a.slice(7) : null;
}

// ── Middlewares ───────────────────────────────────────────
function requireAuth(req) {
  const t = extractToken(req);
  if (!t) return {ok:false,status:401,error:'Token requerido'};
  const p = verifyJWT(t);
  if (!p) return {ok:false,status:401,error:'Token inválido o expirado'};
  return {ok:true,user:p};
}
function requireRole(req, minRole) {
  const a = requireAuth(req);
  if (!a.ok) return a;
  if ((ROLE_LEVEL[a.user.rol]||0) < (ROLE_LEVEL[minRole]||99))
    return {ok:false,status:403,error:'Permisos insuficientes'};
  return a;
}

// ── Lógica de estados con fecha ───────────────────────────
// Evalúa si un estado {activo/valor, fechaHasta} está activo en este momento
function isActiveState(state) {
  if (!state) return false;
  const val = state.valor !== undefined ? state.valor : state.activo;
  if (!val) return false;
  if (!state.fechaHasta) return true; // sin fecha = indefinido
  const raw = String(state.fechaHasta || '').trim();
  if (!raw) return true;
  // Si la fecha viene como YYYY-MM-DD, considerar activo hasta fin de ese día.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T23:59:59.999`) > new Date();
  }
  return new Date(raw) > new Date();
}

// Serializa estado al guardar
function normalizeState(input) {
  if (typeof input === 'boolean') return { valor: input, fechaHasta: null };
  if (typeof input === 'object' && input !== null) {
    return {
      valor: input.valor !== undefined ? !!input.valor : !!input.activo,
      fechaHasta: input.fechaHasta || null,
    };
  }
  return { valor: false, fechaHasta: null };
}

// ── Generador de contraseña segura ────────────────────────
function generatePassword() {
  const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower   = 'abcdefghjkmnpqrstuvwxyz';
  const digits  = '23456789';
  const special = '@#$%&*!';
  const all     = upper + lower + digits + special;
  const getRand = (str) => str[crypto.randomInt(0, str.length)];
  let pass = [getRand(upper),getRand(upper),getRand(lower),getRand(lower),getRand(digits),getRand(digits),getRand(special),getRand(all),getRand(all),getRand(all)];
  for (let i=pass.length-1;i>0;i--) { const j=crypto.randomInt(0,i+1); [pass[i],pass[j]]=[pass[j],pass[i]]; }
  return pass.join('');
}

// ── Helpers ───────────────────────────────────────────────
function usernameFromEmail(email) {
  return (email||'').split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g,'');
}
function normalizeLogin(login) {
  return String(login || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}
function resolveLogin(login, email) {
  return normalizeLogin(login || usernameFromEmail(email));
}
function isRootIdentity(user) {
  if (!user || typeof user !== 'object') return false;
  return (user.rol === ROLES.ROOT)
    || (normalizeLogin(user.login) === normalizeLogin(ROOT_LOGIN))
    || (String(user.email || '').trim().toLowerCase() === ROOT_EMAIL.toLowerCase());
}
function publicAdminIdentity(user) {
  if (!user) return '?';
  if (isRootIdentity(user)) return ROOT_LOGIN;
  return String(user.email || resolveLogin(user.login, user.email) || '?').trim();
}
function maskRootEmailInText(value) {
  const raw = String(value || '');
  if (!raw) return raw;
  return raw.split(ROOT_EMAIL).join(ROOT_LOGIN);
}
function toProperCase(str) {
  return (str||'').trim().toLowerCase().split(/\s+/)
    .map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
}
function hashPassword(plain) {
  return createPasswordHash(plain, JWT_SECRET);
}
function formatDNI(raw) {
  const d = String(raw||'').replace(/\D/g,'');
  // Format as X.XXX.XXX or XX.XXX.XXX
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function formatPhone(raw) {
  const d = String(raw||'').replace(/\D/g,'');
  if (d.length < 8) return d;
  const clean = d.replace(/^54/,'').replace(/^9/,'');
  const area=clean.slice(0,4), p1=clean.slice(4,6), p2=clean.slice(6,10);
  return `+54 9 ${area} ${p1}-${p2}`;
}
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email||'').trim());
}
function validateDNI(dni) {
  return /^\d{7,8}$/.test(String(dni||'').replace(/\D/g,''));
}
function validatePassword(password) {
  if (!password||password.length<8)  return 'Mínimo 8 caracteres';
  if (!/[A-Z]/.test(password))       return 'Al menos una mayúscula';
  if (!/[a-z]/.test(password))       return 'Al menos una minúscula';
  if (!/[0-9]/.test(password))       return 'Al menos un número';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Al menos un carácter especial';
  return null;
}
function validateLogin(login) {
  const normalized = normalizeLogin(login);
  if (!normalized) return 'Usuario de acceso obligatorio';
  if (normalized.length < 4) return 'El usuario de acceso debe tener al menos 4 caracteres';
  if (!/^[a-z0-9._-]+$/.test(normalized)) return 'El usuario de acceso solo admite letras minúsculas, números, punto, guion y guion bajo';
  return null;
}

module.exports = {
  ROOT_EMAIL, ROOT_LOGIN, ROLES, ROLE_LEVEL, ROLE_LABELS, CAN_CREATE, EAD_UNIT,
  signJWT, verifyJWT, extractToken,
  requireAuth, requireRole,
  isActiveState, normalizeState,
  generatePassword, usernameFromEmail, normalizeLogin, resolveLogin, isRootIdentity, publicAdminIdentity, maskRootEmailInText, toProperCase,
  hashPassword, verifyPasswordHash: (plain, stored) => verifyPasswordHash(plain, stored, JWT_SECRET), legacyPasswordHash: (plain) => legacyPasswordHash(plain, JWT_SECRET), isLegacyPasswordHash,
  formatPhone, formatDNI,
  validateEmail, validateDNI, validatePassword, validateLogin,
};
