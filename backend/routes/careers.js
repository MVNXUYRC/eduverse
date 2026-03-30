const express = require('express');
const router = express.Router();
const careers = require('../data/careers.json');

/**
 * GET /api/careers
 * Query params:
 *   q         - text search (nombre, descripcion, institucion)
 *   tipo      - Pregrado | Grado | Posgrado
 *   area      - Tecnología | Salud | Negocios | Ingeniería | Ciencias Sociales
 *   modalidad - Online | Híbrido
 *   duracion  - duration filter (exact or range)
 *   page      - pagination (default: 1)
 *   limit     - results per page (default: 12)
 *   sort      - nombre | area | duracion (default: id)
 */
router.get('/', (req, res) => {
  try {
    let { q, tipo, area, modalidad, duracion, page = 1, limit = 12, sort } = req.query;

    let results = [...careers];

    // Text search: name, description, institution
    if (q && q.trim()) {
      const query = q.trim().toLowerCase();
      results = results.filter(c =>
        c.nombre.toLowerCase().includes(query) ||
        c.descripcion.toLowerCase().includes(query) ||
        c.institucion.toLowerCase().includes(query) ||
        c.area.toLowerCase().includes(query)
      );
    }

    // Filter by tipo (supports comma-separated multiple)
    if (tipo) {
      const tipos = tipo.split(',').map(t => t.trim());
      results = results.filter(c => tipos.includes(c.tipo));
    }

    // Filter by area (supports comma-separated multiple)
    if (area) {
      const areas = area.split(',').map(a => a.trim());
      results = results.filter(c => areas.includes(c.area));
    }

    // Filter by modalidad
    if (modalidad) {
      const modalidades = modalidad.split(',').map(m => m.trim());
      results = results.filter(c => modalidades.includes(c.modalidad));
    }

    // Filter by duracion (approximate match)
    if (duracion) {
      results = results.filter(c => c.duracion.toLowerCase().includes(duracion.toLowerCase()));
    }

    // Sorting
    if (sort) {
      results.sort((a, b) => {
        if (sort === 'nombre') return a.nombre.localeCompare(b.nombre);
        if (sort === 'area') return a.area.localeCompare(b.area);
        return 0;
      });
    }

    // Pagination
    const total = results.length;
    const totalPages = Math.ceil(total / Number(limit));
    const offset = (Number(page) - 1) * Number(limit);
    const paginated = results.slice(offset, offset + Number(limit));

    res.json({
      data: paginated,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages,
        hasNext: Number(page) < totalPages,
        hasPrev: Number(page) > 1
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor', message: err.message });
  }
});

/**
 * GET /api/careers/featured
 * Returns popular + new careers for landing page
 */
router.get('/featured', (req, res) => {
  try {
    const popular = careers.filter(c => c.popular).slice(0, 6);
    const nuevas = careers.filter(c => c.nueva).slice(0, 4);

    // Unique areas with count
    const areaCount = careers.reduce((acc, c) => {
      acc[c.area] = (acc[c.area] || 0) + 1;
      return acc;
    }, {});
    const areas = Object.entries(areaCount)
      .sort((a, b) => b[1] - a[1])
      .map(([nombre, cantidad]) => ({ nombre, cantidad }));

    res.json({ popular, nuevas, areas });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor', message: err.message });
  }
});

/**
 * GET /api/careers/filters
 * Returns available filter options
 */
router.get('/filters', (req, res) => {
  try {
    const tipos = [...new Set(careers.map(c => c.tipo))].sort();
    const areas = [...new Set(careers.map(c => c.area))].sort();
    const modalidades = [...new Set(careers.map(c => c.modalidad))].sort();
    const instituciones = [...new Set(careers.map(c => c.institucion))].sort();

    res.json({ tipos, areas, modalidades, instituciones });
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor', message: err.message });
  }
});

/**
 * GET /api/careers/:id
 * Returns a single career by ID
 */
router.get('/:id', (req, res) => {
  try {
    const career = careers.find(c => c.id === parseInt(req.params.id));
    if (!career) {
      return res.status(404).json({ error: 'Carrera no encontrada' });
    }
    res.json(career);
  } catch (err) {
    res.status(500).json({ error: 'Error interno del servidor', message: err.message });
  }
});

module.exports = router;
