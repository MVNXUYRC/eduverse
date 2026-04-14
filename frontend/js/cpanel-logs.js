(function initCPanelLogs(global) {
  function createCPanelLogs(deps) {
    const { api, esc, fmtD, getMe } = deps;
    let allLogs = [];
    let logPage = 1;
    let logPageSize = '10';
    let logSortBy = 'fecha';
    let logSortDir = 'desc';
    let logFilters = { q: '', action: '', entity: '', user: '', role: '', dateExact: '', dateFrom: '', dateTo: '' };
    let logCalendarMonth = (() => {
      const d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), 1);
    })();
    let logDatePickerOpen = false;

    function visibleAuditUser(log) {
      return log?.rol === 'root' ? 'root' : String(log?.user || '');
    }
    function toLowerToken(value) {
      return String(value || '').trim().toLowerCase();
    }
    function sortAlpha(values = []) {
      return [...new Set((values || [])
        .map((v) => String(v || '').trim())
        .filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    }
    function normalizeText(value) {
      return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    function escapeExcelCell(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    function sortHead(label, key) {
      const isCurrent = logSortBy === key;
      const indicator = isCurrent ? (logSortDir === 'asc' ? '▲' : '▼') : '';
      return `<button type="button" onclick="sortLogBy('${key}')" style="border:none;background:none;padding:0;margin:0;cursor:pointer;font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit;display:inline-flex;align-items:center;gap:5px">
        <span>${label}</span>
        <span style="font-size:.72rem;color:rgba(255,255,255,.65);min-width:10px">${indicator}</span>
      </button>`;
    }
    function toLocalDateKey(value) {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    function parseDateKey(key) {
      const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return null;
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      if (Number.isNaN(d.getTime())) return null;
      return d;
    }
    function formatDateKey(key) {
      const d = parseDateKey(key);
      if (!d) return '';
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = d.getFullYear();
      return `${dd}/${mm}/${yy}`;
    }
    function getDateFilterLabel() {
      if (logFilters.dateExact) return formatDateKey(logFilters.dateExact);
      if (logFilters.dateFrom && logFilters.dateTo) return `${formatDateKey(logFilters.dateFrom)} - ${formatDateKey(logFilters.dateTo)}`;
      return 'Todas';
    }
    function updateDateTriggerLabel() {
      const lbl = document.getElementById('log-date-label');
      if (lbl) lbl.textContent = getDateFilterLabel();
    }
    function toggleLogDatePicker(force) {
      const pop = document.getElementById('log-date-pop');
      if (!pop) return;
      logDatePickerOpen = force !== undefined ? !!force : !logDatePickerOpen;
      pop.style.display = logDatePickerOpen ? 'block' : 'none';
      if (logDatePickerOpen) renderLogDateCalendar();
    }
    function setLogCalendarMonth(delta) {
      logCalendarMonth = new Date(logCalendarMonth.getFullYear(), logCalendarMonth.getMonth() + Number(delta || 0), 1);
      renderLogDateCalendar();
    }
    function pickLogDate(key) {
      const clicked = String(key || '');
      const hasExact = !!logFilters.dateExact;
      const hasRange = !!logFilters.dateFrom && !!logFilters.dateTo;
      if (!hasExact && !hasRange) {
        logFilters.dateExact = clicked;
        logFilters.dateFrom = '';
        logFilters.dateTo = '';
      } else if (hasExact) {
        const first = logFilters.dateExact;
        if (first === clicked) {
          logFilters.dateExact = clicked;
          logFilters.dateFrom = '';
          logFilters.dateTo = '';
        } else {
          const start = first < clicked ? first : clicked;
          const end = first < clicked ? clicked : first;
          logFilters.dateExact = '';
          logFilters.dateFrom = start;
          logFilters.dateTo = end;
        }
      } else {
        logFilters.dateExact = clicked;
        logFilters.dateFrom = '';
        logFilters.dateTo = '';
      }
      logPage = 1;
      updateDateTriggerLabel();
      renderLogDateCalendar();
      renderLogTable();
      toggleLogDatePicker(false);
    }
    function clearLogDateFilter() {
      logFilters.dateExact = '';
      logFilters.dateFrom = '';
      logFilters.dateTo = '';
      logPage = 1;
      updateDateTriggerLabel();
      renderLogDateCalendar();
      renderLogTable();
    }
    function renderLogDateCalendar() {
      const host = document.getElementById('log-date-cal');
      if (!host) return;
      const year = logCalendarMonth.getFullYear();
      const month = logCalendarMonth.getMonth();
      const firstDay = new Date(year, month, 1);
      const startWeekday = (firstDay.getDay() + 6) % 7;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const monthLabel = firstDay.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      const selectedStart = logFilters.dateExact || logFilters.dateFrom || '';
      const selectedEnd = logFilters.dateTo || '';
      const dayNames = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
      const cells = [];
      for (let i = 0; i < startWeekday; i += 1) {
        cells.push('<button type="button" disabled style="height:28px;border:none;background:transparent"></button>');
      }
      for (let day = 1; day <= daysInMonth; day += 1) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const inRange = selectedStart && selectedEnd && key >= selectedStart && key <= selectedEnd;
        const isEdge = key === selectedStart || key === selectedEnd;
        const isSingle = !selectedEnd && key === selectedStart;
        const style = isEdge || isSingle
          ? 'background:var(--cy);color:#fff;border:1px solid var(--cy)'
          : inRange
            ? 'background:rgba(0,149,204,.12);color:var(--cy);border:1px solid rgba(0,149,204,.25)'
            : 'background:#fff;color:var(--tx2);border:1px solid var(--bd)';
        cells.push(`<button type="button" onclick="pickLogDate('${key}')" style="height:28px;border-radius:6px;font-size:12px;${style}">${day}</button>`);
      }
      host.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <button type="button" class="btn btn-ol btn-sm" style="padding:3px 8px" onclick="setLogCalendarMonth(-1)">←</button>
          <div style="font-size:12px;font-weight:700;text-transform:capitalize">${esc(monthLabel)}</div>
          <button type="button" class="btn btn-ol btn-sm" style="padding:3px 8px" onclick="setLogCalendarMonth(1)">→</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px">${dayNames.map((d) => `<div style="font-size:10px;color:var(--mt);text-align:center;font-weight:700">${d}</div>`).join('')}</div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">${cells.join('')}</div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;gap:6px">
          <button type="button" class="btn btn-ol btn-sm" style="padding:4px 8px" onclick="clearLogDateFilter()">Limpiar fecha</button>
          <button type="button" class="btn btn-ol btn-sm" style="padding:4px 8px" onclick="toggleLogDatePicker(false)">Cerrar</button>
        </div>
      `;
    }
    function normalizeAuditDetail(detail) {
      const original = detail;
      const raw = String(detail || '').trim();
      if (!raw) return '';
      if (original && typeof original === 'object') {
        const carreras = Number(original.carrerasEliminadas || 0);
        const contactos = Number(
          original.contactosEliminados !== undefined
            ? original.contactosEliminados
            : (original.usuariosEliminados || 0)
        );
        const logs = Number(original.logsEliminados || 0);
        if (!Number.isNaN(carreras) && !Number.isNaN(contactos) && !Number.isNaN(logs)) {
          return `carreras: ${carreras}, contactos: ${contactos}, logs: ${logs}`;
        }
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (
            Object.prototype.hasOwnProperty.call(parsed, 'carrerasEliminadas') &&
            Object.prototype.hasOwnProperty.call(parsed, 'logsEliminados')
          ) {
            const carreras = Number(parsed.carrerasEliminadas || 0);
            const contactos = Number(
              parsed.contactosEliminados !== undefined
                ? parsed.contactosEliminados
                : (parsed.usuariosEliminados || 0)
            );
            const logs = Number(parsed.logsEliminados || 0);
            return `carreras: ${carreras}, contactos: ${contactos}, logs: ${logs}`;
          }
        }
      } catch {}
      const legacyMatch = raw.match(/carreras:\s*(\d+)\D+contactos:\s*(\d+)\D+logs:\s*(\d+)/i)
        || raw.match(/se eliminaron carreras:\s*(\d+),\s*contactos:\s*(\d+),\s*logs:\s*(\d+)/i);
      if (legacyMatch) {
        return `carreras: ${Number(legacyMatch[1] || 0)}, contactos: ${Number(legacyMatch[2] || 0)}, logs: ${Number(legacyMatch[3] || 0)}`;
      }
      return raw;
    }

    async function rlog() {
      const me = getMe();
      if (me.rol !== 'root') {
        document.getElementById('ct').innerHTML = '<div class="empty"><div class="ei">🔒</div><p>Solo accesible para root</p></div>';
        return;
      }
      const ct = document.getElementById('ct');
      ct.innerHTML = '<div class="empty"><div class="ei">⏳</div></div>';
      try {
        const d = await api('/audit');
        allLogs = d.logs || [];
        logPage = 1;
        logPageSize = '10';
        logSortBy = 'fecha';
        logSortDir = 'desc';
        logFilters = { q: '', action: '', entity: '', user: '', role: '', dateExact: '', dateFrom: '', dateTo: '' };
        ct.innerHTML = `
          <div id="log-root" style="font-family:'Ubuntu',sans-serif">
            <div class="tb" id="log-toolbar">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%">
                <div style="display:flex;align-items:center;gap:8px;min-width:280px;max-width:520px;flex:1">
                  <div class="sb2" style="flex:1">🔍 <input type="text" id="log-search" placeholder="Buscar…" value=""/></div>
                </div>
              </div>
              <div style="width:100%;padding:12px;border:1.5px solid var(--bd);border-radius:var(--r);background:var(--sf)">
                <div class="tr2" style="width:100%;align-items:flex-end;gap:8px;justify-content:flex-start">
                  <div style="display:flex;flex-direction:column;gap:5px;width:220px;min-width:220px;max-width:220px;flex:0 0 220px">
                    <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Acción</label>
                    <select class="fsel" id="log-filt-action"></select>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:5px;width:220px;min-width:220px;max-width:220px;flex:0 0 220px">
                    <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Entidad</label>
                    <select class="fsel" id="log-filt-entity"></select>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:5px;width:260px;min-width:260px;max-width:260px;flex:0 0 260px">
                    <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Correo Electrónico</label>
                    <select class="fsel" id="log-filt-user"></select>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:5px;width:180px;min-width:180px;max-width:180px;flex:0 0 180px">
                    <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Rol</label>
                    <select class="fsel" id="log-filt-role"></select>
                  </div>
                  <div style="position:relative;display:flex;flex-direction:column;gap:5px;width:230px;min-width:230px;max-width:230px;flex:0 0 230px">
                    <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Fecha / Período</label>
                    <button type="button" class="btn btn-ol" id="log-date-trigger" onclick="toggleLogDatePicker()" style="width:100%;justify-content:space-between;padding:8px 11px">
                      <span id="log-date-label" style="font-weight:400">Todas</span>
                      <span>📅</span>
                    </button>
                    <div id="log-date-pop" style="display:none;position:absolute;top:100%;left:0;z-index:25;margin-top:6px;width:230px;background:#fff;border:1px solid var(--bd);border-radius:8px;padding:8px;box-shadow:0 10px 24px rgba(0,0,0,.12)">
                      <div id="log-date-cal"></div>
                    </div>
                  </div>
                  <div style="display:flex;align-items:flex-end;justify-content:flex-end;gap:8px;flex:1;min-width:160px;padding-right:4px">
                    <div style="display:flex;flex-direction:column;gap:5px;width:140px;min-width:140px;max-width:140px;flex:0 0 140px">
                      <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Registros</label>
                      <select class="fsel" id="log-limit">
                        <option value="10" selected>10</option>
                        <option value="20">20</option>
                        <option value="all">Todos</option>
                      </select>
                    </div>
                    <button class="btn btn-ol" id="btn-clear-log-filters" title="Limpiar filtros" aria-label="Limpiar filtros" style="width:52px;justify-content:center;padding-left:0;padding-right:0">🗑️</button>
                    <button class="btn btn-ol" id="btn-export-log" title="Exportar" aria-label="Exportar" style="width:52px;justify-content:center;padding-left:0;padding-right:0">⬇️</button>
                  </div>
                </div>
              </div>
            </div>
            <div id="log-table-wrap"></div>
            <div id="log-pg"></div>
          </div>
        `;
        document.getElementById('log-search')?.addEventListener('input', (e) => {
          logFilters.q = e.target.value || '';
          logPage = 1;
          renderLogTable();
        });
        document.getElementById('log-filt-action')?.addEventListener('change', (e) => {
          logFilters.action = e.target.value || '';
          logPage = 1;
          renderLogTable();
        });
        document.getElementById('log-filt-entity')?.addEventListener('change', (e) => {
          logFilters.entity = e.target.value || '';
          logPage = 1;
          renderLogTable();
        });
        document.getElementById('log-filt-user')?.addEventListener('change', (e) => {
          logFilters.user = e.target.value || '';
          logPage = 1;
          renderLogTable();
        });
        document.getElementById('log-filt-role')?.addEventListener('change', (e) => {
          logFilters.role = e.target.value || '';
          logPage = 1;
          renderLogTable();
        });
        document.getElementById('log-limit')?.addEventListener('change', (e) => {
          logPageSize = e.target.value || '10';
          logPage = 1;
          renderLogTable();
        });
        document.getElementById('btn-clear-log-filters')?.addEventListener('click', clearLogFilters);
        document.getElementById('btn-export-log')?.addEventListener('click', exportLogExcel);
        document.addEventListener('click', (event) => {
          const trigger = document.getElementById('log-date-trigger');
          const pop = document.getElementById('log-date-pop');
          if (!logDatePickerOpen || !trigger || !pop) return;
          if (trigger.contains(event.target) || pop.contains(event.target)) return;
          toggleLogDatePicker(false);
        });
        updateDateTriggerLabel();
        renderLogDateCalendar();
        renderLogTable();
      } catch (e) {
        ct.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>${e.message}</p></div>`;
      }
    }

    function clearLogFilters() {
      const search = document.getElementById('log-search');
      const action = document.getElementById('log-filt-action');
      const entity = document.getElementById('log-filt-entity');
      const user = document.getElementById('log-filt-user');
      const role = document.getElementById('log-filt-role');
      if (search) search.value = '';
      if (action) action.value = '';
      if (entity) entity.value = '';
      if (user) user.value = '';
      if (role) role.value = '';
      logFilters = { q: '', action: '', entity: '', user: '', role: '', dateExact: '', dateFrom: '', dateTo: '' };
      logPage = 1;
      updateDateTriggerLabel();
      renderLogDateCalendar();
      toggleLogDatePicker(false);
      renderLogTable();
    }

    function buildFilteredLogs() {
      const q = normalizeText(logFilters.q);
      let rows = [...allLogs];
      if (q) {
        rows = rows.filter((l) => {
          const searchable = [
            l.ts,
            l.action,
            l.entity,
            normalizeAuditDetail(l.detail),
            visibleAuditUser(l),
            l.rol,
          ].map((v) => normalizeText(v)).join(' ');
          return searchable.includes(q);
        });
      }
      if (logFilters.action) rows = rows.filter((l) => toLowerToken(l.action) === logFilters.action);
      if (logFilters.entity) rows = rows.filter((l) => toLowerToken(l.entity) === logFilters.entity);
      if (logFilters.user) rows = rows.filter((l) => toLowerToken(visibleAuditUser(l)) === logFilters.user);
      if (logFilters.role) rows = rows.filter((l) => toLowerToken(l.rol) === logFilters.role);
      if (logFilters.dateExact) {
        rows = rows.filter((l) => toLocalDateKey(l.ts) === logFilters.dateExact);
      } else {
        if (logFilters.dateFrom) rows = rows.filter((l) => toLocalDateKey(l.ts) >= logFilters.dateFrom);
        if (logFilters.dateTo) rows = rows.filter((l) => toLocalDateKey(l.ts) <= logFilters.dateTo);
      }
      const sortValue = (l) => {
        if (logSortBy === 'accion') return String(l.action || '');
        if (logSortBy === 'entidad') return String(l.entity || '');
        if (logSortBy === 'correo') return String(visibleAuditUser(l) || '');
        if (logSortBy === 'rol') return String(l.rol || '');
        return String(l.ts || '');
      };
      rows.sort((a, b) => {
        if (logSortBy === 'fecha') {
          const av = new Date(a.ts || 0).getTime();
          const bv = new Date(b.ts || 0).getTime();
          if (av === bv) return 0;
          return logSortDir === 'asc' ? av - bv : bv - av;
        }
        const av = normalizeText(sortValue(a));
        const bv = normalizeText(sortValue(b));
        const cmp = av.localeCompare(bv, 'es', { sensitivity: 'base', numeric: true });
        return logSortDir === 'asc' ? cmp : -cmp;
      });
      return rows;
    }

    function renderLogTable() {
      const actionSel = document.getElementById('log-filt-action');
      const entitySel = document.getElementById('log-filt-entity');
      const userSel = document.getElementById('log-filt-user');
      const roleSel = document.getElementById('log-filt-role');
      const actions = sortAlpha(allLogs.map((l) => toLowerToken(l.action)));
      const entities = sortAlpha(allLogs.map((l) => toLowerToken(l.entity)));
      const users = sortAlpha(allLogs.map((l) => toLowerToken(visibleAuditUser(l))));
      const roles = sortAlpha(allLogs.map((l) => toLowerToken(l.rol)));
      if (actionSel) actionSel.innerHTML = `<option value="">Todas</option>${actions.map((a) => `<option value="${esc(a)}" ${logFilters.action === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}`;
      if (entitySel) entitySel.innerHTML = `<option value="">Todas</option>${entities.map((e) => `<option value="${esc(e)}" ${logFilters.entity === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}`;
      if (userSel) userSel.innerHTML = `<option value="">Todos</option>${users.map((u) => `<option value="${esc(u)}" ${logFilters.user === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}`;
      if (roleSel) roleSel.innerHTML = `<option value="">Todos</option>${roles.map((r) => `<option value="${esc(r)}" ${logFilters.role === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}`;

      const filtered = buildFilteredLogs();
      const wrap = document.getElementById('log-table-wrap');
      if (!wrap) return;
      const total = filtered.length;
      let rows = filtered;
      let page = logPage;
      let totalPages = 1;
      if (logPageSize !== 'all') {
        const perPage = logPageSize === '20' ? 20 : 10;
        totalPages = Math.max(Math.ceil(total / perPage), 1);
        page = Math.min(Math.max(page, 1), totalPages);
        logPage = page;
        rows = filtered.slice((page - 1) * perPage, page * perPage);
      } else {
        logPage = 1;
        page = 1;
      }
      if (!rows.length) {
        wrap.innerHTML = '<div class="empty" style="padding:24px"><p>Sin resultados para estos filtros.</p></div>';
      } else {
        wrap.innerHTML = `<div class="tw" style="font-size:.85rem"><table style="width:100%;table-layout:fixed">
        <colgroup>
          <col style="width:16%">
          <col style="width:11%">
          <col style="width:10%">
          <col style="width:35%">
          <col style="width:18%">
          <col style="width:10%">
        </colgroup>
        <thead><tr>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('FECHA Y HORA', 'fecha')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('ACCIÓN', 'accion')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('ENTIDAD', 'entidad')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">DETALLE</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('CORREO ELECTRÓNICO', 'correo')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('ROL', 'rol')}</th>
        </tr></thead>
        <tbody>${rows.map((l) => `<tr>
          <td style="color:var(--mt);white-space:nowrap">${fmtD(l.ts)} ${new Date(l.ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
          <td>${esc(l.action).toLowerCase()}</td>
          <td>${esc(l.entity).toLowerCase()}</td>
          <td style="max-width:320px;white-space:normal;word-break:break-word">${esc(normalizeAuditDetail(l.detail))}</td>
          <td>${esc(visibleAuditUser(l))}</td>
          <td>${esc(l.rol)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
      }
      const pg = document.getElementById('log-pg');
      if (pg) {
        if (logPageSize !== 'all' && totalPages > 1) {
          let buttons = '';
          for (let i = 1; i <= totalPages; i += 1) {
            buttons += `<button class="pb ${i === page ? 'active' : ''}" onclick="setLogPage(${i})">${i}</button>`;
          }
          pg.innerHTML = `<div class="pag"><button class="pb" onclick="setLogPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>←</button>${buttons}<button class="pb" onclick="setLogPage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>→</button></div>`;
        } else {
          pg.innerHTML = '';
        }
      }
      wrap.insertAdjacentHTML('beforeend', `<div class="records-count" style="margin-top:10px">Se encontraron ${total} registro${total === 1 ? '' : 's'} de log${total === 1 ? '' : 's'}.</div>`);
    }

    function setLogPage(page) {
      logPage = Math.max(1, Number.parseInt(page, 10) || 1);
      renderLogTable();
    }

    function sortLogBy(key) {
      if (logSortBy === key) logSortDir = logSortDir === 'asc' ? 'desc' : 'asc';
      else {
        logSortBy = key;
        logSortDir = key === 'fecha' ? 'desc' : 'asc';
      }
      logPage = 1;
      renderLogTable();
    }

    async function exportLogExcel() {
      const btn = document.getElementById('btn-export-log');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳';
      }
      try {
        const rows = buildFilteredLogs();
        const headers = ['Fecha y hora', 'Acción', 'Entidad', 'Detalle', 'Correo Electrónico', 'Rol'];
        const body = rows.map((l) => ([
          `${fmtD(l.ts)} ${new Date(l.ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`,
          String(l.action || '').toLowerCase(),
          String(l.entity || '').toLowerCase(),
          normalizeAuditDetail(l.detail),
          visibleAuditUser(l),
          l.rol || '',
        ]));
        const tableHeader = headers.map((h) => `<th style="border:none;padding:4px 8px;text-align:left">${escapeExcelCell(h)}</th>`).join('');
        const tableBody = body.map((row) => `<tr>${row.map((cell) => `<td style="border:none;padding:4px 8px">${escapeExcelCell(cell)}</td>`).join('')}</tr>`).join('');
        const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table style="border-collapse:collapse;border:none"><thead><tr>${tableHeader}</tr></thead><tbody>${tableBody}</tbody></table></body></html>`;
        const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `logs-auditoria-${stamp}.xls`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = '⬇️';
        }
      }
    }

    return {
      rlog,
      renderLogTable,
      clearLogFilters,
      setLogPage,
      sortLogBy,
      exportLogExcel,
      toggleLogDatePicker,
      setLogCalendarMonth,
      pickLogDate,
      clearLogDateFilter,
    };
  }

  global.createCPanelLogs = createCPanelLogs;
})(window);
