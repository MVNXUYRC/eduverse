(function initCPanelNewsletter(global) {
  function createCPanelNewsletter(deps) {
    const { api, esc, fmtD, toast, getMe } = deps;

    let cache = {
      data: [],
      summary: {},
      digest: {},
      dispatchLog: [],
      logsSummary: {},
      unavailable: false,
    };

    let filters = { q: '', status: '' };
    let page = 1;
    let pageSize = '10';
    let sortBy = 'fechaAlta';
    let sortDir = 'desc';

    let logFilters = { q: '', type: '', status: '' };
    let logPage = 1;
    let logPageSize = '10';
    let logSortBy = 'runAt';
    let logSortDir = 'desc';
    let activeView = 'overview';

    async function fetchViaCpanel(path, opts = {}) {
      const token = sessionStorage.getItem('unam_atk');
      const method = (opts.method || 'GET').toUpperCase();
      let url = `/cpanel/api${path}`;
      if (method === 'GET') url += (url.includes('?') ? '&' : '?') + `_ts=${Date.now()}`;
      const res = await fetch(url, {
        cache: 'no-store',
        method,
        headers: {
          ...(opts.isFormData ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(opts.headers || {}),
        },
        ...(opts.body ? { body: opts.body } : {}),
      });
      const raw = await res.text();
      let data = {};
      if (raw) {
        try { data = JSON.parse(raw); } catch { data = {}; }
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    }

    async function callApi(path, opts = {}) {
      try {
        return await api(path, opts);
      } catch (e) {
        const msg = String(e?.message || '').toLowerCase();
        if (!msg.includes('endpoint no encontrado') && !msg.includes('not found')) throw e;
        return fetchViaCpanel(path, opts);
      }
    }

    function toBase64Bytes(base64) {
      const raw = atob(base64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
      return bytes;
    }

    function downloadBase64File(base64, filename, mimeType) {
      const bytes = toBase64Bytes(base64);
      const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `newsletter-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    function sortHead(label, key) {
      const isCurrent = sortBy === key;
      const indicator = isCurrent ? (sortDir === 'asc' ? '▲' : '▼') : '';
      return `<button type="button" onclick="sortNewsletterBy('${key}')" style="border:none;background:none;padding:0;margin:0;cursor:pointer;font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit;display:inline-flex;align-items:center;gap:5px">
        <span>${label}</span>
        <span style="font-size:.72rem;color:rgba(255,255,255,.65);min-width:10px">${indicator}</span>
      </button>`;
    }

    function sortLogHead(label, key) {
      const isCurrent = logSortBy === key;
      const indicator = isCurrent ? (logSortDir === 'asc' ? '▲' : '▼') : '';
      return `<button type="button" onclick="sortNewsletterLogBy('${key}')" style="border:none;background:none;padding:0;margin:0;cursor:pointer;font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit;display:inline-flex;align-items:center;gap:5px">
        <span>${label}</span>
        <span style="font-size:.72rem;color:rgba(255,255,255,.65);min-width:10px">${indicator}</span>
      </button>`;
    }

    function dateValue(value) {
      const ts = Date.parse(value || '');
      return Number.isFinite(ts) ? ts : 0;
    }

    function filteredRows() {
      let rows = cache.data || [];
      const q = String(filters.q || '').trim().toLowerCase();
      if (q) rows = rows.filter((r) => String(r.email || '').toLowerCase().includes(q) || String(r.source || '').toLowerCase().includes(q));
      if (filters.status === 'active') rows = rows.filter((r) => r.activo);
      if (filters.status === 'inactive') rows = rows.filter((r) => !r.activo);

      const boolValue = (value) => (value ? 1 : 0);
      const stringValue = (value) => String(value || '').toLocaleLowerCase('es-AR');
      return [...rows].sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'email') cmp = stringValue(a.email).localeCompare(stringValue(b.email), 'es');
        else if (sortBy === 'origen') cmp = stringValue(a.source || 'sitio').localeCompare(stringValue(b.source || 'sitio'), 'es');
        else if (sortBy === 'estado') cmp = boolValue(a.activo) - boolValue(b.activo);
        else if (sortBy === 'fechaAlta') cmp = dateValue(a.fechaAlta || a.actualizadoEn) - dateValue(b.fechaAlta || b.actualizadoEn);
        else if (sortBy === 'ultimoEnvio') cmp = dateValue(a.ultimoEnvio) - dateValue(b.ultimoEnvio);
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    function filteredLogRows() {
      let rows = cache.dispatchLog || [];
      const q = String(logFilters.q || '').trim().toLowerCase();
      if (q) {
        rows = rows.filter((r) => {
          const detail = String(r.message || '').toLowerCase();
          const status = String(r.status || '').toLowerCase();
          const type = String(r.dispatchType || '').toLowerCase();
          return detail.includes(q) || status.includes(q) || type.includes(q);
        });
      }
      if (logFilters.type) rows = rows.filter((r) => String(r.dispatchType || '') === logFilters.type);
      if (logFilters.status) rows = rows.filter((r) => String(r.status || '').toLowerCase().includes(logFilters.status));

      const stringValue = (value) => String(value || '').toLocaleLowerCase('es-AR');
      const numValue = (value) => Number(value || 0);
      return [...rows].sort((a, b) => {
        let cmp = 0;
        if (logSortBy === 'runAt') cmp = dateValue(a.runAt) - dateValue(b.runAt);
        else if (logSortBy === 'dispatchType') cmp = stringValue(a.dispatchType).localeCompare(stringValue(b.dispatchType), 'es');
        else if (logSortBy === 'status') cmp = stringValue(a.status).localeCompare(stringValue(b.status), 'es');
        else if (logSortBy === 'recipientsTotal') cmp = numValue(a.recipientsTotal) - numValue(b.recipientsTotal);
        else if (logSortBy === 'sentCount') cmp = numValue(a.sentCount) - numValue(b.sentCount);
        else if (logSortBy === 'failCount') cmp = numValue(a.failCount) - numValue(b.failCount);
        else if (logSortBy === 'diffTotal') cmp = numValue(a.diffTotal) - numValue(b.diffTotal);
        return logSortDir === 'asc' ? cmp : -cmp;
      });
    }

    function pagedRows(rows, currentPage, currentPageSize) {
      if (currentPageSize === 'all') return rows;
      const size = Number(currentPageSize || 10) || 10;
      const start = (currentPage - 1) * size;
      return rows.slice(start, start + size);
    }

    function renderPagination(totalRows, currentPage, currentPageSize, handlerName) {
      if (currentPageSize === 'all') return '';
      const size = Number(currentPageSize || 10) || 10;
      const totalPages = Math.max(1, Math.ceil(totalRows / size));
      const safePage = Math.min(Math.max(1, currentPage), totalPages);
      const mk = (p, label = p, active = false, disabled = false) => `<button class="pb ${active ? 'active' : ''}" ${disabled ? 'disabled' : ''} onclick="${handlerName}(${p})">${label}</button>`;
      const buttons = [];
      buttons.push(mk(Math.max(1, safePage - 1), '‹', false, safePage <= 1));
      for (let p = 1; p <= totalPages; p += 1) buttons.push(mk(p, p, p === safePage, false));
      buttons.push(mk(Math.min(totalPages, safePage + 1), '›', false, safePage >= totalPages));
      return `<div class="pag">${buttons.join('')}</div>`;
    }

    function dispatchTypeBadge(value) {
      if (value === 'manual') return '<span class="bx bcy">Manual</span>';
      return '<span class="bx bgy">Automático</span>';
    }

    function statusBadge(value) {
      const status = String(value || '').toLowerCase();
      if (status.includes('error')) return `<span class="bx brd">${esc(value || 'error')}</span>`;
      if (status.includes('parcial')) return `<span class="bx bor">${esc(value || 'parcial')}</span>`;
      if (status.includes('enviado')) return `<span class="bx bgr">${esc(value || 'enviado')}</span>`;
      if (status.includes('sin-')) return `<span class="bx bgy">${esc(value || 'sin datos')}</span>`;
      return `<span class="bx bbr">${esc(value || 'estado')}</span>`;
    }

    function renderTable() {
      const rows = filteredRows();
      const visible = pagedRows(rows, page, pageSize);
      const total = rows.length;
      const recordsLabel = `Se encontraron ${total} suscriptor${total === 1 ? '' : 'es'}.`;
      const footer = `<div class="records-count">${recordsLabel}</div>`;

      if (!visible.length) {
        return `<div class="empty"><div class="ei">📭</div><p>Sin suscriptores para los filtros seleccionados.</p></div>${footer}`;
      }

      return `<div class="tw" style="font-size:.85rem"><table style="width:100%;table-layout:fixed">
        <colgroup>
          <col style="width:31%">
          <col style="width:14%">
          <col style="width:12%">
          <col style="width:17%">
          <col style="width:14%">
          <col style="width:12%">
        </colgroup>
        <thead><tr>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('CORREO ELECTRÓNICO', 'email')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('ORIGEN', 'origen')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('ESTADO', 'estado')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('FECHA ALTA', 'fechaAlta')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('ÚLTIMO ENVÍO', 'ultimoEnvio')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">ACCIONES</th>
        </tr></thead>
        <tbody>${visible.map((r) => `<tr class="${r.activo ? '' : 'row-finalizada'}">
          <td style="padding-left:24px">${esc(r.email)}</td>
          <td style="text-align:center">${esc(r.source || 'sitio')}</td>
          <td style="text-align:center">${r.activo ? '<span class="bx bgr">Activo</span>' : '<span class="bx bgy">Inactivo</span>'}</td>
          <td style="text-align:center">${esc(fmtD(r.fechaAlta || r.actualizadoEn))}</td>
          <td style="text-align:center">${r.ultimoEnvio ? esc(fmtD(r.ultimoEnvio)) : '—'}</td>
          <td style="text-align:center">
            <div class="acts" style="gap:4px;justify-content:center">
              <button title="${r.activo ? 'Inactivar' : 'Activar'}" class="btn btn-sm ${r.activo ? 'btn-rd' : 'btn-ge'}" style="padding:5px 8px" onclick="toggleNewsletterSubscription(${Number(r.id)}, ${r.activo ? 'false' : 'true'})">${r.activo ? '⛔' : '✅'}</button>
              <button title="Eliminar" class="btn btn-rd btn-sm" style="padding:5px 8px" onclick="deleteNewsletterSubscription(${Number(r.id)}, '${encodeURIComponent(r.email || '')}')">🗑️</button>
            </div>
          </td>
        </tr>`).join('')}</tbody>
      </table></div>${footer}${renderPagination(total, page, pageSize, 'setNewsletterPage')}`;
    }

    function renderLogTable() {
      const rows = filteredLogRows();
      const visible = pagedRows(rows, logPage, logPageSize);
      const total = rows.length;
      const recordsLabel = `Se encontraron ${total} registro${total === 1 ? '' : 's'} de envío.`;
      const footer = `<div class="records-count">${recordsLabel}</div>`;

      if (!visible.length) {
        return `<div class="empty"><div class="ei">🧾</div><p>Sin registros de envíos para los filtros seleccionados.</p></div>${footer}`;
      }

      return `<div class="tw" style="font-size:.85rem"><table style="width:100%;table-layout:fixed">
        <colgroup>
          <col style="width:16%">
          <col style="width:10%">
          <col style="width:16%">
          <col style="width:10%">
          <col style="width:10%">
          <col style="width:10%">
          <col style="width:8%">
          <col style="width:20%">
        </colgroup>
        <thead><tr>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortLogHead('FECHA/HORA', 'runAt')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortLogHead('TIPO', 'dispatchType')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortLogHead('ESTADO', 'status')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortLogHead('DEST.', 'recipientsTotal')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortLogHead('ENVIADOS', 'sentCount')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortLogHead('FALLIDOS', 'failCount')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortLogHead('DIFF', 'diffTotal')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">DETALLE</th>
        </tr></thead>
        <tbody>${visible.map((r) => `<tr>
          <td style="text-align:center">${esc(fmtD(r.runAt))}${r.runAt ? `<div style="font-size:.72rem;color:var(--mt);margin-top:2px">${esc(new Date(r.runAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }))}</div>` : ''}</td>
          <td style="text-align:center">${dispatchTypeBadge(r.dispatchType)}</td>
          <td style="text-align:center">${statusBadge(r.status)}</td>
          <td style="text-align:center">${Number(r.recipientsTotal || 0)}</td>
          <td style="text-align:center">${Number(r.sentCount || 0)}</td>
          <td style="text-align:center">${Number(r.failCount || 0)}</td>
          <td style="text-align:center">${Number(r.diffTotal || 0)}</td>
          <td style="text-align:left;font-size:.8rem;line-height:1.4">${esc(String(r.message || '').slice(0, 180) || '—')}</td>
        </tr>`).join('')}</tbody>
      </table></div>${footer}${renderPagination(total, logPage, logPageSize, 'setNewsletterLogPage')}`;
    }

    function rerenderContactsTable() {
      const wrap = document.getElementById('nwl-table-wrap');
      if (wrap) wrap.innerHTML = renderTable();
    }

    function rerenderLogsTable() {
      const wrap = document.getElementById('nwl-log-table-wrap');
      if (wrap) wrap.innerHTML = renderLogTable();
    }

    async function loadData() {
      const q = new URLSearchParams();
      if (filters.q) q.set('q', filters.q);
      if (filters.status) q.set('status', filters.status);
      const [subs, logs] = await Promise.all([
        callApi(`/newsletter/subscriptions?${q.toString()}`),
        callApi('/newsletter/logs').catch(() => ({ data: [] })),
      ]);

      return {
        data: Array.isArray(subs?.data) ? subs.data : [],
        summary: subs?.summary || {},
        digest: subs?.digest || {},
        dispatchLog: Array.isArray(logs?.data) && logs.data.length ? logs.data : (Array.isArray(subs?.dispatchLog) ? subs.dispatchLog : []),
        logsSummary: logs?.summary || {},
        unavailable: false,
      };
    }

    function renderSummaryCards(summary, logsSummary) {
      return `<div class="stats" style="margin-bottom:14px">
        <div class="sc"><div class="sv">${Number(summary.total || 0)}</div><div class="sl">Suscriptores</div></div>
        <div class="sc"><div class="sv">${Number(summary.active || 0)}</div><div class="sl">Activos</div></div>
        <div class="sc"><div class="sv">${Number(summary.inactive || 0)}</div><div class="sl">Inactivos</div></div>
        <div class="sc"><div class="sv">${Number(logsSummary.total || (cache.dispatchLog || []).length || 0)}</div><div class="sl">Envíos registrados</div></div>
      </div>`;
    }

    function renderSubscribersSection(me) {
      return `
        <div class="tb">
          <div class="tr2" style="width:100%;justify-content:space-between;gap:10px">
            <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:260px;max-width:560px">
              <div class="sb2" style="flex:1">🔍 <input type="text" id="nwl-search" placeholder="Buscar por correo u origen..." value="${esc(filters.q || '')}"/></div>
              <select class="fsel" id="nwl-status">
                <option value="">Todos</option>
                <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Activos</option>
                <option value="inactive" ${filters.status === 'inactive' ? 'selected' : ''}>Inactivos</option>
              </select>
            </div>
            <div class="tr2">
              <select class="fsel" id="nwl-limit">
                <option value="10" ${pageSize === '10' ? 'selected' : ''}>10</option>
                <option value="20" ${pageSize === '20' ? 'selected' : ''}>20</option>
                <option value="all" ${pageSize === 'all' ? 'selected' : ''}>Todos</option>
              </select>
              <button class="btn btn-ol" id="btn-clear-newsletter-filters" title="Limpiar filtros">🗑️</button>
              ${me.rol === 'root' ? '<button id="nwl-send-btn" class="btn btn-cy" onclick="sendNewsletterDigestNow()" title="Enviar digest ahora" style="white-space:nowrap">Enviar digest ahora</button>' : ''}
            </div>
          </div>
        </div>
        <div id="nwl-table-wrap">${renderTable()}</div>`;
    }

    function renderDataExchangeSection() {
      return `
        <div class="tb">
          <div class="tr2" style="width:100%;justify-content:space-between;gap:10px">
            <div style="font-size:.9rem;font-weight:700;color:var(--tx)">Data Exchange Newsletter</div>
            <div class="tr2">
              <button class="btn btn-ol" id="btn-export-newsletter" title="Exportar base .xlsx">⬇️ Exportar .xlsx</button>
            </div>
          </div>
        </div>
        <div class="tw" style="padding:14px;margin-bottom:14px">
          <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:12px;align-items:end">
            <div>
              <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px">Alta manual de correos</label>
              <textarea id="nwl-manual-input" class="fi" rows="3" placeholder="correo1@dominio.com, correo2@dominio.com o uno por línea"></textarea>
            </div>
            <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;height:100%">
              <button class="btn btn-cy" id="btn-nwl-manual-add" style="height:44px;white-space:nowrap">Agregar correos</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:12px;align-items:end;margin-top:12px">
            <div>
              <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:6px">Importación masiva (.xlsx, .xls, .csv)</label>
              <input id="nwl-import-file" class="fi" type="file" accept=".xlsx,.xls,.csv" />
              <div class="fhint" style="margin-top:6px">Se toma la primera hoja y la primera columna.</div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;height:100%">
              <button class="btn btn-cy" id="btn-nwl-import" style="height:44px;white-space:nowrap">Importar archivo</button>
            </div>
          </div>
        </div>`;
    }

    function renderDispatchSection() {
      return `
        <div style="margin-top:4px" class="tb">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%">
            <div style="font-size:.9rem;font-weight:700;color:var(--tx)">Log de envíos Newsletter</div>
            <div class="tr2" style="min-width:280px;justify-content:flex-end">
              <div class="sb2" style="max-width:260px">🔍 <input type="text" id="nwl-log-search" placeholder="Buscar en estado o detalle..." value="${esc(logFilters.q || '')}"/></div>
              <select class="fsel" id="nwl-log-type">
                <option value="">Todos los tipos</option>
                <option value="manual" ${logFilters.type === 'manual' ? 'selected' : ''}>Manual</option>
                <option value="automatico" ${logFilters.type === 'automatico' ? 'selected' : ''}>Automático</option>
              </select>
              <select class="fsel" id="nwl-log-limit">
                <option value="10" ${logPageSize === '10' ? 'selected' : ''}>10</option>
                <option value="20" ${logPageSize === '20' ? 'selected' : ''}>20</option>
                <option value="all" ${logPageSize === 'all' ? 'selected' : ''}>Todos</option>
              </select>
              <button class="btn btn-ol" id="btn-clear-newsletter-log-filters" title="Limpiar filtros log">🗑️</button>
            </div>
          </div>
        </div>
        <div id="nwl-log-table-wrap">${renderLogTable()}</div>`;
    }

    function setNewsletterView(view) {
      const allowed = new Set(['overview', 'subscribers', 'sends', 'data']);
      activeView = allowed.has(view) ? view : 'overview';
    }

    async function rnwl(view = activeView) {
      setNewsletterView(view);
      const me = getMe();
      const ct = document.getElementById('ct');
      if (!me) {
        ct.innerHTML = '<div class="empty"><div class="ei">🔒</div><p>Sesión expirada.</p></div>';
        return;
      }

      ct.innerHTML = '<div class="empty"><div class="ei">⏳</div></div>';
      try {
        cache = await loadData();
      } catch (e) {
        ct.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>${esc(e.message || 'No se pudo cargar Newsletter')}</p></div>`;
        return;
      }

      const summary = cache.summary || {};
      const digest = cache.digest || {};
      const logsSummary = cache.logsSummary || {};
      const showOverview = activeView === 'overview';
      const showSubscribers = activeView === 'subscribers';
      const showSends = activeView === 'sends';
      const showData = activeView === 'data';
      const overviewCards = `
        <div class="tw" style="padding:14px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div style="font-size:.9rem;color:var(--tx2);max-width:640px;line-height:1.5">
              Gestioná suscriptores, revisá resultados de envíos y ejecutá importación/exportación de datos del newsletter.
            </div>
            <div class="tr2">
              <button class="btn btn-ol" onclick="nav('nwl-subs')">Suscriptores</button>
              <button class="btn btn-ol" onclick="nav('nwl-sends')">Envíos</button>
              <button class="btn btn-ol" onclick="nav('nwl-data')">Data Exchange</button>
            </div>
          </div>
        </div>`;

      ct.innerHTML = `
        ${renderSummaryCards(summary, logsSummary)}

        <div class="alr alr-info" style="margin-bottom:14px">
          Próximo chequeo semanal: <strong>${esc(fmtD(summary.nextRunAt)) || '—'}</strong>.
          Último chequeo: <strong>${digest.lastRunAt ? esc(fmtD(digest.lastRunAt)) : '—'}</strong>.
          Último envío: <strong>${digest.lastSentAt ? esc(fmtD(digest.lastSentAt)) : '—'}</strong>.
        </div>
        ${showOverview ? overviewCards : ''}
        ${showSubscribers ? renderSubscribersSection(me) : ''}
        ${showSends ? renderDispatchSection() : ''}
        ${showData ? renderDataExchangeSection() : ''}
      `;

      document.getElementById('nwl-search')?.addEventListener('input', (e) => {
        filters.q = e.target.value || '';
        page = 1;
        rerenderContactsTable();
      });
      document.getElementById('nwl-status')?.addEventListener('change', (e) => {
        filters.status = e.target.value || '';
        page = 1;
        rnwl();
      });
      document.getElementById('nwl-limit')?.addEventListener('change', (e) => {
        pageSize = e.target.value || '10';
        page = 1;
        rerenderContactsTable();
      });
      document.getElementById('btn-clear-newsletter-filters')?.addEventListener('click', clearFilters);
      document.getElementById('btn-export-newsletter')?.addEventListener('click', exportNewsletterXlsx);
      document.getElementById('btn-nwl-manual-add')?.addEventListener('click', submitManualEmails);
      document.getElementById('btn-nwl-import')?.addEventListener('click', importNewsletterFile);

      document.getElementById('nwl-log-search')?.addEventListener('input', (e) => {
        logFilters.q = e.target.value || '';
        logPage = 1;
        rerenderLogsTable();
      });
      document.getElementById('nwl-log-type')?.addEventListener('change', (e) => {
        logFilters.type = e.target.value || '';
        logPage = 1;
        rerenderLogsTable();
      });
      document.getElementById('nwl-log-limit')?.addEventListener('change', (e) => {
        logPageSize = e.target.value || '10';
        logPage = 1;
        rerenderLogsTable();
      });
      document.getElementById('btn-clear-newsletter-log-filters')?.addEventListener('click', clearLogFilters);
    }

    function setNewsletterPage(nextPage) {
      page = Math.max(1, Number(nextPage || 1));
      rerenderContactsTable();
    }

    function setNewsletterLogPage(nextPage) {
      logPage = Math.max(1, Number(nextPage || 1));
      rerenderLogsTable();
    }

    function sortNewsletterBy(key) {
      if (sortBy === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else {
        sortBy = key;
        sortDir = 'asc';
      }
      page = 1;
      rerenderContactsTable();
    }

    function sortNewsletterLogBy(key) {
      if (logSortBy === key) logSortDir = logSortDir === 'asc' ? 'desc' : 'asc';
      else {
        logSortBy = key;
        logSortDir = 'asc';
      }
      logPage = 1;
      rerenderLogsTable();
    }

    function clearFilters() {
      filters = { q: '', status: '' };
      page = 1;
      rnwl(activeView);
    }

    function clearLogFilters() {
      logFilters = { q: '', type: '', status: '' };
      logPage = 1;
      rnwl(activeView);
    }

    async function toggleSubscription(id, nextActive) {
      try {
        await callApi(`/newsletter/subscriptions/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ activo: !!nextActive }),
        });
        toast(`Suscripción ${nextActive ? 'activada' : 'desactivada'}.`, 'success');
        await rnwl();
      } catch (e) {
        toast(e.message || 'No se pudo actualizar la suscripción.', 'error');
      }
    }

    async function deleteSubscription(id, emailRaw) {
      const label = decodeURIComponent(String(emailRaw || '')).trim();
      if (!label) return;
      if (!confirm(`¿Eliminar suscripción de ${label}?`)) return;
      try {
        await callApi(`/newsletter/subscriptions/${id}`, { method: 'DELETE' });
        toast('Suscripción eliminada.', 'success');
        await rnwl();
      } catch (e) {
        toast(e.message || 'No se pudo eliminar la suscripción.', 'error');
      }
    }

    async function submitManualEmails() {
      const input = document.getElementById('nwl-manual-input');
      const btn = document.getElementById('btn-nwl-manual-add');
      const emails = String(input?.value || '').trim();
      if (!emails) return toast('Ingresá al menos un correo.', 'info');

      if (btn) { btn.disabled = true; btn.textContent = 'Procesando...'; }
      try {
        const result = await callApi('/newsletter/subscriptions/manual', {
          method: 'POST',
          body: JSON.stringify({ emails, source: 'manual' }),
        });
        const stats = result?.stats || {};
        toast(`Manual: agregados ${Number(stats.agregados || 0)}, duplicados ${Number(stats.duplicados || 0)}, inválidos ${Number(stats.invalidos || 0)}.`, 'success');
        if (input) input.value = '';
        await rnwl();
      } catch (e) {
        toast(e.message || 'No se pudo procesar el alta manual.', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Agregar correos'; }
      }
    }

    async function importNewsletterFile() {
      const fileInput = document.getElementById('nwl-import-file');
      const btn = document.getElementById('btn-nwl-import');
      const file = fileInput?.files?.[0];
      if (!file) return toast('Seleccioná un archivo para importar.', 'info');

      const fd = new FormData();
      fd.append('file', file);
      if (btn) { btn.disabled = true; btn.textContent = 'Importando...'; }
      try {
        const token = sessionStorage.getItem('unam_atk');
        const response = await fetch('/admin/api/newsletter/subscriptions/import', {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: fd,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        const s = data?.stats || {};
        toast(`Importación: leídos ${Number(s.leidos || 0)}, válidos ${Number(s.validos || 0)}, importados ${Number(s.importados || 0)}, duplicados ${Number(s.duplicados || 0)}, inválidos ${Number(s.invalidos || 0)}.`, 'success');
        if (fileInput) fileInput.value = '';
        await rnwl();
      } catch (e) {
        const msg = String(e?.message || '').toLowerCase();
        if (msg.includes('endpoint no encontrado') || msg.includes('not found')) {
          try {
            const fd2 = new FormData();
            fd2.append('file', file);
            const fallback = await fetchViaCpanel('/newsletter/subscriptions/import', {
              method: 'POST',
              body: fd2,
              isFormData: true,
            });
            const s = fallback?.stats || {};
            toast(`Importación: leídos ${Number(s.leidos || 0)}, válidos ${Number(s.validos || 0)}, importados ${Number(s.importados || 0)}, duplicados ${Number(s.duplicados || 0)}, inválidos ${Number(s.invalidos || 0)}.`, 'success');
            if (fileInput) fileInput.value = '';
            await rnwl();
            return;
          } catch (e2) {
            toast(e2.message || 'No se pudo importar el archivo.', 'error');
            return;
          }
        }
        toast(e.message || 'No se pudo importar el archivo.', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Importar archivo'; }
      }
    }

    async function exportNewsletterXlsx() {
      const btn = document.getElementById('btn-export-newsletter');
      if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
      try {
        const result = await callApi('/newsletter/subscriptions/export');
        if (!result?.fileBase64) throw new Error('No se recibió el archivo para exportar.');
        downloadBase64File(result.fileBase64, result.filename, result.mimeType);
        toast(`Exportación completada: ${Number(result.total || 0)} registro(s).`, 'success');
      } catch (e) {
        toast(e.message || 'No se pudo exportar la base de newsletter.', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '⬇️'; }
      }
    }

    async function sendDigestNow() {
      const me = getMe();
      if (me?.rol !== 'root') return;
      const activeCount = (cache.summary?.active || 0);
      const confirmMsg = activeCount > 0
        ? `¿Enviar el digest ahora a ${activeCount} suscriptor(es) activo(s)?\n\nSe enviará el resumen de cambios desde el lunes de la semana actual hasta este momento.`
        : '¿Enviar el digest ahora?\n\nNo hay suscriptores activos en este momento: el envío quedará registrado sin destinatarios.';
      if (!confirm(confirmMsg)) return;

      const btn = document.getElementById('nwl-send-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

      try {
        const result = await callApi('/newsletter/send', { method: 'POST' });
        const sections = result.secciones || result.sections || {};
        const diffTotal = Number(result?.diff?.total ?? result?.diffTotal ?? 0);
        const sentCount = Number(result?.sentCount || 0);
        const failCount = Number(result?.failCount || 0);
        const recipientsTotal = Number(result?.recipientsTotal || 0);
        const parts = [
          sections.nueva && `${sections.nueva} nueva(s)`,
          sections.inscripcionAbierta && `${sections.inscripcionAbierta} inscripción abierta`,
          sections.proximamente && `${sections.proximamente} próximamente`,
          sections.cierreProximo && `${sections.cierreProximo} cierre próximo`,
          sections.cierreReciente && `${sections.cierreReciente} cierre reciente`,
          sections.actualizadas && `${sections.actualizadas} actualizada(s)`,
        ].filter(Boolean);
        const changesLabel = parts.length ? `Secciones: ${parts.join(', ')}.` : 'Secciones: sin cambios.';
        const summaryLabel = `Resultado: enviados ${sentCount}, fallidos ${failCount}, destinatarios ${recipientsTotal}, diff.total ${diffTotal}.`;
        const sendLabel = sentCount > 0
          ? `Envío completado ${sentCount}/${recipientsTotal}.`
          : (recipientsTotal === 0 ? 'Sin suscriptores activos.' : 'No se pudo enviar a ningún destinatario.');
        toast(`${sendLabel} ${summaryLabel} ${changesLabel}`, sentCount > 0 ? 'success' : 'info');
        await rnwl();
      } catch (e) {
        toast(String(e?.message || 'Error al enviar el digest.'), 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar digest ahora'; }
      }
    }

    return {
      rnwl,
      setNewsletterPage,
      setNewsletterLogPage,
      sortNewsletterBy,
      sortNewsletterLogBy,
      clearNewsletterFilters: clearFilters,
      clearNewsletterLogFilters: clearLogFilters,
      exportNewsletterCsv: exportNewsletterXlsx,
      exportNewsletterXlsx,
      submitNewsletterManual: submitManualEmails,
      importNewsletterFile,
      toggleNewsletterSubscription: toggleSubscription,
      deleteNewsletterSubscription: deleteSubscription,
      sendNewsletterDigestNow: sendDigestNow,
    };
  }

  global.createCPanelNewsletter = createCPanelNewsletter;
})(window);
