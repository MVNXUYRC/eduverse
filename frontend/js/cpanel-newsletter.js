(function initCPanelNewsletter(global) {
  function createCPanelNewsletter(deps) {
    const { api, esc, fmtD, toast, getMe } = deps;

    const SOURCE_LABELS = {
      novedades: 'Suscripción',
      manual: 'Manual',
      import: 'Importación',
      sitio: 'Sitio',
    };
    const SECTION_TITLES = {
      nueva: 'NUEVAS PROPUESTAS',
      proximamente: 'Próximamente disponibles',
      inscripcionAbierta: 'Inscripciones abiertas',
      cierreProximo: 'Inscripciones con cierre próximo',
      cierreReciente: 'Inscripciones cerradas recientemente',
      actualizadas: 'PROPUESTAS ACTUALIZADAS',
    };
    const DARK_TH_BASE_STYLE = 'font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em';

    let cache = {
      data: [],
      summary: {},
      digest: {},
      dispatchLog: [],
      logsSummary: {},
      sourceOptions: [],
      preview: null,
      unavailable: false,
    };

    let filters = {
      q: '',
      status: '',
      source: '',
      dateMode: '',
      dateExact: '',
      dateFrom: '',
      dateTo: '',
    };
    let page = 1;
    let pageSize = '10';
    let sortBy = 'fechaAlta';
    let sortDir = 'desc';

    let logFilters = { q: '', type: '' };
    let logPage = 1;
    let logPageSize = '10';
    let logSortBy = 'runAt';
    let logSortDir = 'desc';

    let activeView = 'overview';
    let previewSelection = new Set();
    let previewLoadedAt = null;
    let overviewRequestSeq = 0;
    let recipientMode = 'all';
    let recipientSearch = '';
    let recipientOptions = [];
    let recipientSelection = new Set();

    let activeLogDetail = null;
    let logDetailRecipientFilter = '';
    let logDetailRecipientPage = 1;

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

    function sourceLabel(source) {
      const key = String(source || '').trim().toLowerCase();
      if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
      if (!key) return 'Sitio';
      return key.charAt(0).toUpperCase() + key.slice(1);
    }

    function fmtTimestamp(value) {
      if (!value) return '—';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '—';
      return date.toLocaleString('es-AR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    }

    function fmtDateOnly(value) {
      if (!value) return '—';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '—';
      return date.toLocaleDateString('es-AR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
      });
    }

    function fmtWeekdayName(value) {
      if (!value) return '—';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '—';
      const weekday = date.toLocaleDateString('es-AR', { weekday: 'long' });
      return weekday ? weekday.charAt(0).toUpperCase() + weekday.slice(1) : '—';
    }

    function newsletterItemDayLabel(item) {
      return fmtWeekdayName(item?.modificadoEn || item?.creadoEn || item?.inscripcionFechaHasta || null);
    }

    function newsletterItemUnitLabel(item) {
      const fromArray = Array.isArray(item?.unidadesAcademicas)
        ? item.unidadesAcademicas.map((v) => String(v || '').trim()).filter(Boolean)
        : [];
      const joined = fromArray.join(', ');
      const single = String(item?.unidadAcademica || '').trim();
      return joined || single || '—';
    }

    function previewCell(value, {
      align = 'center',
      leftPadding = 0,
      padLeft = null,
      padRight = null,
    } = {}) {
      const raw = String(value ?? '').trim();
      const display = raw || '—';
      const isDash = display === '—';
      const textAlign = isDash ? 'center' : align;
      const leftPadStyle = Number.isFinite(padLeft) ? `;padding-left:${padLeft}px` : '';
      const rightPadStyle = Number.isFinite(padRight) ? `;padding-right:${padRight}px` : '';
      const textPadStyle = (!isDash && align === 'left' && leftPadding > 0) ? `;padding-left:${leftPadding}px` : '';
      return `<td style="text-align:${textAlign}${leftPadStyle}${rightPadStyle}${textPadStyle}">${esc(display)}</td>`;
    }

    function renderDarkTh(content, align = 'center') {
      return `<th style="${DARK_TH_BASE_STYLE};text-align:${align}">${content}</th>`;
    }

    function fmtDayMonthShort(value) {
      if (!value) return '—';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '—';
      const raw = date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }).toLowerCase();
      const cleaned = raw.replace('.', '').replace(/\s+/g, '/');
      return cleaned;
    }

    function fmtTimeAmPm(value) {
      if (!value) return '—';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '—';
      return date.toLocaleTimeString('es-AR', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
      });
    }

    function dispatchSummaryLine(label, dispatch) {
      if (!dispatch || !dispatch.runAt) return `${label}: —`;
      const start = fmtDayMonthShort(dispatch.windowStart || dispatch.runAt);
      const end = fmtDayMonthShort(dispatch.windowEnd || dispatch.runAt);
      const sentDay = fmtDayMonthShort(dispatch.runAt);
      const sentTime = fmtTimeAmPm(dispatch.runAt);
      return `${label}: ${start} - ${end} - enviado ${sentDay}, ${sentTime}`;
    }

    function dateValue(value) {
      const ts = Date.parse(value || '');
      return Number.isFinite(ts) ? ts : 0;
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

    function filteredRows() {
      const rows = cache.data || [];
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

    function renderSummaryCards(summary, logsSummary) {
      return `<div class="stats" style="margin-bottom:14px">
        <div class="sc">
          <div class="sv">${Number(summary.total || 0)}</div>
          <div class="sl">Suscriptores</div>
          <div style="font-size:.74rem;color:var(--tx2);margin-top:6px">Base total de contactos.</div>
        </div>
        <div class="sc">
          <div class="sv">${Number(summary.active || 0)}</div>
          <div class="sl">Activos</div>
          <div style="font-size:.74rem;color:var(--tx2);margin-top:6px">Reciben envíos automáticos y manuales.</div>
        </div>
        <div class="sc">
          <div class="sv">${Number(summary.inactive || 0)}</div>
          <div class="sl">Inactivos</div>
          <div style="font-size:.74rem;color:var(--tx2);margin-top:6px">Excluidos de envíos.</div>
        </div>
        <div class="sc">
          <div class="sv">${Number(logsSummary.total || (cache.dispatchLog || []).length || 0)}</div>
          <div class="sl">Envíos registrados</div>
          <div style="font-size:.74rem;color:var(--tx2);margin-top:6px">Historial consolidado de ejecución.</div>
        </div>
      </div>`;
    }

    function previewSelectedCount() {
      if (!cache.preview?.diff) return 0;
      return [...previewSelection].length;
    }

    function getManualSendContext() {
      const total = Number(cache.preview?.diff?.total || 0);
      const selected = previewSelectedCount();
      const excluded = Math.max(0, total - selected);
      const isCustomMode = recipientMode === 'custom';
      const selectedRecipients = recipientSelectionCount();
      const allActiveRecipients = Number(cache.summary?.active || 0);
      const canSendByContent = selected > 0;
      const canSendByRecipients = !isCustomMode || selectedRecipients > 0;
      const canSend = canSendByContent && canSendByRecipients;
      const blockedReason = !canSendByContent
        ? 'Seleccioná al menos una novedad para habilitar el envío manual.'
        : (!canSendByRecipients
          ? 'Seleccioná al menos un correo en “Seleccionar correos”.'
          : '');
      return {
        total,
        selected,
        excluded,
        isCustomMode,
        selectedRecipients,
        allActiveRecipients,
        canSend,
        blockedReason,
      };
    }

    function normalizeEmail(value) {
      return String(value || '').trim().toLowerCase();
    }

    function allPreviewKeys() {
      const diff = cache.preview?.diff || {};
      const out = [];
      Object.keys(SECTION_TITLES).forEach((section) => {
        const rows = Array.isArray(diff[section]) ? diff[section] : [];
        rows.forEach((item) => {
          if (item?._key) out.push(String(item._key));
        });
      });
      return out;
    }

    function ensurePreviewSelection() {
      const keys = allPreviewKeys();
      if (!keys.length) {
        previewSelection = new Set();
        return;
      }
      if (!previewLoadedAt) {
        previewSelection = new Set(keys);
        return;
      }
      const next = new Set();
      keys.forEach((key) => {
        if (previewSelection.has(key)) next.add(key);
      });
      previewSelection = next;
    }

    function ensureRecipientSelection() {
      const available = new Set(recipientOptions.map((email) => normalizeEmail(email)).filter(Boolean));
      const next = new Set();
      recipientSelection.forEach((email) => {
        const key = normalizeEmail(email);
        if (available.has(key)) next.add(key);
      });
      recipientSelection = next;
    }

    function recipientSelectionCount() {
      return [...recipientSelection].length;
    }

    function filteredRecipientOptions() {
      const q = normalizeEmail(recipientSearch);
      if (!q) return recipientOptions;
      return recipientOptions.filter((email) => normalizeEmail(email).includes(q));
    }

    function bindOverviewInteractiveEvents() {
      const searchInput = document.getElementById('nwl-recipient-search');
      if (searchInput && searchInput.dataset.bound !== '1') {
        searchInput.dataset.bound = '1';
        searchInput.addEventListener('input', (e) => {
          recipientSearch = e.target.value || '';
          const start = Number.isFinite(e.target.selectionStart) ? e.target.selectionStart : null;
          const end = Number.isFinite(e.target.selectionEnd) ? e.target.selectionEnd : null;
          rerenderPreviewPanel({ focusRecipientSearch: true, selectionStart: start, selectionEnd: end });
        });
      }
    }

    function setSendProgressState({
      visible = false, pct = 0, label = '', color = 'var(--cy)', result = '', resultTone = 'var(--tx2)',
    } = {}) {
      const wrap = document.getElementById('nwl-send-progress');
      if (!wrap) return;
      wrap.style.display = visible ? 'block' : 'none';

      const bar = document.getElementById('nwl-sp-bar');
      const lbl = document.getElementById('nwl-sp-lbl');
      const pctEl = document.getElementById('nwl-sp-pct');
      const resultEl = document.getElementById('nwl-sp-result');

      if (bar) {
        bar.style.width = `${Math.max(0, Math.min(100, Number(pct || 0)))}%`;
        bar.style.background = color;
      }
      if (lbl) lbl.textContent = label || '';
      if (pctEl) pctEl.textContent = `${Math.max(0, Math.min(100, Number(pct || 0)))}%`;
      if (resultEl) {
        resultEl.textContent = result || '';
        resultEl.style.color = resultTone;
      }
    }

    function renderRecipientPicker() {
      const modeAll = recipientMode === 'all';
      const selectedTotal = recipientSelectionCount();
      const filtered = filteredRecipientOptions();
      return `<div class="tw" style="padding:12px;border:1px solid var(--bd);margin-bottom:12px">
        <div style="font-size:.9rem;font-weight:700;color:var(--tx);margin-bottom:10px">Destinatarios</div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
          <label style="display:flex;align-items:center;gap:6px;font-size:.86rem;color:var(--tx);cursor:pointer">
            <input type="radio" name="nwl-recipient-mode" ${modeAll ? 'checked' : ''} onchange="setNewsletterRecipientMode('all')" style="accent-color:var(--cy)" />
            Enviar a todos
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:.86rem;color:var(--tx);cursor:pointer">
            <input type="radio" name="nwl-recipient-mode" ${!modeAll ? 'checked' : ''} onchange="setNewsletterRecipientMode('custom')" style="accent-color:var(--cy)" />
            Seleccionar correos
          </label>
        </div>
        ${modeAll
          ? `<div class="alr alr-info" style="margin-bottom:0;padding:10px 12px">Se enviará a todos los suscriptores activos.</div>`
          : `<div>
              <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
                <div class="sb2" style="min-width:220px;max-width:360px">🔍 <input type="text" id="nwl-recipient-search" placeholder="Buscar correo..." value="${esc(recipientSearch || '')}" /></div>
                <div class="tr2">
                  <button class="btn btn-ol btn-sm" style="min-width:138px;justify-content:center" onclick="newsletterRecipientsSelectFiltered()">Seleccionar visibles</button>
                  <button class="btn btn-ol btn-sm" style="min-width:130px;justify-content:center" onclick="newsletterRecipientsClear()">Limpiar selección</button>
                </div>
              </div>
              <div style="font-size:.82rem;color:var(--tx2);margin-bottom:8px">Correos seleccionados: <strong>${selectedTotal}</strong></div>
              <div class="tw" style="max-height:180px;overflow:auto;border-radius:10px">
                ${filtered.length
                  ? `<table style="width:100%;table-layout:fixed">
                      <colgroup><col style="width:14%"><col style="width:86%"></colgroup>
                      <thead><tr>${renderDarkTh('USAR')}${renderDarkTh('CORREO')}</tr></thead>
                      <tbody>
                        ${filtered.map((email) => {
                          const key = normalizeEmail(email);
                          const checked = recipientSelection.has(key);
                          return `<tr class="${checked ? '' : 'row-finalizada'}">
                            <td style="text-align:center"><input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleNewsletterRecipient('${esc(key)}', this.checked)" style="accent-color:var(--cy);width:15px;height:15px"></td>
                            <td style="text-align:left;padding-left:16px">${esc(email)}</td>
                          </tr>`;
                        }).join('')}
                      </tbody>
                    </table>`
                  : '<div class="empty" style="padding:16px 0"><p>Sin resultados para la búsqueda actual.</p></div>'}
              </div>
            </div>`}
      </div>`;
    }

    function renderPreviewPanel(me) {
      const preview = cache.preview;
      if (!preview || !preview.diff) {
        return `<div class="tw" style="padding:14px;margin-bottom:14px">
          <div style="font-size:.95rem;font-weight:700;color:var(--tx);margin-bottom:8px">Novedades detectadas</div>
          <div class="empty" style="padding:18px 0">
            <div class="ei">📰</div>
            <p>No hay novedades para enviar en este momento.</p>
          </div>
        </div>`;
      }
      ensurePreviewSelection();
      const ctx = getManualSendContext();
      const {
        total, selected, excluded, canSend,
      } = ctx;
      const rowsBySection = Object.keys(SECTION_TITLES).map((section) => {
        const items = Array.isArray(preview.diff[section]) ? preview.diff[section] : [];
        if (!items.length) return '';
        return `<div class="tw" style="padding:8px 10px 10px;margin-bottom:10px;border:1px solid var(--bd);background:#fff">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px">
            <div style="font-size:.84rem;font-weight:700;color:var(--tx)">${SECTION_TITLES[section]}</div>
            <span style="margin-left:auto;display:block;text-align:right;font-size:.8rem;color:var(--tx2)">${items.length} ${items.length === 1 ? 'item' : 'items'}</span>
          </div>
          <div class="tw" style="border-radius:10px;overflow:hidden;border:1px solid var(--bd)">
            <table style="width:100%;table-layout:fixed">
              <colgroup>
                <col style="width:6%">
                <col style="width:14%">
                <col style="width:15%">
                <col style="width:23%">
                <col style="width:42%">
              </colgroup>
              <thead><tr>
                ${renderDarkTh('ENVIAR')}
                ${renderDarkTh('CREADA')}
                ${renderDarkTh('TIPO')}
                ${renderDarkTh('UNIDAD ACADÉMICA')}
                ${renderDarkTh('PROPUESTA FORMATIVA')}
              </tr></thead>
              <tbody>
                ${items.map((item) => {
                  const checked = previewSelection.has(String(item._key));
                  const createdLabel = newsletterItemDayLabel(item);
                  const tipoLabel = item.esCurso ? 'Curso' : (item.tipo || 'Carrera');
                  const unitLabel = newsletterItemUnitLabel(item);
                  return `<tr class="${checked ? '' : 'row-finalizada'}" style="${checked ? 'background:#f6fbff' : ''}">
                    <td style="text-align:center"><input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleNewsletterPreviewItem('${esc(String(item._key))}', this.checked)" style="accent-color:var(--cy);width:15px;height:15px"></td>
                    ${previewCell(createdLabel, { align: 'left', leftPadding: 10 })}
                    ${previewCell(tipoLabel, { align: 'left', leftPadding: 10 })}
                    ${previewCell(unitLabel, { align: 'left', leftPadding: 10 })}
                    ${previewCell(item.nombre || '', { align: 'left', leftPadding: 10 })}
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>`;
      }).join('');

      return `<div class="tw" style="padding:14px;margin-bottom:14px">
        <div style="font-size:.95rem;font-weight:700;color:var(--tx);margin-bottom:10px">Novedades detectadas</div>
        <div style="font-size:.78rem;color:var(--tx2);margin-bottom:10px">Período evaluado: lunes 00:00 (AR) a ahora.</div>
        ${rowsBySection || '<div class="empty" style="padding:20px 0"><div class="ei">📭</div><p>Sin novedades para mostrar.</p></div>'}

        <div class="tw" style="padding:12px;margin:10px 0;border:1px solid var(--bd);background:#fff">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
            <div style="font-size:.9rem;font-weight:700;color:var(--tx)">Selección</div>
            <div class="tr2">
              <button class="btn btn-ol btn-sm" style="min-width:132px;justify-content:center" onclick="newsletterPreviewSelectAll()">Seleccionar todo</button>
              <button class="btn btn-ol btn-sm" style="min-width:132px;justify-content:center" onclick="newsletterPreviewClearSelection()">Limpiar selección</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px">
            <div><div style="font-size:.72rem;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;font-weight:700">Detectadas</div><div style="font-size:.95rem;font-weight:700;color:var(--tx);margin-top:2px">${total}</div></div>
            <div><div style="font-size:.72rem;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;font-weight:700">Seleccionadas</div><div style="font-size:.95rem;font-weight:700;color:var(--tx);margin-top:2px">${selected}</div></div>
            <div><div style="font-size:.72rem;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;font-weight:700">Excluidas</div><div style="font-size:.95rem;font-weight:700;color:var(--tx);margin-top:2px">${excluded}</div></div>
          </div>
        </div>

        <div class="tw" style="padding:12px;border:1px solid var(--bd);background:#fff">
          <div style="font-size:.9rem;font-weight:700;color:var(--tx);margin-bottom:8px">Acción de envío</div>
          ${me.rol === 'root' ? renderRecipientPicker() : ''}
          <div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;flex-wrap:wrap">
            ${me.rol === 'root'
              ? `<button id="nwl-send-btn" class="btn btn-cy" onclick="sendNewsletterDigestNow()" ${canSend ? '' : 'disabled'} style="font-weight:700;min-width:132px;justify-content:center">Enviar</button>`
              : ''}
          </div>
          <div id="nwl-send-progress" style="display:none;margin-top:10px;padding:14px 18px;background:var(--ev);border-radius:var(--r);border:1px solid var(--bd)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">
              <span style="font-size:.8rem;font-weight:600;color:var(--tx2)" id="nwl-sp-lbl">Preparando…</span>
              <span style="font-size:.78rem;color:var(--mt)" id="nwl-sp-pct">0%</span>
            </div>
            <div style="height:7px;background:var(--bd);border-radius:4px;overflow:hidden">
              <div id="nwl-sp-bar" style="height:100%;width:0%;background:var(--cy);border-radius:4px;transition:width .2s ease"></div>
            </div>
            <div id="nwl-sp-result" style="margin-top:8px;font-size:.8rem;color:var(--tx2)"></div>
          </div>
        </div>
      </div>`;
    }

    function renderTable() {
      const rows = filteredRows();
      const visible = pagedRows(rows, page, pageSize);
      const total = rows.length;
      const recordsLabel = `Se encontraron ${total} suscriptor${total === 1 ? '' : 'es'}.`;
      const footer = `<div class="records-count">${recordsLabel}</div>`;

      if (!visible.length) {
        return `<div class="empty"><div class="ei">📭</div><p>No hay suscriptores para los filtros seleccionados.</p><p style="font-size:.82rem;color:var(--tx2);margin-top:8px">Probá limpiar filtros o agregar contactos desde Data Exchange.</p></div>${footer}`;
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
          ${renderDarkTh(sortHead('CORREO ELECTRÓNICO', 'email'))}
          ${renderDarkTh(sortHead('ORIGEN', 'origen'))}
          ${renderDarkTh(sortHead('ESTADO', 'estado'))}
          ${renderDarkTh(sortHead('FECHA ALTA', 'fechaAlta'))}
          ${renderDarkTh(sortHead('ÚLTIMO ENVÍO', 'ultimoEnvio'))}
          ${renderDarkTh('ACCIONES')}
        </tr></thead>
        <tbody>${visible.map((r) => `<tr class="${r.activo ? '' : 'row-finalizada'}">
          <td style="padding-left:24px">${esc(r.email)}</td>
          <td style="text-align:center">${esc(sourceLabel(r.source))}</td>
          <td style="text-align:center">${r.activo ? 'Activo' : 'Inactivo'}</td>
          <td style="text-align:center">${esc(fmtDateOnly(r.fechaAlta || r.actualizadoEn))}</td>
          <td style="text-align:center">${r.ultimoEnvio ? esc(fmtTimestamp(r.ultimoEnvio)) : '—'}</td>
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
        return `<div class="empty"><div class="ei">🧾</div><p>No hay registros de envío para los filtros seleccionados.</p><p style="font-size:.82rem;color:var(--tx2);margin-top:8px">Cuando se ejecute un envío, el historial quedará disponible aquí.</p></div>${footer}`;
      }

      return `<div class="tw" style="font-size:.85rem"><table style="width:100%;table-layout:fixed">
        <colgroup>
          <col style="width:22%">
          <col style="width:12%">
          <col style="width:16%">
          <col style="width:12%">
          <col style="width:12%">
          <col style="width:12%">
          <col style="width:14%">
        </colgroup>
        <thead><tr>
          ${renderDarkTh(sortLogHead('Timestamp', 'runAt'))}
          ${renderDarkTh(sortLogHead('TIPO', 'dispatchType'))}
          ${renderDarkTh(sortLogHead('ESTADO', 'status'))}
          ${renderDarkTh(sortLogHead('DESTINATARIOS', 'recipientsTotal'))}
          ${renderDarkTh(sortLogHead('ENVIADOS', 'sentCount'))}
          ${renderDarkTh(sortLogHead('FALLIDOS', 'failCount'))}
          ${renderDarkTh('DETALLE')}
        </tr></thead>
        <tbody>${visible.map((r) => `<tr>
          <td style="text-align:left;padding-left:18px">${esc(fmtTimestamp(r.runAt))}</td>
          <td style="text-align:center">${esc(r.dispatchType === 'manual' ? 'Manual' : 'Automático')}</td>
          <td style="text-align:center">${esc(r.status || '—')}</td>
          <td style="text-align:center">${Number(r.recipientsTotal || 0)}</td>
          <td style="text-align:center">${Number(r.sentCount || 0)}</td>
          <td style="text-align:center">${Number(r.failCount || 0)}</td>
          <td style="text-align:center"><button class="btn btn-ol btn-sm" title="Ver detalle" onclick="openNewsletterLogDetail(${Number(r.id || 0)})">👁</button></td>
        </tr>`).join('')}</tbody>
      </table></div>${footer}${renderPagination(total, logPage, logPageSize, 'setNewsletterLogPage')}`;
    }

    function detailRecipientRows() {
      const recipients = Array.isArray(activeLogDetail?.recipients) ? activeLogDetail.recipients : [];
      const q = String(logDetailRecipientFilter || '').trim().toLowerCase();
      let rows = recipients;
      if (q) rows = rows.filter((row) => String(row.email || '').toLowerCase().includes(q));
      return rows;
    }

    function renderLogDetailView() {
      const detail = activeLogDetail;
      if (!detail) {
        return '<div class="empty"><div class="ei">⚠️</div><p>No se encontró el detalle de este envío.</p><p style="font-size:.82rem;color:var(--tx2);margin-top:8px">Volvé al listado y reintentá desde el registro correspondiente.</p></div>';
      }
      const rows = detailRecipientRows();
      const pageSizeDetail = 10;
      const totalPages = Math.max(1, Math.ceil(rows.length / pageSizeDetail));
      const currentPage = Math.min(Math.max(1, logDetailRecipientPage), totalPages);
      const start = (currentPage - 1) * pageSizeDetail;
      const visible = rows.slice(start, start + pageSizeDetail);
      const newsCount = Number(detail?.diff?.total || detail?.sections?.total || 0);

      const recipientsTable = visible.length
        ? `<div class="tw" style="font-size:.85rem"><table style="width:100%;table-layout:fixed">
            <colgroup>
              <col style="width:40%">
              <col style="width:30%">
              <col style="width:15%">
              <col style="width:15%">
            </colgroup>
            <thead><tr>
              ${renderDarkTh('CORREO')}
              ${renderDarkTh('TIMESTAMP ENVÍO')}
              ${renderDarkTh('NOTICIAS')}
              ${renderDarkTh('ESTADO')}
            </tr></thead>
            <tbody>${visible.map((row) => `<tr>
              <td style="padding-left:24px">${esc(row.email || '')}</td>
              <td style="text-align:center">${esc(fmtTimestamp(row.sentAt || detail.runAt))}</td>
              <td style="text-align:center">${Number(row.newsCount || newsCount)}</td>
              <td style="text-align:center">${esc(row.status || '—')}</td>
            </tr>`).join('')}</tbody>
          </table></div>${renderPagination(rows.length, currentPage, String(pageSizeDetail), 'setNewsletterDetailRecipientPage')}`
        : '<div class="empty"><div class="ei">📭</div><p>No hay destinatarios para este filtro.</p><p style="font-size:.82rem;color:var(--tx2);margin-top:8px">Ajustá la búsqueda para ver más resultados.</p></div>';

      return `
        <div class="tb" style="margin-bottom:10px">
          <div class="tr2">
            <button class="btn btn-ol" onclick="closeNewsletterLogDetail()">← Volver a Envíos</button>
          </div>
          <div class="tr2" style="font-size:.84rem;color:var(--tx2)">
            <span><strong>Timestamp:</strong> ${esc(fmtTimestamp(detail.runAt))}</span>
            <span><strong>Tipo:</strong> ${esc(detail.dispatchType === 'manual' ? 'Manual' : 'Automático')}</span>
            <span><strong>Estado:</strong> ${esc(detail.status || '—')}</span>
          </div>
        </div>

        <div class="tw" style="padding:14px;margin-bottom:14px">
          <div style="font-size:.9rem;font-weight:700;color:var(--tx);margin-bottom:10px">Newsletter enviado</div>
          ${detail.newsletterHtml
            ? `<iframe title="Newsletter enviado" sandbox="allow-same-origin" style="width:100%;min-height:520px;border:1px solid var(--bd);border-radius:10px;background:#fff" srcdoc="${esc(detail.newsletterHtml)}"></iframe>`
            : '<div class="empty" style="padding:20px 0"><div class="ei">📰</div><p>Este envío no tiene contenido HTML almacenado.</p></div>'}
        </div>

        <div class="tw" style="padding:14px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
            <div style="font-size:.9rem;font-weight:700;color:var(--tx)">Destinatarios y noticias enviadas</div>
            <div class="sb2" style="max-width:300px">🔍 <input type="text" id="nwl-detail-recipient-search" placeholder="Buscar por correo..." value="${esc(logDetailRecipientFilter || '')}" /></div>
          </div>
          ${recipientsTable}
        </div>`;
    }

    function rerenderContactsTable() {
      const wrap = document.getElementById('nwl-table-wrap');
      if (wrap) wrap.innerHTML = renderTable();
    }

    function rerenderLogsTable() {
      const wrap = document.getElementById('nwl-log-table-wrap');
      if (wrap) wrap.innerHTML = renderLogTable();
    }

    function buildSubscriptionQueryParams() {
      const q = new URLSearchParams();
      if (filters.q) q.set('q', filters.q);
      if (filters.status) q.set('status', filters.status);
      if (filters.source) q.set('source', filters.source);
      if (filters.dateMode === 'exact' && filters.dateExact) q.set('lastSentDate', filters.dateExact);
      if (filters.dateMode === 'range') {
        if (filters.dateFrom) q.set('lastSentFrom', filters.dateFrom);
        if (filters.dateTo) q.set('lastSentTo', filters.dateTo);
      }
      return q;
    }

    async function loadData() {
      const q = buildSubscriptionQueryParams();
      const [subs, logs] = await Promise.all([
        callApi(`/newsletter/subscriptions?${q.toString()}`),
        callApi('/newsletter/logs').catch(() => ({ data: [] })),
      ]);

      return {
        data: Array.isArray(subs?.data) ? subs.data : [],
        summary: subs?.summary || {},
        digest: subs?.digest || {},
        sourceOptions: Array.isArray(subs?.sourceOptions) ? subs.sourceOptions : [],
        dispatchLog: Array.isArray(logs?.data) && logs.data.length ? logs.data : (Array.isArray(subs?.dispatchLog) ? subs.dispatchLog : []),
        logsSummary: logs?.summary || {},
        unavailable: false,
      };
    }

    async function loadManualPreview(requestSeq) {
      try {
        // Siempre usar API admin canónica: /admin/api/newsletter/preview-manual
        const resp = await api('/newsletter/preview-manual');
        if (requestSeq !== overviewRequestSeq) return;
        cache.preview = resp?.preview || null;
        previewLoadedAt = new Date().toISOString();
      } catch (error) {
        console.error('[newsletter] Error cargando preview manual', error);
        if (requestSeq !== overviewRequestSeq) return;
        cache.preview = null;
        previewLoadedAt = null;
      }
    }

    async function loadActiveRecipients(requestSeq) {
      try {
        const resp = await api('/newsletter/subscriptions?status=active');
        if (requestSeq !== overviewRequestSeq) return;
        const rows = Array.isArray(resp?.data) ? resp.data : [];
        recipientOptions = rows
          .map((row) => normalizeEmail(row?.email))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'es'));
        ensureRecipientSelection();
      } catch (error) {
        console.error('[newsletter] Error cargando destinatarios manuales', error);
        if (requestSeq !== overviewRequestSeq) return;
        recipientOptions = [];
        recipientSelection = new Set();
      }
    }

    function renderSubscribersSection() {
      const sourceOptions = Array.isArray(cache.sourceOptions) ? cache.sourceOptions : [];
      return `
        <div class="tb">
          <div class="tr2" style="width:100%;justify-content:space-between;gap:10px;align-items:flex-end">
            <div style="display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;flex:1;min-width:280px">
              <div class="sb2" style="min-width:220px;max-width:320px">🔍 <input type="text" id="nwl-search" placeholder="Buscar por correo..." value="${esc(filters.q || '')}"/></div>
              <select class="fsel" id="nwl-status">
                <option value="">Estado: todos</option>
                <option value="active" ${filters.status === 'active' ? 'selected' : ''}>Activos</option>
                <option value="inactive" ${filters.status === 'inactive' ? 'selected' : ''}>Inactivos</option>
              </select>
              <select class="fsel" id="nwl-source">
                <option value="">Origen: todos</option>
                ${sourceOptions.map((opt) => `<option value="${esc(opt)}" ${String(filters.source || '') === String(opt) ? 'selected' : ''}>${esc(sourceLabel(opt))}</option>`).join('')}
              </select>
              <select class="fsel" id="nwl-date-mode">
                <option value="" ${filters.dateMode === '' ? 'selected' : ''}>Último envío: todos</option>
                <option value="exact" ${filters.dateMode === 'exact' ? 'selected' : ''}>Fecha específica</option>
                <option value="range" ${filters.dateMode === 'range' ? 'selected' : ''}>Rango</option>
              </select>
              ${filters.dateMode === 'exact'
                ? `<input class="fsel" id="nwl-date-exact" type="date" value="${esc(filters.dateExact || '')}" title="Último envío - fecha exacta" />`
                : ''}
              ${filters.dateMode === 'range'
                ? `<input class="fsel" id="nwl-date-from" type="date" value="${esc(filters.dateFrom || '')}" title="Último envío - desde" />`
                : ''}
              ${filters.dateMode === 'range'
                ? `<input class="fsel" id="nwl-date-to" type="date" value="${esc(filters.dateTo || '')}" title="Último envío - hasta" />`
                : ''}
            </div>
            <div class="tr2">
              <select class="fsel" id="nwl-limit">
                <option value="10" ${pageSize === '10' ? 'selected' : ''}>10</option>
                <option value="20" ${pageSize === '20' ? 'selected' : ''}>20</option>
                <option value="all" ${pageSize === 'all' ? 'selected' : ''}>Todos</option>
              </select>
              <button class="btn btn-ol" id="btn-clear-newsletter-filters" title="Limpiar filtros" style="min-width:150px;justify-content:center">Limpiar filtros</button>
              <button class="btn btn-ol" id="btn-export-newsletter" title="Exportar base .xlsx" style="min-width:150px;justify-content:center">Exportar Excel</button>
            </div>
          </div>
        </div>
        <div id="nwl-table-wrap">${renderTable()}</div>`;
    }

    function renderDataExchangeSection() {
      return `
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
      if (activeLogDetail) return renderLogDetailView();
      return `
        <div style="margin-top:4px" class="tb">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%">
            <div style="font-size:.9rem;font-weight:700;color:var(--tx)">LOGS</div>
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
      const requestSeq = ++overviewRequestSeq;
      const me = getMe();
      const ct = document.getElementById('ct');
      if (!me) {
        ct.innerHTML = '<div class="empty"><div class="ei">🔒</div><p>Sesión expirada.</p></div>';
        return;
      }

      ct.innerHTML = '<div class="empty"><div class="ei">⏳</div></div>';
      try {
        cache = { ...cache, ...(await loadData()) };
        if (requestSeq !== overviewRequestSeq) return;
        if (activeView === 'overview') {
          cache.preview = null;
          await loadActiveRecipients(requestSeq);
          if (requestSeq !== overviewRequestSeq) return;
          await loadManualPreview(requestSeq);
          if (requestSeq !== overviewRequestSeq) return;
          if (cache.preview?.diff) {
            const keys = allPreviewKeys();
            previewSelection = previewSelection.size ? new Set([...previewSelection].filter((k) => keys.includes(k))) : new Set(keys);
          }
        }
      } catch (e) {
        ct.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>${esc(e.message || 'No se pudo cargar Newsletter')}</p></div>`;
        return;
      }

      const summary = cache.summary || {};
      const showOverview = activeView === 'overview';
      const showSubscribers = activeView === 'subscribers';
      const showSends = activeView === 'sends';
      const showData = activeView === 'data';

      ct.innerHTML = `
        ${showOverview ? `<div id="nwl-preview-panel-wrap">${renderPreviewPanel(me)}</div>` : ''}
        ${showSubscribers ? renderSubscribersSection() : ''}
        ${showSends ? renderDispatchSection() : ''}
        ${showData ? renderDataExchangeSection() : ''}
      `;

      document.getElementById('nwl-search')?.addEventListener('input', (e) => {
        filters.q = e.target.value || '';
        page = 1;
        rnwl(activeView);
      });
      document.getElementById('nwl-status')?.addEventListener('change', (e) => {
        filters.status = e.target.value || '';
        page = 1;
        rnwl(activeView);
      });
      document.getElementById('nwl-source')?.addEventListener('change', (e) => {
        filters.source = e.target.value || '';
        page = 1;
        rnwl(activeView);
      });
      document.getElementById('nwl-date-mode')?.addEventListener('change', (e) => {
        filters.dateMode = e.target.value || '';
        filters.dateExact = '';
        filters.dateFrom = '';
        filters.dateTo = '';
        page = 1;
        rnwl(activeView);
      });
      document.getElementById('nwl-date-exact')?.addEventListener('change', (e) => {
        filters.dateExact = e.target.value || '';
        page = 1;
        rnwl(activeView);
      });
      document.getElementById('nwl-date-from')?.addEventListener('change', (e) => {
        filters.dateFrom = e.target.value || '';
        page = 1;
        rnwl(activeView);
      });
      document.getElementById('nwl-date-to')?.addEventListener('change', (e) => {
        filters.dateTo = e.target.value || '';
        page = 1;
        rnwl(activeView);
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

      document.getElementById('nwl-detail-recipient-search')?.addEventListener('input', (e) => {
        logDetailRecipientFilter = e.target.value || '';
        logDetailRecipientPage = 1;
        rnwl('sends');
      });
      bindOverviewInteractiveEvents();
    }

    function setNewsletterPage(nextPage) {
      page = Math.max(1, Number(nextPage || 1));
      rerenderContactsTable();
    }

    function setNewsletterLogPage(nextPage) {
      logPage = Math.max(1, Number(nextPage || 1));
      rerenderLogsTable();
    }

    function setNewsletterDetailRecipientPage(nextPage) {
      logDetailRecipientPage = Math.max(1, Number(nextPage || 1));
      rnwl('sends');
    }

    function rerenderPreviewPanel(options = {}) {
      if (activeView !== 'overview') return;
      const ct = document.getElementById('ct');
      const me = getMe();
      if (!ct || !me) return;
      const panel = ct.querySelector('#nwl-preview-panel-wrap');
      if (panel) {
        panel.innerHTML = renderPreviewPanel(me);
        bindOverviewInteractiveEvents();
        if (options.focusRecipientSearch) {
          const input = document.getElementById('nwl-recipient-search');
          if (input) {
            input.focus();
            if (
              Number.isFinite(options.selectionStart)
              && Number.isFinite(options.selectionEnd)
            ) {
              input.setSelectionRange(options.selectionStart, options.selectionEnd);
            }
          }
        }
      }
      else rnwl('overview');
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
      filters = {
        q: '',
        status: '',
        source: '',
        dateMode: '',
        dateExact: '',
        dateFrom: '',
        dateTo: '',
      };
      page = 1;
      rnwl(activeView);
    }

    function clearLogFilters() {
      logFilters = { q: '', type: '' };
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
        await rnwl(activeView);
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
        await rnwl(activeView);
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
        await rnwl(activeView);
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
        await rnwl(activeView);
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
            await rnwl(activeView);
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
      if (btn) { btn.disabled = true; btn.textContent = 'Exportando...'; }
      try {
        const q = buildSubscriptionQueryParams();
        const result = await callApi(`/newsletter/subscriptions/export?${q.toString()}`);
        if (!result?.fileBase64) throw new Error('No se recibió el archivo para exportar.');
        downloadBase64File(result.fileBase64, result.filename, result.mimeType);
        toast(`Exportación completada: ${Number(result.total || 0)} registro(s).`, 'success');
      } catch (e) {
        toast(e.message || 'No se pudo exportar la base de newsletter.', 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Exportar Excel'; }
      }
    }

    function togglePreviewItem(key, checked) {
      const cleanKey = String(key || '').trim();
      if (!cleanKey) return;
      if (checked) previewSelection.add(cleanKey);
      else previewSelection.delete(cleanKey);
      rerenderPreviewPanel();
    }

    function previewSelectAll() {
      previewSelection = new Set(allPreviewKeys());
      rerenderPreviewPanel();
    }

    function previewClearSelection() {
      previewSelection = new Set();
      rerenderPreviewPanel();
    }

    function setRecipientMode(mode) {
      recipientMode = mode === 'custom' ? 'custom' : 'all';
      rerenderPreviewPanel();
    }

    function toggleRecipient(email, checked) {
      const key = normalizeEmail(email);
      if (!key) return;
      if (checked) recipientSelection.add(key);
      else recipientSelection.delete(key);
      rerenderPreviewPanel();
    }

    function recipientsSelectFiltered() {
      filteredRecipientOptions().forEach((email) => recipientSelection.add(normalizeEmail(email)));
      rerenderPreviewPanel();
    }

    function recipientsClear() {
      recipientSelection = new Set();
      rerenderPreviewPanel();
    }

    async function sendDigestNow() {
      const me = getMe();
      if (me?.rol !== 'root') return;
      const selectedKeys = [...previewSelection];
      const selectedEmails = recipientMode === 'custom'
        ? [...recipientSelection].map((email) => normalizeEmail(email)).filter(Boolean)
        : null;
      const payload = {
        selectedKeys,
        recipientMode: recipientMode === 'custom' ? 'custom' : 'all',
      };
      if (Array.isArray(selectedEmails)) payload.selectedEmails = selectedEmails;
      const ctx = getManualSendContext();
      if (!ctx.canSend) {
        toast(ctx.blockedReason || 'No se puede ejecutar el envío manual en este estado.', 'info');
        return;
      }
      const btn = document.getElementById('nwl-send-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
      setSendProgressState({
        visible: true,
        pct: 8,
        label: 'Preparando envío...',
        color: 'var(--cy)',
        result: '',
        resultTone: 'var(--tx2)',
      });

      let progressPct = 8;
      const progressTimer = setInterval(() => {
        progressPct = Math.min(progressPct + 7, 82);
        let label = 'Preparando envío...';
        if (progressPct >= 25 && progressPct < 55) label = 'Validando selección...';
        if (progressPct >= 55) label = 'Enviando novedades...';
        setSendProgressState({
          visible: true,
          pct: progressPct,
          label,
          color: 'var(--cy)',
        });
      }, 220);

      try {
        const result = await callApi('/newsletter/send', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        clearInterval(progressTimer);
        setSendProgressState({
          visible: true,
          pct: 100,
          label: 'Envío completado',
          color: 'var(--gr)',
        });
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
        const summaryLabel = `Resultado del envío manual: enviados ${sentCount}, fallidos ${failCount}, destinatarios ${recipientsTotal}, novedades ${diffTotal}.`;
        setSendProgressState({
          visible: true,
          pct: 100,
          label: 'Envío completado',
          color: failCount > 0 ? 'var(--or)' : 'var(--gr)',
          result: `Envío ${failCount > 0 ? 'finalizado con incidencias' : 'exitoso'}: enviados ${sentCount}, fallidos ${failCount}.`,
          resultTone: failCount > 0 ? 'var(--or)' : 'var(--gr)',
        });
        toast(`${summaryLabel} ${changesLabel}`, sentCount > 0 ? 'success' : 'info');
        previewSelection = new Set();
        await rnwl('overview');
      } catch (e) {
        clearInterval(progressTimer);
        const msg = String(e?.message || 'Error al enviar el digest.');
        if (msg.toLowerCase().includes('no hay novedades')) toast(msg, 'info');
        else toast(msg, 'error');
        setSendProgressState({
          visible: true,
          pct: 100,
          label: 'Error en el envío',
          color: 'var(--rd)',
          result: msg,
          resultTone: 'var(--rd)',
        });
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar'; }
      }
    }

    async function openNewsletterLogDetail(id) {
      const logId = Number.parseInt(String(id || ''), 10);
      if (!Number.isFinite(logId)) return;
      try {
        const resp = await callApi(`/newsletter/logs?id=${logId}`);
        // Compatibilidad: algunos clientes asumían un sobre extra `data`,
        // pero el backend actual responde `{ data, detail }` en primer nivel.
        const payload = (resp && typeof resp === 'object')
          ? (resp?.data?.data || resp?.data?.detail ? resp.data : resp)
          : null;
        const data = payload?.data || null;
        const detail = payload?.detail || {};
        if (!data) throw new Error('No se encontró detalle para este envío.');
        activeLogDetail = {
          ...data,
          recipients: Array.isArray(detail.recipients) ? detail.recipients : [],
          diff: detail.diff || data.diff || null,
          sections: detail.sections || data.sections || null,
          newsletterHtml: detail.newsletterHtml || data.newsletterHtml || '',
        };
        logDetailRecipientFilter = '';
        logDetailRecipientPage = 1;
        rnwl('sends');
      } catch (e) {
        toast(e.message || 'No se pudo abrir el detalle del envío.', 'error');
      }
    }

    function closeNewsletterLogDetail() {
      activeLogDetail = null;
      logDetailRecipientFilter = '';
      logDetailRecipientPage = 1;
      rnwl('sends');
    }

    global.toggleNewsletterPreviewItem = togglePreviewItem;
    global.newsletterPreviewSelectAll = previewSelectAll;
    global.newsletterPreviewClearSelection = previewClearSelection;
    global.setNewsletterRecipientMode = setRecipientMode;
    global.toggleNewsletterRecipient = toggleRecipient;
    global.newsletterRecipientsSelectFiltered = recipientsSelectFiltered;
    global.newsletterRecipientsClear = recipientsClear;
    global.openNewsletterLogDetail = openNewsletterLogDetail;
    global.closeNewsletterLogDetail = closeNewsletterLogDetail;
    global.setNewsletterDetailRecipientPage = setNewsletterDetailRecipientPage;

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
