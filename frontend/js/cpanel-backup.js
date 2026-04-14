(function initCPanelBackup(global) {
  function createCPanelBackup(deps) {
    const { api, toast, getMe } = deps;

    async function rbkp() {
      const me = getMe();
      if (me.rol !== 'root') {
        document.getElementById('ct').innerHTML = '<div class="empty"><div class="ei">🔒</div><p>Solo accesible para root</p></div>';
        return;
      }
      document.getElementById('ct').innerHTML = `<div style="max-width:560px;display:flex;flex-direction:column;gap:18px">

        <div class="tw">
          <div style="padding:22px">
            <div class="fl" style="margin-bottom:6px">Propuestas Formativas</div>
            <p style="font-size:.88rem;color:var(--tx2);margin-bottom:18px;line-height:1.5">Exportá o importá el listado completo de propuestas. Al importar, las propuestas existentes serán reemplazadas.</p>
            <div style="display:flex;flex-direction:column;gap:12px">
              <div>
                <div style="font-size:.8rem;font-weight:600;color:var(--mt);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Exportar</div>
                <button class="btn btn-cy" id="btn-exp-carr" onclick="doExportCarr()">Descargar propuestas (.json)</button>
              </div>
              <div style="border-top:1px solid var(--bd);padding-top:12px">
                <div style="font-size:.8rem;font-weight:600;color:var(--mt);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Importar</div>
                <input type="file" id="file-carr" accept=".json" style="display:none" onchange="onFileSelected(this,'lbl-carr','btn-imp-carr')"/>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  <button class="btn btn-ol" onclick="document.getElementById('file-carr').click()">Seleccionar archivo…</button>
                  <span id="lbl-carr" style="font-size:.88rem;color:var(--mt);flex:1">Ningún archivo seleccionado</span>
                  <button class="btn btn-cy" id="btn-imp-carr" style="display:none" onclick="doImportCarr()">Importar</button>
                </div>
                <div id="imp-wrap-carr" style="display:none;margin-top:10px;padding:10px 12px;background:var(--bg);border:1px solid var(--bd);border-radius:8px">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <span id="imp-lbl-carr" style="font-size:.8rem;color:var(--tx2)">Preparando importación…</span>
                    <span id="imp-pct-carr" style="font-size:.78rem;color:var(--mt)">0%</span>
                  </div>
                  <div style="height:7px;background:var(--bd);border-radius:100px;overflow:hidden">
                    <div id="imp-bar-carr" style="height:100%;width:0%;background:var(--cy);transition:width .2s ease"></div>
                  </div>
                </div>
                <div id="imp-msg-carr" style="display:none;margin-top:8px;font-size:.84rem;color:var(--tx2)"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="tw">
          <div style="padding:22px">
            <div class="fl" style="margin-bottom:6px">Usuarios</div>
            <p style="font-size:.88rem;color:var(--tx2);margin-bottom:18px;line-height:1.5">Exportá o importá el listado de usuarios. Al importar, los usuarios se fusionan por correo electrónico.</p>
            <div style="display:flex;flex-direction:column;gap:12px">
              <div>
                <div style="font-size:.8rem;font-weight:600;color:var(--mt);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Exportar</div>
                <button class="btn btn-cy" id="btn-exp-usr" onclick="doExportUsr()">Descargar usuarios (.json)</button>
              </div>
              <div style="border-top:1px solid var(--bd);padding-top:12px">
                <div style="font-size:.8rem;font-weight:600;color:var(--mt);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Importar</div>
                <input type="file" id="file-usr" accept=".json" style="display:none" onchange="onFileSelected(this,'lbl-usr','btn-imp-usr')"/>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  <button class="btn btn-ol" onclick="document.getElementById('file-usr').click()">Seleccionar archivo…</button>
                  <span id="lbl-usr" style="font-size:.88rem;color:var(--mt);flex:1">Ningún archivo seleccionado</span>
                  <button class="btn btn-cy" id="btn-imp-usr" style="display:none" onclick="doImportUsr()">Importar</button>
                </div>
                <div id="imp-wrap-usr" style="display:none;margin-top:10px;padding:10px 12px;background:var(--bg);border:1px solid var(--bd);border-radius:8px">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <span id="imp-lbl-usr" style="font-size:.8rem;color:var(--tx2)">Preparando importación…</span>
                    <span id="imp-pct-usr" style="font-size:.78rem;color:var(--mt)">0%</span>
                  </div>
                  <div style="height:7px;background:var(--bd);border-radius:100px;overflow:hidden">
                    <div id="imp-bar-usr" style="height:100%;width:0%;background:var(--cy);transition:width .2s ease"></div>
                  </div>
                </div>
                <div id="imp-msg-usr" style="display:none;margin-top:8px;font-size:.84rem;color:var(--tx2)"></div>
              </div>
            </div>
          </div>
        </div>

      </div>`;
    }

    function onFileSelected(input, lblId, btnId) {
      const lbl = document.getElementById(lblId);
      const btn = document.getElementById(btnId);
      if (input.files[0]) {
        if (lbl) lbl.textContent = input.files[0].name;
        if (btn) btn.style.display = '';
      } else {
        if (lbl) lbl.textContent = 'Ningún archivo seleccionado';
        if (btn) btn.style.display = 'none';
      }
    }

    function setImportProgress(kind, pct, label) {
      const wrap = document.getElementById(`imp-wrap-${kind}`);
      const bar = document.getElementById(`imp-bar-${kind}`);
      const lbl = document.getElementById(`imp-lbl-${kind}`);
      const pctEl = document.getElementById(`imp-pct-${kind}`);
      if (wrap) wrap.style.display = '';
      if (bar) {
        bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        bar.style.background = pct >= 100 ? 'var(--gr)' : 'var(--cy)';
      }
      if (lbl && label) lbl.textContent = label;
      if (pctEl) pctEl.textContent = `${Math.max(0, Math.min(100, pct))}%`;
    }

    function setImportMessage(kind, msg, type = 'info') {
      const el = document.getElementById(`imp-msg-${kind}`);
      if (!el) return;
      const color = type === 'success' ? 'var(--gr)' : type === 'error' ? 'var(--rd)' : 'var(--tx2)';
      el.style.display = '';
      el.style.color = color;
      el.textContent = msg;
    }

    function resetImportUi(kind) {
      const wrap = document.getElementById(`imp-wrap-${kind}`);
      const msg = document.getElementById(`imp-msg-${kind}`);
      if (wrap) wrap.style.display = 'none';
      if (msg) {
        msg.style.display = 'none';
        msg.textContent = '';
      }
    }

    async function doExportCarr() {
      const btn = document.getElementById('btn-exp-carr');
      btn.disabled = true;
      btn.textContent = 'Exportando…';
      try {
        const d = await api('/backup/export');
        const blob = new Blob([JSON.stringify({ exportedAt: d.exportedAt, carreras: d.carreras }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `propuestas-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        toast('Propuestas exportadas', 'success');
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Descargar propuestas (.json)';
      }
    }

    async function doExportUsr() {
      const btn = document.getElementById('btn-exp-usr');
      btn.disabled = true;
      btn.textContent = 'Exportando…';
      try {
        const d = await api('/backup/export');
        const blob = new Blob([JSON.stringify({ exportedAt: d.exportedAt, usuarios: d.usuarios }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `usuarios-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        toast('Usuarios exportados', 'success');
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Descargar usuarios (.json)';
      }
    }

    async function doImportCarr() {
      const input = document.getElementById('file-carr');
      const file = input.files[0];
      if (!file) return;
      if (!confirm(`¿Importar propuestas desde "${file.name}"?\n\nLas propuestas existentes serán reemplazadas.`)) return;
      const btn = document.getElementById('btn-imp-carr');
      btn.disabled = true;
      btn.textContent = 'Importando…';
      resetImportUi('carr');
      setImportProgress('carr', 5, 'Validando archivo…');
      try {
        const data = JSON.parse(await file.text());
        setImportProgress('carr', 25, 'Archivo leído');
        if (!data.carreras) throw { message: 'El archivo no contiene propuestas' };
        setImportProgress('carr', 55, 'Importando propuestas al sistema…');
        const r = await api('/backup/import', { method: 'POST', body: JSON.stringify({ carreras: data.carreras }) });
        setImportProgress('carr', 100, 'Importación completada');
        setImportMessage('carr', `Importación realizada con éxito: ${r.carreras} propuestas.`, 'success');
        toast(`${r.carreras} propuestas importadas correctamente`, 'success');
        input.value = '';
        onFileSelected(input, 'lbl-carr', 'btn-imp-carr');
      } catch (e) {
        setImportProgress('carr', 100, 'Importación fallida');
        setImportMessage('carr', e.message || 'Error al importar propuestas.', 'error');
        toast(e.message || 'Error al importar', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Importar';
      }
    }

    async function doImportUsr() {
      const input = document.getElementById('file-usr');
      const file = input.files[0];
      if (!file) return;
      if (!confirm(`¿Importar usuarios desde "${file.name}"?\n\nLos usuarios se fusionarán por correo electrónico.`)) return;
      const btn = document.getElementById('btn-imp-usr');
      btn.disabled = true;
      btn.textContent = 'Importando…';
      resetImportUi('usr');
      setImportProgress('usr', 5, 'Validando archivo…');
      try {
        const data = JSON.parse(await file.text());
        setImportProgress('usr', 25, 'Archivo leído');
        if (!data.usuarios) throw { message: 'El archivo no contiene usuarios' };
        setImportProgress('usr', 55, 'Importando usuarios al sistema…');
        const r = await api('/backup/import', { method: 'POST', body: JSON.stringify({ usuarios: data.usuarios }) });
        setImportProgress('usr', 100, 'Importación completada');
        setImportMessage('usr', `Importación realizada con éxito: ${r.usuarios} usuarios.`, 'success');
        toast(`${r.usuarios} usuarios importados correctamente`, 'success');
        input.value = '';
        onFileSelected(input, 'lbl-usr', 'btn-imp-usr');
      } catch (e) {
        setImportProgress('usr', 100, 'Importación fallida');
        setImportMessage('usr', e.message || 'Error al importar usuarios.', 'error');
        toast(e.message || 'Error al importar', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Importar';
      }
    }

    return {
      rbkp,
      onFileSelected,
      setImportProgress,
      setImportMessage,
      resetImportUi,
      doExportCarr,
      doExportUsr,
      doImportCarr,
      doImportUsr,
    };
  }

  global.createCPanelBackup = createCPanelBackup;
})(window);
