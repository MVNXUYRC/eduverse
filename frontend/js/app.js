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

// ── Estado global ─────────────────────────────────────────
const state = {
  page: 'home',
  filters: { q: '', tipo: [], subtipo: [], disciplina: [], modalidad: [], unidad: [], regional: [], esCurso: null },
  results: [], meta: { total: 0, page: 1, totalPages: 1 },
  sort: 'nombre',
  loading: false,
};

// ── Utilities ─────────────────────────────────────────────
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function showToast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3400);
}
window.showToast = showToast;

// ── API ───────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(API_BASE + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchFeatured()  { return apiFetch('/careers/featured'); }
async function fetchFilters()   { return apiFetch('/careers/filters'); }
async function fetchCareer(id)  { return apiFetch(`/careers/${id}`); }

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
  const navIdMap = { home: 'nav-home', search: 'nav-search', quienes: 'nav-quienes', contacto: 'nav-contacto' };
  const navId = navIdMap[page] || ('nav-' + page);
  const nl = document.getElementById(navId);
  if (nl) nl.classList.add('active');
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.navigate = navigate;

function render() {
  const app = document.getElementById('app');
  const pages = { home: renderHome, search: renderSearch, admin: renderAdmin };
  const placeholders = ['quienes', 'contacto'];
  if (pages[state.page]) pages[state.page](app);
  else if (placeholders.includes(state.page)) renderPlaceholder(app, state.page);
  else renderHome(app);
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
      const total = document.getElementById('stat-total');
      const fac   = document.getElementById('stat-fac');
      const reg   = document.getElementById('stat-reg');
      const virt  = document.getElementById('stat-virt-item');
      const facIt = document.getElementById('stat-fac-item');
      if (total) total.textContent = s.total || '0';
      if (fac)   fac.textContent   = s.facultades || '0';
      if (reg)   reg.textContent   = s.regionales || '0';
      if (facIt) facIt.style.display = s.facultades > 0 ? '' : 'none';
      if (virt)  virt.style.display  = s.tiene100Virtual ? '' : 'none';
    }
    // Sections: 0. Inscripción abierta 1. Cursos 2. Nuevas 3. Disciplinas
    document.getElementById('featured-sections').innerHTML =
      inscripcionSection(data.inscripcionAbierta) +
      cursosSection(data.cursos) +
      nuevasSection(data.nuevas) +
      disciplinasSection(data.disciplinas);
    setupCardClicks();
    setupDiscClicks();
    // Update search hints from top 5 disciplines
    const hintsBar = document.getElementById('hero-hints');
    if (hintsBar && data.disciplinas?.length) {
      const top5 = data.disciplinas.slice(0,5);
      hintsBar.innerHTML = '<span>Búsquedas frecuentes:</span>' +
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
      <p class="hero-subtitle">Explorá carreras de grado, pregrado, posgrado y cursos de la UNaM en modalidad virtual e híbrida.</p>
      <div class="search-wrapper">
        <div class="search-box" id="hero-search-box">
          <span class="search-icon">🔍</span>
          <input type="text" class="search-input" id="hero-search-input" placeholder="Buscar carrera, disciplina, palabras clave..." autocomplete="off" />
          <button class="search-btn" id="hero-search-btn">Buscar</button>
        </div>
        <div class="search-hints" id="hero-hints">
          <span>Búsquedas frecuentes:</span>
          <span class="search-hint-tag" data-q="Licenciatura">Licenciaturas</span>
          <span class="search-hint-tag" data-q="Maestría">Maestrías</span>
          <span class="search-hint-tag" data-q="Tecnicatura">Tecnicaturas</span>
          <span class="search-hint-tag" data-q="Doctorado">Doctorados</span>
          <span class="search-hint-tag" data-q="curso">Cursos</span>
        </div>
      </div>
      <div class="stats-bar" id="hero-stats-bar">
        <div class="stat-item"><div class="stat-value" id="stat-total">—</div><div class="stat-label">Propuestas</div></div>
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
      <div><div class="section-label" style="color:var(--unam-green)">Inscripción abierta</div><h2 class="section-title">Propuestas con inscripción abierta</h2></div>
      <a class="section-link" onclick="navigate('search')">Ver toda la oferta →</a>
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
      <div><div class="section-label">Incorporadas recientemente</div><h2 class="section-title">Nuevas propuestas académicas</h2></div>
      <a class="section-link" onclick="navigate('search')">Ver toda la oferta →</a>
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
  const tipoLabel = c.esCurso ? 'Curso' : (c.tipo || 'Carrera');
  const tipoClass = tipoLabel.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const nuevaBadge = c.nueva ? `<span class="badge badge-nueva">Nuevo</span>` : '';
  const cursoBadge = c.esCurso ? `<span class="badge badge-curso">Curso</span>` : '';
  // Handle both old boolean and new object format
  const _inscAbierta = c.inscripcionAbierta
    ? (typeof c.inscripcionAbierta==='object'
        ? (c.inscripcionAbierta.valor && (!c.inscripcionAbierta.fechaHasta || new Date(c.inscripcionAbierta.fechaHasta)>new Date()))
        : c.inscripcionAbierta)
    : false;
  const inscBadge = _inscAbierta ? `<span class="badge badge-nueva" style="background:rgba(58,170,53,.1);color:var(--unam-green)">Inscripción abierta</span>` : '';
  return `
  <div class="career-card card-animate" data-id="${c.id}">
    <div class="card-top">
      <div class="card-badges">
        <span class="badge badge-tipo ${tipoClass}">${tipoLabel}</span>
        ${c.subtipo ? `<span class="badge badge-tipo posgrado">${c.subtipo}</span>` : ''}
        <span class="badge badge-modalidad">${c.modalidad}</span>
        ${nuevaBadge}${cursoBadge}${inscBadge}
      </div>
    </div>
    <h3 class="card-title">${c.nombre}</h3>
    ${c.tags?.length ? `<div class="card-tags" style="display:flex;flex-wrap:nowrap;gap:5px;margin-bottom:8px;overflow:hidden">${c.tags.slice(0,3).map(t=>`<span style="font-size:.68rem;padding:2px 9px;background:rgba(0,163,224,.07);border:1px solid rgba(0,163,224,.15);border-radius:100px;color:var(--unam-cyan);white-space:nowrap;flex-shrink:0">${t}</span>`).join('')}${c.tags.length>3?`<span style="font-size:.68rem;color:var(--text-muted);flex-shrink:0">+${c.tags.length-3}</span>`:''}</div>` : ''}
    <p class="card-desc">${c.descripcion}</p>
    <div class="card-meta">
      ${c.duracion ? `<div class="card-meta-item">${c.duracion}</div>` : ''}
      <div class="card-meta-item">${(c.unidadesAcademicas||[c.unidadAcademica]).filter(Boolean).join(', ')}</div>
      ${c.regional ? `<div class="card-meta-item">${c.regional}</div>` : ''}
    </div>
    <div class="card-footer">
      <span class="card-disciplina">${c.disciplina||''}</span>
      <button class="btn-primary" onclick="openDetail(${c.id})">Ver más</button>
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
      <div class="section-label">🔍 Buscador</div>
      <h1 class="search-page-title">Carreras y Cursos</h1>
      <p class="search-page-sub">Filtrá por tipo, disciplina, modalidad, unidad académica y más.</p>
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
  state.filters.esCurso = val;
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
  bar.innerHTML = chips.length ? `<div class="active-filters">${chips.join('')}</div>` : '';
}

function removeFilter(key, val) {
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
  } finally { state.loading = false; }
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
    state.filters = { q: '', tipo: [], subtipo: [], disciplina: [], modalidad: [], unidad: [], regional: [], esCurso: null };
    const inp = document.getElementById('main-search-input');
    if (inp) inp.value = '';
    document.querySelectorAll('[data-filter]').forEach(cb => cb.checked = false);
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
  const tags = document.querySelectorAll('.search-hint-tag');

  const go = q => {
    state.filters = { q: q || '', tipo: [], subtipo: [], disciplina: [], modalidad: [], unidad: [], regional: [], esCurso: null };
    state.meta.page = 1;
    navigate('search');
  };

  btn?.addEventListener('click', () => go(inp?.value));
  inp?.addEventListener('keydown', e => { if (e.key === 'Enter') go(inp.value); });
  tags.forEach(t => t.addEventListener('click', () => { go(t.dataset.q); }));
}

function filterByCurso() {
  state.filters = { q: '', tipo: [], subtipo: [], disciplina: [], modalidad: [], unidad: [], regional: [], esCurso: true };
  state.meta.page = 1;
  navigate('search');
}
window.filterByCurso = filterByCurso;

// ── CARD CLICKS ───────────────────────────────────────────
function setupCardClicks() {
  document.querySelectorAll('.career-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.classList.contains('btn-primary')) return;
      const id = parseInt(card.dataset.id);
      if (id) openDetail(id);
    });
  });
}

function setupDiscClicks() {
  document.querySelectorAll('.disc-card').forEach(card => {
    card.addEventListener('click', () => {
      state.filters = { q: '', tipo: [], subtipo: [], disciplina: [card.dataset.disc], modalidad: [], unidad: [], regional: [], esCurso: null };
      state.meta.page = 1;
      navigate('search');
    });
  });
}

// ── DETAIL PAGE ───────────────────────────────────────────
async function openDetail(id) {
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
    return new Date(s.fechaHasta) > new Date();
  }
  const _activo      = evalState(c._activo !== undefined ? c._activo : c.activo);
  const _inscAbierta = evalState(c._inscripcionAbierta !== undefined ? c._inscripcionAbierta : c.inscripcionAbierta);
  const unidadesStr  = (c.unidadesAcademicas || [c.unidadAcademica]).filter(Boolean).join(', ');
  const tipoLabel    = c.esCurso ? 'Curso' : (c.tipo || 'Carrera');

  // ── Badge markup ──────────────────────────────────────
  const finalizadaBanner = !_activo
    ? '<div style="display:inline-flex;align-items:center;gap:8px;padding:7px 14px;background:rgba(143,163,177,.15);border:1px solid rgba(143,163,177,.3);border-radius:100px;margin-bottom:14px;font-size:.83rem;font-weight:600;color:var(--text-muted)">Propuesta finalizada</div>'
    : '';
  const inscBadge = _inscAbierta ? '<span class="badge badge-nueva" style="background:rgba(58,170,53,.1);color:#3AAA35">Inscripción abierta</span>' : '';
  const nuevaBadge = c.nueva ? '<span class="badge badge-nueva">Nuevo</span>' : '';
  const subtipoBadge = c.subtipo ? '<span class="badge" style="background:rgba(125,78,36,.1);color:#7D4E24;padding:3px 10px;border-radius:100px;font-size:.75rem;font-weight:600">' + c.subtipo + '</span>' : '';

  // ── Meta cards ────────────────────────────────────────
  const duracionCard   = c.duracion   ? '<div class="detail-meta-card"><div class="detail-meta-label">Duración</div><div class="detail-meta-value">' + c.duracion + '</div></div>' : '';
  const disciplinaCard = c.disciplina ? '<div class="detail-meta-card"><div class="detail-meta-label">Disciplina</div><div class="detail-meta-value">' + c.disciplina + '</div></div>' : '';
  const regionalCard   = c.regional   ? '<div class="detail-meta-card"><div class="detail-meta-label">Regional</div><div class="detail-meta-value">' + c.regional + '</div></div>' : '';

  // ── TAB 1: Descripción ────────────────────────────────
  let tab1 = '';
  tab1 += '<div class="detail-section" style="border:none;padding:0 0 24px">';
  tab1 += '<div style="font-size:1.02rem;color:var(--text-secondary);line-height:1.85">' + (c.descripcion || '') + '</div>';
  tab1 += '</div>';
  // Unidad académica
  tab1 += '<div class="detail-section"><div class="detail-section-title">Unidad académica</div>';
  tab1 += '<p style="color:var(--text-secondary);font-size:.95rem">' + unidadesStr + '</p></div>';
  // Contacto
  if (c.contacto || c.telefonoContacto) {
    tab1 += '<div class="detail-section"><div class="detail-section-title">Contacto</div>';
    if (c.contacto) tab1 += '<p style="font-size:.93rem;margin-bottom:4px"><a href="mailto:' + c.contacto + '" style="color:var(--unam-cyan);font-weight:600">' + c.contacto + '</a></p>';
    if (c.telefonoContacto) tab1 += '<p style="font-size:.9rem;color:var(--text-secondary)">' + c.telefonoContacto + '</p>';
    tab1 += '</div>';
  }
  // Tags
  if (c.tags?.length) {
    tab1 += '<div class="detail-section"><div class="detail-section-title">Palabras clave</div>';
    tab1 += '<div class="tags-list">' + c.tags.map(t => '<span class="tag">' + t + '</span>').join('') + '</div></div>';
  }

  // ── TAB 2: Requisitos ─────────────────────────────────
  let tab2 = '';
  if (!_activo) {
    tab2 += '<div class="detail-section"><p style="font-size:.95rem;color:var(--text-muted)">Esta propuesta ya no está activa. Los requisitos de admisión no están disponibles.</p></div>';
  } else if (c.requisitosTexto || c.requisitos?.length) {
    tab2 += '<div class="detail-section">';
    if (c.requisitosTexto) {
      tab2 += '<div style="font-size:.95rem;color:var(--text-secondary);line-height:1.75">' + c.requisitosTexto + '</div>';
    } else {
      tab2 += '<div class="req-list">' + (c.requisitos||[]).map(r => '<div class="req-item"><span class="req-dot"></span><span>' + r + '</span></div>').join('') + '</div>';
    }
    tab2 += '</div>';
  } else {
    tab2 += '<div class="detail-section"><p style="font-size:.95rem;color:var(--text-muted)">No se cargaron requisitos de admisión para esta propuesta.</p></div>';
  }
  // Disertantes (para cursos)
  if (c.esCurso && c.disertantes?.length) {
    tab2 += '<div class="detail-section"><div class="detail-section-title">Disertantes</div>';
    tab2 += '<div class="tags-list">' + c.disertantes.map(d => '<span class="tag">' + d + '</span>').join('') + '</div></div>';
  }

  // ── TAB 3: Plan / Programa ────────────────────────────
  let tab3 = '';
  if (c.esCurso) {
    if (c.programa) {
      tab3 += '<div class="detail-section"><div style="font-size:.97rem;color:var(--text-secondary);line-height:1.8">' + c.programa + '</div></div>';
    } else {
      tab3 += '<div class="detail-section"><p style="color:var(--text-muted);font-size:.95rem">No se cargó programa para este curso.</p></div>';
    }
    if (c.formularioInscripcion && _inscAbierta) {
      tab3 += '<div style="margin-top:16px"><a href="' + c.formularioInscripcion + '" target="_blank" style="display:inline-flex;align-items:center;gap:8px;padding:11px 22px;background:var(--unam-cyan);color:#fff;border-radius:8px;font-weight:600;font-size:.95rem;text-decoration:none">Formulario de inscripción</a></div>';
    }
  } else {
    // Carreras: plan de estudios con visor PDF
    if (c.planEstudiosPDF) {
      // PDF viewer: no download, no print
      const pdfId = 'pdf-viewer-' + c.id;
      const pdfBtn = 'togglePdfFull("' + pdfId + '")';
      tab3 += '<div style="width:100%;border:0.5px solid var(--border);border-radius:8px;margin-bottom:16px">';
      tab3 += '<div style="padding:8px 14px;background:var(--bg-surface);border-bottom:0.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">';
      tab3 += '<span style="font-size:.82rem;color:var(--text-muted);font-weight:600">Plan de estudios</span>';
      tab3 += '<button onclick="' + pdfBtn + '" style="font-size:.78rem;padding:3px 10px;background:rgba(0,163,224,.08);border:1px solid rgba(0,163,224,.2);border-radius:5px;color:var(--unam-cyan);cursor:pointer" id="' + pdfId + '-btn">⛶ Expandir</button>';
      tab3 += '</div>';
      tab3 += '<iframe id="' + pdfId + '" src="' + c.planEstudiosPDF + '" style="width:100%;height:520px;border:none;display:block;transition:height .3s ease" title="Plan de estudios" onload="checkPdfLoad(this)" onerror="showPdfError(this)"></iframe>';
      tab3 += '<div id="' + pdfId + '-err" style="display:none;padding:24px;text-align:center;color:var(--text-muted);font-size:.9rem">No se pudo cargar el PDF en el visor. <a href="' + c.planEstudiosPDF + '" target="_blank" style="color:var(--unam-cyan)">Descargar archivo</a></div>';
      tab3 += '</div>';
    }
    if (c.planEstudios?.length) {
      tab3 += '<div class="plan-list">' + c.planEstudios.map((item, i) =>
        '<div class="plan-item"><span class="plan-num">' + String(i+1).padStart(2,'0') + '</span><span>' + item + '</span></div>'
      ).join('') + '</div>';
    }
    if (!c.planEstudiosPDF && !c.planEstudios?.length) {
      tab3 += '<div class="detail-section"><p style="color:var(--text-muted);font-size:.95rem">No se cargó plan de estudios para esta carrera.</p></div>';
    }
  }

  // ── TAB 4: Resoluciones ───────────────────────────────
  let tab4 = '';
  if (c.documentos?.length) {
    tab4 += '<div style="display:flex;flex-direction:column;gap:12px">';
    c.documentos.forEach(d => {
      tab4 += '<div style="display:flex;align-items:flex-start;gap:16px;padding:16px 20px;background:#fff;border:1px solid var(--border-card);border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.04)">';
      tab4 += '<div style="width:40px;height:40px;background:rgba(125,78,36,.08);border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.2rem">📋</div>';
      tab4 += '<div style="flex:1">';
      tab4 += '<div style="font-weight:700;font-size:.92rem;margin-bottom:3px">' + d.tipo + (d.organismo ? ' — ' + d.organismo : '') + '</div>';
      if (d.numero || d.anio) tab4 += '<div style="font-size:.85rem;color:var(--text-muted);margin-bottom:6px">N° ' + [d.numero, d.anio].filter(Boolean).join(' / ') + '</div>';
      if (d.pdf) tab4 += '<a href="' + d.pdf + '" target="_blank" style="display:inline-flex;align-items:center;gap:5px;font-size:.83rem;color:var(--unam-cyan);font-weight:600;text-decoration:none">Ver documento PDF →</a>';
      tab4 += '</div></div>';
    });
    tab4 += '</div>';
  } else {
    tab4 += '<div class="detail-section"><p style="color:var(--text-muted);font-size:.95rem">No se cargaron documentos administrativos para esta propuesta.</p></div>';
  }

  // ── Tab dots (show only if content) ──────────────────
  const hasRequisitos = !!(c.requisitosTexto || c.requisitos?.length || (c.esCurso && c.disertantes?.length));
  const hasPlan = !!(c.esCurso ? c.programa : (c.planEstudios?.length || c.planEstudiosPDF));
  const hasDocs = !!(c.documentos?.length);
  const tab3Label = c.esCurso ? 'Programa' : 'Plan de estudios';
  const inactiveNote = !_activo ? '<div style="margin-top:28px;padding:18px 22px;background:rgba(143,163,177,.07);border:1px solid rgba(143,163,177,.2);border-radius:12px"><p style="font-size:.9rem;color:var(--text-muted);margin-bottom:10px">Esta propuesta ya no está activa. Para consultas podés contactarnos:</p><a href="mailto:ead@unam.edu.ar" style="color:var(--unam-cyan);font-weight:600;font-size:.93rem">ead@unam.edu.ar</a></div>' : '';

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
      <button class="detail-tab active" onclick="switchTab(0, this)">Descripción</button>
      <button class="detail-tab" onclick="switchTab(1, this)">Requisitos${hasRequisitos ? '' : ''}</button>
      <button class="detail-tab" onclick="switchTab(2, this)">${tab3Label}${hasPlan ? '' : ''}</button>
      <button class="detail-tab" onclick="switchTab(3, this)">Resoluciones${hasDocs ? ' <span class=\'detail-tab-dot\'>' + c.documentos.length + '</span>' : ''}</button>
    </div>

    <div id="detail-tab-0" class="detail-tab-panel active">${tab1}${inactiveNote}</div>
    <div id="detail-tab-1" class="detail-tab-panel">${tab2}</div>
    <div id="detail-tab-2" class="detail-tab-panel">${tab3}</div>
    <div id="detail-tab-3" class="detail-tab-panel">${tab4}</div>

  </div>
  ${footerHTML()}`;
}

function switchTab(idx, btn) {
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.detail-tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const panel = document.getElementById('detail-tab-' + idx);
  if (panel) panel.classList.add('active');
}


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
        <button class="btn-primary" onclick="openCareerModal(null)" style="padding:10px 22px">+ Nueva carrera</button>
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
          <input class="form-input" id="f-disciplina" value="${career?.disciplina || ''}" placeholder="Ej: Informática" />
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

// ── PLACEHOLDER PAGES ─────────────────────────────────────
const PLACEHOLDER_DATA = {
  quienes:  { icon: '', title: 'Quiénes somos', isContent: true },
  contacto: { icon: '✉️', title: 'Contacto', desc: 'Ponete en contacto con el equipo de Educación a Distancia de la UNaM.', isContact: true },
};

function renderPlaceholder(app, page) {
  const d = PLACEHOLDER_DATA[page] || { icon: '🚧', title: 'En construcción', desc: 'Esta sección estará disponible próximamente.' };

  if (d.isContent) {
    app.innerHTML = `
    <div class="detail-page" style="padding-top:calc(var(--nav-height) + 40px)">
      <div style="max-width:900px;margin:0 auto;padding:0 clamp(16px,4vw,48px) 60px">
        <h1 style="font-size:1.6rem;font-weight:800;margin-bottom:28px;color:var(--text-primary)">${d.title}</h1>
        <div style="max-width:820px;margin:0 auto;font-size:1rem;color:var(--text-secondary);line-height:1.85">

  <p style="margin-bottom:1.4rem">El <strong style="color:var(--text-primary)">Sistema Institucional de Educación a Distancia (SIED)</strong> es la estructura estratégica de la Universidad Nacional de Misiones (UNaM) dedicada a la gestión, regulación y fortalecimiento de las propuestas educativas mediadas por tecnologías digitales.</p>

  <p style="margin-bottom:2rem">Nuestra misión es democratizar el acceso a la educación superior de calidad, promoviendo la inclusión y la construcción colectiva de saberes en un territorio de fronteras múltiples.</p>

  <h2 style="font-size:1.15rem;font-weight:700;color:var(--text-primary);margin-bottom:1rem;padding-bottom:8px;border-bottom:2px solid var(--unam-cyan)">Pilares Institucionales</h2>

  <div style="display:flex;flex-direction:column;gap:1rem;margin-bottom:2rem">
    <div style="padding:16px 20px;background:rgba(0,163,224,.04);border-left:3px solid var(--unam-cyan);border-radius:0 8px 8px 0">
      <strong style="color:var(--text-primary)">Marco Normativo</strong><br>
      Operamos bajo el Nuevo Marco Normativo del SIED, aprobado por Resolución Rectoral (ad referendum del Consejo Superior) en 2025. Nos alineamos a los estándares nacionales establecidos por la Resolución ME Nº 2599/2023 y las recomendaciones de la CONEAU.
    </div>
    <div style="padding:16px 20px;background:rgba(0,163,224,.04);border-left:3px solid var(--unam-cyan);border-radius:0 8px 8px 0">
      <strong style="color:var(--text-primary)">Estructura de Gestión</strong><br>
      Adoptamos un modelo mixto que articula una coordinación central dependiente de la Secretaría General Académica con Unidades de Educación a Distancia (UEaD) en cada Facultad y Escuela.
    </div>
    <div style="padding:16px 20px;background:rgba(0,163,224,.04);border-left:3px solid var(--unam-cyan);border-radius:0 8px 8px 0">
      <strong style="color:var(--text-primary)">Trayectoria y Consolidación</strong><br>
      Capitalizamos experiencias de virtualización iniciadas en la década de los 90. Entre 2020 y 2025, hemos consolidado una oferta diversa que incluye carreras de pregrado, grado, posgrado y cursos de extensión 100% a distancia o en modalidades combinadas.
    </div>
  </div>

  <h2 style="font-size:1.15rem;font-weight:700;color:var(--text-primary);margin-bottom:1rem;padding-bottom:8px;border-bottom:2px solid var(--unam-cyan)">Compromiso con la Calidad</h2>
  <p style="margin-bottom:1rem">El SIED garantiza la excelencia académica mediante:</p>

  <div style="display:flex;flex-direction:column;gap:1rem">
    <div style="padding:16px 20px;background:rgba(58,170,53,.04);border-left:3px solid var(--unam-green);border-radius:0 8px 8px 0">
      <strong style="color:var(--text-primary)">Ecosistema Tecnológico</strong><br>
      Contamos con una infraestructura propia alojada en el Data Center de la UNaM, que asegura la operatividad de nuestras plataformas Moodle y la integración con sistemas como SIU-Guaraní.
    </div>
    <div style="padding:16px 20px;background:rgba(58,170,53,.04);border-left:3px solid var(--unam-green);border-radius:0 8px 8px 0">
      <strong style="color:var(--text-primary)">Acompañamiento Pedagógico</strong><br>
      Equipos interdisciplinarios trabajan en el diseño de materiales didácticos, sistemas de tutorías y procesos de evaluación continua para asegurar trayectorias formativas significativas.
    </div>
    <div style="padding:16px 20px;background:rgba(58,170,53,.04);border-left:3px solid var(--unam-green);border-radius:0 8px 8px 0">
      <strong style="color:var(--text-primary)">Innovación Permanente</strong><br>
      Promovemos la investigación y la alfabetización digital en toda la comunidad universitaria, alineados con el Programa de Desarrollo Institucional 2018-2026.
    </div>
  </div>

</div>
      </div>
    </div>
    ${footerHTML()}`;
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
          <li><a onclick="navigate('search')">Pregrado</a></li>
          <li><a onclick="navigate('search')">Grado</a></li>
          <li><a onclick="navigate('search')">Posgrado</a></li>
        </ul></div>
        <div class="footer-col"><h4>Institucional</h4><ul>
          <li><a href="https://unam.edu.ar" target="_blank">Sitio Oficial</a></li>
          <li><a href="https://unam.edu.ar/index.php/institucional/unidades-academicas" target="_blank">Unidades Académicas</a></li>
          <li><a href="https://unam.edu.ar" target="_blank">Red Solidaria de Formación</a></li>
        </ul></div>
        <div class="footer-col"><h4>Acceso</h4><ul>
          <li><a href="https://ead.unam.edu.ar/" target="_blank">Campus Virtual</a></li>
          <li><a href="mailto:ead@unam.edu.ar">ead@unam.edu.ar</a></li>
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
  const iframe = document.getElementById(id);
  const btn = document.getElementById(id + '-btn');
  if (!iframe) return;
  const isExpanded = iframe.getAttribute('data-expanded') === '1';
  if (isExpanded) {
    iframe.style.height = '520px';
    iframe.style.position = '';
    iframe.style.top = '';
    iframe.style.left = '';
    iframe.style.width = '';
    iframe.style.zIndex = '';
    iframe.style.background = '';
    iframe.removeAttribute('data-expanded');
    if (btn) btn.textContent = '⛶ Expandir';
    document.body.style.overflow = '';
  } else {
    iframe.style.height = 'calc(100vh - 80px)';
    iframe.style.position = 'fixed';
    iframe.style.top = '80px';
    iframe.style.left = '0';
    iframe.style.width = '100%';
    iframe.style.zIndex = '8000';
    iframe.style.background = '#fff';
    iframe.setAttribute('data-expanded','1');
    if (btn) {
      btn.textContent = '✕ Cerrar';
      btn.style.position = 'fixed';
      btn.style.top = '88px';
      btn.style.right = '20px';
      btn.style.zIndex = '8001';
    }
    document.body.style.overflow = 'hidden';
  }
}
window.togglePdfFull = togglePdfFull;

function checkPdfLoad(iframe) {
  // If the iframe loads HTML (home page fallback), show error message
  try {
    const ct = iframe.contentDocument?.contentType || '';
    if (ct && !ct.includes('pdf') && !ct.includes('octet')) {
      showPdfError(iframe);
    }
  } catch {}
}
function showPdfError(iframe) {
  if (!iframe) return;
  iframe.style.display = 'none';
  const errId = iframe.id + '-err';
  const err = document.getElementById(errId);
  if (err) err.style.display = '';
}
window.checkPdfLoad = checkPdfLoad;
window.showPdfError = showPdfError;

async function initApp() {
  setupNavbar();
  // Check public access mode before rendering
  try {
    const modeRes = await fetch('/api/access-mode');
    if (modeRes.ok) {
      const modeData = await modeRes.json();
      if (!modeData.open) {
        // Restricted mode: check if user is authenticated via Google
        window._accessRestricted = true;
        // If auth.js hasn't loaded yet or user not logged in, auth.js will handle the gate
      }
    }
  } catch {}
  navigate('home');
}
window.initApp = initApp;
