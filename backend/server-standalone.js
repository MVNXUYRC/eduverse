/**
 * EduVerse — Production Server (zero external dependencies)
 * Compatible with Railway, Render, Fly.io, VPS
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_DIR = path.join(__dirname, '../frontend');

const careers = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/careers.json'), 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function jsonResponse(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  } catch {
    try {
      const index = fs.readFileSync(path.join(FRONTEND_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(index);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  }
}

function router(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const params = new URLSearchParams(parsed.query);
  const segments = pathname.split('/').filter(Boolean);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
    return res.end();
  }

  if (pathname === '/api/health') {
    return jsonResponse(res, { status: 'OK', env: NODE_ENV, timestamp: new Date().toISOString(), careers: careers.length });
  }

  if (pathname.startsWith('/api/careers')) {
    const sub = segments[2];

    if (sub === 'featured') {
      const popular = careers.filter(c => c.popular).slice(0, 6);
      const nuevas = careers.filter(c => c.nueva).slice(0, 4);
      const areaCount = careers.reduce((acc, c) => { acc[c.area] = (acc[c.area] || 0) + 1; return acc; }, {});
      const areas = Object.entries(areaCount).sort((a, b) => b[1] - a[1]).map(([nombre, cantidad]) => ({ nombre, cantidad }));
      return jsonResponse(res, { popular, nuevas, areas });
    }

    if (sub === 'filters') {
      return jsonResponse(res, {
        tipos: [...new Set(careers.map(c => c.tipo))].sort(),
        areas: [...new Set(careers.map(c => c.area))].sort(),
        modalidades: [...new Set(careers.map(c => c.modalidad))].sort(),
        instituciones: [...new Set(careers.map(c => c.institucion))].sort(),
      });
    }

    if (sub && !isNaN(parseInt(sub))) {
      const career = careers.find(c => c.id === parseInt(sub));
      if (!career) return jsonResponse(res, { error: 'Carrera no encontrada' }, 404);
      return jsonResponse(res, career);
    }

    // Search with filters
    let results = [...careers];
    const q = params.get('q');
    if (q) {
      const query = q.toLowerCase();
      results = results.filter(c =>
        c.nombre.toLowerCase().includes(query) ||
        c.descripcion.toLowerCase().includes(query) ||
        c.institucion.toLowerCase().includes(query) ||
        c.area.toLowerCase().includes(query)
      );
    }
    const tipo = params.get('tipo');
    if (tipo) { const l = tipo.split(',').map(t => t.trim()); results = results.filter(c => l.includes(c.tipo)); }
    const area = params.get('area');
    if (area) { const l = area.split(',').map(a => a.trim()); results = results.filter(c => l.includes(c.area)); }
    const modalidad = params.get('modalidad');
    if (modalidad) { const l = modalidad.split(',').map(m => m.trim()); results = results.filter(c => l.includes(c.modalidad)); }
    const sort = params.get('sort');
    if (sort === 'nombre') results.sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (sort === 'area') results.sort((a, b) => a.area.localeCompare(b.area));
    const limit = Math.min(parseInt(params.get('limit') || '12'), 50);
    const page = Math.max(parseInt(params.get('page') || '1'), 1);
    const total = results.length;
    const totalPages = Math.ceil(total / limit) || 1;
    return jsonResponse(res, {
      data: results.slice((page - 1) * limit, page * limit),
      meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    });
  }

  serveStatic(res, path.join(FRONTEND_DIR, pathname === '/' ? 'index.html' : pathname));
}

const server = http.createServer(router);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎓 EduVerse [${NODE_ENV}] → http://localhost:${PORT}`);
  console.log(`📚 API → http://localhost:${PORT}/api/careers`);
  console.log(`❤️  Health → http://localhost:${PORT}/api/health\n`);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { server.close(() => process.exit(0)); });

module.exports = server;
