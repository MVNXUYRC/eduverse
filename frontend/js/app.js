/**
 * UNaM Académica — SPA Application
 * Buscador avanzado + Panel Admin ABM
 */

const API_BASE      = '/api';
const DEBOUNCE_MS   = 350;

// ── Icons por disciplina ──────────────────────────────────
const DISC_ICONS = {
  'Informática': '💻', 'Administración': '📊', 'Educación': '📖',
  'Ciencias Ambientales': '🌿', 'Ciencias Exactas': '🔬', 'Ingeniería': '⚙️',
  'Salud': '🏥', 'Turismo': '🌍', 'Ciencias Sociales': '🤝',
  'Derecho': '⚖️', 'Ciencias Naturales': '🦋', 'Arte y Cultura': '🎭',
  'Ingeniería Forestal': '🌲', 'Letras': '📚',
};
const ALLOWED_DISCIPLINAS = ['Ciencias Sociales', 'Ciencias Aplicadas', 'Artes'];

// ── Estado global ─────────────────────────────────────────
const state = {
  page: 'home',
  filters: { q: '', tipo: [], subtipo: [], disciplina: [], modalidad: [], unidad: [], regional: [], esCurso: null, inscripcionAbierta: null },
  results: [], meta: { total: 0, page: 1, totalPages: 1 },
  sort: 'reciente',
  loading: false,
};
const EMPTY_FILTERS = { q: '', tipo: [], subtipo: [], disciplina: [], modalidad: [], unidad: [], regional: [], esCurso: null, inscripcionAbierta: null };
window._siteUnderConstruction = false;
window._siteUnderConstructionImage = '/public/site-under-construction.svg';
const PDF_VIEWERS = new Map();

// ── Utilities ─────────────────────────────────────────────
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(value) {
  return escapeHtml(value);
}
function safePublicUrl(value, { allowMailto = false, allowRelative = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (allowRelative && (raw.startsWith('/uploads/') || raw.startsWith('/public/') || raw.startsWith('/api/'))) return raw;
  try {
    const parsed = new URL(raw);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === 'http:' || protocol === 'https:' || (allowMailto && protocol === 'mailto:')) return raw;
  } catch {
    return '';
  }
  return '';
}

function showToast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3400);
}
window.showToast = showToast;

async function sendNewsletterSubscription(email, source = 'sitio') {
  return apiFetch('/newsletter/subscribe', {
    method: 'POST',
    body: JSON.stringify({ email, source }),
  });
}

function persistNewsletterEmailLocal(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  if (!valid) return;
  try {
    const key = 'unam_newsletter_emails';
    const current = JSON.parse(localStorage.getItem(key) || '[]');
    const next = [];
    const seen = new Set();
    (Array.isArray(current) ? current : []).forEach((entry) => {
      const emailValue = typeof entry === 'string' ? entry : entry?.email;
      const dateValue = typeof entry === 'object' ? entry?.fechaAlta : null;
      const cleanEmail = String(emailValue || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return;
      if (seen.has(cleanEmail)) return;
      seen.add(cleanEmail);
      next.push({
        email: cleanEmail,
        fechaAlta: dateValue || null,
        activo: typeof entry === 'object' ? entry?.activo !== false : true,
      });
    });
    if (!seen.has(normalized)) {
      next.push({
        email: normalized,
        fechaAlta: new Date().toISOString(),
        activo: true,
      });
    }
    localStorage.setItem(key, JSON.stringify(next));
  } catch {}
}

function submitNewsletterFrom(inputId, source = 'sitio') {
  const input = document.getElementById(inputId);
  const email = String(input?.value || '').trim().toLowerCase();
  if (!email) {
    showToast('Ingresá un correo electrónico.', 'error');
    return false;
  }
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!valid) {
    showToast('Ingresá un correo electrónico válido.', 'error');
    return false;
  }
  sendNewsletterSubscription(email, source)
    .then((resp) => {
      if (resp?.alreadySubscribed) {
        showToast('Ese correo ya está registrado.', 'info');
        if (input) input.value = '';
        return;
      }
      persistNewsletterEmailLocal(email);
      if (input) input.value = '';
      showToast('¡Suscripción registrada!', 'success');
    })
    .catch((e) => {
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('ya está registrado') || msg.includes('ya se encuentra registrado')) {
        if (input) input.value = '';
        showToast('Ese correo ya está registrado.', 'info');
        return;
      }
      if (msg.includes('newsletter no operativo')) {
        showToast('El newsletter no está operativo en este momento.', 'error');
        return;
      }
      // Fallback temporal: si el backend no está actualizado, preservamos el registro local.
      persistNewsletterEmailLocal(email);
      if (input) input.value = '';
      showToast('Suscripción registrada localmente. Actualizá el backend para sincronizarla en cPanel.', 'info');
    });
  return false;
}
window.submitNewsletterFrom = submitNewsletterFrom;

// ── API ───────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  let url = API_BASE + path;
  if (method === 'GET') {
    url += (url.includes('?') ? '&' : '?') + '_ts=' + Date.now();
  }
  const res = await fetch(url, { cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts });
  const raw = await res.text();
  let data = {};
  if (raw) {
    try { data = JSON.parse(raw); } catch { data = {}; }
  }
  if (!res.ok) { const err = new Error(data.error || `HTTP ${res.status}`); err.errorCode = data.errorCode || null; throw err; }
  return data;
}

async function fetchFeatured()  { return apiFetch('/careers/featured'); }
async function fetchFilters()   { return apiFetch('/careers/filters'); }
async function fetchCareer(id)  { return apiFetch(`/careers/${id}`); }
async function registerCareerInterest(id, email) {
  return apiFetch(`/careers/${id}/interesados`, { method: 'POST', body: JSON.stringify({ email }) });
}

async function searchCareers(params = {}) {
  const q = new URLSearchParams();
  if (params.q)          q.set('q',          params.q);
  if (params.tipo?.length)      q.set('tipo',      params.tipo.join(','));
  if (params.subtipo?.length)   q.set('subtipo',   params.subtipo.join(','));
  if (params.disciplina?.length)q.set('disciplina',params.disciplina.join(','));
  if (params.modalidad?.length) q.set('modalidad', params.modalidad.join(','));
  if (params.unidad?.length)    q.set('unidad',    params.unidad.join(','));
  if (params.regional?.length)  q.set('regional',  params.regional.join(','));
  if (params.esCurso !== null && params.esCurso !== undefined) q.set('esCurso', params.esCurso);
  if (params.inscripcionAbierta !== null && params.inscripcionAbierta !== undefined) q.set('inscripcionAbierta', params.inscripcionAbierta);
  if (params.page)       q.set('page',       params.page);
  if (params.sort)       q.set('sort',       params.sort);
  return apiFetch(`/careers?${q}`);
}

// ABM
async function createCareer(data)     { return apiFetch('/careers',    { method: 'POST', body: JSON.stringify(data) }); }
async function updateCareer(id, data) { return apiFetch(`/careers/${id}`, { method: 'PUT',  body: JSON.stringify(data) }); }
async function deleteCareer(id)       { return apiFetch(`/careers/${id}`, { method: 'DELETE' }); }

// ── Router ────────────────────────────────────────────────
function navigate(page, data = null) {
  if (page === 'campus') { window.open('https://ead.unam.edu.ar/', '_blank'); return; }
  state.page = page;
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  // Map page names to nav IDs
  const navIdMap = { home: 'nav-home', search: 'nav-search', novedades: 'nav-novedades', quienes: 'nav-quienes', contacto: 'nav-contacto' };
  const navId = navIdMap[page] || ('nav-' + page);
  const nl = document.getElementById(navId);
  if (nl) nl.classList.add('active');
  render();
  syncHashRoute();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.navigate = navigate;

function syncHashRoute() {
  const base = window.location.pathname;
  if (state.page === 'home') {
    window.history.replaceState(null, '', base);
    return;
  }
  if (state.page !== 'search') {
    window.history.replaceState(null, '', `${base}#${state.page}`);
    return;
  }
  const q = new URLSearchParams();
  if (state.filters.q) q.set('q', state.filters.q);
  if (state.filters.tipo?.length) q.set('tipo', state.filters.tipo.join(','));
  if (state.filters.subtipo?.length) q.set('subtipo', state.filters.subtipo.join(','));
  if (state.filters.disciplina?.length) q.set('disciplina', state.filters.disciplina.join(','));
  if (state.filters.modalidad?.length) q.set('modalidad', state.filters.modalidad.join(','));
  if (state.filters.unidad?.length) q.set('unidad', state.filters.unidad.join(','));
  if (state.filters.regional?.length) q.set('regional', state.filters.regional.join(','));
  if (state.filters.esCurso !== null && state.filters.esCurso !== undefined) q.set('esCurso', String(state.filters.esCurso));
  if (state.filters.inscripcionAbierta !== null && state.filters.inscripcionAbierta !== undefined) q.set('inscripcionAbierta', String(state.filters.inscripcionAbierta));
  if (state.meta.page > 1) q.set('page', String(state.meta.page));
  const qs = q.toString();
  window.history.replaceState(null, '', `${base}#search${qs ? `?${qs}` : ''}`);
}

function hydrateRouteFromHash() {
  const raw = (window.location.hash || '').replace(/^#/, '');
  if (!raw) return 'home';
  const [pageRaw, qsRaw = ''] = raw.split('?');
  const page = pageRaw || 'home';
  const allowed = new Set(['home', 'search', 'novedades', 'quienes', 'contacto', 'unidades', 'admin']);
  if (!allowed.has(page)) return 'home';
  if (page !== 'search') return page;

  const params = new URLSearchParams(qsRaw);
  const csv = key => (params.get(key) || '').split(',').map(v => v.trim()).filter(Boolean);
  const esCursoRaw = params.get('esCurso');
  const pageNum = parseInt(params.get('page') || '1', 10);
  state.filters = {
    ...EMPTY_FILTERS,
    q: params.get('q') || '',
    tipo: csv('tipo'),
    subtipo: csv('subtipo'),
    disciplina: csv('disciplina'),
    modalidad: csv('modalidad'),
    unidad: csv('unidad'),
    regional: csv('regional'),
    esCurso: esCursoRaw === null ? null : esCursoRaw === 'true',
    inscripcionAbierta: params.get('inscripcionAbierta') === null ? null : params.get('inscripcionAbierta') === 'true',
  };
  state.meta.page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
  return 'search';
}

function render() {
  const app = document.getElementById('app');
  applySiteConstructionChrome(window._siteUnderConstruction === true);
  if (window._siteUnderConstruction) {
    renderSiteConstruction(app);
    return;
  }
  const pages = { home: renderHome, search: renderSearch, novedades: renderNovedades, admin: renderAdmin, unidades: renderUnidades };
  const placeholders = ['quienes', 'contacto'];
  if (pages[state.page]) pages[state.page](app);
  else if (placeholders.includes(state.page)) renderPlaceholder(app, state.page);
  else renderHome(app);
}

function renderSiteConstruction(app) {
  const image = window._siteUnderConstructionImage || '/public/site-under-construction.svg';
  app.innerHTML = `
    <section style="padding-top:calc(var(--nav-height) + 34px);min-height:78vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#f8fdff 0%,#eef8fc 100%)">
      <div style="width:100%;max-width:980px;padding:0 clamp(16px,4vw,48px);text-align:center">
        <img src="${image}" alt="Sitio en construcción" style="max-width:min(640px,100%);height:auto;margin:0 auto 8px;display:block;filter:drop-shadow(0 10px 26px rgba(0,163,224,.08))" onerror="this.style.display='none'" />
        <p style="font-size:.98rem;line-height:1.8;color:var(--text-secondary);max-width:760px;margin:0 auto">Estamos actualizando contenidos para ofrecerte una mejor experiencia. El sitio está disponible y volverá a su funcionamiento habitual muy pronto.</p>
      </div>
    </section>
    ${constructionFooterHTML()}`;
}

function constructionFooterHTML() {
  return `
    <footer class="footer" style="padding:18px clamp(16px,4vw,48px);border-top:1px solid var(--border);background:#fff">
      <div class="footer-inner">
        <div class="footer-bottom" style="border-top:none;padding-top:0;justify-content:flex-start">
          <span class="footer-copy">© 2026 Universidad Nacional de Misiones</span>
        </div>
      </div>
    </footer>`;
}

function applySiteConstructionChrome(enabled) {
  const navLinks = document.getElementById('nav-links');
  const navRight = document.querySelector('.nav-right');
  if (navLinks) navLinks.style.display = enabled ? 'none' : '';
  if (navRight) navRight.style.display = enabled ? 'none' : '';
}

// ── HOME ──────────────────────────────────────────────────
async function renderHome(app) {
  app.innerHTML = heroHTML() + `<div id="featured-sections">${skeletonSections()}</div>` + footerHTML();
  setupHeroSearch();
  try {
    const data = await fetchFeatured();
    // Update hero stats dynamically
    if (data.stats) {
      const s = data.stats;
      const elCarreras = document.getElementById('stat-carreras');
      const elCursos   = document.getElementById('stat-cursos');
      const fac        = document.getElementById('stat-fac');
      const reg        = document.getElementById('stat-reg');
      const virt       = document.getElementById('stat-virt-item');
      const facIt      = document.getElementById('stat-fac-item');
      if (elCarreras) elCarreras.textContent = s.carreras ?? '0';
      if (elCursos)   elCursos.textContent   = s.cursos   ?? '0';
      if (fac)        fac.textContent        = s.facultades || '0';
      if (reg)        reg.textContent        = s.regionales || '0';
      if (facIt)      facIt.style.display    = s.facultades > 0 ? '' : 'none';
      if (virt)       virt.style.display     = s.tiene100Virtual ? '' : 'none';
    }
    // Sections: próximamente → inscripciones abiertas → nuevas → disciplinas
    document.getElementById('featured-sections').innerHTML =
      proximamenteSection(data.proximamente) +
      inscripcionSection(data.inscripcionAbierta) +
      nuevasSection(data.nuevas) +
      disciplinasSection(data.disciplinas);
    setupCardClicks();
    setupDiscClicks();
    // Update search hints from top 5 disciplines
    const hintsBar = document.getElementById('hero-hints');
    if (hintsBar && data.disciplinas?.length) {
      const top5 = data.disciplinas.slice(0,5);
      hintsBar.innerHTML = '<span>Probá con:</span>' +
        top5.map(d => `<span class="search-hint-tag" data-q="${d.nombre}">${d.nombre}</span>`).join('');
      document.querySelectorAll('.search-hint-tag').forEach(t => t.addEventListener('click', () => {
        state.filters = { q: t.dataset.q || '', tipo: [], subtipo: [], disciplina: [], modalidad: [], unidad: [], regional: [], esCurso: null };
        state.meta.page = 1; navigate('search');
      }));
    }
  } catch {
    document.getElementById('featured-sections').innerHTML = `
      <div class="section"><div class="section-inner">
        <div class="state-container"><div class="state-icon">⚠️</div>
        <div class="state-title">Error al conectar</div>
        <div class="state-desc">Verificá que el servidor está corriendo.</div></div>
      </div></div>`;
  }
}

function heroHTML() {
  return `
  <section class="hero">
    <div class="hero-content">
      <div class="hero-badge"><span class="hero-badge-dot"></span>Universidad Nacional de Misiones</div>
      <h1 class="hero-title">Educación a <span class="highlight">Distancia</span></h1>
      <p class="hero-subtitle">Encontrá propuestas de forma simple y rápida, y empezá a explorar tus intereses para descubrir todas las oportunidades que te esperan..</p>
      <div class="search-wrapper">
        <div class="search-box" id="hero-search-box">
          <span class="search-icon">🔍</span>
          <input type="text" class="search-input" id="hero-search-input" aria-label="Buscar propuesta académica" placeholder="Buscar carrera, disciplina, palabras clave y más.." autocomplete="off" />
          <button class="search-btn" id="hero-search-btn" aria-label="Buscar propuestas">Buscar</button>
        </div>
        <div class="hero-cta-row">
          <button class="search-btn-secondary" id="hero-browse-btn" aria-label="Ver toda la oferta académica">Ver toda la oferta</button>
        </div>
        <div class="search-hints" id="hero-hints">
          <span>Probá con:</span>
          <span class="search-hint-tag" data-q="Licenciatura">Licenciaturas</span>
          <span class="search-hint-tag" data-q="Maestría">Maestrías</span>
          <span class="search-hint-tag" data-q="Tecnicatura">Tecnicaturas</span>
          <span class="search-hint-tag" data-q="Doctorado">Doctorados</span>
          <span class="search-hint-tag" data-q="curso">Cursos</span>
        </div>
      </div>
      <div class="stats-bar" id="hero-stats-bar">
        <div class="stat-item"><div class="stat-value" id="stat-carreras">—</div><div class="stat-label">Carreras</div></div>
        <div class="stat-item"><div class="stat-value" id="stat-cursos">—</div><div class="stat-label">Cursos</div></div>
        <div class="stat-item" id="stat-fac-item"><div class="stat-value" id="stat-fac">—</div><div class="stat-label">Facultades</div></div>
        <div class="stat-item"><div class="stat-value" id="stat-reg">—</div><div class="stat-label">Regionales</div></div>
        <div class="stat-item" id="stat-virt-item" style="display:none"><div class="stat-value">100<span>%</span></div><div class="stat-label">Virtual disponible</div></div>
      </div>
    </div>
  </section>`;
}

function popularSection(careers) { return ''; }

function disciplinasSection(discs) {
  if (!discs?.length) return '';
  return `<section class="section" style="padding-top:0"><div class="section-inner">
    <div class="section-header">
      <div><div class="section-label">Explorar por área</div><h2 class="section-title">Disciplinas</h2></div>
    </div>
    <div class="disciplinas-grid animate-in">
      ${discs.map(d => `
        <div class="disc-card" data-disc="${d.nombre}">
          <div><div class="disc-name">${d.nombre}</div><div class="disc-count">${d.cantidad} propuesta${d.cantidad > 1 ? 's' : ''}</div></div>
        </div>`).join('')}
    </div>
  </div></section>`;
}

function inscripcionSection(items) {
  if (!items?.length) return '';
  return `<section class="section" style="padding-top:0"><div class="section-inner">
    <div class="section-header">
      <div><div class="section-label" style="color:var(--unam-cyan)">propuestas disponibles</div><h2 class="section-title">Inscripciones abiertas</h2></div>
    </div>
    <div class="cards-grid animate-in">${items.map(c => careerCard(c)).join('')}</div>
  </div></section>`;
}
function proximamenteSection(items) {
  if (!items?.length) return '';
  return `<section class="section" style="padding-top:0"><div class="section-inner">
    <div class="section-header">
      <div><div class="section-label section-label-proximamente">próximas aperturas</div><h2 class="section-title">Próximamente</h2></div>
    </div>
    <div class="cards-grid animate-in">${items.map(c => careerCard(c)).join('')}</div>
  </div></section>`;
}

function cursosSection(cursos) {
  if (!cursos?.length) return '';
  return `<section class="section" style="padding-top:0"><div class="section-inner">
    <div class="section-header">
      <div><div class="section-label">Formación continua</div><h2 class="section-title">Cursos disponibles</h2></div>
      <a class="section-link" onclick="filterByCurso()">Ver todos →</a>
    </div>
    <div class="cards-grid animate-in">${cursos.map(c => careerCard(c)).join('')}</div>
  </div></section>`;
}

function nuevasSection(nuevas) {
  if (!nuevas?.length) return '';
  return `<section class="section" style="padding-top:0"><div class="section-inner">
    <div class="section-header">
      <div><div class="section-label">Incorporadas recientemente</div><h2 class="section-title">Nuevas propuestas</h2></div>
    </div>
    <div class="cards-grid animate-in">${nuevas.map(c => careerCard(c)).join('')}</div>
  </div></section>`;
}

function skeletonSections() {
  const skel = Array(6).fill(0).map(() => `
    <div class="skeleton-card">
      <div style="display:flex;gap:10px;margin-bottom:12px">
        <div class="skeleton" style="width:42px;height:42px;border-radius:8px"></div>
        <div style="flex:1"><div class="skeleton skeleton-line" style="width:55%;height:13px;margin-bottom:7px"></div>
        <div class="skeleton skeleton-line" style="width:35%;height:10px"></div></div>
      </div>
      <div class="skeleton skeleton-line" style="width:80%;height:15px;margin-bottom:10px"></div>
      <div class="skeleton skeleton-line" style="width:100%;height:9px;margin-bottom:5px"></div>
      <div class="skeleton skeleton-line" style="width:90%;height:9px"></div>
    </div>`).join('');
  return `<section class="section"><div class="section-inner">
    <div class="skeleton skeleton-line" style="width:200px;height:20px;margin-bottom:22px"></div>
    <div class="cards-grid">${skel}</div></div></section>`;
}

// ── CAREER CARD ───────────────────────────────────────────
function careerCard(c) {
  const evalState = (s, defaultVal = true) => {
    if (s === undefined || s === null) return defaultVal;
    if (typeof s === 'boolean') return s;
    const v = s.valor !== undefined ? s.valor : s.activo;
    if (!v) return false;
    if (!s.fechaHasta) return true;
    const raw = String(s.fechaHasta || '').trim();
    if (!raw) return true;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T23:59:59.999`) > new Date();
    return new Date(raw) > new Date();
  };
  const tipoLabel = c.esCurso ? 'Curso' : (c.tipo || 'Carrera');
  const tipoClass = tipoLabel.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const proximamenteBadge = c.proximamente ? '<span class="badge badge-proximamente">Próximamente</span>' : '';
  const nuevaBadge = c.nueva ? `<span class="badge badge-nueva">Nuevo</span>` : '';
  const _activo = evalState(c._activo !== undefined ? c._activo : c.activo, true);
  const finalizadaBadge = (!_activo && !c.proximamente) ? `<span class="badge badge-finalizada">${c.esCurso ? 'Finalizado' : 'Finalizada'}</span>` : '';
  // Handle both old boolean and new object format
  const _inscAbierta = c.inscripcionAbierta
    ? (typeof c.inscripcionAbierta==='object'
        ? (c.inscripcionAbierta.valor && (!c.inscripcionAbierta.fechaHasta || new Date(c.inscripcionAbierta.fechaHasta)>new Date()))
        : c.inscripcionAbierta)
    : false;
  const inscBadge = _inscAbierta ? '<span class="badge badge-inscripcion">Inscripción abierta</span>' : '';
  const descSnippet = String(c.descripcion || '').trim();
  return `
  <div class="career-card card-animate" data-id="${c.id}">
    <div class="card-top">
      <div class="card-badges">
        <div class="card-badges-main">
          <span class="badge badge-tipo ${tipoClass}">${tipoLabel}</span>
          ${c.subtipo ? `<span class="badge badge-tipo posgrado">${c.subtipo}</span>` : ''}
          <span class="badge badge-modalidad">${c.modalidad}</span>
        </div>
        ${(proximamenteBadge || finalizadaBadge || nuevaBadge || inscBadge) ? `<div class="card-badges-state">${proximamenteBadge}${finalizadaBadge}${nuevaBadge}${inscBadge}</div>` : ''}
      </div>
    </div>
    <h3 class="card-title">${c.nombre}</h3>
    ${c.tags?.length ? `<div class="card-tags" style="display:flex;flex-wrap:nowrap;gap:5px;margin-bottom:8px;overflow:hidden">${c.tags.slice(0,3).map(t=>`<span style="font-size:.68rem;padding:2px 9px;background:rgba(0,163,224,.07);border:1px solid rgba(0,163,224,.15);border-radius:100px;color:var(--unam-cyan);white-space:nowrap;flex-shrink:0">${t}</span>`).join('')}${c.tags.length>3?`<span style="font-size:.68rem;color:var(--text-muted);flex-shrink:0">+${c.tags.length-3}</span>`:''}</div>` : ''}
    <div class="card-desc rich-content card-desc-rich">${descSnippet}</div>
    <div class="card-meta">
      ${c.duracion ? `<div class="card-meta-item">${c.duracion}</div>` : ''}
      <div class="card-meta-item">${(c.unidadesAcademicas||[c.unidadAcademica]).filter(Boolean).join(', ')}</div>
      ${c.regional ? `<div class="card-meta-item">${c.regional}</div>` : ''}
    </div>
    <div class="card-footer">
      <span class="card-disciplina">${c.disciplina||''}</span>
      <div class="card-footer-actions">
        <button type="button" class="btn-primary" onclick="openDetail(${c.id})">Ver más</button>
      </div>
    </div>
  </div>`;
}

function skeletonCards(n) {
  return Array(n).fill(0).map(() => `
    <div class="skeleton-card">
      <div style="display:flex;gap:10px;margin-bottom:12px">
        <div class="skeleton" style="width:42px;height:42px;border-radius:8px"></div>
        <div style="flex:1"><div class="skeleton skeleton-line" style="width:55%;height:13px;margin-bottom:7px"></div>
        <div class="skeleton skeleton-line" style="width:35%;height:10px"></div></div>
      </div>
      <div class="skeleton skeleton-line" style="width:80%;height:15px;margin-bottom:10px"></div>
      <div class="skeleton skeleton-line" style="width:100%;height:9px;margin-bottom:5px"></div>
      <div class="skeleton skeleton-line" style="width:90%;height:9px;margin-bottom:5px"></div>
      <div class="skeleton skeleton-line" style="width:70%;height:9px"></div>
    </div>`).join('');
}

// ── SEARCH PAGE ───────────────────────────────────────────
async function renderSearch(app) {
  app.innerHTML = `
  <div class="search-page">
    <div class="search-page-header">
      <h1 class="search-page-title">Oferta Académica</h1>
      <p class="search-page-sub">Explorá toda la oferta académica de la <strong>Universidad Nacional de Misiones</strong> en Educación a Distancia: carreras, posgrados y cursos. Filtrá por tipo, disciplina, modalidad, unidad académica y más..</p>
      <div class="search-bar-full">
        <div class="search-box" id="main-search-box">
          <span class="search-icon">🔍</span>
          <input type="text" class="search-input" id="main-search-input"
            placeholder="Nombre, disciplina, palabras clave..." value="${state.filters.q}" autocomplete="off" />
        </div>
        <button class="filters-mobile-toggle" id="filters-toggle" style="display:none">⚙️ Filtros</button>
      </div>
      <div class="search-tabs">
        <button class="search-tab ${state.filters.esCurso === null ? 'active' : ''}" onclick="setTab(null)">Todo</button>
        <button class="search-tab ${state.filters.esCurso === false ? 'active' : ''}" onclick="setTab(false)">Carreras</button>
        <button class="search-tab ${state.filters.esCurso === true ? 'active' : ''}" onclick="setTab(true)">Cursos</button>
      </div>
    </div>
    <div class="search-layout">
      <aside class="filters-panel" id="filters-panel">
        <div class="filters-header">
          <h3 class="filters-title">Filtros</h3>
          <span class="filters-clear" id="clear-filters">Limpiar</span>
        </div>
        <div class="filter-group">
          <div class="filter-label">Estado de inscripción</div>
          <div class="filter-options">
            <label class="filter-option">
              <input type="checkbox" id="filter-inscripcion-abierta" ${state.filters.inscripcionAbierta === true ? 'checked' : ''} />
              <span class="filter-option-label">Con inscripciones abiertas</span>
            </label>
          </div>
        </div>
        <div id="filter-groups"><div class="skeleton skeleton-line" style="width:100%;height:12px;margin-bottom:8px"></div>
        <div class="skeleton skeleton-line" style="width:80%;height:12px"></div></div>
      </aside>
      <main>
        <div id="active-filters-bar"></div>
        <div class="results-header">
          <p class="results-count" id="results-count">Cargando...</p>
          <div class="results-sort">
            <label>Ordenar:</label>
            <select class="select-styled" id="sort-select">
              <option value="reciente">Recientes</option>
              <option value="nombre">Nombre A–Z</option>
              <option value="tipo">Tipo</option>
            </select>
          </div>
        </div>
        <div id="results-grid" class="cards-grid">${skeletonCards(6)}</div>
        <div id="pagination"></div>
      </main>
    </div>
  </div>
  ${footerHTML()}`;

  try {
    const fd = await fetchFilters();
    renderFilterGroups(fd);
  } catch { document.getElementById('filter-groups').innerHTML = '<p style="color:var(--text-muted);font-size:.82rem">Error al cargar filtros</p>'; }

  setupMainSearch();
  setupSort();
  setupClearFilters();
  setupMobileFiltersToggle();
  await doSearch();
}

function setTab(val) {
  state.filters = { ...EMPTY_FILTERS, esCurso: val };
  state.meta.page = 1;
  navigate('search');
}
window.setTab = setTab;

function renderFilterGroups(fd) {
  const makeGroup = (label, key, options) => `
    <div class="filter-group">
      <div class="filter-label">${label}</div>
      <div class="filter-options">
        ${options.map(opt => `
          <label class="filter-option">
            <input type="checkbox" value="${opt}" data-filter="${key}" ${state.filters[key]?.includes(opt) ? 'checked' : ''} />
            <span class="filter-option-label">${opt}</span>
          </label>`).join('')}
      </div>
    </div>`;

  document.getElementById('filter-groups').innerHTML =
    makeGroup('Tipo', 'tipo', fd.tipos||[]) +
    makeGroup('Subtipo', 'subtipo', fd.subtipos||[]) +
    makeGroup('Disciplina', 'disciplina', fd.disciplinas||[]) +
    makeGroup('Modalidad', 'modalidad', fd.modalidades||[]) +
    makeGroup('Unidad académica', 'unidad', fd.unidadesAcademicas||[]) +
    makeGroup('Regional', 'regional', fd.regionales||[]);

  document.querySelectorAll('[data-filter]').forEach(cb => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.filter;
      if (!state.filters[key]) state.filters[key] = [];
      if (cb.checked) { if (!state.filters[key].includes(cb.value)) state.filters[key].push(cb.value); }
      else { state.filters[key] = state.filters[key].filter(v => v !== cb.value); }
      state.meta.page = 1;
      renderActiveFilters();
      debouncedSearch();
    });
  });

  const inscOpenCb = document.getElementById('filter-inscripcion-abierta');
  inscOpenCb?.addEventListener('change', () => {
    state.filters.inscripcionAbierta = inscOpenCb.checked ? true : null;
    state.meta.page = 1;
    renderActiveFilters();
    debouncedSearch();
  });
}

function renderActiveFilters() {
  const bar = document.getElementById('active-filters-bar');
  if (!bar) return;
  const chips = [];
  ['tipo','subtipo','disciplina','modalidad','unidad','regional'].forEach(key => {
    (state.filters[key] || []).forEach(val => {
      chips.push(`<span class="filter-chip" onclick="removeFilter('${key}','${val}')">${val} <span class="filter-chip-remove">✕</span></span>`);
    });
  });
  if (state.filters.inscripcionAbierta === true) {
    chips.push(`<span class="filter-chip" onclick="removeFilter('inscripcionAbierta','true')">Inscripciones abiertas <span class="filter-chip-remove">✕</span></span>`);
  }
  bar.innerHTML = chips.length ? `<div class="active-filters">${chips.join('')}</div>` : '';
}

function removeFilter(key, val) {
  if (key === 'inscripcionAbierta') {
    state.filters.inscripcionAbierta = null;
    const cb = document.getElementById('filter-inscripcion-abierta');
    if (cb) cb.checked = false;
    renderActiveFilters();
    debouncedSearch();
    return;
  }
  state.filters[key] = (state.filters[key] || []).filter(v => v !== val);
  document.querySelectorAll(`[data-filter="${key}"]`).forEach(cb => { if (cb.value === val) cb.checked = false; });
  renderActiveFilters();
  debouncedSearch();
}
window.removeFilter = removeFilter;

async function doSearch() {
  state.loading = true;
  const grid  = document.getElementById('results-grid');
  const count = document.getElementById('results-count');
  if (grid)  grid.innerHTML  = skeletonCards(6);
  if (count) count.innerHTML = 'Buscando...';

  try {
    const data = await searchCareers({ ...state.filters, page: state.meta.page, sort: state.sort });
    state.results = data.data;
    state.meta    = data.meta;
    renderResults();
  } catch {
    if (grid) grid.innerHTML = `<div class="state-container" style="grid-column:1/-1">
      <div class="state-icon">⚠️</div><div class="state-title">Error al buscar</div></div>`;
  } finally {
    state.loading = false;
    if (state.page === 'search') syncHashRoute();
  }
}

const debouncedSearch = debounce(doSearch, DEBOUNCE_MS);

function renderResults() {
  const grid  = document.getElementById('results-grid');
  const count = document.getElementById('results-count');
  const pag   = document.getElementById('pagination');
  if (!grid) return;

  if (!state.results.length) {
    grid.innerHTML = `<div class="state-container" style="grid-column:1/-1">
      <div class="state-icon">🔍</div>
      <div class="state-title">Sin resultados</div>
      <div class="state-desc">Intentá con otros criterios de búsqueda o limpiá los filtros.</div></div>`;
    if (count) count.innerHTML = '<strong>0</strong> resultados';
    if (pag)   pag.innerHTML = '';
    return;
  }

  grid.innerHTML = state.results.map(c => careerCard(c)).join('');
  setupCardClicks();

  const { total, page, totalPages } = state.meta;
  if (count) count.innerHTML = `<strong>${total}</strong> resultado${total !== 1 ? 's' : ''} — Página ${page} de ${totalPages}`;

  if (pag && totalPages > 1) {
    let pages = '';
    for (let i = 1; i <= totalPages; i++) pages += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    pag.innerHTML = `<div class="pagination">
      <button class="page-btn" onclick="goToPage(${page-1})" ${page===1?'disabled':''}>←</button>
      ${pages}
      <button class="page-btn" onclick="goToPage(${page+1})" ${page===totalPages?'disabled':''}>→</button>
    </div>`;
  } else if (pag) pag.innerHTML = '';
}

function goToPage(p) { state.meta.page = p; doSearch(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
window.goToPage = goToPage;

function setupMainSearch() {
  const inp = document.getElementById('main-search-input');
  if (!inp) return;
  inp.addEventListener('input', e => { state.filters.q = e.target.value; state.meta.page = 1; debouncedSearch(); });
  inp.focus();
}

function setupSort() {
  const sel = document.getElementById('sort-select');
  if (!sel) return;
  sel.value = state.sort;
  sel.addEventListener('change', e => { state.sort = e.target.value; state.meta.page = 1; doSearch(); });
}

function setupClearFilters() {
  const btn = document.getElementById('clear-filters');
  if (!btn) return;
  btn.addEventListener('click', () => {
    state.filters = { ...EMPTY_FILTERS };
    const inp = document.getElementById('main-search-input');
    if (inp) inp.value = '';
    document.querySelectorAll('[data-filter]').forEach(cb => cb.checked = false);
    const inscOpenCb = document.getElementById('filter-inscripcion-abierta');
    if (inscOpenCb) inscOpenCb.checked = false;
    renderActiveFilters();
    state.meta.page = 1;
    doSearch();
  });
}

function setupMobileFiltersToggle() {
  const toggle = document.getElementById('filters-toggle');
  const panel  = document.getElementById('filters-panel');
  if (!toggle || !panel) return;
  const check = () => {
    if (window.innerWidth <= 1024) { toggle.style.display = 'flex'; panel.classList.add('mobile-hidden'); }
    else { toggle.style.display = 'none'; panel.classList.remove('mobile-hidden'); }
  };
  check(); window.addEventListener('resize', check);
  toggle.addEventListener('click', () => panel.classList.toggle('mobile-hidden'));
}

// ── HERO SEARCH ───────────────────────────────────────────
function setupHeroSearch() {
  const inp  = document.getElementById('hero-search-input');
  const btn  = document.getElementById('hero-search-btn');
  const browseBtn = document.getElementById('hero-browse-btn');
  const tags = document.querySelectorAll('.search-hint-tag');

  const go = q => {
    state.filters = { ...EMPTY_FILTERS, q: q || '' };
    state.meta.page = 1;
    navigate('search');
  };

  btn?.addEventListener('click', () => go(inp?.value));
  browseBtn?.addEventListener('click', () => go(''));
  inp?.addEventListener('keydown', e => { if (e.key === 'Enter') go(inp.value); });
  tags.forEach(t => t.addEventListener('click', () => { go(t.dataset.q); }));
}

function filterByCurso() {
  state.filters = { ...EMPTY_FILTERS, esCurso: true };
  state.meta.page = 1;
  navigate('search');
}
window.filterByCurso = filterByCurso;

function filterByTipo(tipo) {
  state.filters = { ...EMPTY_FILTERS, tipo: [tipo], esCurso: false };
  state.meta.page = 1;
  navigate('search');
}
window.filterByTipo = filterByTipo;

// ── CARD CLICKS ───────────────────────────────────────────
function setupCardClicks() {
  document.querySelectorAll('.career-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('button, a, input, label, select, textarea')) return;
      const id = parseInt(card.dataset.id);
      if (id) openDetail(id);
    });
  });
}

function setupDiscClicks() {
  document.querySelectorAll('.disc-card').forEach(card => {
    card.addEventListener('click', () => {
      state.filters = { ...EMPTY_FILTERS, disciplina: [card.dataset.disc] };
      state.meta.page = 1;
      navigate('search');
    });
  });
}

// ── DETAIL PAGE ───────────────────────────────────────────
async function openDetail(id) {
  if (window._siteUnderConstruction) {
    navigate('home');
    return;
  }
  const app = document.getElementById('app');
  app.innerHTML = `<div class="detail-page"><div class="detail-hero" style="padding-top:calc(var(--nav-height) + 44px)">
    <div class="detail-inner">${skeletonCards(1)}</div></div></div>${footerHTML()}`;
  try {
    const c = await fetchCareer(id);
    renderDetail(c, app);
  } catch { showToast('Error al cargar la carrera', 'error'); navigate('search'); }
}
window.openDetail = openDetail;

function renderDetail(c, app) {
  function evalState(s) {
    if (!s && s !== false) return false;
    if (typeof s === 'boolean') return s;
    const v = s.valor !== undefined ? s.valor : s.activo;
    if (!v) return false;
    if (!s.fechaHasta) return true;
    const raw = String(s.fechaHasta || '').trim();
    if (!raw) return true;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T23:59:59.999`) > new Date();
    return new Date(raw) > new Date();
  }
  const _activo      = evalState(c._activo !== undefined ? c._activo : c.activo);
  const _inscAbierta = evalState(c._inscripcionAbierta !== undefined ? c._inscripcionAbierta : c.inscripcionAbierta);
  const isProximamente = c.proximamente === true;
  const EAD_UNIT = 'Educación a Distancia';
  const unidadesRaw = [...new Set((c.unidadesAcademicas || [c.unidadAcademica]).filter(Boolean))];
  const unidadesOrdered = (unidadesRaw.includes(EAD_UNIT) && unidadesRaw.length > 1)
    ? [EAD_UNIT, ...unidadesRaw.filter(u => u !== EAD_UNIT)]
    : unidadesRaw;
  const showUnidadAcademica = !(unidadesOrdered.length === 1 && unidadesOrdered[0] === EAD_UNIT);
  const unidadesStr  = unidadesOrdered.join(', ');
  const tipoLabel    = c.esCurso ? 'Curso' : (c.tipo || 'Carrera');

  // ── Badge markup ──────────────────────────────────────
  const finalizadaBanner = !_activo
    ? (isProximamente
      ? '<div class="detail-status-proximamente">Próximamente</div>'
      : '<div style="display:inline-flex;align-items:center;gap:8px;padding:7px 14px;background:rgba(220,38,38,.09);border:1px solid rgba(220,38,38,.28);border-radius:100px;margin-bottom:14px;font-size:.83rem;font-weight:700;color:#b42318">' + (c.esCurso ? 'Finalizado' : 'Finalizada') + '</div>')
    : '';
  const inscBadge = _inscAbierta ? '<span class="badge badge-inscripcion">Inscripción abierta</span>' : '';
  const nuevaBadge = c.nueva ? '<span class="badge badge-nueva">Nuevo</span>' : '';
  const subtipoBadge = c.subtipo ? '<span class="badge" style="background:rgba(125,78,36,.1);color:#7D4E24;padding:3px 10px;border-radius:100px;font-size:.75rem;font-weight:600">' + c.subtipo + '</span>' : '';

  // ── Meta cards ────────────────────────────────────────
  const duracionCard   = c.duracion   ? '<div class="detail-meta-card"><div class="detail-meta-label">Duración</div><div class="detail-meta-value">' + c.duracion + '</div></div>' : '';
  const disciplinaCard = c.disciplina ? '<div class="detail-meta-card"><div class="detail-meta-label">Disciplina</div><div class="detail-meta-value">' + c.disciplina + '</div></div>' : '';
  const regionalCard   = c.regional   ? '<div class="detail-meta-card"><div class="detail-meta-label">Regional</div><div class="detail-meta-value">' + c.regional + '</div></div>' : '';
  const docsSectionHtml = (c.documentos?.length)
    ? '<div style="display:flex;flex-direction:column;gap:12px">' +
      c.documentos.map((d) => {
        let row = '<div style="display:flex;align-items:flex-start;gap:16px;padding:16px 20px;background:#fff;border:1px solid var(--border-card);border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.04)">';
        row += '<div style="width:40px;height:40px;background:rgba(125,78,36,.08);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.2rem">📋</div>';
        row += '<div style="flex:1">';
        const docUrl = safePublicUrl(d.pdf, { allowRelative: true });
        row += '<div style="font-weight:700;font-size:.92rem;margin-bottom:3px">' + escapeHtml(d.tipo) + (d.organismo ? ' — ' + escapeHtml(d.organismo) : '') + '</div>';
        if (d.numero || d.anio) row += '<div style="font-size:.85rem;color:var(--text-muted);margin-bottom:6px">N° ' + escapeHtml([d.numero, d.anio].filter(Boolean).join(' / ')) + '</div>';
        if (docUrl) row += '<a href="' + escapeAttr(docUrl) + '" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:5px;font-size:.83rem;color:var(--unam-cyan);font-weight:600;text-decoration:none">Ver documento..</a>';
        row += '</div></div>';
        return row;
      }).join('') +
      '</div>'
    : '<div class="detail-section"><p style="color:var(--text-muted);font-size:.95rem">No se cargaron documentos administrativos para esta propuesta.</p></div>';

  // ── TAB 1: Descripción ────────────────────────────────
  let tab1 = '';
  tab1 += '<div class="detail-section" style="border:none;padding:0 0 24px">';
  tab1 += '<div class="rich-content" style="font-size:1.02rem;color:var(--text-secondary);line-height:1.85;text-align:justify">' + (c.descripcion || '') + '</div>';
  if (isProximamente) {
    tab1 += `<div class="detail-interest-cta-wrap">
      <button type="button" class="btn-interest-cta" onclick="openInterestedModal(${c.id})">Quiero recibir información</button>
    </div>`;
  }
  tab1 += '</div>';
  // Unidad académica
  if (showUnidadAcademica) {
    tab1 += '<div class="detail-section"><div class="detail-section-title">Unidad académica</div>';
    tab1 += '<p style="color:var(--text-secondary);font-size:.95rem">' + escapeHtml(unidadesStr) + '</p></div>';
  }
  // Disertantes
  if (c.disertantes?.length) {
    const properName = (n) => String(n || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
    tab1 += '<div class="detail-section"><div class="detail-section-title">Disertantes</div>';
    tab1 += '<ul style="margin:0;padding-left:20px;color:var(--text-secondary);font-size:.95rem;line-height:1.8">';
    tab1 += c.disertantes.map(d => '<li>' + properName(d) + '</li>').join('');
    tab1 += '</ul></div>';
  }
  // Contacto
  if (c.contacto || c.telefonoContacto) {
    tab1 += '<div class="detail-section"><div class="detail-section-title">Contacto</div>';
    const contactMail = safePublicUrl(`mailto:${c.contacto}`, { allowMailto: true });
    if (c.contacto && contactMail) tab1 += '<p style="font-size:.93rem;margin-bottom:4px"><a href="' + escapeAttr(contactMail) + '" style="color:var(--unam-cyan);font-weight:600">' + escapeHtml(c.contacto) + '</a></p>';
    if (c.telefonoContacto) tab1 += '<p style="font-size:.9rem;color:var(--text-secondary)">' + escapeHtml(c.telefonoContacto) + '</p>';
    tab1 += '</div>';
  }
  // Tags
  if (c.tags?.length) {
    tab1 += '<div class="detail-section"><div class="detail-section-title">Palabras clave</div>';
    tab1 += '<div class="tags-list">' + c.tags.map(t => '<span class="tag">' + escapeHtml(t) + '</span>').join('') + '</div></div>';
  }

  // ── TAB 2: Requisitos ─────────────────────────────────
  let tab2 = '';
  if (c.requisitosTexto || c.requisitos?.length) {
    tab2 += '<div class="detail-section">';
    if (c.requisitosTexto) {
      tab2 += '<div class="rich-content" style="font-size:.95rem;color:var(--text-secondary);line-height:1.75;text-align:justify">' + c.requisitosTexto + '</div>';
    } else {
      tab2 += '<div class="req-list">' + (c.requisitos||[]).map(r => '<div class="req-item"><span class="req-dot"></span><span>' + r + '</span></div>').join('') + '</div>';
    }
    tab2 += '</div>';
  }

  // ── TAB 2.5: Alcances del título ───────────────────────
  let tabAlcances = '';
  const alcancesHtml = c.alcancesTitulo || c.alcancesDelTitulo || c.alcances || '';
  const hasAlcances = String(alcancesHtml).trim();
  if (!c.esCurso && hasAlcances) {
    tabAlcances += '<div class="detail-section">';
    tabAlcances += '<div class="rich-content" style="font-size:.97rem;color:var(--text-secondary);line-height:1.8;text-align:justify">' + alcancesHtml + '</div>';
    tabAlcances += '</div>';
  }
  // ── TAB 3: Plan / Programa ────────────────────────────
  let tab3 = '';
  if (c.esCurso) {
    if (c.programa) {
      tab3 += '<div class="detail-section"><div class="rich-content" style="font-size:.97rem;color:var(--text-secondary);line-height:1.8;text-align:justify">' + c.programa + '</div></div>';
    }
  } else {
    // Carreras: plan de estudios con visor PDF
    if (c.planEstudiosPDF) {
      const pdfId = 'pdf-viewer-' + c.id;
      const safePdfUrl = safePublicUrl(c.planEstudiosPDF, { allowRelative: true });
      if (safePdfUrl) {
      tab3 += '<div style="width:100%;border:0.5px solid var(--border);border-radius:8px;margin-bottom:16px">';
      tab3 += '<div style="padding:8px 14px;background:var(--bg-surface);border-bottom:0.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">';
      tab3 += '<span style="font-size:.82rem;color:var(--text-muted);font-weight:600">Plan de estudios</span>';
      tab3 += '<div style="display:flex;align-items:center;gap:8px">';
      tab3 += '<a href="' + escapeAttr(safePdfUrl) + '" target="_blank" rel="noopener noreferrer" style="font-size:.78rem;padding:3px 10px;background:rgba(0,163,224,.08);border:1px solid rgba(0,163,224,.2);border-radius:5px;color:var(--unam-cyan);cursor:pointer;text-decoration:none">Abrir</a>';
      tab3 += '</div>';
      tab3 += '</div>';
      tab3 += '<div id="' + pdfId + '" data-pdf-viewer="1" data-pdf-url="' + escapeAttr(safePdfUrl) + '" style="width:100%;height:520px;display:flex;flex-direction:column;transition:height .3s ease">';
      tab3 += '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--bg-elevated)">';
      tab3 += '<div style="display:flex;align-items:center;gap:8px">';
      tab3 += '<button onclick="pdfPrev(\'' + pdfId + '\')" id="' + pdfId + '-prev" style="font-size:.78rem;padding:4px 10px;border:1px solid var(--border);border-radius:5px;background:#fff;cursor:pointer" disabled>←</button>';
      tab3 += '<button onclick="pdfNext(\'' + pdfId + '\')" id="' + pdfId + '-next" style="font-size:.78rem;padding:4px 10px;border:1px solid var(--border);border-radius:5px;background:#fff;cursor:pointer" disabled>→</button>';
      tab3 += '<span id="' + pdfId + '-page" style="font-size:.8rem;color:var(--text-muted);min-width:74px;text-align:center">0 / 0</span>';
      tab3 += '</div>';
      tab3 += '<div style="display:flex;align-items:center;gap:8px">';
      tab3 += '<button onclick="pdfZoom(\'' + pdfId + '\', -0.15)" style="font-size:.78rem;padding:4px 10px;border:1px solid var(--border);border-radius:5px;background:#fff;cursor:pointer">−</button>';
      tab3 += '<button onclick="pdfZoom(\'' + pdfId + '\', 0.15)" style="font-size:.78rem;padding:4px 10px;border:1px solid var(--border);border-radius:5px;background:#fff;cursor:pointer">+</button>';
      tab3 += '</div>';
      tab3 += '</div>';
      tab3 += '<div style="flex:1;overflow:auto;background:#f3f6f8;display:flex;justify-content:center;align-items:flex-start;padding:12px">';
      tab3 += '<canvas id="' + pdfId + '-canvas" style="max-width:100%;height:auto;background:#fff;border:1px solid var(--border);box-shadow:0 2px 12px rgba(0,0,0,.08)"></canvas>';
      tab3 += '</div>';
      tab3 += '<div id="' + pdfId + '-err" style="display:none;padding:12px 16px;text-align:center;color:var(--text-muted);font-size:.9rem;border-top:1px solid var(--border)">No se pudo cargar el PDF. <a href="' + escapeAttr(safePdfUrl) + '" target="_blank" rel="noopener noreferrer" style="color:var(--unam-cyan)">Abrir archivo</a></div>';
      tab3 += '</div>';
      tab3 += '</div>';
      }
    }
    if (c.planEstudios?.length) {
      tab3 += '<div class="plan-list">' + c.planEstudios.map((item, i) =>
        '<div class="plan-item"><span class="plan-num">' + String(i+1).padStart(2,'0') + '</span><span>' + item + '</span></div>'
      ).join('') + '</div>';
    }
  }

  // ── Tab dots (show only if content) ──────────────────
  const hasRequisitos = !!tab2;
  const hasPlan = !!tab3;
  const hasDocs = !!(c.documentos?.length);
  const tab3Label = c.esCurso ? 'Programa' : 'Plan de estudios';
  const inscStateRaw = c.inscripcionAbierta;
  const inscStateValue = typeof inscStateRaw === 'object'
    ? !!(inscStateRaw.valor !== undefined ? inscStateRaw.valor : inscStateRaw.activo)
    : !!inscStateRaw;
  const hasInscForm = !!(c.formularioInscripcion);
  const shouldShowInscTab = !isProximamente && (c.esCurso || hasInscForm || _inscAbierta);
  const inscFecha = c.inscripcionAbierta?.fechaHasta || null;
  const inscExpiredByDate = !!(inscStateValue && inscFecha && !_inscAbierta);
  const inactiveNote = (!_activo && !isProximamente) ? '<div style="margin-top:28px;padding:18px 22px;background:rgba(143,163,177,.07);border:1px solid rgba(143,163,177,.2);border-radius:12px"><p style="font-size:.9rem;color:var(--text-muted);margin-bottom:10px">Esta propuesta ya no está activa. Para consultas podés contactarnos:</p><a href="mailto:ead@unam.edu.ar" style="color:var(--unam-cyan);font-weight:600;font-size:.93rem">ead@unam.edu.ar</a></div>' : '';

  // ── TAB Inscripción (solo si tiene formulario) ────────────
  const tabInsc = shouldShowInscTab ? (() => {
    const fechaStr = inscFecha
      ? new Date(inscFecha).toLocaleDateString('es-AR', {day:'2-digit',month:'long',year:'numeric'})
      : null;
    let html = '<div class="detail-section" style="border:none;padding:0 0 24px">';
    if (_inscAbierta && !hasInscForm) {
      const safeMailTo = c.contacto ? safePublicUrl(`mailto:${c.contacto}`, { allowMailto: true }) : '';
      const contactMail = safeMailTo
        ? `<a href="${escapeAttr(safeMailTo)}" style="color:var(--unam-cyan);font-weight:700;text-decoration:none">${escapeHtml(c.contacto)}</a>`
        : (c.contacto ? `<strong>${escapeHtml(c.contacto)}</strong>` : null);
      const contactPhone = c.telefonoContacto ? `<strong>${escapeHtml(c.telefonoContacto)}</strong>` : null;
      const contactParts = [contactMail, contactPhone].filter(Boolean);
      const contactLine = contactParts.length
        ? contactParts.join(' o ')
        : '<strong>los canales de contacto de la propuesta</strong>';
      html += `<div style="margin-bottom:14px;padding:12px 14px;background:rgba(0,163,224,.06);border:1px solid rgba(0,163,224,.2);border-radius:10px">
        <p style="margin:0;font-size:.92rem;line-height:1.65;color:var(--text-primary)">
          Para inscribirte debés cumplir con los <strong>requisitos</strong> de inscripción y comunicarte con ${contactLine}.
        </p>
      </div>`;
    }
    if (c.esCurso && _inscAbierta && hasInscForm) {
      html += `<p style="font-size:.98rem;color:var(--text-secondary);line-height:1.8;margin-bottom:14px">
        Para poder inscribirte al curso <strong>${escapeHtml(c.nombre)}</strong>, deberás completar el formulario de inscripción.
      </p>`;
      html += `<div style="margin-bottom:16px;padding:12px 14px;background:rgba(0,163,224,.06);border:1px solid rgba(0,163,224,.2);border-radius:10px">
        <p style="margin:0;font-size:.9rem;line-height:1.6;color:var(--text-primary)">
          Recordá revisar los <a href="#" onclick="openRequirementsTab(event)" style="color:var(--unam-cyan);text-decoration:underline"><strong>requisitos</strong></a> de inscripción antes de hacerlo.
        </p>
      </div>`;
    }
    if (fechaStr) {
      html += `<p style="font-size:1rem;color:var(--text-primary);margin-bottom:14px">
        La inscripción${c.esCurso ? ` al curso <strong>${escapeHtml(c.nombre)}</strong>` : ''} estará disponible hasta el <strong style="color:var(--unam-green)">${escapeHtml(fechaStr)}</strong>.
      </p>`;
    }
    const enrollmentUrl = safePublicUrl(c.formularioInscripcion);
    if (hasInscForm) {
      if (!enrollmentUrl) return '<div class="detail-section"><p style="color:var(--text-muted);font-size:.95rem">El formulario de inscripción configurado no es válido.</p></div>';
      if (_inscAbierta) {
        html += `<p style="font-size:.98rem;color:var(--text-secondary);line-height:1.7;margin:0 0 12px">
          Para inscribirte deberás completar el formulario de inscripción.
        </p>`;
        html += `<a href="${escapeAttr(enrollmentUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;background:var(--unam-cyan);color:#fff;font-weight:700;font-size:.88rem;border-radius:9px;text-decoration:none">
          Acceder al Formulario
        </a>`;
        if (c.esCurso) {
          html += `<p style="font-size:.9rem;color:var(--text-muted);line-height:1.65;margin:28px 0 0">
            Si necesitás ayuda, podés comunicarte a <a href="mailto:ead@unam.edu.ar" style="color:var(--unam-cyan);font-weight:700;text-decoration:none">ead@unam.edu.ar</a> o +54 376 44-80200 / Int. 195.
          </p>`;
        }
      } else {
        html += `<div style="margin:0 0 12px;padding:12px 14px;background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.2);border-radius:10px">
          <p style="margin:0;font-size:.92rem;line-height:1.65;color:#9f1239">
            La inscripción está cerrada${inscExpiredByDate && fechaStr ? ` desde el <strong>${escapeHtml(fechaStr)}</strong>` : ''}.
          </p>
        </div>`;
      }
    } else if (c.esCurso) {
      html += `<div style="margin:0 0 12px;padding:12px 14px;background:rgba(143,163,177,.1);border:1px solid rgba(143,163,177,.24);border-radius:10px">
        <p style="margin:0;font-size:.92rem;line-height:1.65;color:var(--text-secondary)">
          La inscripción no está habilitada para este curso en este momento.
        </p>
      </div>`;
    }
    html += '</div>';
    return html;
  })() : '';

  const tabs = [
    { label: 'Descripción', content: tab1 + inactiveNote, always: true },
    { label: 'Requisitos', content: tab2 },
    { label: 'Alcances del título', content: tabAlcances },
    { label: tab3Label, content: tab3 },
    { label: `Documentación${hasDocs ? ` <span class='detail-tab-dot'>${c.documentos.length}</span>` : ''}`, content: hasDocs ? docsSectionHtml : '' },
    { label: 'Inscripción', content: shouldShowInscTab ? tabInsc : '' },
  ].filter((t) => t.always || String(t.content || '').trim());

  const tabsBar = tabs.map((tab, idx) =>
    `<button class="detail-tab ${idx === 0 ? 'active' : ''}" onclick="switchTab(${idx}, this)">${tab.label}</button>`
  ).join('');
  const tabsPanels = tabs.map((tab, idx) =>
    `<div id="detail-tab-${idx}" class="detail-tab-panel ${idx === 0 ? 'active' : ''}">${tab.content}</div>`
  ).join('');

  app.innerHTML = `
  <div class="detail-page">
    <div class="detail-hero">
      <div class="detail-inner" style="max-width:1000px">
        <div class="detail-breadcrumb">
          <a onclick="navigate('home')">Inicio</a> › <a onclick="navigate('search')">Carreras y Cursos</a> › <span>${c.nombre}</span>
        </div>
        ${finalizadaBanner}
        <div class="detail-badges">
          <span class="badge badge-tipo">${tipoLabel}</span>
          ${subtipoBadge}
          <span class="badge badge-modalidad">${c.modalidad}</span>
          ${inscBadge}${nuevaBadge}
        </div>
        <h1 class="detail-title">${c.nombre}</h1>
      </div>
    </div>

    <div class="detail-meta-grid">
      ${duracionCard}
      <div class="detail-meta-card"><div class="detail-meta-label">Modalidad</div><div class="detail-meta-value">${c.modalidad}</div></div>
      ${disciplinaCard}${regionalCard}
    </div>

    <div class="detail-tabs-bar">
      ${tabsBar}
    </div>
    ${tabsPanels}

  </div>
  ${footerHTML()}`;

  initPdfViewers();
}

function switchTab(idx, btn) {
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.detail-tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const panel = document.getElementById('detail-tab-' + idx);
  if (panel) panel.classList.add('active');
}

function openRequirementsTab(event) {
  event?.preventDefault?.();
  const tabs = [...document.querySelectorAll('.detail-tab')];
  const reqIdx = tabs.findIndex((tab) => String(tab.textContent || '').trim().toLowerCase().startsWith('requisitos'));
  if (reqIdx >= 0) switchTab(reqIdx, tabs[reqIdx]);
}
window.openRequirementsTab = openRequirementsTab;

function closeInterestedModal() {
  const modal = document.getElementById('modal-container');
  if (modal) modal.innerHTML = '';
}

function openInterestedModal(careerId) {
  const modal = document.getElementById('modal-container');
  if (!modal) return;
  modal.innerHTML = `
    <div class="modal-backdrop interested-modal-backdrop" onclick="closeInterestedModal()">
      <div class="modal-content interested-modal-content" onclick="event.stopPropagation()">
        <h3 class="interested-modal-title">Recibir información</h3>
        <p class="interested-modal-sub">Dejá tu correo y te avisaremos cuando se habilite la propuesta.</p>
        <input id="interesado-email" type="email" class="form-input" placeholder="informes@unam.edu.ar" autocomplete="email" />
        <div id="interesado-error" class="interested-modal-error"></div>
        <div class="interested-modal-actions">
          <button type="button" class="interested-btn-secondary" onclick="closeInterestedModal()">Cancelar</button>
          <button type="button" class="interested-btn-primary" onclick="submitInterested(${Number(careerId)})">Enviar</button>
        </div>
      </div>
    </div>`;
  const input = document.getElementById('interesado-email');
  input?.focus();
  input?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') submitInterested(careerId);
  });
}

async function submitInterested(careerId) {
  const input = document.getElementById('interesado-email');
  const err = document.getElementById('interesado-error');
  const email = String(input?.value || '').trim().toLowerCase();
  if (!email) {
    if (err) err.textContent = 'Ingresá un correo.';
    return;
  }
  const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!okEmail) {
    if (err) err.textContent = 'Ingresá un correo válido.';
    return;
  }
  try {
    await registerCareerInterest(careerId, email);
    closeInterestedModal();
    showToast('Registro guardado. Te contactaremos con novedades.', 'success');
  } catch (e) {
    if (err) {
      if (e?.errorCode === 'ALREADY_INFORMED') {
        err.innerHTML = 'Ya te enviamos la información a ese correo. Si no lo encontrás, revisá la carpeta de spam o escribinos a <a href="mailto:ead@unam.edu.ar" style="color:inherit;text-decoration:none">ead@unam.edu.ar</a>.';
      } else {
        err.textContent = e?.message || 'No se pudo registrar tu correo.';
      }
    }
  }
}
window.openInterestedModal = openInterestedModal;
window.closeInterestedModal = closeInterestedModal;
window.submitInterested = submitInterested;


// ── ADMIN ABM ─────────────────────────────────────────────
let adminAllCareers = [];
let adminFiltered   = [];
let adminSearchQ    = '';

async function renderAdmin(app) {
  app.innerHTML = `
  <div class="admin-page">
    <div class="admin-header">
      <div class="admin-header-inner">
        <h1 class="admin-title">Panel <span>Administrador</span></h1>
        <div style="display:flex;gap:10px;align-items:center">
          <a href="/cpanel" style="padding:10px 18px;border:1.5px solid rgba(0,163,224,.4);color:#00A3E0;border-radius:100px;font-size:.82rem;font-weight:700;text-decoration:none">Ir al CPanel completo →</a>
          <button class="btn-primary" onclick="openCareerModal(null)" style="padding:10px 22px">+ Nueva propuesta</button>
        </div>
      </div>
    </div>
    <div class="admin-body">
      <div class="admin-stats" id="admin-stats">
        ${skeletonCards(4).replace(/class="cards-grid"/g,'').replace(/class="career-card/g,'class="skeleton-card')}
      </div>
      <div class="admin-toolbar">
        <div class="admin-search">
          <span>🔍</span>
          <input type="text" placeholder="Buscar en el listado..." id="admin-search-input" />
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <select class="select-styled" id="admin-filter-tipo">
            <option value="">Todos los tipos</option>
            <option>Pregrado</option><option>Grado</option><option>Posgrado</option>
          </select>
          <select class="select-styled" id="admin-filter-activo">
            <option value="">Todos</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>
        </div>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr>
            <th>Nombre</th><th>Tipo</th><th>Disciplina</th>
            <th>Modalidad</th><th>Regional</th><th>Estado</th><th>Acciones</th>
          </tr></thead>
          <tbody id="admin-tbody"><tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">Cargando...</td></tr></tbody>
        </table>
      </div>
    </div>
  </div>
  ${footerHTML()}`;

  await loadAdminData();
  setupAdminSearch();
}

async function loadAdminData() {
  try {
    const data = await searchCareers({ limit: 100 });
    // También cargar inactivos
    const inactivos = await apiFetch('/careers?limit=100&activo=false').catch(() => ({ data: [] }));
    adminAllCareers = [...data.data, ...(inactivos.data || [])];
    adminFiltered   = [...adminAllCareers];
    renderAdminStats();
    renderAdminTable();
  } catch { showToast('Error al cargar datos', 'error'); }
}

function renderAdminStats() {
  const total    = adminAllCareers.length;
  const activos  = adminAllCareers.filter(c => c.activo !== false).length;
  const cursos   = adminAllCareers.filter(c => c.esCurso).length;
  const posgrado = adminAllCareers.filter(c => c.tipo === 'Posgrado').length;
  document.getElementById('admin-stats').innerHTML = `
    <div class="admin-stat"><div class="admin-stat-value">${total}</div><div class="admin-stat-label">Total</div></div>
    <div class="admin-stat"><div class="admin-stat-value">${activos}</div><div class="admin-stat-label">Activos</div></div>
    <div class="admin-stat"><div class="admin-stat-value">${cursos}</div><div class="admin-stat-label">Cursos</div></div>
    <div class="admin-stat"><div class="admin-stat-value">${posgrado}</div><div class="admin-stat-label">Posgrado</div></div>`;
}

function renderAdminTable() {
  const tbody = document.getElementById('admin-tbody');
  if (!tbody) return;
  if (!adminFiltered.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">Sin resultados</td></tr>';
    return;
  }
  tbody.innerHTML = adminFiltered.map(c => `
    <tr>
      <td style="font-weight:600;max-width:220px">${c.nombre}</td>
      <td>${c.esCurso ? '<span class="badge badge-curso">Curso</span>' : c.tipo}${c.subtipo ? ` <span style="font-size:.75rem;color:var(--text-muted)">(${c.subtipo})</span>` : ''}</td>
      <td>${c.disciplina}</td>
      <td>${c.modalidad}</td>
      <td>${c.regional}</td>
      <td><span class="status-badge ${c.activo !== false ? 'activo' : 'inactivo'}">${c.activo !== false ? '● Activo' : '● Inactivo'}</span></td>
      <td><div class="admin-actions">
        <button class="btn-edit" onclick="openCareerModal(${c.id})">✏️ Editar</button>
        <button class="btn-delete" onclick="confirmDelete(${c.id},'${c.nombre.replace(/'/g,"\\'")}')">🗑️ Baja</button>
      </div></td>
    </tr>`).join('');
}

function setupAdminSearch() {
  const inp = document.getElementById('admin-search-input');
  const tipoSel = document.getElementById('admin-filter-tipo');
  const activoSel = document.getElementById('admin-filter-activo');
  const filter = () => {
    const q   = (inp?.value || '').toLowerCase();
    const tipo = tipoSel?.value;
    const activo = activoSel?.value;
    adminFiltered = adminAllCareers.filter(c => {
      const matchQ = !q || c.nombre.toLowerCase().includes(q) || c.disciplina.toLowerCase().includes(q);
      const matchTipo = !tipo || c.tipo === tipo;
      const matchActivo = activo === '' || (activo === 'true' ? c.activo !== false : c.activo === false);
      return matchQ && matchTipo && matchActivo;
    });
    renderAdminTable();
  };
  inp?.addEventListener('input', filter);
  tipoSel?.addEventListener('change', filter);
  activoSel?.addEventListener('change', filter);
}

// ── MODAL CARRERA ─────────────────────────────────────────
async function openCareerModal(id) {
  let career = null;
  if (id) {
    try { career = await fetchCareer(id); } catch { showToast('Error al cargar', 'error'); return; }
  }

  let tags = career?.tags || [];

  const mc = document.getElementById('modal-container');
  mc.innerHTML = `
  <div class="modal-backdrop" id="modal-backdrop" onclick="closeModal(event)">
    <div class="modal">
      <div class="modal-header">
        <h2 class="modal-title">${id ? 'Editar carrera' : 'Nueva carrera'}</h2>
        <button class="modal-close" onclick="closeModalDirect()">✕</button>
      </div>
      <div class="form-grid">
        <div class="form-group full">
          <label class="form-label">Nombre *</label>
          <input class="form-input" id="f-nombre" value="${career?.nombre || ''}" placeholder="Ej: Licenciatura en Sistemas" />
        </div>
        <div class="form-group">
          <label class="form-label">Tipo *</label>
          <select class="form-select" id="f-tipo" onchange="checkSubtipo()">
            <option value="">Seleccionar</option>
            ${['Pregrado','Grado','Posgrado'].map(t => `<option ${career?.tipo===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" id="subtipo-group" style="${career?.tipo==='Posgrado'?'':'display:none'}">
          <label class="form-label">Subtipo</label>
          <select class="form-select" id="f-subtipo">
            <option value="">Sin subtipo</option>
            ${['Especialización','Maestría','Doctorado'].map(s => `<option ${career?.subtipo===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Disciplina</label>
          <select class="form-select" id="f-disciplina">
            <option value="">Seleccionar</option>
            ${ALLOWED_DISCIPLINAS.map(d => `<option ${career?.disciplina===d?'selected':''}>${d}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Modalidad</label>
          <select class="form-select" id="f-modalidad">
            ${['Híbrida','100% Virtual'].map(m => `<option ${career?.modalidad===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Unidad Académica</label>
          <input class="form-input" id="f-unidad" value="${career?.unidadAcademica || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Regional</label>
          <input class="form-input" id="f-regional" value="${career?.regional || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Localidad</label>
          <input class="form-input" id="f-localidad" value="${career?.localidad || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label">Duración</label>
          <input class="form-input" id="f-duracion" value="${career?.duracion || ''}" placeholder="Ej: 4 años" />
        </div>
        <div class="form-group">
          <label class="form-label">Imagen (emoji)</label>
          <input class="form-input" id="f-imagen" value="${career?.imagen || '📚'}" style="font-size:1.2rem" />
        </div>
        <div class="form-group full">
          <label class="form-label">Descripción</label>
          <textarea class="form-textarea" id="f-descripcion">${career?.descripcion || ''}</textarea>
        </div>
        <div class="form-group full">
          <label class="form-label">Palabras clave (tags) — presioná Enter para agregar</label>
          <div class="tags-input-wrap" id="tags-wrap">
            ${tags.map(t => `<span class="tag-item">${t}<span class="tag-remove" onclick="removeTag('${t}')">✕</span></span>`).join('')}
            <input type="text" id="tags-input" placeholder="Agregar tag..." />
          </div>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:10px">
          <input type="checkbox" id="f-esCurso" ${career?.esCurso?'checked':''} style="width:16px;height:16px" />
          <label class="form-label" style="margin:0;text-transform:none;font-size:.88rem">Es un curso (no una carrera)</label>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:10px">
          <input type="checkbox" id="f-activo" ${career?.activo!==false?'checked':''} style="width:16px;height:16px" />
          <label class="form-label" style="margin:0;text-transform:none;font-size:.88rem">Activo (visible en el buscador)</label>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-cancel" onclick="closeModalDirect()">Cancelar</button>
        <button class="btn-save" onclick="saveCareer(${id || 'null'})">💾 Guardar</button>
      </div>
    </div>
  </div>`;

  // Tags input
  const tagsInput = document.getElementById('tags-input');
  tagsInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = tagsInput.value.trim().toLowerCase();
      if (val && !tags.includes(val)) {
        tags.push(val);
        renderTagsInModal(tags);
      }
      tagsInput.value = '';
    }
  });
  window._currentTags = tags;
}
window.openCareerModal = openCareerModal;

function renderTagsInModal(tags) {
  window._currentTags = tags;
  const wrap = document.getElementById('tags-wrap');
  if (!wrap) return;
  const input = wrap.querySelector('input');
  const inputVal = input?.value || '';
  wrap.innerHTML = tags.map(t => `<span class="tag-item">${t}<span class="tag-remove" onclick="removeTag('${t}')">✕</span></span>`).join('');
  const newInput = document.createElement('input');
  newInput.type = 'text'; newInput.id = 'tags-input'; newInput.placeholder = 'Agregar tag...';
  newInput.value = inputVal;
  newInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = newInput.value.trim().toLowerCase();
      if (val && !window._currentTags.includes(val)) { window._currentTags.push(val); renderTagsInModal(window._currentTags); }
      newInput.value = '';
    }
  });
  wrap.appendChild(newInput);
  newInput.focus();
}

function removeTag(tag) {
  window._currentTags = (window._currentTags || []).filter(t => t !== tag);
  renderTagsInModal(window._currentTags);
}
window.removeTag = removeTag;

function checkSubtipo() {
  const tipo = document.getElementById('f-tipo')?.value;
  const group = document.getElementById('subtipo-group');
  if (group) group.style.display = tipo === 'Posgrado' ? '' : 'none';
}
window.checkSubtipo = checkSubtipo;

async function saveCareer(id) {
  const nombre = document.getElementById('f-nombre')?.value?.trim();
  const tipo   = document.getElementById('f-tipo')?.value;
  if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }
  if (!tipo)   { showToast('El tipo es obligatorio',   'error'); return; }

  const data = {
    nombre,
    tipo,
    subtipo:         document.getElementById('f-subtipo')?.value || null,
    disciplina:      document.getElementById('f-disciplina')?.value?.trim(),
    modalidad:       document.getElementById('f-modalidad')?.value,
    unidadAcademica: document.getElementById('f-unidad')?.value?.trim(),
    regional:        document.getElementById('f-regional')?.value?.trim(),
    localidad:       document.getElementById('f-localidad')?.value?.trim(),
    duracion:        document.getElementById('f-duracion')?.value?.trim(),
    imagen:          document.getElementById('f-imagen')?.value?.trim() || '📚',
    descripcion:     document.getElementById('f-descripcion')?.value?.trim(),
    tags:            window._currentTags || [],
    esCurso:         document.getElementById('f-esCurso')?.checked || false,
    activo:          document.getElementById('f-activo')?.checked !== false,
  };

  try {
    if (id) { await updateCareer(id, data); showToast('Carrera actualizada', 'success'); }
    else    { await createCareer(data);     showToast('Carrera creada',       'success'); }
    closeModalDirect();
    await loadAdminData();
  } catch { showToast('Error al guardar', 'error'); }
}
window.saveCareer = saveCareer;

async function confirmDelete(id, nombre) {
  if (!confirm(`¿Dar de baja "${nombre}"?\n\nEl registro se desactivará (baja lógica) y no aparecerá en el buscador.`)) return;
  try {
    await deleteCareer(id);
    showToast('Carrera dada de baja', 'success');
    await loadAdminData();
  } catch { showToast('Error al dar de baja', 'error'); }
}
window.confirmDelete = confirmDelete;

function closeModal(e) { if (e.target.id === 'modal-backdrop') closeModalDirect(); }
function closeModalDirect() { document.getElementById('modal-container').innerHTML = ''; }
window.closeModal = closeModal;
window.closeModalDirect = closeModalDirect;

// ── NOVEDADES ─────────────────────────────────────────────
function renderNovedades(app) {
  app.innerHTML = `
    <div class="detail-page" style="padding-top:calc(var(--nav-height) + 40px)">
      <div class="novedades-page">
        <h1 class="novedades-title">Novedades</h1>
        <p class="novedades-sub">
          Queremos mantenerte al día con las novedades de <strong>Educación a Distancia</strong> de la Universidad Nacional de Misiones.
          Cada semana te informaremos por correo sobre actualizaciones de la oferta académica, nuevas propuestas,
          aperturas de inscripción y cambios relevantes publicados en el sitio.
        </p>
        <section class="newsletter-inline" aria-label="Newsletter de novedades">
          <div class="newsletter-inline-title">Sumate al Newsletter semanal</div>
          <p class="newsletter-inline-sub">Dejá tu correo electrónico y recibí las novedades en un solo resumen.</p>
          <form class="newsletter-form" onsubmit="return submitNewsletterFrom('newsletter-novedades-email','novedades')">
            <input id="newsletter-novedades-email" type="email" class="newsletter-input" placeholder="tu-correo@ejemplo.com" autocomplete="email" />
            <button type="submit" class="newsletter-btn">Recibí novedades</button>
          </form>
        </section>
      </div>
    </div>
    ${footerHTML()}`;
}

// ── PLACEHOLDER PAGES ─────────────────────────────────────
const PLACEHOLDER_DATA = {
  quienes:  { icon: '', title: 'Quiénes somos', isContent: true },
  contacto: { icon: '✉️', title: 'Contacto', desc: 'Ponete en contacto con el equipo de Educación a Distancia de la UNaM.', isContact: true },
};

function docInst(titulo, subtitulo, fecha, desc, pdfUrl) {
  const pdfBtn = pdfUrl
    ? `<a href="${pdfUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:5px;font-size:.83rem;color:var(--unam-cyan);font-weight:600;text-decoration:none">Ver documento..</a>`
    : `<span style="font-size:.78rem;color:var(--text-muted)">PDF próximamente disponible</span>`;
  return `<div style="padding:20px 24px;background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px;display:flex;align-items:flex-start;gap:16px">
    <div style="width:42px;height:42px;background:rgba(0,163,224,.08);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.3rem">📋</div>
    <div style="flex:1">
      <div style="font-weight:700;font-size:.95rem;color:var(--text-primary);margin-bottom:3px">${titulo}</div>
      ${subtitulo ? `<div style="font-size:.82rem;color:var(--text-muted);margin-bottom:2px">${subtitulo}</div>` : ''}
      ${fecha ? `<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:8px">${fecha}</div>` : ''}
      ${pdfBtn}
    </div>
  </div>`;
}

function renderPlaceholder(app, page) {
  const d = PLACEHOLDER_DATA[page] || { icon: '🚧', title: 'En construcción', desc: 'Esta sección estará disponible próximamente.' };

  if (d.isContent) {
    app.innerHTML = `
    <div class="detail-page" style="padding-top:calc(var(--nav-height) + 40px)">
      <div style="max-width:900px;margin:0 auto;padding:0 clamp(16px,4vw,48px) 60px">
        <h1 style="font-size:1.6rem;font-weight:800;margin-bottom:24px;color:var(--text-primary)">${d.title}</h1>

        <!-- Tabs -->
        <div style="display:flex;gap:4px;border-bottom:2px solid var(--border-card);margin-bottom:32px">
          <button id="qs-tab-0" onclick="qsTab(0)" style="padding:10px 20px;border:none;background:none;cursor:pointer;font-size:.9rem;font-weight:700;color:var(--unam-cyan);border-bottom:2px solid var(--unam-cyan);margin-bottom:-2px">Sobre el SIED</button>
          <button id="qs-tab-1" onclick="qsTab(1)" style="padding:10px 20px;border:none;background:none;cursor:pointer;font-size:.9rem;font-weight:600;color:var(--text-muted);border-bottom:2px solid transparent;margin-bottom:-2px">Documentación</button>
        </div>

        <!-- Panel 0: Sobre el SIED -->
        <div id="qs-panel-0" style="font-size:1rem;color:var(--text-secondary);line-height:1.85">
          <p style="margin-bottom:1.4rem">El <strong style="color:var(--text-primary)">Sistema Institucional de Educación a Distancia (SIED)</strong> es la estructura estratégica de la Universidad Nacional de Misiones (UNaM) dedicada a la gestión, regulación y fortalecimiento de las propuestas educativas mediadas por tecnologías digitales.</p>

          <h2 style="font-size:1.1rem;font-weight:700;color:var(--text-primary);margin:1.6rem 0 .8rem;padding-bottom:8px;border-bottom:2px solid var(--unam-cyan)">Fundamentación y Trayectoria</h2>
          <p style="margin-bottom:1rem">Nuestra identidad se basa en la institucionalización de la innovación y la virtualización como ejes del desarrollo socio-educativo. El Área de Educación a Distancia fue creada formalmente por la <strong style="color:var(--text-primary)">Resolución Rectoral Nº 1797-2018</strong> para implementar el SIED y garantizar el acceso a una educación universitaria de excelencia con pertinencia social.</p>
          <p style="margin-bottom:1.4rem">Operamos bajo la órbita de la Secretaría General Académica, con dependencia directa del Rectorado y el Vice Rectorado.</p>

          <h2 style="font-size:1.1rem;font-weight:700;color:var(--text-primary);margin:1.6rem 0 .8rem;padding-bottom:8px;border-bottom:2px solid var(--unam-cyan)">Pilares de Gestión</h2>
          <div style="display:flex;flex-direction:column;gap:1rem;margin-bottom:1.6rem">
            <div style="padding:16px 20px;background:rgba(0,163,224,.04);border-left:3px solid var(--unam-cyan);border-radius:0 8px 8px 0">
              <strong style="color:var(--text-primary)">Marco Normativo</strong><br>
              El SIED cuenta con la validación de la CONEAU (RESFC-2020-267-APN-CONEAU#ME) y de la SPU (RESOL-2020-175-APN-SECPU#ME). Actualmente, nos encontramos en proceso de ratificación institucional en el marco de nuestra evaluación externa periódica.
            </div>
            <div style="padding:16px 20px;background:rgba(0,163,224,.04);border-left:3px solid var(--unam-cyan);border-radius:0 8px 8px 0">
              <strong style="color:var(--text-primary)">Misión Pedagógica</strong><br>
              Promover propuestas mediadas por tecnologías que incluyan modos alternativos de enseñanza y aprendizaje, fomentando el pensamiento crítico y el compromiso social.
            </div>
            <div style="padding:16px 20px;background:rgba(0,163,224,.04);border-left:3px solid var(--unam-cyan);border-radius:0 8px 8px 0">
              <strong style="color:var(--text-primary)">Modelo de Gestión</strong><br>
              Coordinación centralizada que articula con Unidades de Educación a Distancia (UEaD) en cada Facultad, asegurando la cohesión en todo el territorio de la provincia.
            </div>
          </div>

          <h2 style="font-size:1.1rem;font-weight:700;color:var(--text-primary);margin:1.6rem 0 .8rem;padding-bottom:8px;border-bottom:2px solid var(--unam-cyan)">Compromiso con la Calidad</h2>
          <p style="margin-bottom:0">Garantizamos la excelencia académica a través de un ecosistema tecnológico propio alojado en el Data Center de la UNaM y un acompañamiento pedagógico continuo que lidera la alfabetización digital de toda nuestra comunidad universitaria.</p>
        </div>

        <!-- Panel 1: Documentación -->
        <div id="qs-panel-1" style="display:none">
          <div style="display:flex;flex-direction:column;gap:16px">
            ${docInst('Resolución 2599/2023','RESOL-2023-2599-APN-ME','SPU. Aprobación SIED.','','/uploads/institucional/resol-2023-2599.pdf')}
            ${docInst('RESOL-2020-175-APN-SECPU#ME','SPU. Aprobación SIED.','03/12/2020','','/uploads/institucional/resol-2020-175.pdf')}
            ${docInst('RESFC-2020-267-APN-CONEAU#ME','CONEAU. Aprobación SIED.','01/09/2020','','/uploads/institucional/resfc-2020-267.pdf')}
          </div>
        </div>

      </div>
    </div>
    ${footerHTML()}`;
    // Tab switch logic
    window.qsTab = function(i) {
      [0,1].forEach(n => {
        document.getElementById('qs-panel-'+n).style.display = n===i ? '' : 'none';
        const btn = document.getElementById('qs-tab-'+n);
        btn.style.color        = n===i ? 'var(--unam-cyan)' : 'var(--text-muted)';
        btn.style.fontWeight   = n===i ? '700' : '600';
        btn.style.borderBottom = n===i ? '2px solid var(--unam-cyan)' : '2px solid transparent';
      });
    };
    return;
  }

  const extra = d.isProximamente ? `
    <div style="margin-top:20px;padding:14px 20px;background:rgba(0,163,224,.06);border:1px solid rgba(0,163,224,.18);border-radius:10px;text-align:center">
      <span style="font-size:.85rem;font-weight:700;color:var(--accent)">Próximamente</span>
    </div>` : d.isContact ? `
    <div style="margin-top:20px;padding:16px;background:rgba(0,163,224,0.06);border:1px solid rgba(0,163,224,0.2);border-radius:10px;text-align:center">
      <div style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--accent);margin-bottom:8px">Correo electrónico</div>
      <a href="mailto:ead@unam.edu.ar" style="font-size:1.1rem;font-weight:700;color:var(--accent);text-decoration:none">ead@unam.edu.ar</a>
      <div style="font-size:.78rem;color:var(--text-muted);margin-top:6px">Al hacer clic se abrirá tu cliente de correo</div>
    </div>` : `<span class="placeholder-badge">Próximamente</span>`;

  app.innerHTML = `
  <div class="placeholder-page">
    <div class="placeholder-card">
      <div class="placeholder-icon">${d.icon}</div>
      <h2 class="placeholder-title">${d.title}</h2>
      <p class="placeholder-desc">${d.desc}</p>
      ${extra}
    </div>
  </div>
  ${footerHTML()}`;
}

// ── UNIDADES ACADÉMICAS ───────────────────────────────────
const UNIDADES_DATA = [
  { nombre: 'Escuela Agrotécnica Eldorado',                    domicilio: 'Bertoni 152 Km 3',                            tel: '+54 3751 431122 / 431329',                    web: 'https://www.eae.unam.edu.ar/',     regional: 'Eldorado'},
  { nombre: 'Escuela de Enfermería',                           domicilio: 'Av. López Torres 3415',                       tel: '+54 3764 4428177 / 4440961',                  web: 'https://www.escenf.unam.edu.ar/', regional: 'Posadas' },
  { nombre: 'Facultad de Arte y Diseño',                       domicilio: 'Carhué Nº 832',                              tel: '+54 3755 401150 / 406601 Int 108',            web: 'https://www.fayd.unam.edu.ar/',     regional: 'Oberá'   },
  { nombre: 'Facultad de Ciencias Económicas',                 domicilio: 'Av. Fernando Elías Llamosas 9458. Campus UNaM', tel: '+54 376 4480394 / 4480395 / 4480006', whatsapp: '3764172541', web: 'https://www.fce.unam.edu.ar/', regional: 'Posadas' },
  { nombre: 'Facultad de Ciencias Exactas, Químicas y Naturales', domicilio: 'Félix de Azara 1552',                      tel: '+54 3764 4435099 Int 114',                    web: 'https://www.fceqyn.unam.edu.ar/', regional: 'Posadas' },
  { nombre: 'Facultad de Ciencias Forestales',                 domicilio: 'Bertoni 124 Km 3',                            tel: '+54 3751 431526 / 431780 Int 108',            web: 'https://www.fcf.unam.edu.ar/',     regional: 'Eldorado'},
  { nombre: 'Facultad de Humanidades y Ciencias Sociales',     domicilio: 'Tucumán 1946',                                tel: '+54 376 4434344 / 4434335 / 4425641 Int 133', web: 'https://www.fhycs.unam.edu.ar/',  regional: 'Posadas' },
  { nombre: 'Facultad de Ingeniería',                          domicilio: 'Juan Manuel de Rosas 325',                    tel: '+54 3755 422169 / 422170 Int 103',            web: 'https://www.fio.unam.edu.ar/',     regional: 'Oberá'   },
];

function renderUnidades(app) {
  const cards = UNIDADES_DATA.map(u => `
    <div style="padding:22px 24px;background:var(--bg-card);border:1px solid var(--border-card);border-radius:12px">
      <div style="font-size:1rem;font-weight:700;color:var(--text-primary);margin-bottom:10px">${u.nombre}</div>
      <div style="display:flex;flex-direction:column;gap:5px;font-size:.88rem;color:var(--text-secondary)">
        <div>📍 ${u.domicilio}, ${u.regional}</div>
        <div>📞 ${u.tel}</div>
        ${u.whatsapp ? `<div>💬 WhatsApp ${u.whatsapp}</div>` : ''}
        <div style="margin-top:4px"><a href="${u.web}" target="_blank" style="color:var(--unam-cyan);font-weight:600;text-decoration:none">${u.web}</a></div>
      </div>
    </div>`).join('');

  app.innerHTML = `
    <div class="detail-page" style="padding-top:calc(var(--nav-height) + 40px)">
      <div style="max-width:900px;margin:0 auto;padding:0 clamp(16px,4vw,48px) 60px">
        <h1 style="font-size:1.6rem;font-weight:800;margin-bottom:8px;color:var(--text-primary)">Unidades Académicas</h1>
        <p style="font-size:.95rem;color:var(--text-muted);margin-bottom:28px">Universidad Nacional de Misiones</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px">
          ${cards}
        </div>
      </div>
    </div>
    ${footerHTML()}`;
}

// ── FOOTER ────────────────────────────────────────────────
function footerHTML() {
  return `
  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-grid">
        <div class="footer-brand">
          <div style="font-size:.88rem;font-weight:700;color:var(--text-primary)">Universidad Nacional de Misiones</div>
        </div>
        <div class="footer-col"><h4>Oferta</h4><ul>
          <li><a onclick="filterByCurso()">Cursos</a></li>
          <li><a onclick="filterByTipo('Pregrado')">Pregrado</a></li>
          <li><a onclick="filterByTipo('Grado')">Grado</a></li>
          <li><a onclick="filterByTipo('Posgrado')">Posgrado</a></li>
        </ul></div>
        <div class="footer-col"><h4>Institucional</h4><ul>
          <li><a href="https://unam.edu.ar" target="_blank">Sitio Oficial</a></li>
          <li><a onclick="navigate('unidades')" style="cursor:pointer">Unidades Académicas</a></li>
          <li><a onclick="navigate('novedades')" style="cursor:pointer">Novedades</a></li>
          <li><a onclick="navigate('quienes');setTimeout(()=>window.qsTab&&window.qsTab(1),80)" style="cursor:pointer">Documentación</a></li>
        </ul></div>
        <div class="footer-col"><h4>Accesos</h4><ul>
          <li><a href="https://ead.unam.edu.ar/" target="_blank">Campus Virtual</a></li>
          <li><a href="mailto:ead@unam.edu.ar">ead@unam.edu.ar</a></li>
          <li><a href="https://www.youtube.com/@eadunam" target="_blank">YouTube</a></li>
          <li><a href="https://www.youtube.com/@redsolidariadeformacion" target="_blank">Red Solidaria de Formación</a></li>
        </ul></div>
      </div>
      <div class="footer-bottom">
        <span class="footer-copy">© ${new Date().getFullYear()} Universidad Nacional de Misiones</span>
      </div>
    </div>
  </footer>`;
}

// ── NAVBAR ────────────────────────────────────────────────
function setupNavbar() {
  const navbar    = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('nav-links');
  const overlay   = document.getElementById('nav-overlay');

  window.addEventListener('scroll', () => {
    navbar?.classList.toggle('scrolled', window.scrollY > 20);
  });

  hamburger?.addEventListener('click', () => {
    navLinks?.classList.toggle('open');
    overlay?.classList.toggle('open');
  });
  overlay?.addEventListener('click', () => {
    navLinks?.classList.remove('open');
    overlay?.classList.remove('open');
  });
}

// ── INIT ──────────────────────────────────────────────────
function togglePdfFull(id) {
  const viewer = document.getElementById(id);
  const btn = document.getElementById(id + '-btn');
  if (!viewer) return;
  const isExpanded = viewer.getAttribute('data-expanded') === '1';
  if (isExpanded) {
    viewer.style.height = '520px';
    viewer.style.position = '';
    viewer.style.top = '';
    viewer.style.left = '';
    viewer.style.right = '';
    viewer.style.bottom = '';
    viewer.style.width = '';
    viewer.style.zIndex = '';
    viewer.style.background = '';
    viewer.removeAttribute('data-expanded');
    if (btn) {
      btn.textContent = '⛶ Expandir';
      btn.style.position = '';
      btn.style.top = '';
      btn.style.right = '';
      btn.style.zIndex = '';
    }
    document.body.style.overflow = '';
    queuePdfRender(id, PDF_VIEWERS.get(id)?.pageNum || 1);
  } else {
    document.querySelectorAll('[data-pdf-viewer="1"][data-expanded="1"]').forEach((el) => {
      if (el.id !== id) togglePdfFull(el.id);
    });
    viewer.style.height = '100vh';
    viewer.style.position = 'fixed';
    viewer.style.top = '0';
    viewer.style.left = '0';
    viewer.style.right = '0';
    viewer.style.bottom = '0';
    viewer.style.width = '100vw';
    viewer.style.zIndex = '9000';
    viewer.style.background = '#fff';
    viewer.setAttribute('data-expanded','1');
    if (btn) {
      btn.textContent = '✕ Cerrar';
      btn.style.position = 'fixed';
      btn.style.top = '18px';
      btn.style.right = '20px';
      btn.style.zIndex = '9001';
    }
    document.body.style.overflow = 'hidden';
    queuePdfRender(id, PDF_VIEWERS.get(id)?.pageNum || 1);
  }
}
window.togglePdfFull = togglePdfFull;

function showPdfErrorById(id) {
  const err = document.getElementById(id + '-err');
  if (err) err.style.display = '';
}

function updatePdfControls(id) {
  const st = PDF_VIEWERS.get(id);
  if (!st) return;
  const page = document.getElementById(id + '-page');
  const prev = document.getElementById(id + '-prev');
  const next = document.getElementById(id + '-next');
  if (page) page.textContent = `${st.pageNum} / ${st.totalPages || 0}`;
  if (prev) prev.disabled = st.pageNum <= 1 || st.totalPages <= 0;
  if (next) next.disabled = st.pageNum >= st.totalPages || st.totalPages <= 0;
}

function queuePdfRender(id, num) {
  const st = PDF_VIEWERS.get(id);
  if (!st || !st.pdfDoc) return;
  if (st.rendering) {
    st.pendingPage = num;
    return;
  }
  st.pageNum = Math.max(1, Math.min(num, st.totalPages));
  st.rendering = true;
  st.pdfDoc.getPage(st.pageNum).then((page) => {
    const viewport = page.getViewport({ scale: st.scale });
    st.canvas.height = viewport.height;
    st.canvas.width = viewport.width;
    return page.render({ canvasContext: st.ctx, viewport }).promise;
  }).then(() => {
    st.rendering = false;
    updatePdfControls(id);
    if (st.pendingPage !== null) {
      const next = st.pendingPage;
      st.pendingPage = null;
      queuePdfRender(id, next);
    }
  }).catch(() => {
    st.rendering = false;
    showPdfErrorById(id);
  });
}

function pdfPrev(id) {
  const st = PDF_VIEWERS.get(id);
  if (!st || st.pageNum <= 1) return;
  queuePdfRender(id, st.pageNum - 1);
}

function pdfNext(id) {
  const st = PDF_VIEWERS.get(id);
  if (!st || st.pageNum >= st.totalPages) return;
  queuePdfRender(id, st.pageNum + 1);
}

function pdfZoom(id, delta) {
  const st = PDF_VIEWERS.get(id);
  if (!st) return;
  st.scale = Math.max(0.7, Math.min(2.4, +(st.scale + delta).toFixed(2)));
  queuePdfRender(id, st.pageNum);
}

async function initPdfViewer(el) {
  if (!el || el.dataset.pdfReady === '1') return;
  const id = el.id;
  const url = el.dataset.pdfUrl;
  const canvas = document.getElementById(id + '-canvas');
  if (!id || !url || !canvas) return;

  if (!window.pdfjsLib) {
    showPdfErrorById(id);
    return;
  }

  window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
  const st = {
    id,
    canvas,
    ctx: canvas.getContext('2d'),
    pageNum: 1,
    pendingPage: null,
    rendering: false,
    totalPages: 0,
    scale: 1.2,
    pdfDoc: null,
  };
  PDF_VIEWERS.set(id, st);
  el.dataset.pdfReady = '1';

  try {
    const loadingTask = window.pdfjsLib.getDocument({ url });
    st.pdfDoc = await loadingTask.promise;
    st.totalPages = st.pdfDoc.numPages || 0;
    if (!st.totalPages) {
      showPdfErrorById(id);
      return;
    }
    updatePdfControls(id);
    queuePdfRender(id, 1);
  } catch {
    showPdfErrorById(id);
  }
}

function initPdfViewers() {
  document.querySelectorAll('[data-pdf-viewer="1"]').forEach((el) => {
    initPdfViewer(el);
  });
}

window.pdfPrev = pdfPrev;
window.pdfNext = pdfNext;
window.pdfZoom = pdfZoom;

async function initApp() {
  setupNavbar();
  // Check public access mode before rendering
  try {
    const modeRes = await fetch('/api/access-mode');
    if (modeRes.ok) {
      const modeData = await modeRes.json();
      window._siteUnderConstruction = modeData.siteUnderConstruction === true;
      window._siteUnderConstructionImage = modeData.constructionImage || '/public/site-under-construction.svg';
      if (!modeData.open) {
        // Restricted mode: check if user is authenticated via Google
        window._accessRestricted = true;
        // If auth.js hasn't loaded yet or user not logged in, auth.js will handle the gate
      }
    }
  } catch {}
  const initialPage = hydrateRouteFromHash();
  navigate(initialPage);
}
window.initApp = initApp;
