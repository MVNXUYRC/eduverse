(function initCPanelCore(global) {
  const {
    BASE, TK, UK, RE, RL, EAD, UNIDAD_REGIONAL, MAX_UPLOAD_BYTES,
    api, isActive, fmtD, eye, pstr, showModal, cm, bgc, toast, esc,
    properName, getOrgsForTipo, compactRichHtml, plainFromHtml, createCPanelState,
  } = global.CPanelShared;

  const state = createCPanelState();

  function getMe() { return state.getMe(); }
  function setMe(v) { state.setMe(v); }
  function getCfg() { return state.getCfg(); }
  function setCfg(v) { state.setCfg(v); }
  function getCp() { return state.getCareerPage(); }
  function setCp(v) { state.setCareerPage(v); }
  function getCf() { return state.getCareerFilters(); }
  function setCf(v) { state.setCareerFilters(v); }
  function getCareerDraft() { return state.getCareerDraft(); }
  function setCareerDraft(draft) { state.setCareerDraft(draft); }
  function getUserQuery() { return state.getUserQuery(); }
  function setUserQuery(v) { state.setUserQuery(v); }
  let dashSortBy = 'denominacion';
  let dashSortDir = 'asc';

  function normalizeSortToken(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  function sortDashHead(label, key) {
    const isCurrent = dashSortBy === key;
    const indicator = isCurrent ? (dashSortDir === 'asc' ? '▲' : '▼') : '';
    return `<button type="button" onclick="sortDashBy('${key}')" style="border:none;background:none;padding:0;margin:0;cursor:pointer;font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit;display:inline-flex;align-items:center;gap:5px">
      <span>${label}</span>
      <span style="font-size:.72rem;color:rgba(255,255,255,.65);min-width:10px">${indicator}</span>
    </button>`;
  }
  function getDashSortValue(career, key) {
    switch (key) {
      case 'tipo':
        return career.esCurso ? 'Curso' : (career.tipo || 'Carrera');
      case 'unidad_academica':
        return (career.unidadesAcademicas || [career.unidadAcademica]).join(', ');
      case 'estado':
        return career.proximamente ? 'Próximamente' : (isActive(career.activo) ? 'Disponible' : 'Finalizada');
      case 'inscripcion':
        return career.proximamente ? '--' : (isActive(career.inscripcionAbierta) ? 'Abierta' : 'Cerrada');
      case 'denominacion':
      default:
        return career.nombre || '';
    }
  }
  function sortDashBy(key) {
    if (dashSortBy === key) dashSortDir = dashSortDir === 'asc' ? 'desc' : 'asc';
    else {
      dashSortBy = key;
      dashSortDir = 'asc';
    }
    rdash();
  }

  async function doLogin() {
    const identifier = document.getElementById('le').value.trim();
    const password = document.getElementById('lp').value;
    const remember = document.getElementById('lr')?.checked;
    const err = document.getElementById('lerr');
    err.textContent = '';
    err.classList.remove('login-alert');
    if (!identifier) {
      err.textContent = 'Ingresá usuario o correo.';
      err.classList.add('login-alert');
      return;
    }
    const btn = document.getElementById('lbtn');
    btn.textContent = 'Ingresando…';
    btn.disabled = true;
    try {
      const d = await api('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
      if (remember) localStorage.setItem(RE, identifier);
      else localStorage.removeItem(RE);
      sessionStorage.setItem(TK, d.token);
      const md = await api('/auth/me');
      setMe(md.user);
      sessionStorage.setItem(UK, JSON.stringify(getMe()));
      await initApp();
    } catch (e) {
      err.textContent = e.message || 'Error';
      err.classList.add('login-alert');
      btn.textContent = 'Ingresar';
      btn.disabled = false;
    }
  }

  async function submitCP() {
    const c = document.getElementById('cp1').value;
    const n = document.getElementById('cp2').value;
    const c2 = document.getElementById('cp3').value;
    const err = document.getElementById('cpe');
    err.textContent = '';
    if (!c || !n || !c2) {
      err.textContent = 'Completá todos los campos.';
      return;
    }
    if (n !== c2) {
      err.textContent = 'Las contraseñas no coinciden.';
      return;
    }
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: c, newPassword: n }) });
      toast('Contraseña actualizada. Iniciá sesión nuevamente.', 'success');
      setTimeout(() => {
        sessionStorage.removeItem(TK);
        sessionStorage.removeItem(UK);
        setMe(null);
        showScr('s-login');
      }, 1600);
    } catch (e) {
      err.textContent = e.message;
    }
  }

  function openCPModal() {
    toggleUD(false);
    showModal(`<div class="mhdr"><h2 class="mtitle">Cambiar contraseña</h2><div class="mclose" onclick="cm()">✕</div></div>
      <div class="fg"><label class="fl">Contraseña actual</label><div class="pw"><input class="fi" type="password" id="mp1"/><button class="eye" onclick="eye('mp1',this)" tabindex="-1">👁</button></div></div>
      <div class="fg"><label class="fl">Nueva contraseña</label><div class="pw"><input class="fi" type="password" id="mp2" oninput="pstr(this.value,'ps2')"/><button class="eye" onclick="eye('mp2',this)" tabindex="-1">👁</button></div><div id="ps2" class="pstr"></div></div>
      <div class="fg"><label class="fl">Confirmar</label><div class="pw"><input class="fi" type="password" id="mp3"/><button class="eye" onclick="eye('mp3',this)" tabindex="-1">👁</button></div></div>
      <div class="mact"><button class="btn btn-ol" onclick="cm()">Cancelar</button><button class="btn btn-cy" onclick="doMCP()">Actualizar</button></div>`);
  }

  async function doMCP() {
    const c = document.getElementById('mp1')?.value;
    const n = document.getElementById('mp2')?.value;
    const c2 = document.getElementById('mp3')?.value;
    if (!c || !n || !c2) return toast('Completá todos los campos', 'error');
    if (n !== c2) return toast('Las contraseñas no coinciden', 'error');
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: c, newPassword: n }) });
      toast('Contraseña actualizada', 'success');
      cm();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function resetLoginUI() {
    const btn = document.getElementById('lbtn');
    if (btn) {
      btn.textContent = 'Ingresar';
      btn.disabled = false;
    }
    const remembered = localStorage.getItem(RE) || '';
    const em = document.getElementById('le');
    if (em) em.value = remembered;
    const rm = document.getElementById('lr');
    if (rm) rm.checked = !!remembered;
    const pw = document.getElementById('lp');
    if (pw) pw.value = '';
    const er = document.getElementById('lerr');
    if (er) {
      er.textContent = '';
      er.classList.remove('login-alert');
    }
  }

  function logout() {
    sessionStorage.removeItem(TK);
    sessionStorage.removeItem(UK);
    setMe(null);
    showScr('s-login');
    resetLoginUI();
  }

  function showScr(id) {
    ['s-login', 's-cp'].forEach((s) => {
      const el = document.getElementById(s);
      if (el) el.classList.toggle('on', s === id);
    });
    document.getElementById('app').style.display = 'none';
  }

  async function initApp() {
    try { setCfg(await api('/config')); } catch { setCfg({}); }
    showApp();
  }

  function showApp() {
    const me = getMe();
    const setDisplay = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.style.display = value;
    };
    const identityLine = document.getElementById('sbe');
    document.getElementById('s-login').classList.remove('on');
    document.getElementById('s-cp').classList.remove('on');
    document.getElementById('app').style.display = 'flex';
    document.getElementById('sbav').textContent = (me.nombre || 'U')[0].toUpperCase();
    document.getElementById('sbn').textContent = '';
    document.getElementById('sbn').style.display = 'none';
    if (me.rol === 'root') {
      identityLine.textContent = '';
      identityLine.style.display = 'none';
    } else {
      document.getElementById('sbn').textContent = me.email || '';
      document.getElementById('sbn').style.display = '';
      identityLine.textContent = '';
      identityLine.style.display = 'none';
    }
    document.getElementById('sbr').textContent = RL[me.rol] || me.rol;
    setDisplay('nav-usr', 'none');
    setDisplay('nav-nwl-parent', 'none');
    setDisplay('nav-nwl-children', 'none');
    setDisplay('nav-cfg', 'none');
    setDisplay('nav-log', 'none');
    setDisplay('nav-bkp', 'none');
    if (me.rol === 'root' || me.rol === 'institucional') setDisplay('nav-usr', 'flex');
    if (me.rol === 'root') {
      setDisplay('nav-nwl-parent', 'flex');
      setDisplay('nav-cfg', 'flex');
      setDisplay('nav-log', 'flex');
      setDisplay('nav-bkp', 'flex');
    }
    nav('dash');
  }

  function setNewsletterMenuExpanded(expanded) {
    const children = document.getElementById('nav-nwl-children');
    const caret = document.getElementById('nav-nwl-caret');
    if (!children || !caret) return;
    children.style.display = expanded ? 'block' : 'none';
    caret.classList.toggle('open', expanded);
  }

  function toggleUD(force) {
    const d = document.getElementById('udrop');
    const c = document.getElementById('sbcv');
    const s = force !== undefined ? force : d.classList.contains('hidden');
    d.classList.toggle('hidden', !s);
    c.classList.toggle('open', s);
  }

  async function rdash() {
    const me = getMe();
    const ct = document.getElementById('ct');
    try {
      const canViewUsers = me.rol === 'root' || me.rol === 'institucional';
      const [cd, ud, nd] = await Promise.all([
        api('/carreras?limit=200'),
        canViewUsers ? api('/usuarios') : Promise.resolve({ data: [] }),
        api('/novedades').catch(() => ({ data: [] })),
      ]);
      const rows = cd.data || [];
      const users = ud.data || [];
      const novedades = nd.data || [];
      const activeRows = rows.filter((c) => isActive(c.activo));
      const activeCarreras = activeRows.filter((c) => !c.esCurso).length;
      const activeCursos = activeRows.filter((c) => c.esCurso).length;
      const activeTotal = activeRows.length;
      const finalizadas = rows.length - activeTotal;
      const inscripcionesAbiertas = rows.filter((c) => isActive(c.inscripcionAbierta)).length;
      const proximamente = rows.filter((c) => c.proximamente === true).length;
      const totalRows = rows.length;
      const percentOfTotal = (value) => (totalRows > 0 ? (value * 100) / totalRows : 0);
      const chartSegments = [
        { label: 'Carreras activas', value: activeCarreras, pct: percentOfTotal(activeCarreras), cls: 'seg-carreras' },
        { label: 'Cursos activos', value: activeCursos, pct: percentOfTotal(activeCursos), cls: 'seg-cursos' },
        { label: 'Finalizadas', value: finalizadas, pct: percentOfTotal(finalizadas), cls: 'seg-finalizadas' },
      ];
      const visibleSegments = chartSegments.filter((segment) => segment.value > 0);
      const sortedRows = [...rows].sort((a, b) => {
        const av = normalizeSortToken(getDashSortValue(a, dashSortBy));
        const bv = normalizeSortToken(getDashSortValue(b, dashSortBy));
        if (av === bv) {
          const an = normalizeSortToken(a.nombre || '');
          const bn = normalizeSortToken(b.nombre || '');
          if (an === bn) return 0;
          return dashSortDir === 'asc' ? (an < bn ? -1 : 1) : (an > bn ? -1 : 1);
        }
        return dashSortDir === 'asc' ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
      });
      ct.innerHTML = `<div class="dash-alt">
        <div class="dash-stack">
          <div class="dash-group">
            <div class="dash-group-title">Propuestas Formativas</div>
            <div class="dash-group-grid dash-group-grid-primary">
              <div class="dash-count-card"><div class="k-label">Carreras</div><div class="k-value">${activeCarreras}</div></div>
              <div class="dash-count-card"><div class="k-label">Cursos</div><div class="k-value">${activeCursos}</div></div>
              <div class="dash-count-card dash-count-card-total"><div class="k-label">Total activas</div><div class="k-value">${activeTotal}</div></div>
              <div class="dash-count-card dash-count-card-finalizadas"><div class="k-label">Finalizadas</div><div class="k-value">${finalizadas}</div></div>
            </div>
          </div>
          <div class="dash-group">
            <div class="dash-group-grid dash-group-grid-secondary">
              <div class="dash-count-card"><div class="k-label">Inscripciones abiertas</div><div class="k-value">${inscripcionesAbiertas}</div></div>
              <div class="dash-count-card"><div class="k-label">Próximamente</div><div class="k-value">${proximamente}</div></div>
              <div class="dash-count-card"><div class="k-label">Base de Interesados</div><div class="k-value">${novedades.length}</div></div>
              ${canViewUsers ? `<div class="dash-count-card"><div class="k-label">Usuarios</div><div class="k-value">${users.length}</div></div>` : ''}
            </div>
          </div>
        </div>
        <div class="dash-group dash-group-visual">
          <div class="dash-group-title">Distribución De Propuestas</div>
          <div class="dash-chart-track">
            ${visibleSegments.length
    ? visibleSegments.map((segment) => `<div class="dash-chart-seg ${segment.cls}" style="width:${segment.pct.toFixed(2)}%"></div>`).join('')
    : '<div class="dash-chart-seg seg-empty" style="width:100%"></div>'}
          </div>
          <div class="dash-legend">
            ${chartSegments.map((segment) => `<div class="dash-legend-item">
              <span class="dash-legend-dot ${segment.cls}"></span>
              <span class="dash-legend-label">${segment.label}</span>
              <span class="dash-legend-value">${segment.value}</span>
              <span class="dash-legend-pct">${segment.pct.toFixed(1)}%</span>
            </div>`).join('')}
          </div>
          <div class="records-count">Total de propuestas: ${totalRows}</div>
        </div>
      </div>
      ${me.rol === 'unidades' ? `<div class="alr alr-info">Unidades asignadas: <strong>${(me.unidades || []).join(', ')}</strong></div>` : ''}
      ${rows.length === 0 ? `<div class="empty"><div class="ei">📭</div><p>Sin propuestas cargadas. Usá "Carreras y Cursos" para agregar la primera.</p></div>` : `
      <div class="tw" style="font-size:.85rem"><table style="width:100%;table-layout:fixed">
        <colgroup>
          <col style="width:39%">
          <col style="width:11%">
          <col style="width:30%">
          <col style="width:10%">
          <col style="width:10%">
        </colgroup>
        <thead><tr>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortDashHead('PROPUESTA FORMATIVA', 'denominacion')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortDashHead('TIPO', 'tipo')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortDashHead('UNIDAD ACADÉMICA', 'unidad_academica')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortDashHead('ESTADO', 'estado')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortDashHead('INSCRIPCIÓN', 'inscripcion')}</th>
        </tr></thead>
        <tbody>${sortedRows.slice(0, 10).map((c) => {
          const estadoLabel = c.proximamente ? 'Próximamente' : (isActive(c.activo) ? 'Disponible' : 'Finalizada');
          const inscripcionLabel = c.proximamente ? '--' : (isActive(c.inscripcionAbierta) ? 'Abierta' : 'Cerrada');
          return `<tr class="${c.proximamente ? 'row-proximamente' : (!isActive(c.activo) ? 'row-finalizada' : '')}">
          <td style="max-width:340px">${esc(c.nombre)}</td>
          <td style="padding-left:24px">${c.esCurso ? 'Curso' : esc(c.tipo || 'Carrera')}</td>
          <td style="padding-left:24px">${esc((c.unidadesAcademicas || [c.unidadAcademica]).join(', '))}</td>
          <td style="text-align:center">${estadoLabel}</td>
          <td style="text-align:center">${inscripcionLabel}</td>
        </tr>`;
        }).join('')}</tbody>
      </table></div>`}`;
    } catch (e) {
      ct.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>${e.message}</p></div>`;
    }
  }

  const careersModule = global.createCPanelCareers({
    BASE, TK, EAD, UNIDAD_REGIONAL, MAX_UPLOAD_BYTES,
    api, isActive, toast, esc, showModal, cm, properName, getOrgsForTipo, compactRichHtml, plainFromHtml,
    getMe, getCfg, getCp, setCp, getCf, setCf, getCareerDraft, setCareerDraft,
  });

  const usersModule = global.createCPanelUsers({
    BASE, TK, RL, api, toast, esc, showModal, cm, getMe, getCfg, getUserQuery, setUserQuery,
  });

  const configModule = global.createCPanelConfig({ api, toast, esc, showModal, cm, getMe });
  const logsModule = global.createCPanelLogs({ api, esc, fmtD, getMe });
  const backupModule = global.createCPanelBackup({ api, toast, getMe });
  const novedadesModule = typeof global.createCPanelNovedades === 'function'
    ? global.createCPanelNovedades({ api, esc, toast, fmtD, getMe })
    : { rnvd: async () => {} };
  const newsletterModule = typeof global.createCPanelNewsletter === 'function'
    ? global.createCPanelNewsletter({ api, esc, fmtD, toast, getMe })
    : { rnwl: async () => {} };

  function nav(page) {
    state.resetNavigationState();
    document.querySelectorAll('.ni').forEach((i) => i.classList.remove('active'));
    const isNewsletterPage = page === 'nwl' || page === 'nwl-subs' || page === 'nwl-sends' || page === 'nwl-data';
    if (isNewsletterPage) {
      document.getElementById('nav-nwl-parent')?.classList.add('active');
      if (page !== 'nwl') document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
      setNewsletterMenuExpanded(true);
    } else {
      document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
      setNewsletterMenuExpanded(false);
    }
    const titles = {
      dash: 'Dashboard',
      carr: 'Propuestas Formativas',
      nov: 'Base de Interesados',
      nwl: 'Newsletter',
      'nwl-subs': 'Suscriptores',
      'nwl-sends': 'Envíos',
      'nwl-data': 'Newsletter · Data Exchange',
      usr: 'Usuarios',
      cfg: 'Configuración del Sistema',
      log: 'Logs',
      bkp: 'Backup',
    };
    document.getElementById('tbt').textContent = titles[page] || page;
    document.getElementById('ct').innerHTML = '<div class="empty"><div class="ei">⏳</div></div>';
    if (page === 'dash') rdash();
    if (page === 'carr') careersModule.rcarr();
    if (page === 'nov') novedadesModule.rnvd();
    if (page === 'nwl') newsletterModule.rnwl('overview');
    if (page === 'nwl-subs') newsletterModule.rnwl('subscribers');
    if (page === 'nwl-sends') newsletterModule.rnwl('sends');
    if (page === 'nwl-data') newsletterModule.rnwl('data');
    if (page === 'usr') usersModule.rusr();
    if (page === 'cfg') configModule.rcfg();
    if (page === 'log') logsModule.rlog();
    if (page === 'bkp') backupModule.rbkp();
  }

  function bindInit() {
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.sb-foot')) toggleUD(false);
    });
    document.getElementById('le').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
    document.getElementById('lp').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
    resetLoginUI();
    const tk = sessionStorage.getItem(TK);
    const usr = sessionStorage.getItem(UK);
    if (tk && usr) {
      try {
        setMe(JSON.parse(usr));
        fetch(`${BASE}/auth/me`, { headers: { Authorization: `Bearer ${tk}` } })
          .then((r) => (r.ok ? r.json() : null))
          .then(async (d) => {
            if (d?.user) {
              setMe(d.user);
              sessionStorage.setItem(UK, JSON.stringify(getMe()));
              await initApp();
            } else logout();
          })
          .catch(() => logout());
      } catch {
        logout();
      }
    }
  }

  Object.assign(global, {
    eye, pstr, cm, bgc,
    doLogin, submitCP, openCPModal, doMCP, resetLoginUI, logout, showScr, initApp, showApp, toggleUD, nav, rdash, sortDashBy,
    ...careersModule,
    ...usersModule,
    ...configModule,
    ...logsModule,
    ...backupModule,
    ...novedadesModule,
    ...newsletterModule,
  });

  bindInit();
})(window);
