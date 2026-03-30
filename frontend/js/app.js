/**
 * EduVerse — Main Application
 * SPA with client-side routing, API integration, debounced search
 */

// === CONFIGURATION ===
const API_BASE = '/api';
const DEBOUNCE_DELAY = 350;

// === STATE ===
const state = {
  currentPage: 'home',
  currentCareer: null,
  filters: { q: '', tipo: [], area: [], modalidad: [] },
  results: [],
  meta: { total: 0, page: 1, totalPages: 1 },
  loading: false,
  sort: '',
  filtersVisible: true,
};

// === ICONS MAP ===
const AREA_ICONS = {
  'Tecnología': '💻',
  'Salud': '🏥',
  'Negocios': '📈',
  'Ingeniería': '⚙️',
  'Ciencias Sociales': '🌍',
};

// === UTILITY FUNCTIONS ===
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function slugify(text) {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

function formatDuration(dur) { return dur; }

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// === API ===
async function fetchFeatured() {
  const res = await fetch(`${API_BASE}/careers/featured`);
  if (!res.ok) throw new Error('Error al cargar datos');
  return res.json();
}

async function fetchFilters() {
  const res = await fetch(`${API_BASE}/careers/filters`);
  if (!res.ok) throw new Error('Error al cargar filtros');
  return res.json();
}

async function fetchCareers(params = {}) {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.tipo?.length) query.set('tipo', params.tipo.join(','));
  if (params.area?.length) query.set('area', params.area.join(','));
  if (params.modalidad?.length) query.set('modalidad', params.modalidad.join(','));
  if (params.page) query.set('page', params.page);
  if (params.sort) query.set('sort', params.sort);

  const res = await fetch(`${API_BASE}/careers?${query}`);
  if (!res.ok) throw new Error('Error al buscar carreras');
  return res.json();
}

async function fetchCareer(id) {
  const res = await fetch(`${API_BASE}/careers/${id}`);
  if (!res.ok) throw new Error('Carrera no encontrada');
  return res.json();
}

// === ROUTER ===
function navigate(page, data = null) {
  state.currentPage = page;
  state.currentCareer = data;

  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  if (page === 'home') document.getElementById('nav-home')?.classList.add('active');
  if (page === 'search') document.getElementById('nav-search')?.classList.add('active');

  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// === RENDER DISPATCHER ===
function render() {
  const app = document.getElementById('app');
  if (state.currentPage === 'home') renderHome(app);
  else if (state.currentPage === 'search') renderSearch(app);
  else if (state.currentPage === 'detail') renderDetail(app);
}

// === HOME PAGE ===
async function renderHome(app) {
  app.innerHTML = `
    ${renderHero()}
    <div id="featured-sections">
      ${renderSkeletonSections()}
    </div>
    ${renderFooter()}
  `;

  setupHeroSearch();

  try {
    const data = await fetchFeatured();
    document.getElementById('featured-sections').innerHTML = `
      ${renderPopularSection(data.popular)}
      ${renderAreasSection(data.areas)}
      ${renderNewSection(data.nuevas)}
    `;
    setupCardClicks();
    setupAreaClicks();
  } catch (err) {
    document.getElementById('featured-sections').innerHTML = `
      <div class="section"><div class="section-inner">
        <div class="state-container">
          <div class="state-icon">⚠️</div>
          <div class="state-title">Error al cargar</div>
          <div class="state-desc">No se pudo conectar al servidor. Asegurate de que el backend está corriendo.</div>
        </div>
      </div></div>
    `;
  }
}

function renderHero() {
  return `
    <section class="hero">
      <div class="hero-content">
        <div class="hero-badge">
          <span class="hero-badge-dot"></span>
          Plataforma Educativa del Futuro
        </div>
        <h1 class="hero-title">
          Tu carrera ideal<br>
          <span class="highlight">comienza aquí</span>
        </h1>
        <p class="hero-subtitle">
          Explorá más de 20 programas universitarios en modalidad online e híbrida. 
          Filtrá por área, tipo de formación y modalidad para encontrar lo que buscás.
        </p>
        <div class="search-wrapper">
          <div class="search-box" id="hero-search-box">
            <span class="search-icon">🔍</span>
            <input
              type="text"
              class="search-input"
              id="hero-search-input"
              placeholder="Buscá tu carrera, área o institución..."
              autocomplete="off"
            />
            <button class="search-btn" id="hero-search-btn">Buscar</button>
          </div>
          <div class="search-hints">
            <span>Buscado:</span>
            <span class="search-hint-tag" data-q="Ingeniería">Ingeniería</span>
            <span class="search-hint-tag" data-q="Salud">Salud</span>
            <span class="search-hint-tag" data-q="Data Science">Data Science</span>
            <span class="search-hint-tag" data-q="MBA">MBA</span>
          </div>
        </div>
        <div class="stats-bar">
          <div class="stat-item">
            <div class="stat-value">20<span>+</span></div>
            <div class="stat-label">Carreras</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">5</div>
            <div class="stat-label">Áreas</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">3</div>
            <div class="stat-label">Tipos de formación</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">100<span>%</span></div>
            <div class="stat-label">Online disponible</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderSkeletonSections() {
  const skeletonCards = Array(6).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-line" style="width:40%; height:14px"></div>
      <div class="skeleton skeleton-line" style="width:70%; height:18px; margin-top:4px"></div>
      <div class="skeleton skeleton-line" style="width:90%; height:10px; margin-top:8px"></div>
      <div class="skeleton skeleton-line" style="width:80%; height:10px"></div>
    </div>
  `).join('');

  return `
    <section class="section">
      <div class="section-inner">
        <div class="skeleton skeleton-line" style="width:180px; height:22px; margin-bottom:24px"></div>
        <div class="cards-grid">${skeletonCards}</div>
      </div>
    </section>
  `;
}

function renderPopularSection(careers) {
  return `
    <section class="section">
      <div class="section-inner">
        <div class="section-header">
          <div>
            <div class="section-label">⭐ Destacadas</div>
            <h2 class="section-title">Carreras más populares</h2>
          </div>
          <a class="section-link" onclick="navigate('search')">Ver todas →</a>
        </div>
        <div class="cards-grid animate-in">
          ${careers.map(c => renderCareerCard(c)).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderAreasSection(areas) {
  return `
    <section class="section" style="padding-top:0">
      <div class="section-inner">
        <div class="section-header">
          <div>
            <div class="section-label">🧭 Explorar</div>
            <h2 class="section-title">Áreas más buscadas</h2>
          </div>
        </div>
        <div class="areas-grid animate-in">
          ${areas.map(a => `
            <div class="area-card" data-area="${a.nombre}">
              <div class="area-icon">${AREA_ICONS[a.nombre] || '📚'}</div>
              <div class="area-info">
                <div class="area-name">${a.nombre}</div>
                <div class="area-count">${a.cantidad} carrera${a.cantidad > 1 ? 's' : ''}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

function renderNewSection(careers) {
  return `
    <section class="section" style="padding-top:0; padding-bottom:100px">
      <div class="section-inner">
        <div class="section-header">
          <div>
            <div class="section-label">✨ Recién llegadas</div>
            <h2 class="section-title">Nuevas ofertas educativas</h2>
          </div>
          <a class="section-link" onclick="navigate('search')">Ver todas →</a>
        </div>
        <div class="cards-grid animate-in">
          ${careers.map(c => renderCareerCard(c)).join('')}
        </div>
      </div>
    </section>
  `;
}

// === CAREER CARD ===
function renderCareerCard(c) {
  const tipoClass = c.tipo.toLowerCase().replace('é', 'e').replace('á', 'a');
  const isNew = c.nueva ? `<span class="badge badge-nueva">✨ Nuevo</span>` : '';
  return `
    <div class="career-card card-animate" data-id="${c.id}">
      <div class="card-top">
        <span class="card-emoji">${c.imagen}</span>
        <div class="card-badges">
          <span class="badge badge-tipo ${tipoClass}">${c.tipo}</span>
          <span class="badge badge-modalidad">${c.modalidad}</span>
          ${isNew}
        </div>
      </div>
      <h3 class="card-title">${c.nombre}</h3>
      <p class="card-desc">${c.descripcion}</p>
      <div class="card-meta">
        <div class="card-meta-item"><span class="icon">⏱</span> ${c.duracion}</div>
        <div class="card-meta-item"><span class="icon">🏫</span> ${c.institucion.split(' ').slice(0, 3).join(' ')}...</div>
      </div>
      <div class="card-footer">
        <span class="card-area">${AREA_ICONS[c.area] || ''} ${c.area}</span>
        <button class="btn-primary" onclick="openDetail(${c.id})">Ver más</button>
      </div>
    </div>
  `;
}

// === SEARCH PAGE ===
async function renderSearch(app) {
  app.innerHTML = `
    <div class="search-page">
      <div class="search-page-header">
        <div class="section-label">🔍 Explorador</div>
        <h1 class="search-page-title">Buscador de Carreras</h1>
        <p class="search-page-sub">Filtrá por área, tipo de formación, modalidad y más.</p>
        <div class="search-bar-full">
          <div class="search-box" id="main-search-box">
            <span class="search-icon">🔍</span>
            <input
              type="text"
              class="search-input"
              id="main-search-input"
              placeholder="Nombre, área, institución..."
              value="${state.filters.q}"
              autocomplete="off"
            />
          </div>
          <button class="filters-mobile-toggle" id="filters-toggle" style="display:none">
            ⚙️ Filtros
          </button>
        </div>
      </div>

      <div class="search-layout">
        <aside class="filters-panel" id="filters-panel">
          <div class="filters-header">
            <h3 class="filters-title">Filtros</h3>
            <span class="filters-clear" id="clear-filters">Limpiar todo</span>
          </div>
          <div id="filter-groups">
            <div class="state-container" style="min-height:80px;padding:20px">
              <div class="skeleton skeleton-line" style="width:100%; height:12px; margin-bottom:8px"></div>
              <div class="skeleton skeleton-line" style="width:80%; height:12px"></div>
            </div>
          </div>
        </aside>

        <main>
          <div id="active-filters-bar"></div>
          <div class="results-header">
            <p class="results-count" id="results-count">Cargando...</p>
            <div class="results-sort">
              <label>Ordenar por:</label>
              <select class="select-styled" id="sort-select">
                <option value="">Relevancia</option>
                <option value="nombre">Nombre A–Z</option>
                <option value="area">Área</option>
              </select>
            </div>
          </div>

          <div id="results-grid" class="cards-grid">
            ${renderSkeletonCards(6)}
          </div>
          <div id="pagination"></div>
        </main>
      </div>
    </div>
    ${renderFooter()}
  `;

  // Init filters and search
  try {
    const filterData = await fetchFilters();
    renderFilterGroups(filterData);
  } catch (e) {
    document.getElementById('filter-groups').innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;padding:8px">Error al cargar filtros</p>';
  }

  setupMainSearch();
  setupSortSelect();
  setupClearFilters();
  setupMobileFiltersToggle();
  await searchCareers();
}

function renderSkeletonCards(count) {
  return Array(count).fill(0).map(() => `
    <div class="skeleton-card">
      <div style="display:flex;gap:12px;margin-bottom:16px">
        <div class="skeleton" style="width:48px;height:48px;border-radius:8px"></div>
        <div style="flex:1">
          <div class="skeleton skeleton-line" style="width:60%;height:14px;margin-bottom:8px"></div>
          <div class="skeleton skeleton-line" style="width:40%;height:10px"></div>
        </div>
      </div>
      <div class="skeleton skeleton-line" style="width:85%;height:16px;margin-bottom:12px"></div>
      <div class="skeleton skeleton-line" style="width:100%;height:10px;margin-bottom:6px"></div>
      <div class="skeleton skeleton-line" style="width:90%;height:10px;margin-bottom:6px"></div>
      <div class="skeleton skeleton-line" style="width:70%;height:10px"></div>
    </div>
  `).join('');
}

function renderFilterGroups(data) {
  const { tipos, areas, modalidades } = data;

  const makeGroup = (label, key, options) => `
    <div class="filter-group">
      <div class="filter-label">${label}</div>
      <div class="filter-options">
        ${options.map(opt => `
          <label class="filter-option">
            <input type="checkbox" value="${opt}" data-filter="${key}"
              ${state.filters[key].includes(opt) ? 'checked' : ''}
            />
            <span class="filter-option-label">${opt}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('filter-groups').innerHTML = `
    ${makeGroup('🎓 Tipo de formación', 'tipo', tipos)}
    ${makeGroup('🧠 Área de conocimiento', 'area', areas)}
    ${makeGroup('🏫 Modalidad', 'modalidad', modalidades)}
  `;

  // Bind filter checkboxes
  document.querySelectorAll('[data-filter]').forEach(cb => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.filter;
      const val = cb.value;
      if (cb.checked) {
        if (!state.filters[key].includes(val)) state.filters[key].push(val);
      } else {
        state.filters[key] = state.filters[key].filter(v => v !== val);
      }
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
  ['tipo', 'area', 'modalidad'].forEach(key => {
    state.filters[key].forEach(val => {
      chips.push(`
        <span class="filter-chip" onclick="removeFilter('${key}','${val}')">
          ${val} <span class="filter-chip-remove">✕</span>
        </span>
      `);
    });
  });

  bar.innerHTML = chips.length ? `<div class="active-filters">${chips.join('')}</div>` : '';
}

function removeFilter(key, val) {
  state.filters[key] = state.filters[key].filter(v => v !== val);

  // Uncheck the checkbox
  document.querySelectorAll(`[data-filter="${key}"]`).forEach(cb => {
    if (cb.value === val) cb.checked = false;
  });

  renderActiveFilters();
  debouncedSearch();
}
window.removeFilter = removeFilter;

async function searchCareers() {
  state.loading = true;
  updateResultsLoading();

  try {
    const data = await fetchCareers({
      ...state.filters,
      page: state.meta.page,
      sort: state.sort,
    });

    state.results = data.data;
    state.meta = data.meta;
    renderResults();
  } catch (err) {
    document.getElementById('results-grid').innerHTML = `
      <div class="state-container" style="grid-column:1/-1">
        <div class="state-icon">⚠️</div>
        <div class="state-title">Error al buscar</div>
        <div class="state-desc">${err.message}</div>
      </div>
    `;
  } finally {
    state.loading = false;
  }
}

function updateResultsLoading() {
  const grid = document.getElementById('results-grid');
  const count = document.getElementById('results-count');
  if (grid) grid.innerHTML = renderSkeletonCards(6);
  if (count) count.innerHTML = 'Buscando...';
}

function renderResults() {
  const grid = document.getElementById('results-grid');
  const count = document.getElementById('results-count');
  const pagination = document.getElementById('pagination');

  if (!grid) return;

  if (state.results.length === 0) {
    grid.innerHTML = `
      <div class="state-container" style="grid-column:1/-1">
        <div class="state-icon">🔍</div>
        <div class="state-title">Sin resultados</div>
        <div class="state-desc">No encontramos carreras con esos criterios. Probá cambiando los filtros.</div>
      </div>
    `;
    if (count) count.innerHTML = '<strong>0</strong> carreras encontradas';
    if (pagination) pagination.innerHTML = '';
    return;
  }

  grid.innerHTML = state.results.map(c => renderCareerCard(c)).join('');
  setupCardClicks();

  if (count) {
    const { total, page, totalPages } = state.meta;
    count.innerHTML = `<strong>${total}</strong> carrera${total !== 1 ? 's' : ''} encontrada${total !== 1 ? 's' : ''} — Página ${page} de ${totalPages}`;
  }

  if (pagination) renderPagination(pagination);
}

function renderPagination(container) {
  const { page, totalPages } = state.meta;
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let pages = [];
  for (let i = 1; i <= totalPages; i++) {
    pages.push(`
      <button class="page-btn ${i === page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>
    `);
  }

  container.innerHTML = `
    <div class="pagination">
      <button class="page-btn" onclick="goToPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>←</button>
      ${pages.join('')}
      <button class="page-btn" onclick="goToPage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>→</button>
    </div>
  `;
}

function goToPage(p) {
  state.meta.page = p;
  searchCareers();
  document.querySelector('.search-page')?.scrollIntoView({ behavior: 'smooth' });
}
window.goToPage = goToPage;

// === SEARCH SETUP ===
const debouncedSearch = debounce(searchCareers, DEBOUNCE_DELAY);

function setupMainSearch() {
  const input = document.getElementById('main-search-input');
  if (!input) return;

  input.addEventListener('input', (e) => {
    state.filters.q = e.target.value;
    state.meta.page = 1;
    debouncedSearch();
  });

  input.focus();
}

function setupHeroSearch() {
  const input = document.getElementById('hero-search-input');
  const btn = document.getElementById('hero-search-btn');
  const hints = document.querySelectorAll('.search-hint-tag');

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') triggerHeroSearch(input.value);
    });
  }

  if (btn && input) {
    btn.addEventListener('click', () => triggerHeroSearch(input.value));
  }

  hints.forEach(h => {
    h.addEventListener('click', () => {
      const q = h.dataset.q;
      if (input) input.value = q;
      triggerHeroSearch(q);
    });
  });
}

function triggerHeroSearch(q) {
  state.filters = { q: q || '', tipo: [], area: [], modalidad: [] };
  state.meta.page = 1;
  navigate('search');
}

function setupSortSelect() {
  const sel = document.getElementById('sort-select');
  if (!sel) return;
  sel.value = state.sort;
  sel.addEventListener('change', (e) => {
    state.sort = e.target.value;
    state.meta.page = 1;
    searchCareers();
  });
}

function setupClearFilters() {
  const btn = document.getElementById('clear-filters');
  if (!btn) return;
  btn.addEventListener('click', () => {
    state.filters = { q: '', tipo: [], area: [], modalidad: [] };
    const input = document.getElementById('main-search-input');
    if (input) input.value = '';
    document.querySelectorAll('[data-filter]').forEach(cb => cb.checked = false);
    renderActiveFilters();
    state.meta.page = 1;
    searchCareers();
  });
}

function setupMobileFiltersToggle() {
  const toggle = document.getElementById('filters-toggle');
  const panel = document.getElementById('filters-panel');
  if (!toggle || !panel) return;

  const checkMobile = () => {
    if (window.innerWidth <= 1024) {
      toggle.style.display = 'flex';
      panel.classList.add('mobile-hidden');
    } else {
      toggle.style.display = 'none';
      panel.classList.remove('mobile-hidden');
    }
  };

  checkMobile();
  window.addEventListener('resize', checkMobile);

  toggle.addEventListener('click', () => {
    panel.classList.toggle('mobile-hidden');
  });
}

// === CARD CLICKS ===
function setupCardClicks() {
  document.querySelectorAll('.career-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-primary')) return;
      const id = parseInt(card.dataset.id);
      if (id) openDetail(id);
    });
  });
}

function setupAreaClicks() {
  document.querySelectorAll('.area-card').forEach(card => {
    card.addEventListener('click', () => {
      const area = card.dataset.area;
      state.filters = { q: '', tipo: [], area: [area], modalidad: [] };
      state.meta.page = 1;
      navigate('search');
    });
  });
}

async function openDetail(id) {
  navigate('detail');
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="detail-page">
      <div class="detail-hero" style="padding-top: calc(var(--nav-height) + 48px)">
        <div class="detail-inner">
          ${renderSkeletonCards(1)}
        </div>
      </div>
    </div>
    ${renderFooter()}
  `;

  try {
    const career = await fetchCareer(id);
    state.currentCareer = career;
    renderDetailPage(career, app);
  } catch (err) {
    app.querySelector('.detail-inner').innerHTML = `
      <div class="state-container">
        <div class="state-icon">⚠️</div>
        <div class="state-title">Error al cargar</div>
        <div class="state-desc">${err.message}</div>
      </div>
    `;
  }
}
window.openDetail = openDetail;

// === DETAIL PAGE ===
function renderDetailPage(c, app) {
  const tipoClass = c.tipo.toLowerCase().replace('é', 'e').replace('á', 'a');

  app.innerHTML = `
    <div class="detail-page">
      <div class="detail-hero">
        <div class="detail-inner">
          <div class="detail-breadcrumb">
            <a onclick="navigate('home')">Inicio</a>
            <span>›</span>
            <a onclick="navigate('search')">Carreras</a>
            <span>›</span>
            <span style="color:var(--text-primary)">${c.nombre}</span>
          </div>

          <span class="detail-emoji">${c.imagen}</span>

          <div class="detail-badges">
            <span class="badge badge-tipo ${tipoClass}">${c.tipo}</span>
            <span class="badge badge-modalidad">${c.modalidad}</span>
            ${c.nueva ? '<span class="badge badge-nueva">✨ Nueva oferta</span>' : ''}
          </div>

          <h1 class="detail-title">${c.nombre}</h1>
          <p class="detail-desc">${c.descripcion}</p>
        </div>
      </div>

      <div class="detail-meta-grid">
        <div class="detail-meta-card">
          <div class="detail-meta-label">⏱ Duración</div>
          <div class="detail-meta-value">${c.duracion}</div>
        </div>
        <div class="detail-meta-card">
          <div class="detail-meta-label">🏫 Modalidad</div>
          <div class="detail-meta-value">${c.modalidad}</div>
        </div>
        <div class="detail-meta-card">
          <div class="detail-meta-label">🎓 Tipo</div>
          <div class="detail-meta-value">${c.tipo}</div>
        </div>
        <div class="detail-meta-card">
          <div class="detail-meta-label">🧠 Área</div>
          <div class="detail-meta-value">${c.area}</div>
        </div>
      </div>

      <div class="detail-body animate-in">
        <div class="detail-section">
          <div class="detail-section-title">🏛️ Institución</div>
          <p style="color:var(--text-secondary); font-size:.95rem; line-height:1.7">${c.institucion}</p>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">📋 Plan de estudios</div>
          <div class="plan-list">
            ${c.planEstudios.map((item, i) => `
              <div class="plan-item">
                <span class="plan-num">${String(i + 1).padStart(2, '0')}</span>
                <span>${item}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">✅ Requisitos de admisión</div>
          <div class="req-list">
            ${c.requisitos.map(req => `
              <div class="req-item">
                <span class="req-dot"></span>
                <span>${req}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="cta-banner">
          <h3>¿Te interesa esta carrera?</h3>
          <p>Completá tu preinscripción y un asesor se pondrá en contacto con vos para guiarte en el proceso.</p>
          <a class="btn-large" href="${c.inscripcion}" target="_blank" onclick="showToast('Redirigiendo al formulario de inscripción...')">
            🎓 Quiero inscribirme
          </a>
        </div>
      </div>
    </div>
    ${renderFooter()}
  `;
}

// === FOOTER ===
function renderFooter() {
  return `
    <footer class="footer">
      <div class="footer-inner">
        <div class="footer-grid">
          <div class="footer-brand">
            <div class="nav-logo">
              <div class="nav-logo-mark">🎓</div>
              EduVerse
            </div>
            <p>La plataforma educativa del futuro. Encontrá tu carrera ideal y comenzá tu camino hacia el éxito profesional.</p>
          </div>
          <div class="footer-col">
            <h4>Explorar</h4>
            <ul>
              <li><a onclick="navigate('home')">Inicio</a></li>
              <li><a onclick="navigate('search')">Todas las carreras</a></li>
              <li><a onclick="triggerAreaSearch('Tecnología')">Tecnología</a></li>
              <li><a onclick="triggerAreaSearch('Salud')">Salud</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Formación</h4>
            <ul>
              <li><a onclick="triggerTipoSearch('Pregrado')">Pregrado</a></li>
              <li><a onclick="triggerTipoSearch('Grado')">Grado</a></li>
              <li><a onclick="triggerTipoSearch('Posgrado')">Posgrado</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>EduVerse</h4>
            <ul>
              <li><a>Sobre nosotros</a></li>
              <li><a>Instituciones</a></li>
              <li><a>Contacto</a></li>
              <li><a>Blog educativo</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <span class="footer-copy">© 2025 EduVerse. Todos los derechos reservados.</span>
          <span class="footer-copy">Construido con ❤️ para la educación.</span>
        </div>
      </div>
    </footer>
  `;
}

// Footer helpers
function triggerAreaSearch(area) {
  state.filters = { q: '', tipo: [], area: [area], modalidad: [] };
  state.meta.page = 1;
  navigate('search');
}
window.triggerAreaSearch = triggerAreaSearch;

function triggerTipoSearch(tipo) {
  state.filters = { q: '', tipo: [tipo], area: [], modalidad: [] };
  state.meta.page = 1;
  navigate('search');
}
window.triggerTipoSearch = triggerTipoSearch;

// === NAVBAR ===
function setupNavbar() {
  const navbar = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('nav-links');
  const overlay = document.getElementById('nav-overlay');

  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) navbar?.classList.add('scrolled');
    else navbar?.classList.remove('scrolled');
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

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
  setupNavbar();
  navigate('home');
});
