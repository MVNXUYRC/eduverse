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
const { createStore } = require('./persistence');
const { StateRepository } = require('./repositories/state-repository');

const PORT         = process.env.PORT || 3000;
const NODE_ENV     = process.env.NODE_ENV || 'development';
const FRONTEND_DIR = path.join(__dirname, '../frontend');
const MAX_JSON_BODY_BYTES = 1 * 1024 * 1024; // 1 MB
const MAX_REQUEST_BYTES = 50 * 1024 * 1024; // 50 MB
// ── DB ────────────────────────────────────────────────────
const store = createStore();
const stateRepo = new StateRepository(store);
let db = {};
let dbReady = false;

async function initStore() {
  if (store.runSchema) await store.runSchema();
  db = await stateRepo.load();
  dbReady = true;
}

async function saveDB() {
  await stateRepo.save(db);
  // Recarga para mantener referencias consistentes (normalización postgres)
  db = await stateRepo.load();
}
const initPromise = initStore();

// ── Admin module ──────────────────────────────────────────
const adminRouter = require('./admin/router');

// Proper save: persist, reload db reference, then UPDATE the router's db reference
// without replacing the save function (that would break subsequent saves)
async function adminSave() {
  await saveDB();
  // Update router's db reference WITHOUT replacing its save function
  adminRouter.updateDb(db);
}
initPromise
  .then(() => adminRouter.init(db, adminSave))
  .catch((err) => {
    console.error('Error inicializando storage:', err.message);
    process.exit(1);
  });

const { isActiveState } = require('./admin/auth');
const { ALLOWED_EMAILS } = require('./auth-config');
const ALLOWED_DISCIPLINAS = ['Ciencias Sociales', 'Ciencias Aplicadas', 'Artes'];

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
  return {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': allowSameOriginFrame ? 'SAMEORIGIN' : 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': csp,
  };
}

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, {
    ...securityHeaders('application/json'),
  });
  res.end(JSON.stringify(data));
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

function safeText(value, max = 8000) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function safeRichHtml(html, max = 180000) {
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
  return out.trim().slice(0, max);
}
// All carreras are public (active or not — see spec: inactive = "Propuesta finalizada")
// But filter still exists for search — return all, mark status
function enrichCarrera(c) {
  const sanitized = {
    ...c,
    nombre: safeText(c.nombre, 240),
    tipo: safeText(c.tipo, 80),
    subtipo: safeText(c.subtipo, 80),
    disciplina: safeText(c.disciplina, 120),
    modalidad: safeText(c.modalidad, 120),
    duracion: safeText(c.duracion, 80),
    unidadAcademica: safeText(c.unidadAcademica, 180),
    regional: safeText(c.regional, 120),
    contacto: safeText(c.contacto, 220),
    telefonoContacto: safeText(c.telefonoContacto, 80),
    descripcion: safeRichHtml(c.descripcion),
    requisitosTexto: safeRichHtml(c.requisitosTexto),
    programa: safeRichHtml(c.programa),
    tags: (Array.isArray(c.tags) ? c.tags : []).map((t)=>safeText(t,80)).filter(Boolean).slice(0, 40),
    disertantes: (Array.isArray(c.disertantes) ? c.disertantes : []).map((d)=>safeText(d,120)).filter(Boolean).slice(0, 40),
    unidadesAcademicas: (Array.isArray(c.unidadesAcademicas) ? c.unidadesAcademicas : []).map((u)=>safeText(u,180)).filter(Boolean),
    documentos: (Array.isArray(c.documentos) ? c.documentos : []).map((d)=>({
      ...d,
      tipo: safeText(d?.tipo, 80),
      organismo: safeText(d?.organismo, 120),
      numero: safeText(d?.numero, 40),
      anio: safeText(d?.anio, 10),
      pdf: safeText(d?.pdf, 600),
    })),
  };
  return {
    ...sanitized,
    _activo:             carreraIsActive(c),
    _inscripcionAbierta: carreraIsInscripcionAbierta(c),
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
    // Check 2: registered users in db.json (active users)
    const dbUser = (db.usuarios||[]).find(u=>
      u.email.toLowerCase()===email && u.activo!==false
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
    results=results.filter(c=>
      norm(c.nombre).includes(ql)||
      norm(c.descripcion).includes(ql)||
      norm(c.disciplina).includes(ql)||
      (c.tags||[]).some(t=>norm(t).includes(ql))||
      (c.disertantes||[]).some(d=>norm(d).includes(ql))||
      norm((c.unidadesAcademicas||[c.unidadAcademica]).join(' ')).includes(ql)
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
  return jsonResponse(res,{cursos,nuevas,disciplinas,inscripcionAbierta,stats:{facultades:facultadesActivas,regionales:regionalesActivas,tiene100Virtual,total:active.length,carreras:totalCarreras,cursos:totalCursos}});
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
  if (pathname.startsWith('/admin/api')) {
    try {
      return await adminRouter.handleAdminAPI(req,res,pathname,params,jsonResponse,readBody);
    } catch (err) {
      console.error('[admin/api] Unhandled error:', err);
      return jsonResponse(res,{error:'Error interno del servidor (admin).'},500);
    }
  }
  if (pathname.startsWith('/cpanel/api')) {
    const rewrittenPath = pathname.replace('/cpanel/api', '/admin/api');
    try {
      return await adminRouter.handleAdminAPI(req,res,rewrittenPath,params,jsonResponse,readBody);
    } catch (err) {
      console.error('[cpanel/api] Unhandled error:', err);
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
  if (pathname==='/api/careers/featured') return handleFeatured(res);
  if (pathname==='/api/careers/filters')  return handleFilters(res);
  if (pathname.startsWith('/api/careers')) {
    const sub=segments[2];
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

const server = http.createServer(router);
server.listen(PORT,'0.0.0.0',()=>{
  console.log(`\nEAD — Educación a Distancia [${NODE_ENV}] → http://localhost:${PORT}`);
  console.log(`Storage mode: ${stateRepo.getMode()}`);
  console.log(`Propuestas: ${(db.carreras||[]).length} registros`);
  console.log(`CPanel: http://localhost:${PORT}/cpanel`);
  console.log(`Root: ${require('./admin/auth').ROOT_EMAIL}\n`);
});
process.on('SIGTERM',()=>{ server.close(async ()=>{ await stateRepo.close(); process.exit(0); }); });
process.on('SIGINT', ()=>{ server.close(async ()=>{ await stateRepo.close(); process.exit(0); }); });
module.exports = server;
