(function initCPanelNewsletter(global) {
  function createCPanelNewsletter(deps) {
    const { api, esc, fmtD, toast, getMe } = deps;
    let cache = { data: [], summary: {}, digest: {}, dispatchLog: [] };
    let filters = { q: '', status: '' };
    let page = 1;
    let pageSize = '10';
    let sortBy = 'fechaAlta';
    let sortDir = 'desc';
    let localFallbackMode = false;
    let localPendingCount = 0;

    async function fetchViaCpanel(path, opts = {}) {
      const token = sessionStorage.getItem('unam_atk');
      const method = (opts.method || 'GET').toUpperCase();
      let url = `/cpanel/api${path}`;
      if (method === 'GET') url += (url.includes('?') ? '&' : '?') + `_ts=${Date.now()}`;
      const res = await fetch(url, {
        cache: 'no-store',
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

    function loadLocalNewsletterData() {
      try {
        const raw = localStorage.getItem('unam_newsletter_emails');
        const list = JSON.parse(raw || '[]');
        if (!Array.isArray(list)) return [];
        const nowIso = new Date().toISOString();
        const dedup = new Map();
        list.forEach((entry, idx) => {
          const emailValue = typeof entry === 'string' ? entry : entry?.email;
          const fechaAltaValue = typeof entry === 'object' ? entry?.fechaAlta : null;
          const activoValue = typeof entry === 'object' ? entry?.activo !== false : true;
          const email = String(emailValue || '').trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
          if (!dedup.has(email)) {
            dedup.set(email, {
              id: idx + 1,
              email,
              source: 'local',
              activo: activoValue,
              fechaAlta: fechaAltaValue || nowIso,
              actualizadoEn: fechaAltaValue || nowIso,
              ultimoEnvio: null,
              _origin: 'local',
            });
          }
        });
        return list
          .map((entry) => (typeof entry === 'string' ? String(entry || '').trim().toLowerCase() : String(entry?.email || '').trim().toLowerCase()))
          .filter(Boolean)
          .map((email) => dedup.get(email))
          .filter(Boolean);
      } catch {
        return [];
      }
    }

    function saveLocalNewsletterData(rows) {
      try {
        const payload = (rows || [])
          .map((row) => ({
            email: String(row.email || '').trim().toLowerCase(),
            fechaAlta: row.fechaAlta || new Date().toISOString(),
            activo: row.activo !== false,
          }))
          .filter((row) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email));
        localStorage.setItem('unam_newsletter_emails', JSON.stringify(payload));
      } catch {}
    }

    function filteredRows() {
      let rows = cache.data || [];
      const q = String(filters.q || '').trim().toLowerCase();
      if (q) rows = rows.filter((r) => String(r.email || '').toLowerCase().includes(q) || String(r.source || '').toLowerCase().includes(q));
      if (filters.status === 'active') rows = rows.filter((r) => r.activo);
      if (filters.status === 'inactive') rows = rows.filter((r) => !r.activo);
      const dateValue = (value) => {
        const ts = Date.parse(value || '');
        return Number.isFinite(ts) ? ts : 0;
      };
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

    function pagedRows(rows) {
      if (pageSize === 'all') return rows;
      const size = Number(pageSize || 10) || 10;
      const start = (page - 1) * size;
      return rows.slice(start, start + size);
    }

    function toCsv(rows) {
      const header = ['correo electrónico', 'origen', 'estado', 'fecha alta', 'último envío'];
      const lines = [header.join(',')];
      rows.forEach((r) => {
        const cols = [
          r.email,
          r.source || 'sitio',
          r.activo ? 'Activo' : 'Inactivo',
          fmtD(r.fechaAlta),
          fmtD(r.ultimoEnvio),
        ].map((v) => `"${String(v || '').replace(/"/g, '""')}"`);
        lines.push(cols.join(','));
      });
      return lines.join('\n');
    }

    function exportNewsletterCsv() {
      const rows = filteredRows();
      if (!rows.length) return toast('No hay suscriptores para exportar.', 'info');
      const csv = toCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `newsletter-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    async function toggleSubscription(originRaw, id, nextActive, emailRaw) {
      const origin = decodeURIComponent(String(originRaw || 'backend'));
      const email = decodeURIComponent(String(emailRaw || '')).trim().toLowerCase();
      if (origin === 'local') {
        const localRows = loadLocalNewsletterData();
        const nextRows = localRows.map((row) => (
          String(row.email || '').trim().toLowerCase() === email
            ? { ...row, activo: !!nextActive, actualizadoEn: new Date().toISOString() }
            : row
        ));
        saveLocalNewsletterData(nextRows);
        toast(`Suscripción ${nextActive ? 'activada' : 'desactivada'}.`, 'success');
        await rnwl();
        return;
      }
      if (localFallbackMode) {
        toast('Modo local: esta acción requiere backend actualizado.', 'info');
        return;
      }
      try {
        await api(`/newsletter/subscriptions/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ activo: !!nextActive }),
        });
      } catch (e) {
        const msg = String(e?.message || '').toLowerCase();
        if (!msg.includes('endpoint no encontrado') && !msg.includes('not found')) {
          toast(e.message || 'No se pudo actualizar la suscripción.', 'error');
          return;
        }
        try {
          await fetchViaCpanel(`/newsletter/subscriptions/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ activo: !!nextActive }),
          });
        } catch (e2) {
          toast(e2.message || 'No se pudo actualizar la suscripción.', 'error');
          return;
        }
      }
      toast(`Suscripción ${nextActive ? 'activada' : 'desactivada'}.`, 'success');
      await rnwl();
    }

    async function deleteSubscription(originRaw, id, emailRaw) {
      const origin = decodeURIComponent(String(originRaw || 'backend'));
      const label = decodeURIComponent(String(emailRaw || '')).trim();
      if (!label) return;
      if (!confirm(`¿Eliminar suscripción de ${label}?`)) return;

      if (origin === 'local') {
        const allLocal = loadLocalNewsletterData();
        const next = allLocal.filter((r) => String(r.email || '').toLowerCase() !== label.toLowerCase());
        saveLocalNewsletterData(next);
        toast('Suscripción eliminada.', 'success');
        await rnwl();
        return;
      }

      try {
        await api(`/newsletter/subscriptions/${id}`, { method: 'DELETE' });
      } catch (e) {
        const msg = String(e?.message || '').toLowerCase();
        if (!msg.includes('endpoint no encontrado') && !msg.includes('not found')) {
          toast(e.message || 'No se pudo eliminar la suscripción.', 'error');
          return;
        }
        try {
          await fetchViaCpanel(`/newsletter/subscriptions/${id}`, { method: 'DELETE' });
        } catch (e2) {
          toast(e2.message || 'No se pudo eliminar la suscripción.', 'error');
          return;
        }
      }
      toast('Suscripción eliminada.', 'success');
      await rnwl();
    }

    function renderPagination(totalRows) {
      if (pageSize === 'all') return '';
      const size = Number(pageSize || 10) || 10;
      const totalPages = Math.max(1, Math.ceil(totalRows / size));
      if (page > totalPages) page = totalPages;
      const mk = (p, label = p, active = false, disabled = false) => `<button class="pb ${active ? 'active' : ''}" ${disabled ? 'disabled' : ''} onclick="setNewsletterPage(${p})">${label}</button>`;
      const buttons = [];
      buttons.push(mk(Math.max(1, page - 1), '‹', false, page <= 1));
      for (let p = 1; p <= totalPages; p += 1) buttons.push(mk(p, p, p === page, false));
      buttons.push(mk(Math.min(totalPages, page + 1), '›', false, page >= totalPages));
      return `<div class="pag">${buttons.join('')}</div>`;
    }

    function renderTable() {
      const rows = filteredRows();
      const visible = pagedRows(rows);
      const total = rows.length;
      const recordsLabel = `Se encontraron ${total} suscriptor${total === 1 ? '' : 'es'}.`;
      const footer = `<div class="records-count">${recordsLabel}</div>`;
      if (!visible.length) return `<div class="empty"><div class="ei">📭</div><p>Sin suscriptores para los filtros seleccionados.</p></div>${footer}`;

      return `<div class="tw" style="font-size:.85rem"><table style="width:100%;table-layout:fixed">
        <colgroup>
          <col style="width:32%">
          <col style="width:14%">
          <col style="width:12%">
          <col style="width:18%">
          <col style="width:14%">
          <col style="width:10%">
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
          <td style="text-align:center">${r.activo ? 'Activo' : 'Inactivo'}</td>
          <td style="text-align:center">${esc(fmtD(r.fechaAlta || r.actualizadoEn))}</td>
          <td style="text-align:center">${r.ultimoEnvio ? esc(fmtD(r.ultimoEnvio)) : '—'}</td>
          <td style="text-align:center">
            <div class="acts" style="gap:4px;justify-content:center">
              <button title="${r.activo ? 'Inactivar' : 'Activar'}" class="btn btn-sm ${r.activo ? 'btn-rd' : 'btn-ge'}" style="padding:5px 8px" onclick="toggleNewsletterSubscription('${encodeURIComponent(r._origin || 'backend')}', ${Number(r.id)}, ${r.activo ? 'false' : 'true'}, '${encodeURIComponent(r.email || '')}')">${r.activo ? '⛔' : '✅'}</button>
              <button title="Eliminar" class="btn btn-rd btn-sm" style="padding:5px 8px" onclick="deleteNewsletterSubscription('${encodeURIComponent(r._origin || 'backend')}', ${Number(r.id)}, '${encodeURIComponent(r.email || '')}')">🗑️</button>
            </div>
          </td>
        </tr>`).join('')}</tbody>
      </table></div>${footer}${renderPagination(total)}`;
    }

    function clearFilters() {
      filters = { q: '', status: '' };
      page = 1;
      rnwl();
    }

    function sortHead(label, key) {
      const isCurrent = sortBy === key;
      const indicator = isCurrent ? (sortDir === 'asc' ? '▲' : '▼') : '';
      return `<button type="button" onclick="sortNewsletterBy('${key}')" style="border:none;background:none;padding:0;margin:0;cursor:pointer;font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit;display:inline-flex;align-items:center;gap:5px">
        <span>${label}</span>
        <span style="font-size:.72rem;color:rgba(255,255,255,.65);min-width:10px">${indicator}</span>
      </button>`;
    }

    function sortNewsletterBy(key) {
      if (sortBy === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else {
        sortBy = key;
        sortDir = 'asc';
      }
      page = 1;
      const wrap = document.getElementById('nwl-table-wrap');
      if (wrap) wrap.innerHTML = renderTable();
    }

    async function loadData() {
      const q = new URLSearchParams();
      if (filters.q) q.set('q', filters.q);
      if (filters.status) q.set('status', filters.status);
      localFallbackMode = false;
      localPendingCount = 0;
      const localRows = loadLocalNewsletterData();
      try {
        const backend = await api(`/newsletter/subscriptions?${q.toString()}`);
        const backendRows = (Array.isArray(backend?.data) ? backend.data : []).map((r) => ({ ...r, _origin: 'backend' }));
        const known = new Set(backendRows.map((r) => String(r.email || '').trim().toLowerCase()));
        const pending = localRows.filter((r) => !known.has(r.email));
        localPendingCount = pending.length;
        if (pending.length) {
          return {
            ...backend,
            data: [...pending, ...backendRows],
            summary: {
              ...(backend.summary || {}),
              total: (backendRows.length + pending.length),
              active: Number((backend.summary?.active || backendRows.filter((r) => r.activo).length) + pending.length),
            },
            localPending: pending.length,
          };
        }
        return backend;
      } catch (e) {
        const msg = String(e?.message || '').toLowerCase();
        if (!msg.includes('endpoint no encontrado') && !msg.includes('not found')) throw e;
        try {
          const backend = await fetchViaCpanel(`/newsletter/subscriptions?${q.toString()}`);
          const backendRows = (Array.isArray(backend?.data) ? backend.data : []).map((r) => ({ ...r, _origin: 'backend' }));
          const known = new Set(backendRows.map((r) => String(r.email || '').trim().toLowerCase()));
          const pending = localRows.filter((r) => !known.has(r.email));
          localPendingCount = pending.length;
          if (pending.length) {
            return {
              ...backend,
              data: [...pending, ...backendRows],
              summary: {
                ...(backend.summary || {}),
                total: (backendRows.length + pending.length),
                active: Number((backend.summary?.active || backendRows.filter((r) => r.activo).length) + pending.length),
              },
              localPending: pending.length,
            };
          }
          return backend;
        } catch (e2) {
          const msg2 = String(e2?.message || '').toLowerCase();
          if (!msg2.includes('endpoint no encontrado') && !msg2.includes('not found')) throw e2;
          localFallbackMode = true;
          return {
            data: localRows,
            summary: {
              total: localRows.length,
              active: localRows.length,
              inactive: 0,
            },
            digest: {},
            dispatchLog: [],
            unavailable: true,
            localFallback: true,
            localPending: localRows.length,
          };
        }
      }
    }

    async function rnwl() {
      const me = getMe();
      const ct = document.getElementById('ct');
      if (!me) {
        ct.innerHTML = '<div class="empty"><div class="ei">🔒</div><p>Sesión expirada.</p></div>';
        return;
      }
      ct.innerHTML = '<div class="empty"><div class="ei">⏳</div></div>';
      try {
        cache = await loadData();
        localPendingCount = Number(cache.localPending || 0);
        const summary = cache.summary || {};
        const digest = cache.digest || {};
        ct.innerHTML = `
          <div class="tb">
            <div class="tr2" style="width:100%;justify-content:space-between;gap:10px">
              <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:260px;max-width:520px">
                <div class="sb2" style="flex:1">🔍 <input type="text" id="nwl-search" placeholder="Buscar por correo u origen…" value="${esc(filters.q || '')}"/></div>
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
                <button class="btn btn-ol" onclick="clearNewsletterFilters()" title="Limpiar filtros">🧹</button>
                <button class="btn btn-ol" onclick="exportNewsletterCsv()" title="Exportar">⬇️</button>
                ${me.rol === 'root' ? `<button id="nwl-send-btn" class="btn btn-cy" onclick="sendNewsletterDigestNow()" title="Enviar digest ahora" style="white-space:nowrap">Enviar digest ahora</button>` : ''}
              </div>
            </div>
          </div>
          <div class="stats" style="margin-bottom:14px">
            <div class="sc"><div class="sv">${Number(summary.total || 0)}</div><div class="sl">Suscriptores</div></div>
            <div class="sc"><div class="sv">${Number(summary.active || 0)}</div><div class="sl">Activos</div></div>
            <div class="sc"><div class="sv">${Number(summary.inactive || 0)}</div><div class="sl">Inactivos</div></div>
          </div>
          ${cache.unavailable ? `<div class="alr alr-warn" style="margin-bottom:14px">Newsletter no está disponible en esta versión del backend. Reiniciá/actualizá el servidor para habilitarlo.</div>` : ''}
          ${cache.localFallback ? `<div class="alr alr-info" style="margin-bottom:14px">Mostrando suscriptores guardados localmente en este navegador.</div>` : ''}
          ${!cache.localFallback && localPendingCount > 0 ? `<div class="alr alr-info" style="margin-bottom:14px">Se muestran ${localPendingCount} suscriptor(es) locales aún no reflejados por el backend.</div>` : ''}
          ${cache.localFallback ? '' : `<div class="alr alr-info" style="margin-bottom:14px">
            Próximo chequeo semanal: <strong>${esc(fmtD(summary.nextRunAt))}</strong>.
            Último chequeo: <strong>${digest.lastRunAt ? esc(fmtD(digest.lastRunAt)) : '—'}</strong>.
            Último envío: <strong>${digest.lastSentAt ? esc(fmtD(digest.lastSentAt)) : '—'}</strong>.
          </div>`}
          <div id="nwl-table-wrap">${renderTable()}</div>`;

        document.getElementById('nwl-search')?.addEventListener('input', (e) => {
          filters.q = e.target.value || '';
          page = 1;
          document.getElementById('nwl-table-wrap').innerHTML = renderTable();
        });
        document.getElementById('nwl-status')?.addEventListener('change', (e) => {
          filters.status = e.target.value || '';
          page = 1;
          rnwl();
        });
        document.getElementById('nwl-limit')?.addEventListener('change', (e) => {
          pageSize = e.target.value || '10';
          page = 1;
          document.getElementById('nwl-table-wrap').innerHTML = renderTable();
        });
      } catch (e) {
        ct.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>${esc(e.message || 'No se pudo cargar Newsletter')}</p></div>`;
      }
    }

    function setNewsletterPage(nextPage) {
      page = Math.max(1, Number(nextPage || 1));
      const wrap = document.getElementById('nwl-table-wrap');
      if (wrap) wrap.innerHTML = renderTable();
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
      if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }

      try {
        const result = await api('/newsletter/send', { method: 'POST' });
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
        const msg = String(e?.message || 'Error al enviar el digest.');
        toast(msg, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar digest ahora'; }
      }
    }

    return {
      rnwl,
      setNewsletterPage,
      sortNewsletterBy,
      clearNewsletterFilters: clearFilters,
      exportNewsletterCsv,
      toggleNewsletterSubscription: toggleSubscription,
      deleteNewsletterSubscription: deleteSubscription,
      sendNewsletterDigestNow: sendDigestNow,
    };
  }

  global.createCPanelNewsletter = createCPanelNewsletter;
})(window);
