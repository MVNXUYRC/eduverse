(function initCpanelNovedades(global) {
  function createCPanelNovedades(deps) {
    const { api, esc, toast, fmtD, getMe } = deps;

    let cache = { data: [], filtros: { carreras: [], unidades: [] } };
    let filters = { q: '', careerId: '', unidad: '', estado: '' };
    let sortBy = 'fecha';
    let sortDir = 'desc';
    let novPage = 1;
    let novPageSize = '10';
    async function fetchViaCpanel(path, opts = {}) {
      const token = sessionStorage.getItem('unam_atk');
      const method = String(opts.method || 'GET').toUpperCase();
      const res = await fetch(`/cpanel/api${path}`, {
        method,
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const raw = await res.text();
      let data = {};
      if (raw) {
        try { data = JSON.parse(raw); } catch { data = {}; }
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    }

    function toCsv(rows) {
      const header = ['estado', 'correo electrónico', 'fecha', 'propuesta formativa', 'unidad académica'];
      const lines = [header.join(',')];
      rows.forEach((r) => {
        const cols = [getEstadoLabel(r), r.email, fmtD(r.fecha), r.carrera, r.unidadAcademica].map((v) => `"${String(v || '').replace(/"/g, '""')}"`);
        lines.push(cols.join(','));
      });
      return lines.join('\n');
    }
    function normalizeText(value) {
      return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    function sortHead(label, key) {
      const isCurrent = sortBy === key;
      const indicator = isCurrent ? (sortDir === 'asc' ? '▲' : '▼') : '';
      return `<button type="button" onclick="sortNvdBy('${key}')" style="border:none;background:none;padding:0;margin:0;cursor:pointer;font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit;display:inline-flex;align-items:center;gap:5px">
        <span>${label}</span>
        <span style="font-size:.72rem;color:rgba(255,255,255,.65);min-width:10px">${indicator}</span>
      </button>`;
    }
    function getSortValue(row, key) {
      if (key === 'estado') return getEstadoLabel(row);
      if (key === 'email') return row.email;
      if (key === 'carrera') return row.carrera;
      if (key === 'unidadAcademica') return row.unidadAcademica;
      return row.fecha;
    }
    function getEstadoLabel(row) {
      if (typeof row?.estado === 'string' && row.estado.trim()) {
        const normalized = normalizeText(row.estado);
        if (normalized.includes('inform') || normalized.includes('avis')) return 'Informado';
        if (normalized.includes('pend')) return 'Pendiente';
      }
      if (typeof row?.notificado === 'boolean') return row.notificado ? 'Informado' : 'Pendiente';
      return 'Pendiente';
    }
    function renderEstadoBadge(row) {
      const estado = getEstadoLabel(row);
      return `<span style="font-size:.82rem;font-weight:400;color:var(--tx)">${estado}</span>`;
    }
    function getAvailableFilterOptions(rows) {
      const safeRows = Array.isArray(rows) ? rows : [];
      const careersById = new Map();
      const careersByName = new Map();
      const unidades = new Set();
      safeRows.forEach((r) => {
        const cid = String(r.carreraId ?? r.careerId ?? '').trim();
        const cname = String(r.carrera || '').trim();
        const unidad = String(r.unidadAcademica || '').trim();
        if (cid && cname && !careersById.has(cid)) careersById.set(cid, cname);
        if (!cid && cname && !careersByName.has(cname.toLowerCase())) careersByName.set(cname.toLowerCase(), cname);
        if (unidad) unidades.add(unidad);
      });
      const careers = [
        ...Array.from(careersById.entries()).map(([id, nombre]) => ({ id, nombre })),
        ...Array.from(careersByName.values()).map((nombre) => ({ id: '', nombre })),
      ].sort((a, b) => normalizeText(a.nombre).localeCompare(normalizeText(b.nombre), 'es'));
      const unidadesList = Array.from(unidades).sort((a, b) => normalizeText(a).localeCompare(normalizeText(b), 'es'));
      return { careers, unidades: unidadesList };
    }
    function renderTableInDom() {
      const host = document.getElementById('nov-table-wrap');
      if (host) host.innerHTML = renderTable(getFilteredRows());
    }
    function sortNvdBy(key) {
      if (sortBy === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else {
        sortBy = key;
        sortDir = 'asc';
      }
      renderTableInDom();
    }

    function getFilteredRows() {
      const rows = Array.isArray(cache.data) ? cache.data : [];
      return rows.filter((r) => {
        const rowCareerId = String(r.carreraId ?? r.careerId ?? '');
        if (filters.careerId && rowCareerId !== String(filters.careerId)) return false;
        if (filters.unidad && String(r.unidadAcademica || '') !== String(filters.unidad)) return false;
        if (filters.estado && normalizeText(getEstadoLabel(r)) !== normalizeText(filters.estado)) return false;
        if (filters.q) {
          const needle = normalizeText(filters.q);
          const haystack = normalizeText(`${getEstadoLabel(r)} ${r.email || ''} ${r.carrera || ''} ${r.unidadAcademica || ''}`);
          if (!haystack.includes(needle)) return false;
        }
        return true;
      });
    }
    function exportNovedades() {
      const rows = getFilteredRows();
      if (!rows.length) return toast('No hay datos para exportar.', 'info');
      const csv = toCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `base-interesados-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    async function loadNovedades() {
      const q = new URLSearchParams();
      if (filters.careerId) q.set('careerId', filters.careerId);
      if (filters.unidad) q.set('unidad', filters.unidad);
      let d = null;
      try {
        d = await api(`/novedades?${q.toString()}`);
      } catch (e) {
        const msg = String(e?.message || '').toLowerCase();
        if (!msg.includes('endpoint no encontrado') && !msg.includes('not found')) throw e;
        try {
          d = await api(`/interesados?${q.toString()}`);
        } catch (e2) {
          const msg2 = String(e2?.message || '').toLowerCase();
          if (!msg2.includes('endpoint no encontrado') && !msg2.includes('not found')) throw e2;
          try {
            d = await fetchViaCpanel(`/novedades?${q.toString()}`);
          } catch (e3) {
            const msg3 = String(e3?.message || '').toLowerCase();
            if (!msg3.includes('endpoint no encontrado') && !msg3.includes('not found')) throw e3;
            try {
              d = await fetchViaCpanel(`/interesados?${q.toString()}`);
            } catch (e4) {
              const msg4 = String(e4?.message || '').toLowerCase();
              if (!msg4.includes('endpoint no encontrado') && !msg4.includes('not found')) throw e4;
              d = { data: [], filtros: { carreras: [], unidades: [] }, unavailable: true };
            }
          }
        }
      }
      cache = d || { data: [], filtros: { carreras: [], unidades: [] } };
      return cache;
    }

    function renderTable(data) {
      const canManage = ['root', 'institucional', 'unidades'].includes(String(getMe()?.rol || ''));
      const isRoot = String(getMe()?.rol || '') === 'root';
      const sortedData = [...data].sort((a, b) => {
        const av = normalizeText(getSortValue(a, sortBy));
        const bv = normalizeText(getSortValue(b, sortBy));
        if (av === bv) return 0;
        return sortDir === 'asc' ? (av < bv ? -1 : 1) : (av > bv ? -1 : 1);
      });
      const total = sortedData.length;
      const pageSize = novPageSize === 'all' ? total || 1 : Number(novPageSize || 10);
      const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
      if (novPage > totalPages) novPage = totalPages;
      const from = pageSize > 0 ? (novPage - 1) * pageSize : 0;
      const to = novPageSize === 'all' ? total : from + pageSize;
      const pageRows = novPageSize === 'all' ? sortedData : sortedData.slice(from, to);
      const registrosLabel = `Se encontraron ${total} registro${total === 1 ? '' : 's'} de interesados.`;
      const recordsFooter = total > 0 ? `<div class="records-count">${registrosLabel}</div>` : '';
      if (!data.length) return `<div class="empty"><div class="ei">📭</div><p>Sin registros para los filtros seleccionados.</p></div>${recordsFooter}`;
      return `<div class="tw" style="font-size:.85rem"><table style="width:100%;table-layout:fixed">
        <colgroup>
          <col style="width:16%">
          <col style="width:${canManage ? '23%' : '26%'}">
          <col style="width:14%">
          <col style="width:${canManage ? '24%' : '27%'}">
          <col style="width:${canManage ? '15%' : '17%'}">
          ${canManage ? '<col style="width:8%">' : ''}
        </colgroup>
        <thead><tr>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('Estado', 'estado')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('Correo Electrónico', 'email')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('Fecha', 'fecha')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('Propuesta Formativa', 'carrera')}</th>
          <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('Unidad Académica', 'unidadAcademica')}</th>
          ${canManage ? '<th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">ACCIONES</th>' : ''}
        </tr></thead>
        <tbody>${pageRows.map((r) => `<tr>
          <td style="text-align:left;padding-left:16px">${renderEstadoBadge(r)}</td>
          <td>${esc(r.email)}</td>
          <td style="text-align:center">${esc(fmtD(r.fecha))}</td>
          <td>${esc(r.carrera)}</td>
          <td>${esc(r.unidadAcademica)}</td>
          ${canManage ? `<td style="text-align:right"><div class="acts" style="gap:4px;justify-content:flex-end">
            <button title="Avisar manualmente" class="btn btn-ge btn-sm" style="padding:5px 8px${getEstadoLabel(r) === 'Informado' ? ';opacity:.45;cursor:not-allowed' : ''}" ${getEstadoLabel(r) === 'Informado' ? 'disabled' : `onclick="markInterestedInformed(${Number(r.id || 0)},'${esc(r.email)}')"`}>🔔</button>
            ${isRoot ? `<button title="Eliminar" class="btn btn-rd btn-sm" style="padding:5px 8px" onclick="deleteInterested(${Number(r.id || 0)},'${esc(r.email)}')">🗑️</button>` : ''}
          </div></td>` : ''}
        </tr>`).join('')}</tbody>
      </table></div>
      ${totalPages > 1 && novPageSize !== 'all'
    ? `<div class="pag"><button class="pb" onclick="setNovPage(${novPage - 1})" ${novPage === 1 ? 'disabled' : ''}>←</button>${Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => `<button class="pb ${p === novPage ? 'active' : ''}" onclick="setNovPage(${p})">${p}</button>`).join('')}<button class="pb" onclick="setNovPage(${novPage + 1})" ${novPage === totalPages ? 'disabled' : ''}>→</button></div>`
    : ''}
      ${recordsFooter}`;
    }
    function setNovPage(page) {
      novPage = Math.max(1, Number(page || 1));
      renderTableInDom();
    }
    async function markInterestedInformed(id, email) {
      const itemId = Number(id);
      if (!Number.isFinite(itemId)) return;
      try {
        const attempts = [
          () => api(`/novedades?id=${itemId}&action=informar`, { method: 'POST' }),
          () => api(`/interesados?id=${itemId}&action=informar`, { method: 'POST' }),
          () => api(`/novedades/${itemId}`, { method: 'PATCH', body: JSON.stringify({ informado: true }) }),
          () => api(`/novedades/${itemId}`, { method: 'POST', body: JSON.stringify({ action: 'informar' }) }),
          () => api(`/novedades/${itemId}/informar`, { method: 'POST' }),
          () => api(`/interesados/${itemId}/informar`, { method: 'POST' }),
          () => fetchViaCpanel(`/novedades?id=${itemId}&action=informar`, { method: 'POST' }),
          () => fetchViaCpanel(`/interesados?id=${itemId}&action=informar`, { method: 'POST' }),
          () => fetchViaCpanel(`/novedades/${itemId}/informar`, { method: 'POST' }),
          () => fetchViaCpanel(`/interesados/${itemId}/informar`, { method: 'POST' }),
        ];
        let lastError = null;
        for (const attempt of attempts) {
          try {
            await attempt();
            lastError = null;
            break;
          } catch (err) {
            lastError = err;
            const msg = String(err?.message || '').toLowerCase();
            if (!msg.includes('endpoint no encontrado') && !msg.includes('not found')) throw err;
          }
        }
        if (lastError) throw lastError;
        toast(`Registro de ${email || 'interesado'} marcado como Informado.`, 'success');
        await rnvd();
      } catch (e) {
        toast(e.message || 'No se pudo marcar como Informado.', 'error');
      }
    }
    async function deleteInterested(id, email) {
      const itemId = Number(id);
      if (!Number.isFinite(itemId)) return;
      if (!confirm(`¿Eliminar el registro de ${email || 'este interesado'}?`)) return;
      try {
        const attempts = [
          () => api(`/novedades?id=${itemId}`, { method: 'DELETE' }),
          () => api(`/interesados?id=${itemId}`, { method: 'DELETE' }),
          () => api(`/novedades/${itemId}`, { method: 'DELETE' }),
          () => api(`/interesados/${itemId}`, { method: 'DELETE' }),
          () => fetchViaCpanel(`/novedades?id=${itemId}`, { method: 'DELETE' }),
          () => fetchViaCpanel(`/interesados?id=${itemId}`, { method: 'DELETE' }),
          () => fetchViaCpanel(`/novedades/${itemId}`, { method: 'DELETE' }),
          () => fetchViaCpanel(`/interesados/${itemId}`, { method: 'DELETE' }),
        ];
        let lastError = null;
        for (const attempt of attempts) {
          try {
            await attempt();
            lastError = null;
            break;
          } catch (err) {
            lastError = err;
            const msg = String(err?.message || '').toLowerCase();
            if (!msg.includes('endpoint no encontrado') && !msg.includes('not found')) throw err;
          }
        }
        if (lastError) throw lastError;
        toast('Registro eliminado.', 'success');
        await rnvd();
      } catch (e) {
        toast(e.message || 'No se pudo eliminar el registro.', 'error');
      }
    }

    async function rnvd() {
      const me = getMe();
      const ct = document.getElementById('ct');
      ct.innerHTML = `<div class="empty"><div class="ei">⏳</div></div>`;
      try {
        const d = await loadNovedades();
        const optionSets = getAvailableFilterOptions(d.data || []);
        const comboActiveStyle = 'border-color:var(--cy); box-shadow:0 0 0 2px rgba(2,132,199,.18)';
        ct.innerHTML = `
          <div class="tb" id="nov-toolbar">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%">
              <div style="display:flex;align-items:center;gap:8px;min-width:280px;max-width:520px;flex:1">
                <div class="sb2" style="flex:1">🔍 <input type="text" id="nov-search" placeholder="Buscar..." value="${esc(filters.q || '')}"></div>
              </div>
            </div>
            <div style="width:100%;padding:12px;border:1.5px solid var(--bd);border-radius:var(--r);background:var(--sf)">
              <div class="tr2" style="width:100%;align-items:flex-end;gap:8px;justify-content:flex-start">
              <select class="fsel" id="nov-career" style="${filters.careerId ? comboActiveStyle : ''}">
                <option value="">Todas las propuestas</option>
                ${optionSets.careers.map((c) => `<option value="${esc(c.id)}" ${String(filters.careerId) === String(c.id) ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}
              </select>
              <select class="fsel" id="nov-estado" style="${filters.estado ? comboActiveStyle : ''}">
                <option value="">Todos los estados</option>
                <option value="Pendiente" ${filters.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                <option value="Informado" ${filters.estado === 'Informado' ? 'selected' : ''}>Informado</option>
              </select>
              <select class="fsel" id="nov-unidad" style="${filters.unidad ? comboActiveStyle : ''}">
                <option value="">Todas las unidades</option>
                ${optionSets.unidades.map((u) => `<option value="${esc(u)}" ${filters.unidad === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}
              </select>
                <div style="display:flex;align-items:flex-end;justify-content:flex-end;gap:8px;flex:1;min-width:160px;padding-right:4px">
                  <div style="display:flex;flex-direction:column;gap:5px;width:140px;min-width:140px;max-width:140px;flex:0 0 140px">
                    <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Registros</label>
                    <select class="fsel" id="nov-limit">
                      <option value="10" ${novPageSize === '10' ? 'selected' : ''}>10</option>
                      <option value="20" ${novPageSize === '20' ? 'selected' : ''}>20</option>
                      <option value="all" ${novPageSize === 'all' ? 'selected' : ''}>Todos</option>
                    </select>
                  </div>
                  <button class="btn btn-ol" id="btn-clear-nov-filters" title="Limpiar filtros" aria-label="Limpiar filtros" style="width:52px;justify-content:center;padding-left:0;padding-right:0">🗑️</button>
                  <button class="btn btn-ol" id="btn-export-nov" title="Exportar" aria-label="Exportar" style="width:52px;justify-content:center;padding-left:0;padding-right:0">⬇️</button>
                </div>
              </div>
            </div>
          </div>
          ${d.unavailable ? `<div class="alr alr-warn">Base de interesados no está disponible en esta versión del backend. Reiniciá/actualizá el servidor para habilitarla.</div>` : ''}
          ${me?.rol === 'unidades' ? `<div class="alr alr-info">Solo se muestran interesados de tus unidades académicas asignadas.</div>` : ''}
          <div id="nov-table-wrap">${renderTable(getFilteredRows())}</div>`;
        document.getElementById('nov-search')?.addEventListener('input', (e) => {
          filters.q = e.target.value || '';
          novPage = 1;
          renderTableInDom();
        });
        document.getElementById('nov-career')?.addEventListener('change', (e) => {
          filters.careerId = e.target.value || '';
          novPage = 1;
          rnvd();
        });
        document.getElementById('nov-estado')?.addEventListener('change', (e) => {
          filters.estado = e.target.value || '';
          novPage = 1;
          renderTableInDom();
        });
        document.getElementById('nov-unidad')?.addEventListener('change', (e) => {
          filters.unidad = e.target.value || '';
          novPage = 1;
          rnvd();
        });
        document.getElementById('nov-limit')?.addEventListener('change', (e) => {
          novPageSize = e.target.value || '10';
          novPage = 1;
          renderTableInDom();
        });
        document.getElementById('btn-clear-nov-filters')?.addEventListener('click', () => {
          const qValue = document.getElementById('nov-search')?.value || '';
          filters = { q: qValue, careerId: '', unidad: '', estado: '' };
          novPageSize = '10';
          novPage = 1;
          rnvd();
        });
        document.getElementById('btn-export-nov')?.addEventListener('click', exportNovedades);
      } catch (e) {
        ct.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>${esc(e.message || 'No se pudo cargar Base de interesados')}</p></div>`;
      }
    }

    return { rnvd, exportNovedades, sortNvdBy, setNovPage, markInterestedInformed, deleteInterested };
  }

  global.createCPanelNovedades = createCPanelNovedades;
})(window);
