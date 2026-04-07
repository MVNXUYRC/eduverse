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
  generatePassword, usernameFromEmail, toProperCase,
  hashPassword, formatPhone,
  validateEmail, validateDNI, validatePassword,
} = require('./auth');

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
    user: user?.username || user?.email || '?',
    rol: user?.rol || '?',
  });
  // Keep last 500 entries
  if (db().auditLog.length > 500) db().auditLog = db().auditLog.slice(0,500);
}
function db()   { return _db; }
function save() {
  if (typeof _save === 'function') _save();
  else console.error('[router] save() called but no save function registered!');
}

function nextId(arr) {
  return (arr||[]).length > 0 ? Math.max(...arr.map(x=>x.id||0))+1 : 1;
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
    const c=[]; req.on('data',ch=>c.push(ch)); req.on('end',()=>resolve(Buffer.concat(c))); req.on('error',reject);
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

// ── AUTH ──────────────────────────────────────────────────
async function handleLogin(body) {
  const email=(body.email||'').toLowerCase().trim(), pass=(body.password||'');
  if (!email||!pass) return {status:400,data:{error:'Email y contraseña requeridos'}};

  if (email===ROOT_EMAIL.toLowerCase()) {
    const rp = process.env.ROOT_PASSWORD||'UNaM@Root2025';
    if (pass!==rp) return {status:401,data:{error:'Credenciales incorrectas'}};
    const token = signJWT({id:'root',email:ROOT_EMAIL,username:'root',nombre:'Administrador',apellido:'Root',rol:ROLES.ROOT,unidades:db().unidadesAcademicas||[],mustChangePassword:false});
    return {status:200,data:{token,rol:ROLES.ROOT,nombre:'Administrador Root',mustChangePassword:false}};
  }

  const user = (db().usuarios||[]).find(u=>u.email.toLowerCase()===email);
  if (!user)        return {status:401,data:{error:'Credenciales incorrectas'}};
  if (!user.activo) return {status:403,data:{error:'Usuario desactivado'}};
  if (user.passwordHash!==hashPassword(pass)) return {status:401,data:{error:'Credenciales incorrectas'}};

  const mcp = !!user.mustChangePassword;
  const token = signJWT({id:user.id,email:user.email,username:user.username,nombre:user.nombre,apellido:user.apellido,rol:user.rol,unidades:user.unidades||[],mustChangePassword:mcp});
  const idx = db().usuarios.findIndex(u=>u.id===user.id);
  if (idx!==-1) { db().usuarios[idx].ultimoAcceso=new Date().toISOString(); save(); }
  return {status:200,data:{token,rol:user.rol,nombre:`${user.nombre} ${user.apellido}`,mustChangePassword:mcp}};
}

async function handleChangePassword(req, body) {
  const auth = requireAuth(req);
  if (!auth.ok) return {status:auth.status,data:{error:auth.error}};
  if (auth.user.rol===ROLES.ROOT) return {status:403,data:{error:'La contraseña del root se gestiona por variable ROOT_PASSWORD'}};
  const {currentPassword,newPassword} = body;
  if (!currentPassword||!newPassword) return {status:400,data:{error:'Ambas contraseñas son obligatorias'}};
  const err = validatePassword(newPassword);
  if (err) return {status:400,data:{error:err}};
  const idx = (db().usuarios||[]).findIndex(u=>u.id===auth.user.id);
  if (idx===-1) return {status:404,data:{error:'Usuario no encontrado'}};
  const user = db().usuarios[idx];
  if (user.passwordHash!==hashPassword(currentPassword)) return {status:401,data:{error:'Contraseña actual incorrecta'}};
  if (hashPassword(newPassword)===user.passwordHash) return {status:400,data:{error:'La nueva contraseña debe ser diferente'}};
  db().usuarios[idx].passwordHash=hashPassword(newPassword);
  db().usuarios[idx].mustChangePassword=false;
  db().usuarios[idx].passwordChangedAt=new Date().toISOString();
  save();
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
  if ((db().usuarios||[]).find(u=>u.email.toLowerCase()===email.toLowerCase()))
    return {status:409,data:{error:'El correo ya está registrado'}};
  if ((db().usuarios||[]).find(u=>String(u.dni).replace(/\D/g,'')===dniClean))
    return {status:409,data:{error:'El documento ya está registrado'}};
  // Institucional can assign any unit to new users
  const plainPassword = generatePassword();
  const nuevo = {
    id:nextId(db().usuarios||[]),
    nombre:toProperCase(nombre),apellido:toProperCase(apellido),
    dni:dniClean,email:email.trim(),username:usernameFromEmail(email),
    telefono:formatPhone(telefono),rol,unidades:unidades||[],
    passwordHash:hashPassword(plainPassword),mustChangePassword:true,
    activo:true,creadoPor:cr.username||cr.email,creadoEn:new Date().toISOString(),
    ultimoAcceso:null,passwordChangedAt:null,
  };
  if (!db().usuarios) db().usuarios=[];
  db().usuarios.push(nuevo);
  audit('CREAR', 'usuario', nuevo.email, auth.user);
  save();
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
    if ((db().usuarios||[]).find(u=>u.email.toLowerCase()===body.email.toLowerCase()&&u.id!==user.id))
      return {status:409,data:{error:'Correo ya registrado'}};
  }
  if (body.dni) {
    const dc=String(body.dni).replace(/\D/g,'');
    if (!validateDNI(dc)) return {status:400,data:{error:'DNI inválido'}};
    if ((db().usuarios||[]).find(u=>String(u.dni).replace(/\D/g,'')===dc&&u.id!==user.id))
      return {status:409,data:{error:'Documento ya registrado'}};
    body.dni=dc;
  }
  if (body.nombre)   user.nombre=toProperCase(body.nombre);
  if (body.apellido) user.apellido=toProperCase(body.apellido);
  if (body.dni)      user.dni=body.dni;
  if (body.telefono) user.telefono=formatPhone(body.telefono);
  if (body.email)    {user.email=body.email.trim();user.username=usernameFromEmail(body.email);}
  if (body.rol)      user.rol=body.rol;
  if (body.unidades) user.unidades=body.unidades;
  if (body.activo!==undefined) user.activo=body.activo;
  let newPlainPass=null;
  if (body.resetPassword) {
    newPlainPass=generatePassword();
    user.passwordHash=hashPassword(newPlainPass);
    user.mustChangePassword=true;
  }
  user.modificadoPor=auth.user.username||auth.user.email;
  user.modificadoEn=new Date().toISOString();
  db().usuarios[idx]=user;
  save();
  const result=safeUser(user);
  if (newPlainPass) result.generatedPassword=newPlainPass;
  return {status:200,data:result};
}

function handleDeleteUsuario(req, id, params) {
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
    save();
    return {status:200,data:{success:true,deleted:true,id:parseInt(id)}};
  }
  db().usuarios[idx].activo=false;
  db().usuarios[idx].desactivadoPor=auth.user.username;
  db().usuarios[idx].desactivadoEn=new Date().toISOString();
  audit('BAJA', 'usuario', email, auth.user);
  save();
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
    const ql=q.toLowerCase();
    rows=rows.filter(c=>c.nombre.toLowerCase().includes(ql)||c.disciplina?.toLowerCase().includes(ql));
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
    return d;
  });

  return {
    nombre:               String(body.nombre||'').trim().replace(/\s+/g,' '),
    esCurso,
    tipo:                 esCurso ? 'Curso' : (body.tipo||existing?.tipo||''),
    subtipo:              (!esCurso && body.tipo==='Posgrado') ? (body.subtipo||existing?.subtipo||'') : '',
    disciplina:           String(body.disciplina||''),
    modalidad:            body.modalidad||'Híbrida',
    duracion:             String(body.duracion||''),
    tags:                 parseTags(body.tags),
    disertantes:          parseTags(body.disertantes),
    unidadesAcademicas:   unidades,
    unidadAcademica:      primaryUnidad, // backwards compat for public search
    regional:             autoRegional,
    descripcion:          String(body.descripcion||''),
    contacto:             String(body.contacto||''),
    telefonoContacto:     String(body.telefonoContacto||''),
    requisitosTexto:      String(body.requisitosTexto||''),
    formularioInscripcion: esCurso ? String(body.formularioInscripcion||'') : '',
    programa:             esCurso ? String(body.programa||'') : '', // rich text for cursos
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
  const body = await parseRequest(req);

  // Log parsed fields for debugging
  console.log('[createCarrera] nombre:', body.nombre, '| regional:', body.regional, '| unidades:', body.unidadesAcademicas, '| duracion:', body.duracion);

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
    creadoPor:auth.user.username||auth.user.email,
    creadoEn:new Date().toISOString(),
  };

  if (body.planEstudiosPDF?.filename) nueva.planEstudiosPDF=saveFile(body.planEstudiosPDF.data,'planes',body.planEstudiosPDF.filename);

  if (!db().carreras) db().carreras=[];
  db().carreras.push(nueva);
  audit('CREAR', 'carrera', nueva.nombre, auth.user);
  save();
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

  const body = await parseRequest(req);
  // Regional auto-calculated from unit

  let fields;
  try { fields = await buildCarreraFromBody({...body}, existing); }
  catch(e) { return {status:e.status||400,data:{error:e.message||e}}; }

  if (!canManageCarrera(auth.user, fields.unidadesAcademicas))
    return {status:403,data:{error:'Sin permiso para alguna de las unidades seleccionadas'}};

  const updated = {
    ...existing, ...fields,
    id:existing.id,
    modificadoPor:auth.user.username||auth.user.email,
    modificadoEn:new Date().toISOString(),
  };
  if (body.planEstudiosPDF?.filename)
    updated.planEstudiosPDF=saveFile(body.planEstudiosPDF.data,'planes',body.planEstudiosPDF.filename);

  db().carreras[idx]=updated;
  audit('EDITAR', 'carrera', updated.nombre, auth.user);
  save();
  return {status:200,data:updated};
}

function handleDeleteCarrera(req, id, params) {
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
    save();
    return {status:200,data:{success:true,deleted:true,id:parseInt(id)}};
  }
  // Soft delete (deactivate)
  db().carreras[idx].activo=normalizeState({valor:false,fechaHasta:null});
  db().carreras[idx].inscripcionAbierta=normalizeState({valor:false,fechaHasta:null});
  db().carreras[idx].desactivadoPor=auth.user.username;
  db().carreras[idx].desactivadoEn=new Date().toISOString();
  audit('BAJA', 'carrera', nombre, auth.user);
  save();
  return {status:200,data:{success:true,id:parseInt(id)}};
}

// ── ROUTER ────────────────────────────────────────────────
async function handleAdminAPI(req, res, pathname, params, jsonResponse, readBody) {
  const base=pathname.replace('/admin/api','');
  const segs=base.split('/').filter(Boolean);
  const r0=segs[0], id=segs[1], m=req.method;

  if (r0==='auth') {
    if (segs[1]==='login'&&m==='POST')           {const b=await readBody(req);const r=await handleLogin(b);return jsonResponse(res,r.data,r.status);}
    if (segs[1]==='change-password'&&m==='POST') {const b=await readBody(req);const r=await handleChangePassword(req,b);return jsonResponse(res,r.data,r.status);}
    if (segs[1]==='me'&&m==='GET')               {const a=requireAuth(req);return a.ok?jsonResponse(res,{user:a.user}):jsonResponse(res,{error:a.error},a.status);}
    if (segs[1]==='logout'&&m==='POST')          return jsonResponse(res,{success:true});
    return jsonResponse(res,{error:'Not found'},404);
  }
  if (r0==='usuarios') {
    if (!id&&m==='GET')   {const r=handleGetUsuarios(req);return jsonResponse(res,r.data,r.status);}
    if (!id&&m==='POST')  {const b=await readBody(req);const r=await handleCreateUsuario(req,b);return jsonResponse(res,r.data,r.status);}
    if (id&&m==='PUT')    {const b=await readBody(req);const r=await handleUpdateUsuario(req,b,id);return jsonResponse(res,r.data,r.status);}
    if (id&&m==='DELETE') {const r=handleDeleteUsuario(req,id,params);return jsonResponse(res,r.data,r.status);}
  }
  if (r0==='carreras') {
    if (!id&&m==='GET')   {const r=handleGetCarrerasAdmin(req,params);return jsonResponse(res,r.data,r.status);}
    if (!id&&m==='POST')  {const r=await handleCreateCarrera(req);return jsonResponse(res,r.data,r.status);}
    if (id&&m==='PUT')    {const r=await handleUpdateCarrera(req,id);return jsonResponse(res,r.data,r.status);}
    if (id&&m==='DELETE') {const r=handleDeleteCarrera(req,id,params);return jsonResponse(res,r.data,r.status);}
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
      disciplinas:db().disciplinas||[],
      tiposDocumento:db().tiposDocumento||['Resolución','Disposición','Ordenanza'],
      organismos:db().organismos||['Consejo Superior','Ministerial','SPU','SSPU','CONEAU'],
      eadUnit:EAD_UNIT,
      accesoPublico: db().config?.acceso_publico !== false,
    });
  }

  // Config: toggle public access (root only)
  if (r0==='config'&&segs[1]==='acceso-publico'&&m==='POST') {
    const a=requireAuth(req);
    if (!a.ok) return jsonResponse(res,{error:a.error},a.status);
    if (a.user.rol!==ROLES.ROOT) return jsonResponse(res,{error:'Solo root puede cambiar esta configuración'},403);
    const b=await readBody(req);
    if (!db().config) db().config={};
    db().config.acceso_publico = b.value !== false;
    db().config.acceso_publico_modificado_por = a.user.email;
    db().config.acceso_publico_modificado_en  = new Date().toISOString();
    save();
    return jsonResponse(res,{success:true, acceso_publico: db().config.acceso_publico});
  }

  // Audit log
  if (r0==='audit'&&m==='GET') {
    const a=requireAuth(req);if(!a.ok)return jsonResponse(res,{error:a.error},a.status);
    if(a.user.rol!==ROLES.ROOT)return jsonResponse(res,{error:'Solo root'},403);
    return jsonResponse(res,{logs:db().auditLog||[]});
  }

  // Backup export
  if (r0==='backup'&&segs[1]==='export'&&m==='GET') {
    const a=requireAuth(req);if(!a.ok)return jsonResponse(res,{error:a.error},a.status);
    if(a.user.rol!==ROLES.ROOT)return jsonResponse(res,{error:'Solo root'},403);
    audit('EXPORT','backup','Exportación completa',a.user);save();
    return jsonResponse(res,{
      exportedAt:new Date().toISOString(),
      version:'1.0',
      carreras:db().carreras||[],
      usuarios:(db().usuarios||[]).map(u=>{const{passwordHash,...r}=u;return r;}),
    });
  }

  // Backup import
  if (r0==='backup'&&segs[1]==='import'&&m==='POST') {
    const a=requireAuth(req);if(!a.ok)return jsonResponse(res,{error:a.error},a.status);
    if(a.user.rol!==ROLES.ROOT)return jsonResponse(res,{error:'Solo root'},403);
    const b=await readBody(req);
    if(!b.carreras&&!b.usuarios)return jsonResponse(res,{error:'Formato inválido'},400);
    if(b.carreras)db().carreras=b.carreras;
    if(b.usuarios){
      // Don't overwrite passwords — merge by email
      const existing=db().usuarios||[];
      b.usuarios.forEach(u=>{
        const idx=existing.findIndex(e=>e.email===u.email);
        if(idx===-1){existing.push({...u,passwordHash:'',mustChangePassword:true});}
        else{existing[idx]={...existing[idx],...u,passwordHash:existing[idx].passwordHash};}
      });
      db().usuarios=existing;
    }
    audit('IMPORT','backup','Importación de datos',a.user);save();
    return jsonResponse(res,{success:true,carreras:(db().carreras||[]).length,usuarios:(db().usuarios||[]).length});
  }

  return jsonResponse(res,{error:'Endpoint no encontrado'},404);
}

module.exports = {init, updateDb, handleAdminAPI};
