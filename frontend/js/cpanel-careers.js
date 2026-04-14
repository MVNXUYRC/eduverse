(function initCpanelCareers(global) {
  function createCPanelCareers(deps) {
    const {
      BASE,
      TK,
      EAD,
      UNIDAD_REGIONAL,
      MAX_UPLOAD_BYTES,
      api,
      isActive,
      toast,
      esc,
      showModal,
      cm,
      properName,
      getOrgsForTipo,
      compactRichHtml,
      plainFromHtml,
      getMe,
      getCfg,
      getCp,
      setCp,
      getCf,
      setCf,
      getCareerDraft,
      setCareerDraft,
    } = deps;

    let linkTarget = null;
    let linkRange = null;
    let carrSortBy = 'nombre';
    let carrSortDir = 'asc';
    let carrPageSize = '10';
    let carrFormInline = false;
    const sortAlpha = (values = []) => [...new Set((values || [])
      .map((v) => String(v || '').trim())
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

    function getDraft() {
      return getCareerDraft();
    }

    function updateDraft(patch) {
      const current = getDraft();
      setCareerDraft({ ...current, ...patch });
    }

    function setTopTitleList(topTitle) {
      if (!topTitle) return;
      topTitle.textContent = 'Propuestas Formativas';
    }

    function setTopTitleNew(topTitle) {
      if (!topTitle) return;
      topTitle.textContent = 'Nueva propuesta';
    }

    function setTopTitleEdit(topTitle) {
      if (!topTitle) return;
      topTitle.textContent = 'Editar propuesta';
    }

    function toggleTopbarBackButton(show) {
      const topbar = document.querySelector('.topbar');
      if (!topbar) return;
      const current = document.getElementById('carr-top-back');
      if (!show) {
        if (current) current.remove();
        return;
      }
      if (current) return;
      const btn = document.createElement('button');
      btn.id = 'carr-top-back';
      btn.className = 'btn btn-ol';
      btn.textContent = 'Atrás';
      btn.style.width = '112px';
      btn.style.justifyContent = 'center';
      btn.style.marginLeft = 'auto';
      btn.style.marginRight = '20px';
      btn.onclick = () => closeCarrForm();
      topbar.appendChild(btn);
    }

    async function rcarr() {
      const ct = document.getElementById('ct');
      const topTitle = document.getElementById('tbt');
      setTopTitleList(topTitle);
      toggleTopbarBackButton(false);
      const filters = {
        q: '',
        esCurso: '',
        activo: '',
        unidad: '',
        regional: '',
        inscripcionAbierta: '',
        ...getCf(),
      };
      setCf(filters);
      const availableParams = new URLSearchParams({ limit: '200', page: '1' });
      const firstAvailable = await api(`/carreras?${availableParams.toString()}`);
      const availableRows = [...(firstAvailable?.data || [])];
      const totalAvailablePages = Number(firstAvailable?.meta?.totalPages || 1);
      for (let page = 2; page <= totalAvailablePages; page += 1) {
        availableParams.set('page', String(page));
        const nextAvailable = await api(`/carreras?${availableParams.toString()}`);
        availableRows.push(...(nextAvailable?.data || []));
      }
      const unidadesDisponibles = sortAlpha(availableRows.flatMap((r) => (r.unidadesAcademicas || [r.unidadAcademica]).filter(Boolean)));
      const regionalesDisponibles = sortAlpha(availableRows.map((r) => String(r.regional || '').trim()).filter(Boolean));
      const hasSinRegional = availableRows.some((r) => !String(r.regional || '').trim());
      const hasCarreras = availableRows.some((r) => !r.esCurso);
      const hasCursos = availableRows.some((r) => !!r.esCurso);
      const hasDisponibles = availableRows.some((r) => !r.proximamente && isActive(r.activo));
      const hasFinalizadas = availableRows.some((r) => !r.proximamente && !isActive(r.activo));
      const hasInscAbierta = availableRows.some((r) => isActive(r.inscripcionAbierta));
      const hasInscCerrada = availableRows.some((r) => !isActive(r.inscripcionAbierta));
      const comboActiveStyle = 'border-color:var(--cy);background:rgba(0,149,204,.08);color:var(--cy);font-weight:600';
      carrSortBy = 'nombre';
      carrSortDir = 'asc';
      carrPageSize = '10';
      setCp(1);
      ct.innerHTML = `
        <div id="carr-root" style="font-family:'Ubuntu','Roboto',sans-serif">
        <div class="tb" id="carr-toolbar">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%">
            <div style="display:flex;align-items:center;gap:8px;min-width:280px;max-width:520px;flex:1">
              <div class="sb2" style="flex:1">🔍 <input type="text" id="cs" placeholder="Buscar…" value="${esc(filters.q)}"/></div>
            </div>
            <div style="display:flex;justify-content:flex-end;min-width:140px;padding-right:20px">
              <button class="btn btn-cy" onclick="openCarrForm(null)" style="width:112px;justify-content:center">Agregar</button>
            </div>
          </div>
          <div style="width:100%;padding:12px;border:1.5px solid var(--bd);border-radius:var(--r);background:var(--sf)">
            <div class="tr2" style="width:100%;align-items:flex-end;gap:8px;justify-content:flex-start">
            <div style="display:flex;flex-direction:column;gap:5px;width:220px;min-width:220px;max-width:220px;flex:0 0 220px">
              <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Tipo</label>
              <select class="fsel" id="cec" style="${filters.esCurso ? comboActiveStyle : ''}">
                <option value="">Todos</option>
                ${hasCarreras ? `<option value="false" ${filters.esCurso === 'false' ? 'selected' : ''}>Carreras</option>` : ''}
                ${hasCursos ? `<option value="true" ${filters.esCurso === 'true' ? 'selected' : ''}>Cursos</option>` : ''}
              </select>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;width:220px;min-width:220px;max-width:220px;flex:0 0 220px">
              <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Estado</label>
              <select class="fsel" id="ca2" style="${filters.activo ? comboActiveStyle : ''}">
                <option value="">Todos</option>
                ${hasDisponibles ? `<option value="true" ${filters.activo === 'true' ? 'selected' : ''}>Disponibles</option>` : ''}
                ${hasFinalizadas ? `<option value="false" ${filters.activo === 'false' ? 'selected' : ''}>Finalizadas</option>` : ''}
              </select>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;width:220px;min-width:220px;max-width:220px;flex:0 0 220px">
              <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Unidad Académica</label>
              <select class="fsel" id="cu2" style="${filters.unidad ? comboActiveStyle : ''}">
                <option value="">Todas</option>
                ${unidadesDisponibles.map((u) => `<option value="${esc(u)}" ${filters.unidad === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}
              </select>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;width:220px;min-width:220px;max-width:220px;flex:0 0 220px">
              <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Regional</label>
              <select class="fsel" id="cr2" style="${filters.regional ? comboActiveStyle : ''}">
                <option value="">Todas</option>
                ${hasSinRegional ? `<option value="__none__" ${filters.regional === '__none__' ? 'selected' : ''}>Sin regional</option>` : ''}
                ${regionalesDisponibles.map((r) => `<option value="${esc(r)}" ${filters.regional === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}
              </select>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;width:220px;min-width:220px;max-width:220px;flex:0 0 220px">
              <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Inscripción</label>
              <select class="fsel" id="ci2" style="${filters.inscripcionAbierta ? comboActiveStyle : ''}">
                <option value="">Todas</option>
                ${hasInscAbierta ? `<option value="true" ${filters.inscripcionAbierta === 'true' ? 'selected' : ''}>Abierta</option>` : ''}
                ${hasInscCerrada ? `<option value="false" ${filters.inscripcionAbierta === 'false' ? 'selected' : ''}>Cerrada</option>` : ''}
              </select>
            </div>
            <div style="display:flex;align-items:flex-end;justify-content:flex-end;gap:8px;flex:1;min-width:160px;padding-right:4px">
              <div style="display:flex;flex-direction:column;gap:5px;width:140px;min-width:140px;max-width:140px;flex:0 0 140px">
                <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Registros</label>
                <select class="fsel" id="c-limit">
                  <option value="10" selected>10</option>
                  <option value="20">20</option>
                  <option value="all">Todos</option>
                </select>
              </div>
              <button class="btn btn-ol" id="btn-clear-carr-filters" title="Limpiar filtros" aria-label="Limpiar filtros" style="width:52px;justify-content:center;padding-left:0;padding-right:0">🗑️</button>
              <button class="btn btn-ol" id="btn-export-carr" title="Exportar" aria-label="Exportar" style="width:52px;justify-content:center;padding-left:0;padding-right:0">⬇️</button>
            </div>
            </div>
          </div>
        </div>
        <div id="carr-form-host"></div>
        <div id="ctb"></div><div id="cpg"></div>
        </div>`;
      const bind = () => {
        setCf({
          q: document.getElementById('cs').value,
          esCurso: document.getElementById('cec').value,
          activo: document.getElementById('ca2').value,
          unidad: document.getElementById('cu2').value,
          regional: document.getElementById('cr2').value,
          inscripcionAbierta: document.getElementById('ci2').value,
        });
        setCp(1);
        lcarr();
      };
      document.getElementById('cs').addEventListener('input', bind);
      document.getElementById('cec').addEventListener('change', bind);
      document.getElementById('ca2').addEventListener('change', bind);
      document.getElementById('cu2').addEventListener('change', bind);
      document.getElementById('cr2').addEventListener('change', bind);
      document.getElementById('ci2').addEventListener('change', bind);
      document.getElementById('c-limit').addEventListener('change', (event) => {
        carrPageSize = event.target.value || '10';
        setCp(1);
        lcarr();
      });
      document.getElementById('btn-clear-carr-filters').addEventListener('click', () => {
        const qValue = document.getElementById('cs')?.value || '';
        document.getElementById('cec').value = '';
        document.getElementById('ca2').value = '';
        document.getElementById('cu2').value = '';
        document.getElementById('cr2').value = '';
        document.getElementById('ci2').value = '';
        setCf({
          q: qValue,
          esCurso: '',
          activo: '',
          unidad: '',
          regional: '',
          inscripcionAbierta: '',
        });
        setCp(1);
        lcarr();
      });
      document.getElementById('btn-export-carr').addEventListener('click', exportCarrerasExcel);
      lcarr();
    }

    function closeCarrForm() {
      if (carrFormInline) {
        const host = document.getElementById('carr-form-host');
        const toolbar = document.getElementById('carr-toolbar');
        const tableWrap = document.getElementById('ctb');
        const pagerWrap = document.getElementById('cpg');
        const topTitle = document.getElementById('tbt');
        if (host) host.innerHTML = '';
        if (toolbar) toolbar.style.display = '';
        if (tableWrap) tableWrap.style.display = '';
        if (pagerWrap) pagerWrap.style.display = '';
        setTopTitleList(topTitle);
        toggleTopbarBackButton(false);
        carrFormInline = false;
        return;
      }
      cm();
    }

    async function lcarr() {
      const filters = {
        q: '',
        esCurso: '',
        activo: '',
        unidad: '',
        regional: '',
        inscripcionAbierta: '',
        ...getCf(),
      };
      const page = getCp();
      try {
        const baseParams = new URLSearchParams({
          q: filters.q || '',
          esCurso: filters.esCurso || '',
          activo: filters.activo || '',
          unidad: filters.unidad || '',
          regional: filters.regional || '',
          inscripcionAbierta: filters.inscripcionAbierta || '',
          sortBy: carrSortBy,
          sortDir: carrSortDir,
        });
        const limitValue = carrPageSize === '20' ? '20' : '10';
        let rows = [];
        let meta = { total: 0, page: 1, totalPages: 1 };
        if (carrPageSize === 'all') {
          const allParams = new URLSearchParams(baseParams);
          allParams.set('limit', '200');
          allParams.set('page', '1');
          const first = await api(`/carreras?${allParams.toString()}`);
          rows = [...(first?.data || [])];
          const totalPages = Number(first?.meta?.totalPages || 1);
          for (let nextPage = 2; nextPage <= totalPages; nextPage += 1) {
            allParams.set('page', String(nextPage));
            const next = await api(`/carreras?${allParams.toString()}`);
            rows.push(...(next?.data || []));
          }
          const total = Number(first?.meta?.total ?? rows.length);
          meta = { total, page: 1, totalPages: 1 };
          setCp(1);
        } else {
          const q = new URLSearchParams(baseParams);
          q.set('limit', limitValue);
          q.set('page', String(page));
          const response = await api(`/carreras?${q.toString()}`);
          rows = response?.data || [];
          meta = response?.meta || { total: rows.length, page, totalPages: 1 };
        }
        const total = Number(meta?.total ?? rows.length ?? 0);
        const registrosLabel = total === 1
          ? 'Se encontraron 1 registro de propuesta formativa.'
          : `Se encontraron ${total} registros de propuestas formativas.`;
        const recordsFooter = total > 0 ? `<div class="records-count" style="margin-top:10px">${registrosLabel}</div>` : '';
        document.getElementById('ctb').innerHTML = rows.length ? `
          <div class="tw" style="font-size:.85rem"><table style="width:100%;table-layout:fixed">
            <colgroup>
              <col style="width:39%">
              <col style="width:9%">
              <col style="width:20%">
              <col style="width:8%">
              <col style="width:6%">
              <col style="width:8%">
              <col style="width:10%">
            </colgroup>
            <thead><tr>
              <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('PROPUESTA FORMATIVA', 'nombre')}</th>
              <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('TIPO', 'tipo')}</th>
              <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('UNIDAD ACADÉMICA', 'unidad')}</th>
              <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('REGIONAL', 'regional')}</th>
              <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('ESTADO', 'estado')}</th>
              <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('INSCRIPCIÓN', 'inscripcion')}</th>
              <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">ACCIONES</th>
            </tr></thead>
            <tbody>${rows.map((c) => {
              const estadoLabel = c.proximamente ? 'Próximamente' : (isActive(c.activo) ? 'Disponible' : 'Finalizada');
              const inscripcionLabel = c.proximamente ? '--' : (isActive(c.inscripcionAbierta) ? 'Abierta' : 'Cerrada');
              return `<tr class="${c.proximamente ? 'row-proximamente' : (!isActive(c.activo) ? 'row-finalizada' : '')}">
              <td style="max-width:340px">${esc(c.nombre)}</td>
              <td style="padding-left:24px">${c.esCurso ? 'Curso' : 'Carrera'}</td>
              <td style="padding-left:24px">${esc((c.unidadesAcademicas || [c.unidadAcademica]).join(', '))}</td>
              <td style="${(c.regional && String(c.regional).trim()) ? 'padding-left:24px' : 'padding-left:0;text-align:center'}">${esc((c.regional && String(c.regional).trim()) ? c.regional : '--')}</td>
              <td style="text-align:center">${estadoLabel}</td>
              <td style="text-align:center">${inscripcionLabel}</td>
              <td style="text-align:right"><div class="acts" style="gap:4px;justify-content:flex-end">
                <button title="Editar" class="btn btn-ge btn-sm" style="padding:5px 8px" onclick="openCarrForm(${c.id})">✏️</button>
                ${c.proximamente ? '' : (isActive(c.inscripcionAbierta)
                  ? `<button title="Cerrar inscripción" class="btn btn-sm" style="padding:5px 8px;background:rgba(217,119,6,.08);color:var(--or);border:1px solid rgba(217,119,6,.2)" onclick="toggleInscripcion(${c.id},'${esc(c.nombre)}',false)">📋</button>`
                  : `<button title="Abrir inscripción" class="btn btn-sm" style="padding:5px 8px;background:rgba(45,160,42,.08);color:var(--gr);border:1px solid rgba(45,160,42,.2)" onclick="toggleInscripcion(${c.id},'${esc(c.nombre)}',true)">📝</button>`
                )}
                ${c.proximamente ? '' : (isActive(c.activo)
                  ? `<button title="Finalizar propuesta" class="btn btn-sm" style="padding:5px 8px;background:rgba(217,119,6,.08);color:var(--or);border:1px solid rgba(217,119,6,.2)" onclick="toggleActivarCarr(${c.id},'${esc(c.nombre)}',false)">🔒</button>`
                  : `<button title="Habilitar propuesta" class="btn btn-sm" style="padding:5px 8px;background:rgba(45,160,42,.08);color:var(--gr);border:1px solid rgba(45,160,42,.2)" onclick="toggleActivarCarr(${c.id},'${esc(c.nombre)}',true)">🔓</button>`
                )}
                ${getMe().rol === 'root' ? `<button title="Eliminar" class="btn btn-rd btn-sm" style="padding:5px 8px" onclick="eliminarCarr(${c.id},'${esc(c.nombre)}')">🗑️</button>` : ''}
              </div></td>
            </tr>`;
            }).join('')}</tbody>
          </table></div>
          ${recordsFooter}` : `<div class="empty"><div class="ei">📭</div><p>Sin resultados</p></div>
          ${recordsFooter}`;
        const pg = document.getElementById('cpg');
        const currentPage = Number(meta?.page || page || 1);
        const totalPages = Number(meta?.totalPages || 1);
        if (totalPages > 1) {
          let buttons = '';
          for (let i = 1; i <= totalPages; i += 1) {
            buttons += `<button class="pb ${i === currentPage ? 'active' : ''}" onclick="setCarrPage(${i})">${i}</button>`;
          }
          pg.innerHTML = `<div class="pag"><button class="pb" onclick="setCarrPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>←</button>${buttons}<button class="pb" onclick="setCarrPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>→</button></div>`;
        } else {
          pg.innerHTML = '';
        }
      } catch (e) {
        toast(e.message, 'error');
      }
    }

    function setCarrPage(page) {
      setCp(page);
      lcarr();
    }

    function sortHead(label, key) {
      const isCurrent = carrSortBy === key;
      const indicator = isCurrent ? (carrSortDir === 'asc' ? '▲' : '▼') : '';
      return `<button type="button" onclick="sortCarrBy('${key}')" style="border:none;background:none;padding:0;margin:0;cursor:pointer;font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit;display:inline-flex;align-items:center;gap:5px">
        <span>${label}</span>
        <span style="font-size:.72rem;color:rgba(255,255,255,.65);min-width:10px">${indicator}</span>
      </button>`;
    }

    function sortCarrBy(key) {
      if (carrSortBy === key) carrSortDir = carrSortDir === 'asc' ? 'desc' : 'asc';
      else {
        carrSortBy = key;
        carrSortDir = 'asc';
      }
      setCp(1);
      lcarr();
    }

    function getCarreraEstadoLabel(carrera) {
      if (carrera.proximamente) return 'Próximamente';
      return isActive(carrera.activo) ? 'Disponible' : 'Finalizada';
    }

    function getCarreraInscripcionLabel(carrera) {
      return isActive(carrera.inscripcionAbierta) ? 'Abierta' : 'Cerrada';
    }

    function escapeExcelCell(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    async function exportCarrerasExcel() {
      const btn = document.getElementById('btn-export-carr');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳';
      }
      try {
        const filters = getCf();
        const baseParams = new URLSearchParams({
          limit: '200',
          page: '1',
          q: filters.q || '',
          esCurso: filters.esCurso || '',
          activo: filters.activo || '',
          unidad: filters.unidad || '',
          regional: filters.regional || '',
          inscripcionAbierta: filters.inscripcionAbierta || '',
          sortBy: carrSortBy,
          sortDir: carrSortDir,
        });
        const first = await api(`/carreras?${baseParams.toString()}`);
        const rows = [...(first?.data || [])];
        const totalPages = Number(first?.meta?.totalPages || 1);
        for (let page = 2; page <= totalPages; page += 1) {
          baseParams.set('page', String(page));
          const next = await api(`/carreras?${baseParams.toString()}`);
          rows.push(...(next?.data || []));
        }

        const headers = ['Denominación', 'Tipo', 'Unidad/es', 'Regional', 'Estado', 'Inscripción'];
        const body = rows.map((c) => ([
          c?.nombre || '',
          c?.esCurso ? 'Curso' : 'Carrera',
          (c?.unidadesAcademicas || [c?.unidadAcademica]).filter(Boolean).join(', '),
          c?.regional || '',
          getCarreraEstadoLabel(c),
          getCarreraInscripcionLabel(c),
        ]));
        const tableHeader = headers.map((h) => `<th style="border:none;padding:4px 8px;text-align:left">${escapeExcelCell(h)}</th>`).join('');
        const tableBody = body.map((row) => `<tr>${row.map((cell) => `<td style="border:none;padding:4px 8px">${escapeExcelCell(cell)}</td>`).join('')}</tr>`).join('');
        const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table style="border-collapse:collapse;border:none"><thead><tr>${tableHeader}</tr></thead><tbody>${tableBody}</tbody></table></body></html>`;
        const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `propuestas-formativas-${stamp}.xls`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast(`Exportación completada: ${rows.length} registro(s).`, 'success');
      } catch (e) {
        toast(e.message || 'No se pudo exportar el listado.', 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = '⬇️';
        }
      }
    }

    async function openCarrForm(id) {
      const parsedId = Number.parseInt(id, 10);
      const careerId = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null;
      const inlineMode = true;
      carrFormInline = inlineMode;
      let c = null;
      if (careerId) {
        try {
          c = await api(`/carreras/${careerId}`);
        } catch {
          try {
            const d = await api('/carreras?limit=200');
            c = (d.data || []).find((x) => x.id === careerId);
          } catch {}
        }
      }
      updateDraft({
        cTags: [...(c?.tags || [])],
        cDis: [...(c?.disertantes || [])],
        cDocs: (c?.documentos || []).map((d, i) => ({ ...d, _i: i })),
      });
      const { cTags, cDis, cDocs } = getDraft();
      const isCurso = c?.esCurso || false;
      const selUnidades = c?.unidadesAcademicas || (c?.unidadAcademica ? [c.unidadAcademica] : []);
      const me = getMe();
      const cfg = getCfg();
      const availUnits = me.rol === 'unidades' ? (me.unidades || []) : (cfg.unidadesAcademicas || []);
      const tiposDoc = sortAlpha(cfg.tiposDocumento?.length ? cfg.tiposDocumento : ['Resolución', 'Disposición', 'Ordenanza']);
      const rawOrganismos = cfg.organismos?.length
        ? cfg.organismos
        : ['Consejo Superior', 'Ministerial', 'SPU', 'SSPU', 'CONEAU'];
      const organismos = sortAlpha(rawOrganismos.includes('Rectoral') ? rawOrganismos : [...rawOrganismos, 'Rectoral']);
      const disciplinas = cfg.disciplinas || [];

      const unidadList = availUnits.map((u) => `<label class="unit-item${selUnidades.includes(u) ? ' sel' : ''}" onclick="toggleUnitSel(this)">
        <input type="checkbox" name="fc-u" value="${esc(u)}" ${selUnidades.includes(u) ? 'checked' : ''}/>
        ${esc(u)}${u === EAD ? '<span class="bx bcy" style="margin-left:auto;font-size:.6rem">Solo cursos</span>' : ''}
      </label>`).join('');

      const stField = (lbl, s, vId, dId) => `<div class="state-tile">
        <label class="state-title">${lbl}</label>
        <div class="estado-row">
          <div class="estado-chk"><input type="checkbox" id="${vId}" ${(vId === 'fc-act-v' ? (s?.valor !== undefined ? s?.valor : s?.activo !== undefined ? s?.activo : true) : s?.valor || s?.activo) ? 'checked' : ''}/><label for="${vId}" style="font-size:.83rem">Activar</label></div>
          <div class="estado-date"><input class="fi" type="date" id="${dId}" value="${s?.fechaHasta ? s.fechaHasta.slice(0, 10) : ''}" min="${new Date().toISOString().slice(0, 10)}"/></div>
        </div>
        <div class="estado-hint">Sin fecha → indefinido · Con fecha → se desactiva automáticamente</div>
      </div>`;

      const formHeader = '';

      const formHtml = `
        <div data-carr-form="1">
        ${formHeader}
        <div class="fgrid">
          <div class="fg ff"><label class="fl">Denominación *</label><input class="fi" id="fc-n" value="${esc(c?.nombre || '')}" oninput="autoNivel(this.value)"/></div>

          <div class="fg">
            <label class="fl">Tipo</label>
            <div id="fc-tipo-wrap" style="display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--bg);border:1.5px solid var(--bd);border-radius:var(--r)">
              <label style="display:flex;align-items:center;gap:6px;font-size:.84rem;cursor:pointer">
                <input type="radio" name="fc-tipo" value="false" ${!isCurso ? 'checked' : ''} style="accent-color:var(--cy)" onchange="onTipoCh()"/> Carrera
              </label>
              <label style="display:flex;align-items:center;gap:6px;font-size:.84rem;cursor:pointer">
                <input type="radio" name="fc-tipo" value="true" ${isCurso ? 'checked' : ''} style="accent-color:var(--cy)" onchange="onTipoCh()"/> Curso
              </label>
            </div>
          </div>

          <div class="fg" id="fc-nivel-grp" style="${isCurso ? 'display:none' : ''}">
            <label class="fl">Nivel académico *</label>
            <select class="fs" id="fc-nivel" onchange="onNivelCh()">
              <option value="">Seleccionar...</option>
              <option value="Pregrado" ${c?.tipo === 'Pregrado' ? 'selected' : ''}>Pregrado</option>
              <option value="Grado" ${c?.tipo === 'Grado' ? 'selected' : ''}>Grado</option>
              <option value="Posgrado" ${c?.tipo === 'Posgrado' ? 'selected' : ''}>Posgrado</option>
            </select>
          </div>
          <div class="fg" id="fc-subtipo-grp" style="${c?.tipo === 'Posgrado' ? '' : 'display:none'}">
            <label class="fl">Tipo de posgrado</label>
            <select class="fs" id="fc-subtipo">
              <option value="">Sin subtipo</option>
              <option value="Especialización" ${c?.subtipo === 'Especialización' ? 'selected' : ''}>Especialización</option>
              <option value="Maestría" ${c?.subtipo === 'Maestría' ? 'selected' : ''}>Maestría</option>
              <option value="Doctorado" ${c?.subtipo === 'Doctorado' ? 'selected' : ''}>Doctorado</option>
            </select>
          </div>

          <input type="hidden" id="fc-reg" value="${selUnidades[0] ? UNIDAD_REGIONAL[selUnidades[0]] || '' : (c?.regional || '')}"/>

          <div class="fg ff">
            <label class="fl">Unidades académicas *</label>
            <div class="units-list" id="fc-units">${unidadList}</div>
            <div class="fhint">Si incluís a Educación a Distancia, el tipo de propuesta cambia a Curso.</div>
          </div>

          <div class="fg"><label class="fl">Disciplina *</label>
            <select class="fs" id="fc-disc">
              <option value="">Seleccionar...</option>
              ${disciplinas.map((d) => `<option ${c?.disciplina === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
            </select>
          </div>
          <div class="fg" style="grid-column:1"><label class="fl">Modalidad *</label>
            <select class="fs" id="fc-mod">
              <option value="">Seleccionar...</option>
              ${['Híbrida', '100% Virtual'].map((m) => `<option ${(c?.modalidad === m || (!c?.modalidad && isCurso && m === '100% Virtual')) ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="fg" style="grid-column:2"><label class="fl">Duración</label><input class="fi" id="fc-dur" value="${esc(c?.duracion || '')}" placeholder="Ej: 3 años / 6 meses / 120 horas"/></div>
          <div class="fg"><label class="fl">Correo de contacto</label><input class="fi" type="email" id="fc-cont" value="${esc(c?.contacto || '')}" placeholder="informes@unam.edu.ar"/></div>
          <div class="fg"><label class="fl">Teléfono de contacto</label><input class="fi" type="text" id="fc-tel-cont" value="${esc(c?.telefonoContacto || '')}" placeholder="+54 3764 123456 int. 102"/></div>
          <div class="ff" style="border-top:1px solid var(--bd);margin:4px 0 2px"></div>

          <div class="fg ff" id="fc-desc-grp">
            <label class="fl">Descripción de la propuesta</label>
            <div class="wysiwyg-wrap">
              <div class="wysiwyg-bar">
                <button type="button" class="wb" onclick="wf2('bold','fc-desc-ed')"><b>N</b></button>
                <button type="button" class="wb" onclick="wf2('italic','fc-desc-ed')"><i>I</i></button>
                <button type="button" class="wb" onclick="wf2('underline','fc-desc-ed')"><u>S</u></button>
                <span style="width:1px;background:var(--bd);margin:0 3px;align-self:stretch"></span>
                <button type="button" class="wb" onclick="wf2('insertUnorderedList','fc-desc-ed')" title="Viñetas">≡</button>
                <button type="button" class="wb" onclick="wf2('insertOrderedList','fc-desc-ed')" title="Numeración">1.</button>
                <span style="width:1px;background:var(--bd);margin:0 3px;align-self:stretch"></span>
                <button type="button" class="wb" onclick="wfLink('fc-desc-ed')">🔗 Hipervínculo</button>
                <button type="button" class="wb" onclick="wf2('unlink','fc-desc-ed')">Quitar</button>
              </div>
              <div class="wysiwyg-content" id="fc-desc-ed" contenteditable="true" data-placeholder="Descripción de la propuesta…">${c?.descripcion || ''}</div>
            </div>
          </div>
          <div class="fg ff" id="fc-req-grp">
            <label class="fl">Requisitos de admisión</label>
            <div class="wysiwyg-wrap">
              <div class="wysiwyg-bar">
                <button type="button" class="wb" onclick="wf2('bold','fc-req-ed')"><b>N</b></button>
                <button type="button" class="wb" onclick="wf2('italic','fc-req-ed')"><i>I</i></button>
                <button type="button" class="wb" onclick="wf2('underline','fc-req-ed')"><u>S</u></button>
                <span style="width:1px;background:var(--bd);margin:0 3px;align-self:stretch"></span>
                <button type="button" class="wb" onclick="wf2('insertUnorderedList','fc-req-ed')" title="Viñetas">≡</button>
                <button type="button" class="wb" onclick="wf2('insertOrderedList','fc-req-ed')" title="Numeración">1.</button>
                <span style="width:1px;background:var(--bd);margin:0 3px;align-self:stretch"></span>
                <button type="button" class="wb" onclick="wfLink('fc-req-ed')">🔗 Hipervínculo</button>
                <button type="button" class="wb" onclick="wf2('unlink','fc-req-ed')">Quitar</button>
              </div>
              <div class="wysiwyg-content" id="fc-req-ed" contenteditable="true" data-placeholder="Requisitos de admisión…">${c?.requisitosTexto || ''}</div>
            </div>
          </div>
          <div class="fg ff" id="fc-alc-grp" style="${!isCurso && (c?.tipo === 'Pregrado' || c?.tipo === 'Grado') ? '' : 'display:none'}">
            <label class="fl">Alcances del título</label>
            <div class="wysiwyg-wrap">
              <div class="wysiwyg-bar">
                <button type="button" class="wb" onclick="wf2('bold','fc-alc-ed')"><b>N</b></button>
                <button type="button" class="wb" onclick="wf2('italic','fc-alc-ed')"><i>I</i></button>
                <button type="button" class="wb" onclick="wf2('underline','fc-alc-ed')"><u>S</u></button>
                <span style="width:1px;background:var(--bd);margin:0 3px;align-self:stretch"></span>
                <button type="button" class="wb" onclick="wf2('insertUnorderedList','fc-alc-ed')" title="Viñetas">≡</button>
                <button type="button" class="wb" onclick="wf2('insertOrderedList','fc-alc-ed')" title="Numeración">1.</button>
                <span style="width:1px;background:var(--bd);margin:0 3px;align-self:stretch"></span>
                <button type="button" class="wb" onclick="wfLink('fc-alc-ed')">🔗 Hipervínculo</button>
                <button type="button" class="wb" onclick="wf2('unlink','fc-alc-ed')">Quitar</button>
              </div>
              <div class="wysiwyg-content" id="fc-alc-ed" contenteditable="true" data-placeholder="Alcances del título…">${c?.alcancesTitulo || ''}</div>
            </div>
          </div>

          <div class="fg ff" id="fc-tags-grp">
            <label class="fl">Palabras clave</label>
            <div class="tw2" id="fc-tags">${cTags.map((t) => `<span class="tc">${esc(t)}<span class="trm" onclick="rmT('${esc(t)}','tags')">✕</span></span>`).join('')}<input type="text" placeholder="Agregar…" onkeydown="addT(event,'tags')"/></div>
          </div>

          <div class="fg ff" id="fc-dis-grp" style="${isCurso ? '' : 'display:none'}">
            <label class="fl">Disertantes</label>
            <div class="tw2" id="fc-dis">${cDis.map((d) => `<span class="tc">${esc(d)}<span class="trm" onclick="rmT('${esc(d)}','dis')">✕</span></span>`).join('')}<input type="text" placeholder="Agregar disertante…" onkeydown="addT(event,'dis')"/></div>
          </div>

          <div class="fg ff" id="fc-form-grp" style="${isCurso ? '' : 'display:none'}">
            <label class="fl">Formulario de inscripción</label>
            <input class="fi" type="url" id="fc-form" value="${esc(c?.formularioInscripcion || '')}" placeholder="https://…"/>
          </div>

          <div class="ff" id="fc-plan-sep" style="${isCurso ? 'display:none;' : ''}border-top:1px solid var(--bd);margin:4px 0 2px"></div>
          <div class="fg ff" id="fc-plan-prog-title-grp" style="${isCurso ? 'display:none;' : ''}">
            <label class="fl" id="fc-plan-prog-title">${isCurso ? 'Programa' : 'Plan de estudios'}</label>
          </div>

          <div class="fg ff" id="fc-plan-grp" style="${!isCurso ? '' : 'display:none'};margin-bottom:6px">
            ${c?.planEstudiosPDF ? `<div style="margin-bottom:6px"><a class="pdf-link" href="${c.planEstudiosPDF}" target="_blank">Ver PDF actual</a></div>` : ''}
            <div class="fup" onclick="document.getElementById('fc-plan').click()">
              <input type="file" id="fc-plan" accept="application/pdf" onchange="fnm(this,'fc-plan-n')"/>
              <div class="fup-hint">Clic para seleccionar PDF</div><div class="fup-name" id="fc-plan-n"></div>
            </div>
          </div>

          <div class="fg ff" id="fc-prog-grp" style="${isCurso ? '' : 'display:none'}">
            <label class="fl" id="fc-prog-label" style="${isCurso ? '' : 'display:none'}">Programa</label>
            <div class="wysiwyg-wrap">
              <div class="wysiwyg-bar">
                <button type="button" class="wb" onclick="wf('bold')"><b>N</b></button>
                <button type="button" class="wb" onclick="wf('italic')"><i>I</i></button>
                <button type="button" class="wb" onclick="wf('underline')"><u>S</u></button>
                <span style="width:1px;background:var(--bd);margin:0 3px;align-self:stretch"></span>
                <button type="button" class="wb" onclick="wf('insertUnorderedList')" title="Viñetas">≡</button>
                <button type="button" class="wb" onclick="wf('insertOrderedList')" title="Numeración">1.</button>
                <span style="width:1px;background:var(--bd);margin:0 3px;align-self:stretch"></span>
                <button type="button" class="wb" onclick="wfLinkProg()">🔗 Hipervínculo</button>
                <button type="button" class="wb" onclick="wf('unlink')">Quitar</button>
              </div>
              <div class="wysiwyg-content" id="fc-prog" contenteditable="true" data-placeholder="Escribí el programa del curso…">${c?.programa || ''}</div>
            </div>
          </div>

          <div class="fg ff" id="fc-docs-title-grp" style="margin-top:2px;margin-bottom:8px">
            <label class="fl" id="fc-docs-title">Documentos administrativos</label>
          </div>

          <div class="fg ff" id="fc-docs-grp">
            <div class="doc-list" id="doc-list">
              ${cDocs.map((d, i) => docRow(d, i, tiposDoc, organismos)).join('')}
            </div>
            <button type="button" class="btn-add" style="margin-top:4px" onclick="addDoc()">+ Agregar</button>
          </div>

          <div class="ff" id="fc-states-sep" style="border-top:1px solid var(--bd);margin:4px 0 2px"></div>
          <div class="fg ff" id="fc-states-title-grp" style="margin-bottom:6px">
            <label class="fl" id="fc-states-title">Estados</label>
          </div>
          <div class="state-grid" id="fc-states-grp" style="display:block">
            <div class="state-tile">
              <div style="display:flex;flex-direction:column;gap:12px">
                <div>
                  <label class="state-title">Nueva propuesta</label>
                  <div class="estado-chk">
                    <input type="checkbox" id="fc-nv" ${c?.nueva ? 'checked' : ''}/>
                    <label for="fc-nv" style="font-size:.83rem"><span style="color:var(--mt);font-weight:500">Activar | </span>Destacar como nueva</label>
                  </div>
                  <div class="estado-hint">Se publicará en la página principal, en la sección de <strong>Nuevas propuestas</strong>, como una propuesta formativa incorporada recientemente.</div>
                </div>
                <div style="border-top:1px solid var(--bd)"></div>
                <div>
                  <label class="state-title">Disponibilidad</label>
                  <div class="estado-chk">
                    <input type="checkbox" id="fc-act-v" ${((c?.activo?.valor !== undefined ? c.activo.valor : c?.activo !== undefined ? c.activo : false)) ? 'checked' : ''}/>
                    <label for="fc-act-v" style="font-size:.83rem"><span style="color:var(--mt);font-weight:500">Activar | </span>Disponible en el sitio</label>
                    <input type="hidden" id="fc-act-d" value="${c?.activo?.fechaHasta ? c.activo.fechaHasta.slice(0, 10) : ''}"/>
                  </div>
                  <div class="estado-hint">Si se desactiva, la propuesta queda Finalizada pero se mantiene cargada.</div>
                </div>
                <div style="border-top:1px solid var(--bd)"></div>
                <div>
                  <label class="state-title">Próximamente</label>
                  <div class="estado-chk">
                    <input type="checkbox" id="fc-prox" ${c?.proximamente ? 'checked' : ''}/>
                    <label for="fc-prox" style="font-size:.83rem"><span style="color:var(--mt);font-weight:500">Activar | </span>Publicar como próxima</label>
                  </div>
                  <div class="estado-hint">Se utiliza cuando la propuesta aún no está lista para su oficialización, pero permite comenzar a captar interesados.</div>
                </div>
                <div style="border-top:1px solid var(--bd)"></div>
                <div>
                  <label class="state-title">Inscripciones abiertas</label>
                  <div class="estado-row">
                    <div class="estado-chk">
                      <input type="checkbox" id="fc-ia-v" ${(c?.inscripcionAbierta?.valor || c?.inscripcionAbierta?.activo) ? 'checked' : ''}/>
                      <label for="fc-ia-v" style="font-size:.83rem">Activar</label>
                    </div>
                    <div class="estado-date">
                      <input class="fi" type="date" id="fc-ia-d" value="${c?.inscripcionAbierta?.fechaHasta ? c.inscripcionAbierta.fechaHasta.slice(0, 10) : ''}" min="${new Date().toISOString().slice(0, 10)}"/>
                    </div>
                  </div>
                  <div class="estado-hint">Si no se define una fecha, la inscripción queda abierta por tiempo indefinido. Si se define una fecha, permanecerá habilitada hasta ese día inclusive y se cerrará automáticamente al día siguiente.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="mact">
          ${inlineMode ? '' : '<button class="btn btn-ol" onclick="closeCarrForm()">Cancelar</button>'}
          <button class="btn btn-cy" id="carr-save-btn" onclick="saveCarr(${careerId || 'null'})" style="${inlineMode ? 'width:112px;justify-content:center' : ''}">Guardar</button>
        </div>
        </div>`;

      const host = document.getElementById('carr-form-host');
      const toolbar = document.getElementById('carr-toolbar');
      const tableWrap = document.getElementById('ctb');
      const pagerWrap = document.getElementById('cpg');
      const topTitle = document.getElementById('tbt');
      if (host) {
        host.innerHTML = `
          <div class="tw" style="margin-bottom:14px"><div style="padding:18px">${formHtml}</div></div>`;
      }
      if (toolbar) toolbar.style.display = 'none';
      if (tableWrap) tableWrap.style.display = 'none';
      if (pagerWrap) pagerWrap.style.display = 'none';
      if (careerId) setTopTitleEdit(topTitle);
      else setTopTitleNew(topTitle);
      toggleTopbarBackButton(true);

      setTimeout(() => {
        const nombreInput = document.getElementById('fc-n');
        if (nombreInput) nombreInput.focus({ preventScroll: true });
        onTipoCh();
        initWysiwygPaste('fc-desc-ed');
        initWysiwygPaste('fc-req-ed');
        initWysiwygPaste('fc-alc-ed');
        initWysiwygPaste('fc-prog');
        const activoCb = document.getElementById('fc-act-v');
        const inscCb = document.getElementById('fc-ia-v');
        const nuevaCb = document.getElementById('fc-nv');
        const proxCb = document.getElementById('fc-prox');
        const inscDate = document.getElementById('fc-ia-d');
        const actDate = document.getElementById('fc-act-d');
        const startedAsProximamente = !!(c?.proximamenteInicial === true || (c?.proximamente === true && c?.proximamenteInicial !== false));
        let prevProxChecked = proxCb?.checked === true;
        const syncStateRules = () => {
          if (!activoCb || !inscCb || !nuevaCb || !proxCb) return;
          const turnedOffProximamente = prevProxChecked && !proxCb.checked;

          if (turnedOffProximamente && startedAsProximamente) {
            nuevaCb.checked = true;
            activoCb.checked = true;
            inscCb.checked = true;
            if (inscDate) inscDate.value = '';
            if (actDate) actDate.value = '';
          }

          // 1) Próximamente: bloquea todo lo demás.
          if (proxCb.checked) {
            nuevaCb.checked = false;
            activoCb.checked = false;
            inscCb.checked = false;
            if (inscDate) inscDate.value = '';
            if (actDate) actDate.value = '';
            nuevaCb.disabled = true;
            activoCb.disabled = true;
            inscCb.disabled = true;
            if (inscDate) inscDate.disabled = true;
            if (actDate) actDate.disabled = true;
            prevProxChecked = proxCb.checked;
            return;
          }

          // Base sin "Próximamente".
          nuevaCb.disabled = false;
          activoCb.disabled = false;
          inscCb.disabled = false;
          if (inscDate) inscDate.disabled = false;
          if (actDate) actDate.disabled = true; // disponibilidad no usa fecha visible

          // 2) Nueva propuesta: activa disponibilidad y bloquea disponibilidad + próximamente.
          if (nuevaCb.checked) {
            activoCb.checked = true;
            proxCb.checked = false;
            activoCb.disabled = true;
            proxCb.disabled = true;
            prevProxChecked = proxCb.checked;
            return;
          }

          // 3) Inscripciones abiertas: activa disponibilidad por defecto y bloquea próximamente.
          if (inscCb.checked) {
            activoCb.checked = true;
            proxCb.checked = false;
            activoCb.disabled = true;
            proxCb.disabled = true;
            prevProxChecked = proxCb.checked;
            return;
          }

          // 4) Disponibilidad (sin nueva): bloquea próximamente.
          if (activoCb.checked) {
            proxCb.checked = false;
            proxCb.disabled = true;
            prevProxChecked = proxCb.checked;
            return;
          }

          // 5) Sin checks relevantes: todo disponible.
          proxCb.disabled = false;
          prevProxChecked = proxCb.checked;
        };

        [activoCb, inscCb, nuevaCb, proxCb].forEach((cb) => cb?.addEventListener('change', syncStateRules));
        syncStateRules();
      }, 100);
    }

    function docRow(d, i, tipos, orgs) {
      return `<div class="doc-item" id="doc-item-${i}">
        <div class="doc-hdr"><span class="doc-title">Documento ${i + 1}</span><button type="button" class="btn btn-rd btn-sm" onclick="rmDoc(${i})">Quitar</button></div>
        <div class="doc-grid">
          <div class="fg" style="margin:0"><label class="fl">Instrumento</label><select class="fs" id="doc-tipo-${i}" onchange="filtOrgs(${i})">${tipos.map((t) => `<option ${d.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="fg" style="margin:0"><label class="fl">Organismo</label><select class="fs" id="doc-org-${i}">${getOrgsForTipo(d.tipo, orgs).map((o) => `<option ${d.organismo === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="fg" style="margin:0"><label class="fl">Número</label><input class="fi" id="doc-num-${i}" value="${esc(d.numero || '')}"/></div>
          <div class="fg" style="margin:0"><label class="fl">Año</label><input class="fi" id="doc-anio-${i}" value="${esc(d.anio || '')}" maxlength="4" placeholder="2024"/></div>
        </div>
        <div class="fg" style="margin-top:8px">
          <label class="fl">Archivo PDF</label>
          ${d.pdf ? `<div style="margin-bottom:5px"><a class="pdf-link" href="${d.pdf}" target="_blank">Ver PDF actual</a></div>` : ''}
          <div class="fup" onclick="document.getElementById('doc-pdf-${i}').click()">
            <input type="file" id="doc-pdf-${i}" accept="application/pdf" onchange="fnm(this,'doc-pdf-n-${i}')"/>
            <div class="fup-hint">Seleccionar PDF</div><div class="fup-name" id="doc-pdf-n-${i}"></div>
          </div>
        </div>
      </div>`;
    }

    function wf(cmd, val) {
      document.execCommand('styleWithCSS', false, false);
      document.execCommand(cmd, false, val || null);
      document.getElementById('fc-prog')?.focus();
    }

    function wf2(cmd, targetId, val) {
      document.getElementById(targetId)?.focus();
      document.execCommand('styleWithCSS', false, false);
      document.execCommand(cmd, false, val || null);
    }

    function wfLink(targetId) {
      const sel = window.getSelection();
      linkRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;
      linkTarget = targetId;
      const existing = document.getElementById('link-overlay');
      if (existing) existing.remove();
      const ov = document.createElement('div');
      ov.id = 'link-overlay';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(13,27,42,.35);z-index:9999;display:flex;align-items:center;justify-content:center';
      ov.innerHTML = `<div style="background:var(--sf);border-radius:var(--rmd);padding:22px 24px;min-width:360px;box-shadow:0 12px 40px rgba(0,0,0,.2)">
        <div style="font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mt);margin-bottom:10px">Insertar hipervínculo</div>
        <input id="link-url-inp" class="fi" type="url" placeholder="https://ejemplo.com" style="margin-bottom:12px" value="https://"/>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-ol" onclick="document.getElementById('link-overlay').remove()">Cancelar</button>
          <button class="btn btn-cy" onclick="applyLink()">Insertar</button>
        </div>
      </div>`;
      document.body.appendChild(ov);
      ov.querySelector('#link-url-inp').focus();
      ov.querySelector('#link-url-inp').select();
      ov.querySelector('#link-url-inp').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyLink();
        if (e.key === 'Escape') ov.remove();
      });
    }

    function wfLinkProg() {
      wfLink('fc-prog');
    }

    function applyLink() {
      const url = document.getElementById('link-url-inp')?.value?.trim();
      document.getElementById('link-overlay')?.remove();
      if (!url || url === 'https://') return;
      const el = document.getElementById(linkTarget);
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (linkRange && sel) {
        sel.removeAllRanges();
        sel.addRange(linkRange);
      }
      document.execCommand('createLink', false, url);
      el.querySelectorAll('a').forEach((a) => {
        a.target = '_blank';
        a.rel = 'noopener';
        a.style.color = 'var(--cy)';
        a.style.textDecoration = 'underline';
      });
      linkTarget = null;
      linkRange = null;
    }

    function initWysiwygPaste(id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      });
    }

    const NIVEL_MAP = [
      { prefix: 'Tecnicatura', tipo: 'Pregrado', subtipo: '' },
      { prefix: 'Especialización', tipo: 'Posgrado', subtipo: 'Especialización' },
      { prefix: 'Maestría', tipo: 'Posgrado', subtipo: 'Maestría' },
      { prefix: 'Doctorado', tipo: 'Posgrado', subtipo: 'Doctorado' },
      { prefix: 'Licenciatura', tipo: 'Grado', subtipo: '' },
      { prefix: 'Profesorado', tipo: 'Grado', subtipo: '' },
      { prefix: 'Ingeniería', tipo: 'Grado', subtipo: '' },
    ];

    function autoNivel(val) {
      const v = val.trim();
      const match = NIVEL_MAP.find((m) => v.toLowerCase().startsWith(m.prefix.toLowerCase()));
      if (!match) {
        onNivelCh();
        return;
      }
      const nivel = document.getElementById('fc-nivel');
      const subtipo = document.getElementById('fc-subtipo');
      const subGrp = document.getElementById('fc-subtipo-grp');
      if (nivel && nivel.value === '') nivel.value = match.tipo;
      if (subtipo && subGrp && match.subtipo && subtipo.value === '') {
        subtipo.value = match.subtipo;
        subGrp.style.display = '';
      } else if (subGrp && !match.subtipo) {
        subGrp.style.display = 'none';
      }
      onNivelCh();
    }

    function onNivelCh() {
      const nivel = document.getElementById('fc-nivel')?.value;
      const sg = document.getElementById('fc-subtipo-grp');
      const ag = document.getElementById('fc-alc-grp');
      if (sg) sg.style.display = nivel === 'Posgrado' ? '' : 'none';
      if (ag) ag.style.display = (nivel === 'Pregrado' || nivel === 'Grado') ? '' : 'none';
      if (nivel !== 'Posgrado') {
        const ss = document.getElementById('fc-subtipo');
        if (ss) ss.value = '';
      }
    }

    function onTipoCh() {
      const isCurso = document.querySelector('input[name="fc-tipo"]:checked')?.value === 'true';
      const g = (id) => document.getElementById(id);
      const planProgTitle = g('fc-plan-prog-title');
      const planProgTitleGrp = g('fc-plan-prog-title-grp');
      const planSep = g('fc-plan-sep');
      const grid = document.querySelector('[data-carr-form="1"] .fgrid');
      if (g('fc-dis-grp')) g('fc-dis-grp').style.display = isCurso ? '' : 'none';
      if (g('fc-form-grp')) g('fc-form-grp').style.display = isCurso ? '' : 'none';
      if (g('fc-plan-grp')) g('fc-plan-grp').style.display = isCurso ? 'none' : '';
      if (g('fc-prog-grp')) g('fc-prog-grp').style.display = isCurso ? '' : 'none';
      if (g('fc-nivel-grp')) g('fc-nivel-grp').style.display = isCurso ? 'none' : '';
      if (planProgTitle) {
        planProgTitle.textContent = isCurso ? 'Programa' : 'Plan de estudios';
      }
      if (planProgTitleGrp) planProgTitleGrp.style.display = isCurso ? 'none' : '';
      if (planSep) planSep.style.display = isCurso ? 'none' : '';
      if (g('fc-prog-label')) g('fc-prog-label').style.display = isCurso ? '' : 'none';
      if (grid) {
        const desc = g('fc-desc-grp');
        const req = g('fc-req-grp');
        const alc = g('fc-alc-grp');
        const tags = g('fc-tags-grp');
        const dis = g('fc-dis-grp');
        const form = g('fc-form-grp');
        const planSeparator = g('fc-plan-sep');
        const plan = g('fc-plan-grp');
        const prog = g('fc-prog-grp');
        const docsTitle = g('fc-docs-title-grp');
        const docs = g('fc-docs-grp');
        const statesSep = g('fc-states-sep');
        const statesTitle = g('fc-states-title-grp');
        const states = g('fc-states-grp');
        const orderedNodes = isCurso
          ? [dis, desc, req, prog, tags, form, docsTitle, docs, statesSep, statesTitle, states]
          : [desc, req, alc, tags, planSeparator, planProgTitleGrp, plan, docsTitle, docs, statesSep, statesTitle, states];
        orderedNodes.forEach((node) => { if (node) grid.appendChild(node); });
      }
      if (g('fc-alc-grp')) {
        const nivel = g('fc-nivel')?.value;
        g('fc-alc-grp').style.display = (!isCurso && (nivel === 'Pregrado' || nivel === 'Grado')) ? '' : 'none';
      }
      if (isCurso) {
        const mod = g('fc-mod');
        if (mod && !mod.value) mod.value = '100% Virtual';
      }
    }

    function toggleUnitSel(el) {
      el.classList.toggle('sel');
      el.querySelector('input').checked = el.classList.contains('sel');
      const selU = [...document.querySelectorAll('input[name="fc-u"]:checked')].map((i) => i.value);
      const hasEad = selU.includes(EAD);
      if (hasEad) {
        document.querySelectorAll('input[name="fc-tipo"]').forEach((r) => { r.checked = r.value === 'true'; });
        onTipoCh();
      }
      const primary = selU[0] || '';
      const regional = UNIDAD_REGIONAL[primary] ?? '';
      const inp = document.getElementById('fc-reg');
      if (inp) inp.value = regional;
    }

    function filtOrgs(i) {
      const tipo = document.getElementById(`doc-tipo-${i}`)?.value;
      const sel = document.getElementById(`doc-org-${i}`);
      if (!sel) return;
      const cfgOrganismos = getCfg().organismos;
      const allOrgsRaw = cfgOrganismos?.length
        ? cfgOrganismos
        : ['Consejo Superior', 'Ministerial', 'SPU', 'SSPU', 'CONEAU'];
      const allOrgs = sortAlpha(allOrgsRaw.includes('Rectoral') ? allOrgsRaw : [...allOrgsRaw, 'Rectoral']);
      const filtered = sortAlpha(getOrgsForTipo(tipo, allOrgs));
      const cur = sel.value;
      sel.innerHTML = filtered.map((o) => `<option${o === cur ? ' selected' : ''}>${o}</option>`).join('');
      if (!filtered.includes(cur)) sel.value = filtered[0];
    }

    async function toggleInscripcion(id, nombre, activar) {
      if (!confirm(`¿${activar ? 'Abrir' : 'Cerrar'} inscripción de "${nombre}"?`)) return;
      try {
        await api(`/carreras/${id}`, { method: 'PATCH', body: JSON.stringify({ inscripcionAbierta: activar }) });
        toast(activar ? 'Inscripción abierta' : 'Inscripción cerrada', 'success');
        lcarr();
      } catch (e) {
        toast(e.message, 'error');
      }
    }

    function addDoc() {
      const cfg = getCfg();
      const tipos = sortAlpha(cfg.tiposDocumento?.length ? cfg.tiposDocumento : ['Resolución', 'Disposición', 'Ordenanza']);
      const orgsRaw = cfg.organismos?.length
        ? cfg.organismos
        : ['Consejo Superior', 'Ministerial', 'SPU', 'SSPU', 'CONEAU'];
      const orgs = sortAlpha(orgsRaw.includes('Rectoral') ? orgsRaw : [...orgsRaw, 'Rectoral']);
      const { cDocs } = getDraft();
      const i = cDocs.length;
      const nextDocs = [...cDocs, { tipo: tipos[0], organismo: orgs[0], numero: '', anio: '', pdf: null, _i: i }];
      updateDraft({ cDocs: nextDocs });
      const list = document.getElementById('doc-list');
      if (list) {
        const tmp = document.createElement('div');
        tmp.innerHTML = docRow(nextDocs[i], i, tipos, orgs);
        list.appendChild(tmp.firstElementChild);
      }
    }

    function rmDoc(i) {
      const cfg = getCfg();
      const tipos = sortAlpha(cfg.tiposDocumento?.length ? cfg.tiposDocumento : ['Resolución', 'Disposición', 'Ordenanza']);
      const orgsRaw = cfg.organismos?.length
        ? cfg.organismos
        : ['Consejo Superior', 'Ministerial', 'SPU', 'SSPU', 'CONEAU'];
      const orgs = sortAlpha(orgsRaw.includes('Rectoral') ? orgsRaw : [...orgsRaw, 'Rectoral']);
      const { cDocs } = getDraft();
      const nextDocs = [...cDocs];
      nextDocs.splice(i, 1);
      updateDraft({ cDocs: nextDocs });
      const list = document.getElementById('doc-list');
      if (!list) return;
      list.innerHTML = nextDocs.map((d, idx) => docRow(d, idx, tipos, orgs)).join('');
    }

    function fnm(inp, nid) {
      const el = document.getElementById(nid);
      const f = inp?.files?.[0];
      if (!f) {
        if (el) el.textContent = 'Ningún archivo';
        return;
      }
      if (f.size > MAX_UPLOAD_BYTES) {
        if (el) el.textContent = 'Archivo demasiado grande';
        inp.value = '';
        toast(`"${f.name}" supera el máximo de 20 MB por archivo.`, 'error');
        return;
      }
      if (el) el.textContent = f.name;
    }

    function addT(e, type) {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const raw = e.target.value;
        const vals = raw.split(';').map((s) => s.trim()).filter(Boolean);
        if (!vals.length) return;
        e.target.value = '';
        const { cTags, cDis } = getDraft();
        if (type === 'tags') {
          const next = [...cTags];
          vals.map((v) => v.toLowerCase()).forEach((v) => { if (!next.includes(v)) next.push(v); });
          updateDraft({ cTags: next });
          rtags();
        } else if (type === 'dis') {
          const next = [...cDis];
          vals.map((v) => properName(v)).forEach((v) => { if (!next.includes(v)) next.push(v); });
          updateDraft({ cDis: next });
          rdis();
        }
      }
    }

    function rmT(v, type) {
      const { cTags, cDis } = getDraft();
      if (type === 'tags') {
        updateDraft({ cTags: cTags.filter((t) => t !== v) });
        rtags();
      } else {
        updateDraft({ cDis: cDis.filter((d) => d !== v) });
        rdis();
      }
    }

    function rtags() {
      const { cTags } = getDraft();
      const w = document.getElementById('fc-tags');
      if (!w) return;
      w.innerHTML = cTags.map((t) => `<span class="tc">${esc(t)}<span class="trm" onclick="rmT('${esc(t)}','tags')">✕</span></span>`).join('');
      const ni = Object.assign(document.createElement('input'), { type: 'text', placeholder: 'Agregar…' });
      ni.addEventListener('keydown', (e) => addT(e, 'tags'));
      w.appendChild(ni);
      ni.focus();
    }

    function rdis() {
      const { cDis } = getDraft();
      const w = document.getElementById('fc-dis');
      if (!w) return;
      w.innerHTML = cDis.map((d) => `<span class="tc">${esc(d)}<span class="trm" onclick="rmT('${esc(d)}','dis')">✕</span></span>`).join('');
      const ni = Object.assign(document.createElement('input'), { type: 'text', placeholder: 'Agregar disertante…' });
      ni.addEventListener('keydown', (e) => addT(e, 'dis'));
      w.appendChild(ni);
      ni.focus();
    }

    async function saveCarr(id) {
      const nombre = document.getElementById('fc-n')?.value?.trim();
      const tipoRadios = [...document.querySelectorAll('input[name="fc-tipo"]')];
      const cursoRadio = tipoRadios.find((r) => String(r?.value) === 'true');
      const carreraRadio = tipoRadios.find((r) => String(r?.value) === 'false');
      // Robust against transient selector issues in some modal re-renders.
      const isCurso = (cursoRadio?.checked === true)
        || (carreraRadio && cursoRadio && carreraRadio.checked === false && cursoRadio.checked !== false);
      const unidades = [...document.querySelectorAll('input[name="fc-u"]:checked')].map((i) => i.value);
      const duracion = document.getElementById('fc-dur')?.value?.trim();
      if (!nombre) return toast('Nombre obligatorio', 'error');
      if (!isCurso && !document.getElementById('fc-nivel')?.value) return toast('Seleccioná el nivel académico', 'error');
      if (!document.getElementById('fc-disc')?.value?.trim()) return toast('Seleccioná la disciplina', 'error');
      if (!document.getElementById('fc-mod')?.value) return toast('Seleccioná la modalidad', 'error');
      if (!unidades.length) return toast('Seleccioná al menos una unidad académica', 'error');
      if (unidades.includes(EAD) && !isCurso) return toast('Educación a Distancia solo admite Cursos', 'error');

      const draft = getDraft();
      const normalizedDis = (draft.cDis || []).map((d) => properName(d)).filter(Boolean);
      updateDraft({ cDis: normalizedDis });

      const currentDraft = getDraft();
      const documentos = currentDraft.cDocs.map((_, i) => ({
        tipo: document.getElementById(`doc-tipo-${i}`)?.value || '',
        organismo: document.getElementById(`doc-org-${i}`)?.value || '',
        numero: document.getElementById(`doc-num-${i}`)?.value || '',
        anio: document.getElementById(`doc-anio-${i}`)?.value || '',
        pdf: currentDraft.cDocs[i]?.pdf || null,
      }));

      const docsReadyWithoutPdf = [];
      for (let i = 0; i < documentos.length; i += 1) {
        const numero = String(documentos[i]?.numero || '').trim();
        const anio = String(documentos[i]?.anio || '').trim();
        const selectedPdf = document.getElementById(`doc-pdf-${i}`)?.files?.[0];
        const hasNewPdf = !!selectedPdf;
        const hasExistingPdf = !!currentDraft.cDocs?.[i]?.pdf;

        if (hasNewPdf && (!numero || !anio)) {
          return toast(`Completá número y año del Documento ${i + 1} antes de subir el PDF.`, 'error');
        }
        if (numero && anio && !hasNewPdf && !hasExistingPdf) {
          docsReadyWithoutPdf.push(i + 1);
        }
      }
      if (docsReadyWithoutPdf.length) {
        const lista = docsReadyWithoutPdf.join(', ');
        const plural = docsReadyWithoutPdf.length > 1;
        const ok = confirm(
          `El/los documento(s) ${lista} tiene(n) número y año, pero no tiene(n) PDF cargado.\n\n¿Querés continuar y guardar igual?`
        );
        if (!ok) return;
      }

      const fd = new FormData();
      fd.append('nombre', nombre);
      fd.append('esCurso', String(isCurso));
      const tipoVal = isCurso ? 'Curso' : (document.getElementById('fc-nivel')?.value || '');
      const subtipoVal = document.getElementById('fc-subtipo')?.value || '';
      fd.append('tipo', tipoVal);
      fd.append('subtipo', subtipoVal);
      fd.append('unidadesAcademicas', JSON.stringify(unidades));
      const regionalVal = document.getElementById('fc-reg')?.value || '';
      const disciplinaVal = document.getElementById('fc-disc')?.value?.trim() || '';
      const modalidadVal = document.getElementById('fc-mod')?.value || 'Híbrida';
      fd.append('regional', regionalVal);
      fd.append('disciplina', disciplinaVal);
      fd.append('modalidad', modalidadVal);
      fd.append('duracion', duracion);
      const descripcion = compactRichHtml(document.getElementById('fc-desc-ed')?.innerHTML || '');
      const requisitosTexto = compactRichHtml(document.getElementById('fc-req-ed')?.innerHTML || '');
      const alcancesTitulo = compactRichHtml(!isCurso
        ? (document.getElementById('fc-alc-ed')?.innerHTML || '')
        : '');
      const programa = compactRichHtml(isCurso ? document.getElementById('fc-prog')?.innerHTML || '' : '');
      if ((descripcion.length + requisitosTexto.length + alcancesTitulo.length + programa.length) > 220000) {
        toast('El contenido de texto es demasiado extenso. Reducí texto/formatos y reintentá.', 'error');
        return;
      }
      fd.append('descripcion', descripcion);
      const contactoInput = document.getElementById('fc-cont');
      const contactoRaw = contactoInput?.value?.trim() || '';
      const contactoVal = contactoRaw || 'ead@unam.edu.ar';
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactoVal);
      if (!emailOk) return toast('Ingresá un correo de contacto válido', 'error');
      const telefonoContactoVal = document.getElementById('fc-tel-cont')?.value?.trim() || '';
      fd.append('contacto', contactoVal);
      fd.append('telefonoContacto', telefonoContactoVal);
      fd.append('requisitosTexto', requisitosTexto);
      fd.append('alcancesTitulo', alcancesTitulo);
      fd.append('alcancesDelTitulo', alcancesTitulo);
      fd.append('alcances', alcancesTitulo);
      const formularioVal = isCurso ? document.getElementById('fc-form')?.value?.trim() || '' : '';
      fd.append('formularioInscripcion', formularioVal);
      fd.append('programa', programa);
      fd.append('tags', JSON.stringify(currentDraft.cTags || []));
      fd.append('disertantes', JSON.stringify(currentDraft.cDis || []));
      fd.append('documentos', JSON.stringify(documentos));
      const nuevaVal = document.getElementById('fc-nv')?.checked === true;
      const proximamenteVal = document.getElementById('fc-prox')?.checked === true;
      const inscValor = document.getElementById('fc-ia-v')?.checked === true;
      const inscFechaEstado = document.getElementById('fc-ia-d')?.value || '';
      const inscFecha = inscFechaEstado;
      fd.append('nueva', String(nuevaVal));
      fd.append('proximamente', String(proximamenteVal));
      fd.append('inscripcionAbiertaValor', String(inscValor));
      fd.append('inscripcionAbiertaFecha', inscFecha);
      const activoChecked = document.getElementById('fc-act-v');
      const activoValor = activoChecked ? activoChecked.checked : true;
      const activoFecha = document.getElementById('fc-act-d')?.value || '';
      fd.append('activoValor', String(activoValor));
      fd.append('activoFecha', activoFecha);

      const planF = document.getElementById('fc-plan')?.files[0];
      const docFiles = [];
      if (planF && planF.size > MAX_UPLOAD_BYTES) return toast(`"${planF.name}" supera el máximo de 20 MB por archivo.`, 'error');
      if (planF) fd.append('planEstudiosPDF', planF, planF.name);
      let oversizedDocName = '';
      currentDraft.cDocs.forEach((_, i) => {
        const f = document.getElementById(`doc-pdf-${i}`)?.files[0];
        if (!f) return;
        if (f.size > MAX_UPLOAD_BYTES) {
          oversizedDocName = f.name;
          return;
        }
        fd.append(`doc_pdf_${i}`, f, f.name);
        docFiles.push(f);
      });
      if (oversizedDocName) return toast(`"${oversizedDocName}" supera el máximo de 20 MB por archivo.`, 'error');
      const hasBinaryFiles = !!planF || docFiles.length > 0;

      const jsonPayload = {
        nombre,
        esCurso: isCurso,
        tipo: tipoVal,
        subtipo: subtipoVal,
        unidadesAcademicas: unidades,
        regional: regionalVal,
        disciplina: disciplinaVal,
        modalidad: modalidadVal,
        duracion,
        descripcion,
        contacto: contactoVal,
        telefonoContacto: telefonoContactoVal,
        requisitosTexto,
        alcancesTitulo,
        alcancesDelTitulo: alcancesTitulo,
        alcances: alcancesTitulo,
        formularioInscripcion: formularioVal,
        programa,
        tags: currentDraft.cTags || [],
        disertantes: currentDraft.cDis || [],
        documentos,
        nueva: nuevaVal,
        proximamente: proximamenteVal,
        inscripcionAbiertaValor: inscValor,
        inscripcionAbiertaFecha: inscFecha,
        activoValor,
        activoFecha,
      };

      const saveBtn = document.getElementById('carr-save-btn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.5';
      }

      const formRoot = document.querySelector('[data-carr-form="1"]');
      let progWrap = document.getElementById('save-progress');
      if (!progWrap && formRoot) {
        progWrap = document.createElement('div');
        progWrap.id = 'save-progress';
        progWrap.style.cssText = 'margin:12px 0 0;padding:14px 18px;background:var(--ev);border-radius:var(--r);border:1px solid var(--bd)';
        progWrap.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px">' +
            '<span style="font-size:.8rem;font-weight:600;color:var(--tx2)" id="sp-lbl">Preparando…</span>' +
            '<span style="font-size:.78rem;color:var(--mt)" id="sp-pct">0%</span>' +
          '</div>' +
          '<div style="height:7px;background:var(--bd);border-radius:4px;overflow:hidden">' +
            '<div id="sp-bar" style="height:100%;width:0%;background:var(--cy);border-radius:4px;transition:width .2s ease"></div>' +
          '</div>';
        const mact = formRoot.querySelector('.mact');
        if (mact) mact.before(progWrap); else formRoot.appendChild(progWrap);
      }

      function sp(pct, label) {
        const bar = document.getElementById('sp-bar');
        const lbl = document.getElementById('sp-lbl');
        const pctEl = document.getElementById('sp-pct');
        if (bar) {
          bar.style.width = `${pct}%`;
          bar.style.background = pct === 100 ? 'var(--gr)' : 'var(--cy)';
        }
        if (lbl && label) lbl.textContent = label;
        if (pctEl) pctEl.textContent = `${pct}%`;
      }

      function uploadFd(ep, method, formData) {
        return new Promise((resolve, reject) => {
          const tk = sessionStorage.getItem(TK);
          const xhr = new XMLHttpRequest();
          xhr.open(method, BASE + ep);
          if (tk) xhr.setRequestHeader('Authorization', `Bearer ${tk}`);
          xhr.upload.onloadstart = () => sp(8, 'Enviando…');
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round(8 + (e.loaded / e.total) * 72);
              sp(pct, pct < 40 ? 'Enviando datos…' : pct < 75 ? 'Subiendo archivos…' : 'Procesando…');
            }
          };
          xhr.upload.onload = () => sp(85, 'Guardando…');
          xhr.onload = () => {
            try {
              const d = JSON.parse(xhr.responseText);
              if (xhr.status >= 400) reject({ status: xhr.status, message: d.error || (`Error ${xhr.status}`) });
              else resolve(d);
            } catch {
              const raw = String(xhr.responseText || '').trim();
              const detail = raw ? ` ${raw.slice(0, 140)}` : '';
              if (xhr.status === 413) {
                reject({ status: 413, message: 'El contenido a guardar es demasiado grande (HTTP 413). Reducí texto pegado o archivos adjuntos y reintentá.' });
                return;
              }
              reject({ status: xhr.status, message: `Error de respuesta del servidor (HTTP ${xhr.status}).${detail}` });
            }
          };
          xhr.onerror = () => reject({ status: 0, message: 'Error de red al guardar' });
          xhr.send(formData);
        });
      }

      async function uploadFileInChunks(savedId, file, target, docIndex = -1) {
        const CHUNK_BYTES = 1 * 1024 * 1024;
        const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_BYTES));
        const uploadId = `up_${savedId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const tk = sessionStorage.getItem(TK);

        for (let i = 0; i < totalChunks; i += 1) {
          const start = i * CHUNK_BYTES;
          const end = Math.min(file.size, start + CHUNK_BYTES);
          const chunk = file.slice(start, end);
          const q = new URLSearchParams({
            uploadId,
            target,
            careerId: String(savedId),
            chunkIndex: String(i),
            totalChunks: String(totalChunks),
            filename: file.name || 'archivo.pdf',
            finalize: i === totalChunks - 1 ? 'true' : 'false',
          });
          if (target === 'doc') q.set('docIndex', String(docIndex));

          const pct = 90 + Math.round(((i + 1) / totalChunks) * 9);
          sp(Math.min(pct, 99), `Subiendo ${target === 'plan' ? 'plan' : `documento ${docIndex + 1}`} por partes (${i + 1}/${totalChunks})…`);

          const res = await fetch(`${BASE}/uploads/chunk?${q.toString()}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
            },
            body: chunk,
          });
          const raw = await res.text();
          let data = {};
          if (raw) {
            try { data = JSON.parse(raw); } catch { data = {}; }
          }
          if (!res.ok) {
            throw { status: res.status, message: data.error || `Error al subir chunk (${res.status})` };
          }
          if (data?.carrera) return data.carrera;
        }
        return null;
      }

      async function uploadSingleAttachment(savedId, payload, meta = {}) {
        try {
          return await uploadFd(`/carreras/${savedId}`, 'PUT', payload);
        } catch (err) {
          const is413 = err?.status === 413 || /HTTP 413/.test(String(err?.message || ''));
          if (!is413 || !meta.file) throw err;
          return uploadFileInChunks(savedId, meta.file, meta.target, meta.docIndex);
        }
      }

      async function uploadAttachmentsInSteps(savedId, initialDocs) {
        let currentDocs = Array.isArray(initialDocs) ? initialDocs : (jsonPayload.documentos || []);
        const totalSteps = (planF ? 1 : 0) + docFiles.length;
        let currentStep = 0;
        const bumpProgress = () => {
          if (!totalSteps) return;
          const pct = 90 + Math.round((currentStep / totalSteps) * 9);
          sp(Math.min(pct, 99), `Subiendo adjuntos (${currentStep}/${totalSteps})…`);
        };

        if (planF) {
          currentStep += 1;
          bumpProgress();
          const fdPlan = new FormData();
          fdPlan.append('documentos', JSON.stringify(currentDocs));
          fdPlan.append('planEstudiosPDF', planF, planF.name);
          const updated = await uploadSingleAttachment(savedId, fdPlan, { target: 'plan', file: planF });
          if (Array.isArray(updated?.documentos)) currentDocs = updated.documentos;
        }

        for (let i = 0; i < currentDraft.cDocs.length; i += 1) {
          const f = document.getElementById(`doc-pdf-${i}`)?.files[0];
          if (!f) continue;
          currentStep += 1;
          bumpProgress();
          const fdDoc = new FormData();
          fdDoc.append('documentos', JSON.stringify(currentDocs));
          fdDoc.append(`doc_pdf_${i}`, f, f.name);
          const updated = await uploadSingleAttachment(savedId, fdDoc, { target: 'doc', file: f, docIndex: i });
          if (Array.isArray(updated?.documentos)) currentDocs = updated.documentos;
        }
        return currentDocs;
      }

      async function saveInStagedMode() {
        const lightPayload = {
          ...jsonPayload,
          documentos: (jsonPayload.documentos || []).map((d) => ({ ...d, pdf: d?.pdf || null })),
        };
        sp(88, 'Guardando metadatos en modo liviano…');
        const saved = await api(id ? `/carreras/${id}` : '/carreras', { method: id ? 'PUT' : 'POST', body: JSON.stringify(lightPayload) });
        if (hasBinaryFiles) {
          const savedId = id || saved?.id;
          if (!savedId) throw { message: 'No se pudo identificar la propuesta para completar la carga de adjuntos.' };
          sp(90, 'Subiendo adjuntos por partes…');
          const initialDocsForUpload = Array.isArray(saved?.documentos) && saved.documentos.length
            ? saved.documentos
            : lightPayload.documentos;
          await uploadAttachmentsInSteps(savedId, initialDocsForUpload);
        }
      }

      try {
        sp(5, 'Iniciando…');
        let saved;
        if (hasBinaryFiles) {
          await saveInStagedMode();
          saved = { id };
        } else {
          sp(80, 'Guardando…');
          saved = await api(id ? `/carreras/${id}` : '/carreras', { method: id ? 'PUT' : 'POST', body: JSON.stringify(jsonPayload) });
        }
        const savedId = id || saved?.id;
        if (savedId) {
          const fresh = await api(`/carreras/${savedId}`);
          const telSent = document.getElementById('fc-tel-cont')?.value || '';
          const normalizePhone = (value) => String(value || '').trim().replace(/[^\d+]/g, '');
          const sentPhone = normalizePhone(telSent);
          const savedPhone = normalizePhone(fresh?.telefonoContacto || '');
          if (sentPhone && savedPhone && sentPhone !== savedPhone) {
            console.warn('[cpanel-careers] Diferencia de formato en teléfono luego de guardar', { sentPhone, savedPhone });
          }
        }
        sp(100, '¡Guardado correctamente!');
        await new Promise((r) => setTimeout(r, 500));
        toast(id ? 'Propuesta actualizada' : 'Propuesta creada', 'success');
        closeCarrForm();
        setCp(1);
        setCf({ q: '', esCurso: '', activo: '', unidad: '', regional: '', inscripcionAbierta: '' });
        lcarr();
      } catch (e) {
        const is413 = e?.status === 413 || /HTTP 413/.test(String(e?.message || ''));
        if (is413) {
          try {
            sp(88, 'Reintentando en modo liviano…');
            await saveInStagedMode();
            sp(100, '¡Guardado correctamente!');
            await new Promise((r) => setTimeout(r, 450));
            toast(hasBinaryFiles ? 'Propuesta guardada y adjuntos cargados en una segunda pasada.' : 'Propuesta guardada en modo liviano.', 'success');
            closeCarrForm();
            setCp(1);
            setCf({ q: '', esCurso: '', activo: '', unidad: '', regional: '', inscripcionAbierta: '' });
            lcarr();
            return;
          } catch (fallbackErr) {
            const fallbackMessage = fallbackErr?.message ? ` Reintento falló: ${fallbackErr.message}` : '';
            e = { ...e, message: `${e.message || 'Error al guardar por límite de tamaño.'}${fallbackMessage}` };
          }
        }
        toast(e.message || 'Error al guardar. Verificá los datos e intentá nuevamente.', 'error');
        const sb = document.getElementById('carr-save-btn');
        if (sb) {
          sb.disabled = false;
          sb.style.opacity = '';
        }
        document.getElementById('save-progress')?.remove();
      }
    }

    async function toggleActivarCarr(id, nombre, activar) {
      const msg = activar ? `¿Activar "${nombre}"? Volverá a ser visible en el sitio.` : `¿Finalizar "${nombre}"? Quedará como finalizada y las inscripciones se cerrarán.`;
      if (!confirm(msg)) return;
      try {
        await api(`/carreras/${id}`, { method: 'PATCH', body: JSON.stringify({ activo: activar }) });
        toast(activar ? 'Propuesta activada' : 'Propuesta desactivada', 'success');
        lcarr();
      } catch (e) {
        toast(e.message, 'error');
      }
    }

    async function eliminarCarr(id, nombre) {
      if (!confirm(`⚠️ ¿ELIMINAR DEFINITIVAMENTE "${nombre}"?\nEsta acción NO se puede deshacer.`)) return;
      try {
        const tk = sessionStorage.getItem(TK);
        const res = await fetch(`${BASE}/carreras/${id}?hard=true`, { method: 'DELETE', headers: { Authorization: `Bearer ${tk}` } });
        const d = await res.json();
        if (!res.ok) throw { message: d.error };
        toast('Eliminada permanentemente', 'success');
        lcarr();
      } catch (e) {
        toast(e.message, 'error');
      }
    }

    async function delCarr(id, nombre) {
      await toggleActivarCarr(id, nombre, false);
    }

    return {
      rcarr,
      lcarr,
      setCarrPage,
      closeCarrForm,
      openCarrForm,
      docRow,
      wf,
      wf2,
      wfLink,
      wfLinkProg,
      applyLink,
      initWysiwygPaste,
      autoNivel,
      onNivelCh,
      onTipoCh,
      toggleUnitSel,
      filtOrgs,
      toggleInscripcion,
      addDoc,
      rmDoc,
      fnm,
      addT,
      rmT,
      rtags,
      rdis,
      saveCarr,
      toggleActivarCarr,
      eliminarCarr,
      delCarr,
      sortCarrBy,
      exportCarrerasExcel,
    };
  }

  global.createCPanelCareers = createCPanelCareers;
})(window);
