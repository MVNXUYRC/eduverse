(function initCPanelConfig(global) {
  function createCPanelConfig(deps) {
    const { api, toast, esc, showModal, cm, getMe } = deps;

    async function rcfg() {
      const me = getMe();
      if (me.rol !== 'root') {
        document.getElementById('ct').innerHTML = '<div class="empty"><div class="ei">🔒</div><p>Solo accesible para root</p></div>';
        return;
      }
      const ct = document.getElementById('ct');
      ct.innerHTML = '<div class="empty"><div class="ei">⏳</div></div>';
      try {
        const cfgData = await api('/config');
        const isConstruction = cfgData.sitioEnConstruccion === true;
        const constructionImage = cfgData.imagenConstruccion || '/public/site-under-construction.svg';
        const newsletterOperativo = cfgData.newsletterOperativo !== false;
        ct.innerHTML = `
          <div style="max-width:560px">
            <div class="alr alr-info" style="margin-bottom:20px">Esta configuración aplica al sitio público.</div>
            <div class="tw" style="margin-bottom:18px">
              <div style="padding:18px">
                <div class="fl" style="margin-bottom:12px;font-size:.8rem">Modo del sitio público</div>
                <label style="display:flex;align-items:flex-start;gap:10px;padding:14px;border:1.5px solid var(--bd);border-radius:var(--r);cursor:pointer;background:var(--sf)">
                  <input type="checkbox" id="cfg-site-under-construction" ${isConstruction ? 'checked' : ''} style="accent-color:var(--cy);margin-top:2px;flex-shrink:0"/>
                  <div>
                    <div style="font-weight:600;font-size:.88rem">Sitio en construcción</div>
                    <div style="font-size:.78rem;color:var(--mt);margin-top:2px">El sitio permanece disponible, pero muestra una pantalla de “en construcción”.</div>
                  </div>
                </label>
                <div class="fg ff" style="margin-top:12px;margin-bottom:0">
                  <label class="fl">Imagen de construcción</label>
                  <input class="fi" id="cfg-construction-image" value="${esc(constructionImage)}" placeholder="/public/site-under-construction.svg"/>
                  <div class="fhint">Ruta pública o URL completa. Ejemplo: /public/site-under-construction.svg</div>
                </div>
                <div style="font-size:.78rem;color:var(--mt);margin-top:14px">Construcción: <strong id="cfg-construction-status-label">${isConstruction ? 'Activado' : 'Desactivado'}</strong></div>
                <div style="display:flex;justify-content:flex-end;margin-top:16px">
                  <button class="btn btn-cy" onclick="saveSiteConstruction()">Guardar</button>
                </div>
              </div>
            </div>
            <div class="tw" style="margin-bottom:18px">
              <div style="padding:18px">
                <div class="fl" style="margin-bottom:12px;font-size:.8rem">Newsletter</div>
                <label style="display:flex;align-items:flex-start;gap:10px;padding:14px;border:1.5px solid var(--bd);border-radius:var(--r);cursor:pointer;background:var(--sf)">
                  <input type="checkbox" id="cfg-newsletter-operativo" ${newsletterOperativo ? 'checked' : ''} style="accent-color:var(--cy);margin-top:2px;flex-shrink:0"/>
                  <div>
                    <div style="font-weight:600;font-size:.88rem">Newsletter operativo</div>
                    <div style="font-size:.78rem;color:var(--mt);margin-top:2px">Cuando está desactivado, se pausa el procesamiento semanal y no se envían correos, pero el sitio sigue aceptando nuevas suscripciones.</div>
                  </div>
                </label>
                <div style="font-size:.78rem;color:var(--mt);margin-top:14px">Estado: <strong id="cfg-newsletter-status-label">${newsletterOperativo ? 'Operativo' : 'No operativo'}</strong></div>
                <div style="display:flex;justify-content:flex-end;margin-top:16px">
                  <button class="btn btn-cy" onclick="saveNewsletterOperational()">Guardar</button>
                </div>
              </div>
            </div>
            <div class="tw" style="margin-bottom:18px;border-color:rgba(185,28,28,.2)">
              <div style="padding:18px">
                <div style="font-weight:700;font-size:.95rem;margin-bottom:6px">Eliminar datos</div>
                <div style="font-size:.8rem;color:var(--mt);line-height:1.5">
                  Elegí qué datos querés borrar entre propuestas, usuarios administrativos y logs de auditoría.
                </div>
                <div style="display:flex;justify-content:flex-end;margin-top:16px">
                  <button class="btn" style="background:#b42318;color:#fff;border-color:#b42318" onclick="openPlatformResetModal()">Eliminar</button>
                </div>
              </div>
            </div>
          </div>`;
      } catch (e) {
        ct.innerHTML = `<div class="empty"><div class="ei">⚠️</div><p>${e.message}</p></div>`;
      }
    }

    async function saveNewsletterOperational() {
      const enabled = document.getElementById('cfg-newsletter-operativo')?.checked === true;
      try {
        await api('/config/newsletter-operativo', { method: 'POST', body: JSON.stringify({ value: enabled }) });
        toast('Estado de Newsletter guardado correctamente', 'success');
        const statusEl = document.getElementById('cfg-newsletter-status-label');
        if (statusEl) statusEl.textContent = enabled ? 'Operativo' : 'No operativo';
      } catch (e) {
        toast(e.message, 'error');
      }
    }

    async function saveSiteConstruction() {
      const enabled = document.getElementById('cfg-site-under-construction')?.checked === true;
      const imageUrl = document.getElementById('cfg-construction-image')?.value?.trim() || '/public/site-under-construction.svg';
      try {
        await api('/config/sitio-en-construccion', { method: 'POST', body: JSON.stringify({ value: enabled, imageUrl }) });
        toast('Modo construcción guardado correctamente', 'success');
        const statusEl = document.getElementById('cfg-construction-status-label');
        if (statusEl) statusEl.textContent = enabled ? 'Activado' : 'Desactivado';
      } catch (e) {
        toast(e.message, 'error');
      }
    }

    function openPlatformResetModal() {
      showModal(`<div class="mhdr"><h2 class="mtitle">Eliminar datos</h2><div class="mclose" onclick="cm()">✕</div></div>
        <div class="fg">
          <div class="alr alr-danger" style="margin-bottom:14px">Seleccioná qué querés borrar. Los datos elegidos se eliminan de forma definitiva.</div>
          <label style="display:flex;align-items:flex-start;gap:10px;padding:12px;border:1.5px solid var(--bd);border-radius:var(--r);cursor:pointer;background:var(--sf);margin-bottom:10px">
            <input type="checkbox" id="cfg-reset-carreras" checked style="accent-color:#b42318;margin-top:2px;flex-shrink:0"/>
            <div><div style="font-weight:600;font-size:.88rem">Propuestas</div><div style="font-size:.78rem;color:var(--mt)">Carreras y cursos cargados.</div></div>
          </label>
          <label style="display:flex;align-items:flex-start;gap:10px;padding:12px;border:1.5px solid var(--bd);border-radius:var(--r);cursor:pointer;background:var(--sf);margin-bottom:10px">
            <input type="checkbox" id="cfg-reset-usuarios" checked style="accent-color:#b42318;margin-top:2px;flex-shrink:0"/>
            <div><div style="font-weight:600;font-size:.88rem">Usuarios</div><div style="font-size:.78rem;color:var(--mt)">Usuarios administrativos creados en el sistema.</div></div>
          </label>
          <label style="display:flex;align-items:flex-start;gap:10px;padding:12px;border:1.5px solid var(--bd);border-radius:var(--r);cursor:pointer;background:var(--sf);margin-bottom:14px">
            <input type="checkbox" id="cfg-reset-logs" checked style="accent-color:#b42318;margin-top:2px;flex-shrink:0"/>
            <div><div style="font-weight:600;font-size:.88rem">Logs</div><div style="font-size:.78rem;color:var(--mt)">Registros de auditoría del panel.</div></div>
          </label>
          <label class="fl">Contraseña</label>
          <div class="pw"><input class="fi" type="password" id="cfg-reset-password" autocomplete="current-password"/><button class="eye" onclick="eye('cfg-reset-password',this)" tabindex="-1">👁</button></div>
        </div>
        <div class="mact"><button class="btn btn-ol" onclick="cm()">Cancelar</button><button class="btn" style="background:#b42318;color:#fff;border-color:#b42318" onclick="confirmPlatformReset()">Eliminar</button></div>`);
    }

    async function confirmPlatformReset() {
      const password = document.getElementById('cfg-reset-password')?.value || '';
      const resetCarreras = document.getElementById('cfg-reset-carreras')?.checked === true;
      const resetUsuarios = document.getElementById('cfg-reset-usuarios')?.checked === true;
      const resetLogs = document.getElementById('cfg-reset-logs')?.checked === true;
      if (!resetCarreras && !resetUsuarios && !resetLogs) {
        toast('Seleccioná al menos una opción para borrar', 'error');
        return;
      }
      if (!password.trim()) {
        toast('Ingresá tu contraseña para continuar', 'error');
        return;
      }
      try {
        const result = await api('/config/reset-platform', { method: 'POST', body: JSON.stringify({ password, resetCarreras, resetUsuarios, resetLogs }) });
        cm();
        toast(`Limpieza completada: ${result.carrerasEliminadas} propuestas, ${result.usuariosEliminados} usuarios y ${result.logsEliminados} logs eliminados.`, 'success');
        await rcfg();
      } catch (e) {
        toast(e.message, 'error');
      }
    }

    return { rcfg, saveSiteConstruction, saveNewsletterOperational, openPlatformResetModal, confirmPlatformReset };
  }

  global.createCPanelConfig = createCPanelConfig;
})(window);
