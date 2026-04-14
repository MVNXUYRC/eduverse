(function initCPanelUsers(global) {
  function createCPanelUsers(deps) {
    const {
      BASE,
      TK,
      RL,
      api,
      toast,
      esc,
      showModal,
      cm,
      getMe,
      getCfg,
      getUserQuery,
      setUserQuery,
    } = deps;

    let usrPage = 1;
    let usrPageSize = '10';
    let usrSortBy = 'nombre';
    let usrSortDir = 'asc';
    let usrFormInline = false;
    let usrFilters = { q: '', rol: '', activo: '', unidad: '' };

    function sortAlpha(values = []) {
      return [...new Set((values || [])
        .map((v) => String(v || '').trim())
        .filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
    }

    function setTopTitleList(topTitle) {
      if (!topTitle) return;
      topTitle.textContent = 'Usuarios';
    }

    function setTopTitleNew(topTitle) {
      if (!topTitle) return;
      topTitle.textContent = 'Nuevo usuario';
    }

    function setTopTitleEdit(topTitle) {
      if (!topTitle) return;
      topTitle.textContent = 'Editar usuario';
    }

    function toggleTopbarBackButton(show) {
      const topbar = document.querySelector('.topbar');
      if (!topbar) return;
      const current = document.getElementById('usr-top-back');
      if (!show) {
        if (current) current.remove();
        return;
      }
      if (current) return;
      const btn = document.createElement('button');
      btn.id = 'usr-top-back';
      btn.className = 'btn btn-ol';
      btn.textContent = 'Atrás';
      btn.style.width = '112px';
      btn.style.justifyContent = 'center';
      btn.style.marginLeft = 'auto';
      btn.style.marginRight = '20px';
      btn.onclick = () => closeUsrForm();
      topbar.appendChild(btn);
    }

    function sortUsers(rows) {
      const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const valueFor = (u) => {
        if (usrSortBy === 'rol') return RL[u.rol] || u.rol || '';
        if (usrSortBy === 'unidad') return (u.unidades || []).join(', ');
        if (usrSortBy === 'estado') return u.activo !== false ? 'activo' : 'inactivo';
        return `${u.nombre || ''} ${u.apellido || ''}`.trim();
      };
      return [...rows].sort((a, b) => {
        const av = norm(valueFor(a));
        const bv = norm(valueFor(b));
        const cmp = av.localeCompare(bv, 'es', { sensitivity: 'base', numeric: true });
        if (cmp !== 0) return usrSortDir === 'desc' ? -cmp : cmp;
        const fallback = norm(`${a.nombre || ''} ${a.apellido || ''}`).localeCompare(norm(`${b.nombre || ''} ${b.apellido || ''}`), 'es', { sensitivity: 'base', numeric: true });
        return usrSortDir === 'desc' ? -fallback : fallback;
      });
    }

    function applyUserFilters(rows) {
      const q = String(usrFilters.q || '').trim().toLowerCase();
      let filtered = [...rows];
      if (q) {
        filtered = filtered.filter((u) => {
          const name = `${u.nombre || ''} ${u.apellido || ''}`.toLowerCase();
          return name.includes(q)
            || String(u.email || '').toLowerCase().includes(q)
            || String(u.login || '').toLowerCase().includes(q);
        });
      }
      if (usrFilters.rol) filtered = filtered.filter((u) => String(u.rol || '') === usrFilters.rol);
      if (usrFilters.activo) filtered = filtered.filter((u) => String(u.activo !== false) === usrFilters.activo);
      if (usrFilters.unidad) filtered = filtered.filter((u) => (u.unidades || []).includes(usrFilters.unidad));
      return sortUsers(filtered);
    }

    function sortHead(label, key) {
      const isCurrent = usrSortBy === key;
      const indicator = isCurrent ? (usrSortDir === 'asc' ? '▲' : '▼') : '';
      return `<button type="button" onclick="sortUsrBy('${key}')" style="border:none;background:none;padding:0;margin:0;cursor:pointer;font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit;display:inline-flex;align-items:center;gap:5px">
        <span>${label}</span>
        <span style="font-size:.72rem;color:rgba(255,255,255,.65);min-width:10px">${indicator}</span>
      </button>`;
    }

    function escapeExcelCell(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    async function exportUsersExcel() {
      const btn = document.getElementById('btn-export-users');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳';
      }
      try {
        const allRows = (await api('/usuarios')).data || [];
        const rows = applyUserFilters(allRows);
        const headers = ['Nombre', 'Correo', 'Rol', 'Unidades', 'Estado'];
        const body = rows.map((u) => ([
          `${u.nombre || ''} ${u.apellido || ''}`.trim(),
          u.email || '',
          RL[u.rol] || u.rol || '',
          (u.unidades || []).join(', '),
          u.activo !== false ? 'Activo' : 'Inactivo',
        ]));
        const tableHeader = headers.map((h) => `<th style="border:none;padding:4px 8px;text-align:left">${escapeExcelCell(h)}</th>`).join('');
        const tableBody = body.map((row) => `<tr>${row.map((cell) => `<td style="border:none;padding:4px 8px">${escapeExcelCell(cell)}</td>`).join('')}</tr>`).join('');
        const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table style="border-collapse:collapse;border:none"><thead><tr>${tableHeader}</tr></thead><tbody>${tableBody}</tbody></table></body></html>`;
        const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `usuarios-${stamp}.xls`;
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

    async function rusr() {
      const me = getMe();
      if (me.rol === 'unidades') {
        document.getElementById('ct').innerHTML = '<div class="empty"><div class="ei">🔒</div><p>Sin permisos</p></div>';
        return;
      }
      const topTitle = document.getElementById('tbt');
      setTopTitleList(topTitle);
      toggleTopbarBackButton(false);
      usrFormInline = false;
      usrPage = 1;
      usrPageSize = '10';
      usrSortBy = 'nombre';
      usrSortDir = 'asc';
      usrFilters = { q: '', rol: '', activo: '', unidad: '' };
      setUserQuery('');
      document.getElementById('ct').innerHTML = `
        <div id="usr-root" style="font-family:'Ubuntu','Roboto',sans-serif">
          <div class="tb" id="usr-toolbar">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%">
              <div style="display:flex;align-items:center;gap:8px;min-width:280px;max-width:520px;flex:1">
                <div class="sb2" style="flex:1">🔍 <input type="text" id="us" placeholder="Buscar…" value=""/></div>
              </div>
              <div style="display:flex;justify-content:flex-end;min-width:140px;padding-right:20px">
                <button class="btn btn-cy" onclick="openUsrForm(null)" style="width:112px;justify-content:center">Agregar</button>
              </div>
            </div>
            <div style="width:100%;padding:12px;border:1.5px solid var(--bd);border-radius:var(--r);background:var(--sf)">
              <div class="tr2" style="width:100%;align-items:flex-end;gap:8px;justify-content:flex-start">
                <div style="display:flex;flex-direction:column;gap:5px;width:220px;min-width:220px;max-width:220px;flex:0 0 220px">
                  <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Rol</label>
                  <select class="fsel" id="ur2"><option value="">Todos</option></select>
                </div>
                <div style="display:flex;flex-direction:column;gap:5px;width:220px;min-width:220px;max-width:220px;flex:0 0 220px">
                  <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Estado</label>
                  <select class="fsel" id="ua2">
                    <option value="">Todos</option>
                    <option value="true">Activos</option>
                    <option value="false">Inactivos</option>
                  </select>
                </div>
                <div style="display:flex;flex-direction:column;gap:5px;width:260px;min-width:260px;max-width:260px;flex:0 0 260px">
                  <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Unidad Académica</label>
                  <select class="fsel" id="uu2"><option value="">Todas</option></select>
                </div>
                <div style="display:flex;align-items:flex-end;justify-content:flex-end;gap:8px;flex:1;min-width:160px;padding-right:4px">
                <div style="display:flex;flex-direction:column;gap:5px;width:140px;min-width:140px;max-width:140px;flex:0 0 140px">
                  <label style="font-size:10px;font-weight:700;color:var(--mt);text-transform:uppercase;letter-spacing:.04em">Registros</label>
                  <select class="fsel" id="u-limit">
                    <option value="10" selected>10</option>
                    <option value="20">20</option>
                    <option value="all">Todos</option>
                  </select>
                </div>
                <button class="btn btn-ol" id="btn-clear-user-filters" title="Limpiar filtros" aria-label="Limpiar filtros" style="width:52px;justify-content:center;padding-left:0;padding-right:0">🗑️</button>
                <button class="btn btn-ol" id="btn-export-users" title="Exportar" aria-label="Exportar" style="width:52px;justify-content:center;padding-left:0;padding-right:0">⬇️</button>
              </div>
            </div>
          </div>
          </div>
          <div id="usr-form-host"></div>
          <div id="utb"></div><div id="upg"></div>
        </div>`;
      const bind = () => {
        usrFilters = {
          q: document.getElementById('us')?.value || '',
          rol: document.getElementById('ur2')?.value || '',
          activo: document.getElementById('ua2')?.value || '',
          unidad: document.getElementById('uu2')?.value || '',
        };
        setUserQuery(usrFilters.q);
        usrPage = 1;
        lusers();
      };
      document.getElementById('us').addEventListener('input', bind);
      document.getElementById('ur2').addEventListener('change', bind);
      document.getElementById('ua2').addEventListener('change', bind);
      document.getElementById('uu2').addEventListener('change', bind);
      document.getElementById('u-limit').addEventListener('change', (event) => {
        usrPageSize = event.target.value || '10';
        usrPage = 1;
        lusers();
      });
      document.getElementById('btn-export-users').addEventListener('click', exportUsersExcel);
      document.getElementById('btn-clear-user-filters').addEventListener('click', () => {
        document.getElementById('us').value = '';
        document.getElementById('ur2').value = '';
        document.getElementById('ua2').value = '';
        document.getElementById('uu2').value = '';
        usrFilters = { q: '', rol: '', activo: '', unidad: '' };
        setUserQuery('');
        usrPage = 1;
        lusers();
      });
      lusers();
    }

    async function lusers() {
      try {
        const allRows = (await api('/usuarios')).data || [];
        const roleOptions = sortAlpha(allRows.map((u) => u.rol));
        const unitOptions = sortAlpha(allRows.flatMap((u) => u.unidades || []));
        const roleSel = document.getElementById('ur2');
        const unitSel = document.getElementById('uu2');
        if (roleSel) {
          const current = usrFilters.rol;
          roleSel.innerHTML = `<option value="">Todos</option>${roleOptions.map((r) => `<option value="${esc(r)}" ${current === r ? 'selected' : ''}>${esc(RL[r] || r)}</option>`).join('')}`;
        }
        if (unitSel) {
          const current = usrFilters.unidad;
          unitSel.innerHTML = `<option value="">Todas</option>${unitOptions.map((u) => `<option value="${esc(u)}" ${current === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}`;
        }
        const filteredRows = applyUserFilters(allRows);
        const me = getMe();
        const total = filteredRows.length;
        let rows = filteredRows;
        let page = usrPage;
        let totalPages = 1;
        if (usrPageSize !== 'all') {
          const perPage = usrPageSize === '20' ? 20 : 10;
          totalPages = Math.max(Math.ceil(total / perPage), 1);
          page = Math.min(Math.max(page, 1), totalPages);
          usrPage = page;
          rows = filteredRows.slice((page - 1) * perPage, page * perPage);
        } else {
          usrPage = 1;
          page = 1;
        }
        const registrosLabel = `Se encontraron ${total} registro${total === 1 ? '' : 's'} de usuario${total === 1 ? '' : 's'}.`;
        const recordsFooter = total > 0 ? `<div class="records-count" style="margin-top:10px">${registrosLabel}</div>` : '';
        document.getElementById('utb').innerHTML = rows.length ? `<div class="tw" style="font-size:.85rem"><table style="width:100%;table-layout:fixed">
          <colgroup>
            <col style="width:26%">
            <col style="width:16%">
            <col style="width:16%">
            <col style="width:16%">
            <col style="width:16%">
            <col style="width:10%">
          </colgroup>
          <thead><tr>
            <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('NOMBRE', 'nombre')}</th>
            <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">CORREO ELECTRÓNICO</th>
            <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('ROL', 'rol')}</th>
            <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('UNIDAD ACADÉMICA', 'unidad')}</th>
            <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">${sortHead('ESTADO', 'estado')}</th>
            <th style="text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.85);background:#161f2e;border-bottom:1px solid rgba(255,255,255,.12);text-transform:uppercase;letter-spacing:.04em">ACCIONES</th>
          </tr></thead>
          <tbody>${rows.map((u) => `<tr class="${u.activo !== false ? '' : 'row-finalizada'}">
            <td style="max-width:320px">${esc(u.nombre)} ${esc(u.apellido)}</td>
            <td style="padding-left:20px">${esc(u.email)}</td>
            <td style="padding-left:20px">${esc(RL[u.rol] || u.rol)}</td>
            <td style="${((u.unidades || []).join(', ') || '—') === '—' ? 'padding-left:0;text-align:center' : 'padding-left:20px'}">${esc((u.unidades || []).join(', ') || '—')}</td>
            <td style="padding-left:20px">${u.activo !== false ? 'Activo' : 'Inactivo'}</td>
            <td style="text-align:right"><div class="acts" style="gap:4px;justify-content:flex-end">
              ${(me.rol === 'root' || (me.rol === 'institucional' && u.rol === 'unidades')) ? `<button title="Editar usuario" class="btn btn-ge btn-sm" style="padding:5px 8px" onclick="openUsrForm(${u.id})">📝</button>` : ''}
              ${(me.rol === 'root' || (me.rol === 'institucional' && u.rol === 'unidades')) ? `<button title="Restablecer contraseña" class="btn btn-sm" style="padding:5px 8px;background:rgba(0,149,204,.08);color:var(--cy);border:1px solid rgba(0,149,204,.2)" onclick="resetUsrPwd(${u.id},'${esc(u.nombre + ' ' + u.apellido)}')">🔐</button>` : ''}
              ${(me.rol === 'root' || (me.rol === 'institucional' && u.rol === 'unidades')) ? (u.activo !== false
                ? `<button title="Desactivar usuario" class="btn btn-sm" style="padding:5px 8px;background:rgba(220,38,38,.07);color:var(--rd);border:1px solid rgba(220,38,38,.13)" onclick="delUsr(${u.id},'${esc(u.nombre + ' ' + u.apellido)}',false)">⛔</button>`
                : `<button title="Activar usuario" class="btn btn-sm" style="padding:5px 8px;background:rgba(58,170,53,.08);color:var(--gr);border:1px solid rgba(58,170,53,.2)" onclick="delUsr(${u.id},'${esc(u.nombre + ' ' + u.apellido)}',true)">✅</button>`) : ''}
              ${me.rol === 'root' ? `<button title="Eliminar definitivamente" class="btn btn-rd btn-sm" style="padding:5px 8px" onclick="eliminarUsr(${u.id},'${esc(u.nombre + ' ' + u.apellido)}')">🗑️</button>` : ''}
            </div></td>
          </tr>`).join('')}</tbody>
        </table></div>${recordsFooter}` : `<div class="empty"><div class="ei">👤</div><p>Sin usuarios</p></div>${recordsFooter}`;
        const pg = document.getElementById('upg');
        if (usrPageSize !== 'all' && totalPages > 1) {
          let buttons = '';
          for (let i = 1; i <= totalPages; i += 1) {
            buttons += `<button class="pb ${i === page ? 'active' : ''}" onclick="setUsrPage(${i})">${i}</button>`;
          }
          pg.innerHTML = `<div class="pag"><button class="pb" onclick="setUsrPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>←</button>${buttons}<button class="pb" onclick="setUsrPage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>→</button></div>`;
        } else {
          pg.innerHTML = '';
        }
      } catch (e) {
        toast(e.message, 'error');
      }
    }

    function setUsrPage(page) {
      usrPage = Math.max(1, Number.parseInt(page, 10) || 1);
      lusers();
    }

    function sortUsrBy(key) {
      if (usrSortBy === key) usrSortDir = usrSortDir === 'asc' ? 'desc' : 'asc';
      else {
        usrSortBy = key;
        usrSortDir = 'asc';
      }
      usrPage = 1;
      lusers();
    }

    function getRoles() {
      const me = getMe();
      if (me.rol === 'root') return [['root', 'root'], ['institucional', 'Administrador Institucional'], ['unidades', 'Administrador de Unidades']];
      if (me.rol === 'institucional') return [['unidades', 'Administrador de Unidades']];
      return [];
    }
    function randomLogin10() {
      const chars = 'abcdefghijklmnopqrstuvwxyz';
      let out = '';
      for (let i = 0; i < 10; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
      return out;
    }
    function generateRootAccessLogin(force = false) {
      const inp = document.getElementById('fu-l');
      if (!inp) return;
      if (force || !inp.value.trim()) inp.value = randomLogin10();
    }
    function regenRootAccessLogin() {
      generateRootAccessLogin(true);
    }

    function userPassModal(title, label, password) {
      window._newUserPass = password || '';
      showModal(`<div class="mhdr"><h2 class="mtitle">${esc(title)}</h2><div class="mclose" onclick="cm()">✕</div></div>
        <div class="alr alr-warn" style="margin-bottom:12px">Por seguridad queda oculta por defecto. Podés verla o copiarla ahora.</div>
        <div class="gp" style="display:block">
          <div class="gp-lbl">${esc(label)}</div>
          <div class="gp-row">
            <div class="gp-code" id="new-gpc">••••••••••</div>
            <button class="gp-copy" type="button" onclick="tgpNew()" title="Mostrar u ocultar contraseña">👁</button>
            <button class="gp-copy" type="button" onclick="cpNew()">Copiar</button>
          </div>
        </div>
        <div class="mact"><button class="btn btn-cy" onclick="cm();lusers()">Entendido</button></div>`);
    }

    function closeUsrForm() {
      if (!usrFormInline) return;
      const host = document.getElementById('usr-form-host');
      const toolbar = document.getElementById('usr-toolbar');
      const tableWrap = document.getElementById('utb');
      const pagerWrap = document.getElementById('upg');
      const topTitle = document.getElementById('tbt');
      if (host) host.innerHTML = '';
      if (toolbar) toolbar.style.display = '';
      if (tableWrap) tableWrap.style.display = '';
      if (pagerWrap) pagerWrap.style.display = '';
      setTopTitleList(topTitle);
      toggleTopbarBackButton(false);
      usrFormInline = false;
    }

    async function openUsrForm(id) {
      const parsedId = Number.parseInt(id, 10);
      const userId = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null;
      let u = null;
      if (userId) {
        try {
          u = (await api('/usuarios')).data?.find((x) => x.id === userId);
        } catch {}
      }
      const me = getMe();
      if (userId && !u) {
        toast('No tenés permisos para editar este usuario', 'error');
        return;
      }
      if (userId && me.rol === 'institucional' && u?.rol !== 'unidades') {
        toast('No tenés permisos para editar este usuario', 'error');
        return;
      }
      const roles = getRoles();
      const cfg = getCfg();
      const udis = me.rol === 'institucional' ? (me.unidades || []) : (cfg.unidadesAcademicas || []);
      const showU = (r) => r === 'unidades';
      const selectedRole = u?.rol || '';
      const showLogin = selectedRole === 'root';
      const suggestedLogin = u?.login || randomLogin10();
      const formHtml = `
        <div class="fgrid">
          <div class="fg"><label class="fl">Nombre/s *</label><input class="fi" id="fu-n" value="${esc(u?.nombre || '')}" placeholder="José Ignacio"/><div class="fhint">Formato Nombre Propio</div></div>
          <div class="fg"><label class="fl">Apellido/s *</label><input class="fi" id="fu-a" value="${esc(u?.apellido || '')}" placeholder="López"/></div>
          <div class="fg"><label class="fl">Documento de identidad *</label><input class="fi" id="fu-d" value="${esc(u?.dni || '')}" placeholder="28456789" maxlength="11" oninput="this.value=this.value.replace(/[^0-9.]/g,'')"/></div>
          <div class="fg"><label class="fl">Teléfono Móvil *</label><input class="fi" id="fu-t" value="${esc(u?.telefono || '')}" placeholder="3764123456" oninput="this.value=this.value.replace(/[^0-9+\\s-]/g,'')"/></div>
          <div class="fg ff"><label class="fl">Correo institucional *</label><input class="fi" id="fu-e" type="email" value="${esc(u?.email || '')}" placeholder="informes@unam.edu.ar"/></div>
          <div class="fg"><label class="fl">Rol *</label><select class="fs" id="fu-r" onchange="onRolCh()"><option value="">Seleccionar</option>${roles.map(([v, l]) => `<option value="${v}" ${u?.rol === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="fg ff" id="fu-l-grp" style="${showLogin ? '' : 'display:none'}">
            <label class="fl">Usuario de acceso (solo root) *</label>
            <div style="display:flex;gap:8px;align-items:center">
              <input class="fi" id="fu-l" value="${esc(suggestedLogin || '')}" placeholder="ej: ${esc(randomLogin10())}" style="flex:1"/>
              <button type="button" class="btn btn-ol btn-sm" onclick="regenRootAccessLogin()">Generar otro</button>
            </div>
            <div class="fhint">10 caracteres en minúsculas. Solo válido para usuarios con rol root.</div>
          </div>
          ${userId ? `<div class="fg" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="fu-act" ${u?.activo !== false ? 'checked' : ''} style="accent-color:var(--cy);width:15px;height:15px"/><label style="font-size:.92rem;color:var(--tx);cursor:pointer" for="fu-act">Usuario activo</label></div>` : ''}
          <div class="fg ff" id="fu-u-grp" style="${showU(selectedRole) ? '' : 'display:none'}">
            <label class="fl">Unidades académicas *</label>
            <div class="units-list">${udis.map((un) => { const chk = (u?.unidades || []).includes(un); return `<label class="unit-item${chk ? ' sel' : ''}" onclick="this.classList.toggle('sel');this.querySelector('input').checked=this.classList.contains('sel')"><input type="checkbox" value="${esc(un)}" ${chk ? 'checked' : ''}/>${esc(un)}</label>`; }).join('')}</div>
            <div class="fhint">Podés asignar una o más</div>
          </div>
        </div>
        <div class="mact">
          ${userId ? `<button class="btn btn-sm" style="background:rgba(217,119,6,.08);color:var(--or);border:1px solid rgba(217,119,6,.2);margin-right:auto" onclick="resetUsrPwd(${userId},'${esc((u?.nombre || '') + ' ' + (u?.apellido || ''))}')">Restablecer contraseña</button>` : ''}
          <button class="btn btn-cy" id="usr-save-btn" onclick="saveUsr(${userId || 'null'})" style="width:112px;justify-content:center">Guardar</button>
        </div>`;

      const host = document.getElementById('usr-form-host');
      const toolbar = document.getElementById('usr-toolbar');
      const tableWrap = document.getElementById('utb');
      const pagerWrap = document.getElementById('upg');
      const topTitle = document.getElementById('tbt');
      if (host) {
        host.innerHTML = `<div class="tw" style="margin-bottom:14px"><div style="padding:18px">${formHtml}</div></div>`;
      }
      if (toolbar) toolbar.style.display = 'none';
      if (tableWrap) tableWrap.style.display = 'none';
      if (pagerWrap) pagerWrap.style.display = 'none';
      if (userId) setTopTitleEdit(topTitle);
      else setTopTitleNew(topTitle);
      toggleTopbarBackButton(true);
      usrFormInline = true;
      setTimeout(() => {
        document.getElementById('fu-n')?.focus({ preventScroll: true });
      }, 50);
    }

    function onRolCh() {
      const r = document.getElementById('fu-r')?.value;
      const g = document.getElementById('fu-u-grp');
      const lg = document.getElementById('fu-l-grp');
      if (g) g.style.display = r === 'unidades' ? '' : 'none';
      if (lg) lg.style.display = r === 'root' ? '' : 'none';
      if (r === 'root') generateRootAccessLogin(false);
    }

    async function saveUsr(id) {
      const parsedId = Number.parseInt(id, 10);
      const userId = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null;
      const nombre = document.getElementById('fu-n')?.value?.trim();
      const apellido = document.getElementById('fu-a')?.value?.trim();
      const login = document.getElementById('fu-l')?.value?.trim();
      const dni = document.getElementById('fu-d')?.value?.trim();
      const email = document.getElementById('fu-e')?.value?.trim();
      const tel = document.getElementById('fu-t')?.value?.trim();
      const rol = document.getElementById('fu-r')?.value;
      const unidades = [...document.querySelectorAll('#fu-u-grp input[type=checkbox]:checked')].map((el) => el.value);
      if (!nombre) return toast('Nombre obligatorio', 'error');
      if (!apellido) return toast('Apellido obligatorio', 'error');
      if (!dni) return toast('Documento obligatorio', 'error');
      if (!email) return toast('Correo obligatorio', 'error');
      if (!tel) return toast('Teléfono obligatorio', 'error');
      if (!rol) return toast('Rol obligatorio', 'error');
      if (rol === 'root' && !login) return toast('Usuario de acceso obligatorio para root', 'error');
      if (rol === 'unidades' && !unidades.length) return toast('Asigná al menos una unidad académica para este rol', 'error');
      const body = { nombre, apellido, dni, email, telefono: tel, rol, unidades };
      if (rol === 'root') body.login = login;
      if (userId) body.activo = document.getElementById('fu-act')?.checked !== false;
      const usrSaveBtn = document.getElementById('usr-save-btn');
      if (usrSaveBtn) {
        usrSaveBtn.disabled = true;
        usrSaveBtn.textContent = 'Guardando…';
      }
      try {
        const res = userId
          ? await api(`/usuarios/${userId}`, { method: 'PUT', body: JSON.stringify(body) })
          : await api('/usuarios', { method: 'POST', body: JSON.stringify(body) });
        if (res?.generatedPassword) {
          const safeName = `${nombre} ${apellido}`.trim();
          userPassModal('Contraseña generada', `${userId ? 'Contraseña restablecida' : 'Contraseña inicial'} para ${safeName}`, res.generatedPassword);
        } else {
          toast(userId ? 'Usuario actualizado' : 'Usuario creado', 'success');
        }
        closeUsrForm();
        await lusers();
      } catch (e) {
        toast(e.message, 'error');
        const sb = document.getElementById('usr-save-btn');
        if (sb) {
          sb.disabled = false;
          sb.textContent = 'Guardar';
        }
      }
    }

    async function resetUsrPwd(id, nombre) {
      if (!confirm(`¿Seguro que querés restablecer la contraseña de "${nombre}"?\n\nSe generará una nueva clave y la actual dejará de funcionar.`)) return;
      try {
        const res = await api(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify({ resetPassword: true }) });
        if (!res?.generatedPassword) throw { message: 'No se pudo generar la nueva contraseña' };
        userPassModal('Contraseña restablecida', `Nueva contraseña para ${nombre}`, res.generatedPassword);
        toast('Contraseña restablecida', 'success');
        await lusers();
      } catch (e) {
        toast(e.message, 'error');
      }
    }

    async function delUsr(id, nombre, activar = false) {
      if (activar) {
        if (!confirm(`¿Reactivar a "${nombre}"?`)) return;
        try {
          await api(`/usuarios/${id}`, { method: 'PUT', body: JSON.stringify({ activo: true }) });
          toast('Usuario reactivado', 'success');
          lusers();
        } catch (e) {
          toast(e.message, 'error');
        }
        return;
      }
      if (!confirm(`¿Desactivar a "${nombre}"?`)) return;
      try {
        await api(`/usuarios/${id}`, { method: 'DELETE' });
        toast('Usuario desactivado', 'success');
        lusers();
      } catch (e) {
        toast(e.message, 'error');
      }
    }

    async function eliminarUsr(id, nombre) {
      if (!confirm(`⚠️ ¿ELIMINAR DEFINITIVAMENTE a "${nombre}"?\nEsta acción NO se puede deshacer.`)) return;
      try {
        const tk = sessionStorage.getItem(TK);
        const res = await fetch(`${BASE}/usuarios/${id}?hard=true`, { method: 'DELETE', headers: { Authorization: `Bearer ${tk}` } });
        const d = await res.json();
        if (!res.ok) throw { message: d.error };
        toast('Usuario eliminado permanentemente', 'success');
        lusers();
      } catch (e) {
        toast(e.message, 'error');
      }
    }

    function tgpNew() {
      const el = document.getElementById('new-gpc');
      const btn = el?.nextElementSibling;
      if (!el) return;
      const hidden = el.textContent.includes('•');
      el.textContent = hidden ? (window._newUserPass || '') : '••••••••••';
      if (btn) btn.textContent = hidden ? '🙈' : '👁';
    }

    async function copyText(text) {
      const value = String(text || '');
      if (!value) throw new Error('No hay texto para copiar');
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(value);
          return true;
        } catch {}
      }
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.pointerEvents = 'none';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      ta.remove();
      if (!ok) throw new Error('No se pudo copiar');
      return true;
    }

    function cpNew() {
      const p = window._newUserPass || '';
      copyText(p).then(() => toast('Se copio en el portapapeles', 'success')).catch(() => toast('No se pudo copiar', 'error'));
    }

    function tgp(id, pass, btn) {
      const el = document.getElementById(id);
      if (!el) return;
      const s = el.textContent !== '••••••••••';
      el.textContent = s ? '••••••••••' : pass;
      btn.textContent = s ? '👁' : '🙈';
    }

    function cpP(p) {
      copyText(p).then(() => toast('Se copio en el portapapeles', 'success')).catch(() => toast('No se pudo copiar automaticamente', 'error'));
    }

    return {
      rusr,
      lusers,
      closeUsrForm,
      getRoles,
      userPassModal,
      openUsrForm,
      onRolCh,
      saveUsr,
      resetUsrPwd,
      delUsr,
      eliminarUsr,
      tgpNew,
      copyText,
      cpNew,
      tgp,
      cpP,
      regenRootAccessLogin,
      setUsrPage,
      sortUsrBy,
      exportUsersExcel,
    };
  }

  global.createCPanelUsers = createCPanelUsers;
})(window);
