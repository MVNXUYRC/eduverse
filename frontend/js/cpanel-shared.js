(function initCpanelShared(global) {
  const BASE = '/admin/api';
  const TK = 'unam_atk';
  const UK = 'unam_au';
  const RE = 'unam_remembered_email';

  const RL = {
    root: 'root',
    institucional: 'Administrador Institucional',
    unidades: 'Administrador de Unidades',
  };

  const RC = {
    root: 'r-root',
    institucional: 'r-inst',
    unidades: 'r-unit',
  };

  const EAD = 'Educación a Distancia';

  const DEFAULT_CAREER_FILTERS = Object.freeze({
    q: '',
    esCurso: '',
    activo: '',
  });

  const UNIDAD_REGIONAL = {
    'Facultad de Arte y Diseño': 'Oberá',
    'Facultad de Ciencias Económicas': 'Posadas',
    'Facultad de Ciencias Exactas, Químicas y Naturales': 'Posadas',
    'Facultad de Ciencias Forestales': 'Eldorado',
    'Facultad de Humanidades y Ciencias Sociales': 'Posadas',
    'Facultad de Ingeniería': 'Oberá',
    'Educación a Distancia': '',
    'Escuela Agrotécnica Eldorado': 'Eldorado',
    'Escuela de Enfermería': 'Posadas',
  };

  const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

  function createCareerFilters(overrides = {}) {
    return { ...DEFAULT_CAREER_FILTERS, ...overrides };
  }

  function createCareerDraft(overrides = {}) {
    return {
      cTags: [...(overrides.cTags || [])],
      cDis: [...(overrides.cDis || [])],
      cDocs: [...(overrides.cDocs || [])],
    };
  }

  function createCPanelState(seed = {}) {
    let me = seed.me || null;
    let cfg = seed.cfg || {};
    let careerPage = Number.isInteger(seed.careerPage) && seed.careerPage > 0 ? seed.careerPage : 1;
    let careerFilters = createCareerFilters(seed.careerFilters);
    let careerDraft = createCareerDraft(seed.careerDraft);
    let userQuery = String(seed.userQuery || '');

    return {
      getMe() { return me; },
      setMe(value) { me = value || null; },
      getCfg() { return cfg; },
      setCfg(value) { cfg = value || {}; },
      getCareerPage() { return careerPage; },
      setCareerPage(value) { careerPage = Number.isInteger(value) && value > 0 ? value : 1; },
      getCareerFilters() { return { ...careerFilters }; },
      setCareerFilters(value) { careerFilters = createCareerFilters(value); },
      resetCareerFilters() { careerFilters = createCareerFilters(); },
      getCareerDraft() { return createCareerDraft(careerDraft); },
      setCareerDraft(value) { careerDraft = createCareerDraft(value); },
      resetCareerDraft() { careerDraft = createCareerDraft(); },
      getUserQuery() { return userQuery; },
      setUserQuery(value) { userQuery = String(value || ''); },
      resetNavigationState() {
        careerPage = 1;
        careerFilters = createCareerFilters();
        userQuery = '';
      },
    };
  }

  async function api(ep, opts = {}) {
    const tk = sessionStorage.getItem(TK);
    const headers = {
      'Content-Type': 'application/json',
      ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
    };
    const method = (opts.method || 'GET').toUpperCase();
    let url = BASE + ep;
    if (method === 'GET') {
      url += (url.includes('?') ? '&' : '?') + '_ts=' + Date.now();
    }
    const res = await fetch(url, { cache: 'no-store', headers, ...opts });
    const raw = await res.text();
    const contentType = String(res.headers?.get?.('content-type') || '').toLowerCase();
    let data = {};

    if (raw) {
      if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(raw);
        } catch {
          throw { status: res.status, message: 'El servidor devolvió JSON inválido.' };
        }
      } else {
        try {
          data = JSON.parse(raw);
        } catch {
          const htmlLike = /^\s*</.test(raw);
          throw {
            status: res.status,
            message: htmlLike
              ? 'El servidor devolvió HTML en lugar de JSON. Verificá que el backend del cPanel esté activo.'
              : 'El servidor devolvió una respuesta no válida.',
          };
        }
      }
    }

    if (!res.ok) throw { status: res.status, message: data.error || 'Error' };
    return data;
  }

  function apiMp(ep, method, fd, onProgress) {
    return new Promise((resolve, reject) => {
      const tk = sessionStorage.getItem(TK);
      const xhr = new XMLHttpRequest();
      xhr.open(method, BASE + ep);
      if (tk) xhr.setRequestHeader('Authorization', `Bearer ${tk}`);
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        });
      }
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject({ status: xhr.status, message: data.error || 'Error' });
        } catch {
          reject({ message: 'Error de respuesta' });
        }
      };
      xhr.onerror = () => reject({ message: 'Error de conexión' });
      xhr.send(fd);
    });
  }

  function isActive(state) {
    if (!state) return false;
    const value = state.valor !== undefined ? state.valor : state.activo;
    if (!value) return false;
    if (!state.fechaHasta) return true;
    const raw = String(state.fechaHasta || '').trim();
    if (!raw) return true;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T23:59:59.999`) > new Date();
    return new Date(raw) > new Date();
  }

  function fmtD(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  function stateLabel(state, on = 'Activo', off = 'Inactivo') {
    if (!state) return `<span class="stlbl st-off">${off}</span>`;
    const value = state.valor !== undefined ? state.valor : state.activo;
    if (!value) return `<span class="stlbl st-off">${off}</span>`;
    if (state.fechaHasta) {
      const raw = String(state.fechaHasta || '').trim();
      const expired = /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? new Date(`${raw}T23:59:59.999`) < new Date()
        : new Date(raw) < new Date();
      return expired
        ? `<span class="stlbl st-exp">Venció ${fmtD(state.fechaHasta)}</span>`
        : `<span class="stlbl st-on">${on} hasta ${fmtD(state.fechaHasta)}</span>`;
    }
    return `<span class="stlbl st-on">${on}</span>`;
  }

  function eye(id, btn) {
    const input = document.getElementById(id);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? '👁' : '🙈';
  }

  function pstr(val, tid) {
    const el = document.getElementById(tid);
    if (!el) return;
    const reqs = [
      { l: 'Mínimo 8 caracteres', ok: val.length >= 8 },
      { l: 'Mayúscula', ok: /[A-Z]/.test(val) },
      { l: 'Minúscula', ok: /[a-z]/.test(val) },
      { l: 'Número', ok: /[0-9]/.test(val) },
      { l: 'Carácter especial', ok: /[^A-Za-z0-9]/.test(val) },
    ];
    el.innerHTML = reqs.map((r) => `<div class="pr ${r.ok ? 'ok' : 'fail'}">${r.ok ? '✓' : '○'} ${r.l}</div>`).join('');
  }

  function showModal(html) {
    document.getElementById('mr').innerHTML = `<div class="mbg" onclick="bgc(event)"><div class="modal">${html}</div></div>`;
  }

  function cm() {
    document.getElementById('mr').innerHTML = '';
  }

  function bgc() {}

  function toast(msg, type = 'info') {
    const c = document.getElementById('tc');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3400);
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function properName(n) {
    return String(n || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  }

  function getOrgsForTipo(tipo, allOrgs) {
    return [...new Set((allOrgs || [])
      .map((v) => String(v || '').trim())
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }

  function replaceTag(element, tagName) {
    const replacement = document.createElement(tagName);
    while (element.firstChild) replacement.appendChild(element.firstChild);
    element.replaceWith(replacement);
    return replacement;
  }

  function unwrapElement(element) {
    const parent = element.parentNode;
    if (!parent) return;
    while (element.firstChild) parent.insertBefore(element.firstChild, element);
    parent.removeChild(element);
  }

  function normalizeRichHtml(root) {
    root.querySelectorAll('b').forEach((el) => replaceTag(el, 'strong'));
    root.querySelectorAll('i').forEach((el) => replaceTag(el, 'em'));

    root.querySelectorAll('span,font').forEach((el) => {
      const style = String(el.getAttribute('style') || '').toLowerCase();
      const wrappers = [];
      if (/font-weight\s*:\s*(bold|[5-9]00)/.test(style)) wrappers.push('strong');
      if (/font-style\s*:\s*italic/.test(style)) wrappers.push('em');
      if (/text-decoration[^;]*underline|text-decoration-line\s*:\s*underline/.test(style)) wrappers.push('u');
      if (!wrappers.length) {
        unwrapElement(el);
        return;
      }
      let current = el;
      wrappers.forEach((tagName) => {
        current = replaceTag(current, tagName);
      });
    });

    root.querySelectorAll('div').forEach((el) => {
      if (el.closest('li')) return;
      if (el.querySelector('ul,ol')) {
        unwrapElement(el);
        return;
      }
      if (el.children.length === 1 && el.firstElementChild && ['UL', 'OL', 'LI'].includes(el.firstElementChild.tagName)) {
        unwrapElement(el);
        return;
      }
      replaceTag(el, 'p');
    });

    root.querySelectorAll('a[href]').forEach((el) => {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    });
  }

  function compactRichHtml(html) {
    if (!document?.createElement) {
      return String(html || '').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').trim();
    }
    const root = document.createElement('div');
    root.innerHTML = String(html || '');
    root.querySelectorAll('script,style,iframe,object,embed').forEach((n) => n.remove());
    normalizeRichHtml(root);
    root.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((a) => {
        const name = a.name.toLowerCase();
        const value = String(a.value || '');
        if (name === 'href') {
          if (/^javascript:/i.test(value)) el.removeAttribute(a.name);
          return;
        }
        if (name === 'src') {
          if (/^data:/i.test(value)) el.remove();
          return;
        }
        if (name === 'target' || name === 'rel') return;
        el.removeAttribute(a.name);
      });
    });
    root.querySelectorAll('p,li').forEach((el) => {
      if (!String(el.textContent || '').trim() && !el.querySelector('br,a,strong,em,u')) el.remove();
    });
    root.innerHTML = root.innerHTML.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
    return root.innerHTML;
  }

  function plainFromHtml(html) {
    const root = document.createElement('div');
    root.innerHTML = String(html || '');
    return String(root.textContent || '').replace(/\s{2,}/g, ' ').trim();
  }

  global.CPanelShared = {
    BASE,
    TK,
    UK,
    RE,
    RL,
    RC,
    EAD,
    DEFAULT_CAREER_FILTERS,
    UNIDAD_REGIONAL,
    MAX_UPLOAD_BYTES,
    createCareerFilters,
    createCareerDraft,
    createCPanelState,
    api,
    apiMp,
    isActive,
    fmtD,
    stateLabel,
    eye,
    pstr,
    showModal,
    cm,
    bgc,
    toast,
    esc,
    properName,
    getOrgsForTipo,
    compactRichHtml,
    plainFromHtml,
  };
})(window);
