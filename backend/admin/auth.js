/**
 * UNaM — Auth Module v4
 * Roles: root > institucional > unidades
 * Labels UI: root / Administrador Institucional / Administrador de Unidades
 */
const crypto = require('crypto');

const ROOT_EMAIL = 'joel_barrera@outlook.com';
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'unam-admin-secret-2025-change-in-prod';
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

// Unidad que solo permite cursos
const EAD_UNIT = 'Educación a Distancia';

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
  return new Date(state.fechaHasta) > new Date();
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
function toProperCase(str) {
  return (str||'').trim().toLowerCase().split(/\s+/)
    .map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
}
function hashPassword(plain) {
  return crypto.createHash('sha256').update(plain+JWT_SECRET).digest('hex');
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

module.exports = {
  ROOT_EMAIL, ROLES, ROLE_LEVEL, ROLE_LABELS, CAN_CREATE, EAD_UNIT,
  signJWT, verifyJWT, extractToken,
  requireAuth, requireRole,
  isActiveState, normalizeState,
  generatePassword, usernameFromEmail, toProperCase,
  hashPassword, formatPhone,
  validateEmail, validateDNI, validatePassword,
};
