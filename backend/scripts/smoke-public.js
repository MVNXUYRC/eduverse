#!/usr/bin/env node
const { loadEnvFiles } = require('../config/load-env');

loadEnvFiles();

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function asUrl(baseUrl, pathname) {
  return new URL(pathname, baseUrl).toString();
}

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(asUrl(baseUrl, pathname), options);
  const contentType = String(response.headers.get('content-type') || '');
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  return { response, body, contentType };
}

async function main() {
  const baseUrl = String(process.argv[2] || process.env.SMOKE_BASE_URL || '').trim();
  const adminIdentifier = String(process.env.SMOKE_ADMIN_IDENTIFIER || '').trim();
  const adminPassword = String(process.env.SMOKE_ADMIN_PASSWORD || '').trim();
  if (!baseUrl) {
    throw new Error('Indicá la URL base pública. Ejemplo: npm run smoke:public -- https://tu-dominio');
  }

  const checks = [];
  let authHeaders = {};

  let result = await request(baseUrl, '/api/health');
  ensure(result.response.ok, 'Healthcheck no respondió 200');
  ensure(result.body && result.body.status === 'OK', 'Healthcheck devolvió payload inesperado');
  checks.push('health');

  result = await request(baseUrl, '/api/access-mode');
  ensure(result.response.ok, 'Access-mode no respondió 200');
  checks.push('access-mode');

  if (result.body?.restrictedAccess) {
    ensure(adminIdentifier && adminPassword, 'El sitio está restringido: definí SMOKE_ADMIN_IDENTIFIER y SMOKE_ADMIN_PASSWORD para seguir con el smoke.');
    const login = await request(baseUrl, '/admin/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: adminIdentifier, password: adminPassword }),
    });
    ensure(login.response.ok, 'Login admin falló en smoke público');
    ensure(login.body?.token, 'Login admin no devolvió token');
    authHeaders = { Authorization: `Bearer ${login.body.token}` };
    checks.push('admin-login');

    const me = await request(baseUrl, '/admin/api/auth/me', { headers: authHeaders });
    ensure(me.response.ok, 'Consulta auth/me falló');
    checks.push('admin-me');
  }

  result = await request(baseUrl, '/api/careers/featured');
  if (!result.response.ok && result.response.status === 401 && Object.keys(authHeaders).length) {
    result = await request(baseUrl, '/api/careers/featured', { headers: authHeaders });
  }
  ensure(result.response.ok, 'Featured no respondió 200');
  const featuredList = Array.isArray(result.body.data) ? result.body.data : (Array.isArray(result.body) ? result.body : []);
  ensure(Array.isArray(featuredList), 'Featured no devolvió una colección');
  checks.push('featured');

  result = await request(baseUrl, '/api/careers/999999999');
  ensure(result.response.status === 404, 'El manejo de error para carrera inexistente no devolvió 404');
  checks.push('404-json');

  const publicSample = featuredList[0];
  if (publicSample?.id) {
    let detail = await request(baseUrl, `/api/careers/${publicSample.id}`);
    if (!detail.response.ok && detail.response.status === 401 && Object.keys(authHeaders).length) {
      detail = await request(baseUrl, `/api/careers/${publicSample.id}`, { headers: authHeaders });
    }
    ensure(detail.response.ok, 'Detalle de carrera no respondió 200');
    checks.push('career-detail');

    const pdfCandidate = detail.body.planEstudiosPDF || (detail.body.documentos || []).find((doc) => doc?.pdf)?.pdf;
    if (pdfCandidate) {
      const pdfPath = String(pdfCandidate).startsWith('http') ? pdfCandidate : asUrl(baseUrl, pdfCandidate);
      const pdfResponse = await fetch(pdfPath);
      const pdfType = String(pdfResponse.headers.get('content-type') || '');
      ensure(pdfResponse.ok, 'El PDF público no respondió 200');
      ensure(pdfType.includes('pdf'), `El recurso PDF no devolvió content-type PDF (${pdfType || 'vacío'})`);
      checks.push('pdf');
    }
  }

  if (adminIdentifier && adminPassword && !Object.keys(authHeaders).length) {
    const login = await request(baseUrl, '/admin/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: adminIdentifier, password: adminPassword }),
    });
    ensure(login.response.ok, 'Login admin falló en smoke público');
    ensure(login.body?.token, 'Login admin no devolvió token');
    checks.push('admin-login');

    authHeaders = { Authorization: `Bearer ${login.body.token}` };
    const me = await request(baseUrl, '/admin/api/auth/me', { headers: authHeaders });
    ensure(me.response.ok, 'Consulta auth/me falló');
    checks.push('admin-me');

    const backup = await request(baseUrl, '/admin/api/backup', { headers: authHeaders });
    ensure(backup.response.ok, 'Export de backup falló');
    ensure(Array.isArray(backup.body?.carreras), 'El backup exportado no tiene estructura válida');
    checks.push('backup-export');
  }

  let rateLimited = false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const probe = await request(baseUrl, '/admin/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '__rate_limit_probe__', password: 'bad-password' }),
    });
    if (probe.response.status === 429) {
      rateLimited = true;
      break;
    }
  }
  ensure(rateLimited, 'No se verificó el rate limiting de login');
  checks.push('rate-limit');

  console.log(`Smoke público OK en ${baseUrl}`);
  console.log(`Checks: ${checks.join(', ')}`);
}

main().catch((err) => {
  console.error('Smoke público: ERROR -', err.message);
  process.exit(1);
});
