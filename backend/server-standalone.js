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

const PORT         = process.env.PORT || 3000;
const NODE_ENV     = process.env.NODE_ENV || 'development';
const FRONTEND_DIR = path.join(__dirname, '../frontend');
const DB_PATH      = path.join(__dirname, 'data/db.json');

// ── DB ────────────────────────────────────────────────────
let db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
function saveDB()   { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
function reloadDB() { db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }

// ── Admin module ──────────────────────────────────────────
const adminRouter = require('./admin/router');

// Proper save: persist, reload db reference, then UPDATE the router's db reference
// without replacing the save function (that would break subsequent saves)
function adminSave() {
  saveDB();
  reloadDB(); // update local db reference
  // Update router's db reference WITHOUT replacing its save function
  adminRouter.updateDb(db);
}
adminRouter.init(db, adminSave);

const { isActiveState } = require('./admin/auth');
const { ALLOWED_EMAILS } = require('./auth-config');

// ── MIME ──────────────────────────────────────────────────
const MIME = {
  '.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
  '.svg':'image/svg+xml','.ico':'image/x-icon','.pdf':'application/pdf',
};

// ── Helpers ───────────────────────────────────────────────
function jsonResponse(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,Authorization',
  });
  res.end(JSON.stringify(data));
}

function serveStatic(res, filePath) {
  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const content = fs.readFileSync(filePath);
    const headers = {'Content-Type':mime};
    if (ext==='.pdf') {
      headers['Content-Disposition'] = 'inline';
      headers['X-Content-Type-Options'] = 'nosniff';
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
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      res.end(index);
    } catch { res.writeHead(404); res.end('Not found'); }
  }
}

function readBody(req) {
  return new Promise((resolve,reject)=>{
    let body='';
    req.on('data',chunk=>body+=chunk.toString());
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
// All carreras are public (active or not — see spec: inactive = "Propuesta finalizada")
// But filter still exists for search — return all, mark status
function enrichCarrera(c) {
  return {
    ...c,
    _activo:             carreraIsActive(c),
    _inscripcionAbierta: carreraIsInscripcionAbierta(c),
  };
}

// ── Public Auth (Google) ──────────────────────────────────
async function handlePublicAuth(req, res, pathname) {
  if (pathname==='/api/auth/verify'&&req.method==='POST') {
    const body=await readBody(req);
    const email=(body.email||'').toLowerCase().trim();
    if (!email) return jsonResponse(res,{allowed:false},400);
    reloadDB();
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
  reloadDB();
  // Return ALL carreras (active and inactive) — inactive = "Propuesta finalizada"
  // Frontend differentiates by _activo
  let results = (db.carreras||[]).map(enrichCarrera);

  const q=params.get('q');
  if (q) {
    const ql=q.toLowerCase();
    results=results.filter(c=>
      c.nombre.toLowerCase().includes(ql)||
      (c.descripcion||'').toLowerCase().includes(ql)||
      (c.disciplina||'').toLowerCase().includes(ql)||
      (c.tags||[]).some(t=>t.toLowerCase().includes(ql))||
      (c.unidadesAcademicas||[c.unidadAcademica]).join(' ').toLowerCase().includes(ql)
    );
  }
  const esCurso=params.get('esCurso');
  if (esCurso!==null&&esCurso!=='') results=results.filter(c=>c.esCurso===(esCurso==='true'));
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
  reloadDB();
  const all  = (db.carreras||[]).map(enrichCarrera);
  const active = all.filter(c=>c._activo);

  const cursos  = active.filter(c=>c.esCurso).slice(0,6);
  const nuevas  = active.filter(c=>c.nueva).slice(0,6);
  const inscripcionAbierta = active.filter(c=>carreraIsInscripcionAbierta(c)).slice(0,6);

  // Disciplinas: ALL carreras (active or not)
  const discCount = all.reduce((acc,c)=>{
    if (c.disciplina) acc[c.disciplina]=(acc[c.disciplina]||0)+1;
    return acc;
  },{});
  const disciplinas = Object.entries(discCount).sort((a,b)=>b[1]-a[1]).map(([nombre,cantidad])=>({nombre,cantidad}));

  // Stats for hero
  const facultadesActivas = new Set(
    active.filter(c=>(c.unidadesAcademicas||[c.unidadAcademica]).some(u=>u?.startsWith('Facultad')))
      .flatMap(c=>c.unidadesAcademicas||[c.unidadAcademica])
      .filter(u=>u?.startsWith('Facultad'))
  ).size;
  const regionalesActivas = new Set(active.map(c=>c.regional).filter(Boolean)).size;
  const tiene100Virtual   = active.some(c=>c.modalidad==='100% Virtual');

  return jsonResponse(res,{cursos,nuevas,disciplinas,inscripcionAbierta,stats:{facultades:facultadesActivas,regionales:regionalesActivas,tiene100Virtual,total:active.length}});
}

function handleFilters(res) {
  reloadDB();
  const all = (db.carreras||[]).map(enrichCarrera);
  return jsonResponse(res,{
    tipos:          ['Pregrado','Grado','Posgrado','Curso'],
    subtipos:       ['Especialización','Maestría','Doctorado'],
    disciplinas:    [...new Set(all.map(c=>c.disciplina).filter(Boolean))].sort(),
    modalidades:    [...new Set(all.map(c=>c.modalidad).filter(Boolean))].sort(),
    unidadesAcademicas: db.unidadesAcademicas||[],
    regionales:     db.regionales||[],
  });
}

// ── Public access check ──────────────────────────────────
function isPublicAccessMode() {
  reloadDB(); // always read fresh from disk
  return db.config?.acceso_publico !== false; // default: open
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
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const params   = new URLSearchParams(parsed.query);
  const segments = pathname.split('/').filter(Boolean);

  if (req.method==='OPTIONS') {
    res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'});
    return res.end();
  }

  if (pathname==='/api/health') {
    return jsonResponse(res,{status:'OK',env:NODE_ENV,timestamp:new Date().toISOString(),carreras:(db.carreras||[]).length});
  }

  // Public site access mode (for frontend to know if login required)
  if (pathname==='/api/access-mode') {
    return jsonResponse(res,{open: isPublicAccessMode()});
  }

  // Enforce public access mode on API routes
  if (pathname.startsWith('/api/') && !isPublicAccessMode()) {
    const { requireAuth } = require('./admin/auth');
    const authResult = requireAuth(req);
    if (!authResult.ok) {
      return jsonResponse(res,{error:'Acceso restringido. Autenticación requerida.',restricted:true},401);
    }
  }

  // Admin panel
  if (pathname==='/admin'||pathname==='/admin/') {
    try {
      const html=fs.readFileSync(path.join(FRONTEND_DIR,'admin.html'));
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      return res.end(html);
    } catch { res.writeHead(404); return res.end('Panel no encontrado'); }
  }
  if (pathname.startsWith('/admin/api')) {
    return adminRouter.handleAdminAPI(req,res,pathname,params,jsonResponse,readBody);
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
      reloadDB();
      const career=(db.carreras||[]).find(c=>c.id===parseInt(sub));
      if (!career) return jsonResponse(res,{error:'No encontrada'},404);
      return jsonResponse(res,enrichCarrera(career));
    }
    return handleSearch(res,params);
  }

  // Block direct access to admin.html
  if (pathname.includes('admin.html')) { res.writeHead(404); return res.end('Not found'); }

  serveStatic(res, path.join(FRONTEND_DIR, pathname==='/'?'index.html':pathname));
}

const server = http.createServer(router);
server.listen(PORT,'0.0.0.0',()=>{
  console.log(`\nUNaM Académica [${NODE_ENV}] → http://localhost:${PORT}`);
  console.log(`Carreras: ${(db.carreras||[]).length} registros`);
  console.log(`Panel admin: http://localhost:${PORT}/admin`);
  console.log(`Root: ${require('./admin/auth').ROOT_EMAIL}\n`);
});
process.on('SIGTERM',()=>{ server.close(()=>process.exit(0)); });
process.on('SIGINT', ()=>{ server.close(()=>process.exit(0)); });
module.exports = server;
