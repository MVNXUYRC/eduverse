const fs = require('fs');
const path = require('path');

let PoolCtor = null;
function getPoolCtor() {
  if (!PoolCtor) {
    // Lazy require keeps JSON mode working without pg installed.
    ({ Pool: PoolCtor } = require('pg'));
  }
  return PoolCtor;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [];
}

class PgStore {
  constructor(connectionConfig) {
    const Pool = getPoolCtor();
    this.pool = new Pool({
      ...connectionConfig,
    });
    this.mode = 'postgres';
  }

  async close() {
    await this.pool.end();
  }

  async runSchema() {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await this.pool.query(sql);
  }

  async loadState() {
    const client = await this.pool.connect();
    try {
      const careers = await client.query('SELECT * FROM careers ORDER BY id');
      const units = await client.query('SELECT career_id, unidad, ord FROM career_units ORDER BY career_id, ord');
      const tags = await client.query('SELECT career_id, tag, ord FROM career_tags ORDER BY career_id, ord');
      const speakers = await client.query('SELECT career_id, speaker, ord FROM career_speakers ORDER BY career_id, ord');
      const docs = await client.query('SELECT career_id, ord, tipo, organismo, numero, anio, pdf FROM career_documents ORDER BY career_id, ord');
      const users = await client.query('SELECT * FROM users_admin ORDER BY id');
      const cfg = await client.query('SELECT key, value FROM app_config');
      const logs = await client.query('SELECT ts, action, entity, detail, user_email, rol FROM audit_logs ORDER BY ts DESC LIMIT 500');
      const lookups = await client.query('SELECT category, value, ord FROM lookup_values ORDER BY category, ord');

      const unitsByCareer = new Map();
      const tagsByCareer = new Map();
      const speakersByCareer = new Map();
      const docsByCareer = new Map();

      for (const r of units.rows) {
        if (!unitsByCareer.has(r.career_id)) unitsByCareer.set(r.career_id, []);
        unitsByCareer.get(r.career_id).push(r.unidad);
      }
      for (const r of tags.rows) {
        if (!tagsByCareer.has(r.career_id)) tagsByCareer.set(r.career_id, []);
        tagsByCareer.get(r.career_id).push(r.tag);
      }
      for (const r of speakers.rows) {
        if (!speakersByCareer.has(r.career_id)) speakersByCareer.set(r.career_id, []);
        speakersByCareer.get(r.career_id).push(r.speaker);
      }
      for (const r of docs.rows) {
        if (!docsByCareer.has(r.career_id)) docsByCareer.set(r.career_id, []);
        docsByCareer.get(r.career_id).push({
          tipo: r.tipo || '',
          organismo: r.organismo || '',
          numero: r.numero || '',
          anio: r.anio || '',
          pdf: r.pdf || null,
        });
      }

      const carreras = careers.rows.map((r) => {
        const extra = r.extra || {};
        return {
          id: r.id,
          nombre: r.nombre,
          esCurso: !!r.es_curso,
          tipo: r.tipo || '',
          subtipo: r.subtipo || '',
          disciplina: r.disciplina || '',
          modalidad: r.modalidad || '',
          duracion: r.duracion || '',
          tags: tagsByCareer.get(r.id) || [],
          disertantes: speakersByCareer.get(r.id) || [],
          unidadesAcademicas: unitsByCareer.get(r.id) || [],
          unidadAcademica: r.unidad_academica || '',
          regional: r.regional || '',
          descripcion: r.descripcion || '',
          contacto: r.contacto || '',
          telefonoContacto: r.telefono_contacto || '',
          requisitosTexto: r.requisitos_texto || '',
          formularioInscripcion: r.formulario_inscripcion || '',
          programa: r.programa || '',
          documentos: docsByCareer.get(r.id) || [],
          inscripcionAbierta: { valor: !!r.inscripcion_abierta_valor, fechaHasta: r.inscripcion_abierta_fecha_hasta || null },
          activo: { valor: !!r.activo_valor, fechaHasta: r.activo_fecha_hasta || null },
          nueva: !!r.nueva,
          popular: !!r.popular,
          planEstudiosPDF: r.plan_estudios_pdf || null,
          creadoPor: r.creado_por || null,
          creadoEn: r.creado_en || null,
          modificadoPor: r.modificado_por || null,
          modificadoEn: r.modificado_en || null,
          desactivadoPor: r.desactivado_por || null,
          desactivadoEn: r.desactivado_en || null,
          ...extra,
        };
      });

      const usuarios = users.rows.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        apellido: u.apellido,
        dni: u.dni,
        email: u.email,
        telefono: u.telefono || '',
        rol: u.rol,
        unidades: Array.isArray(u.unidades) ? u.unidades : [],
        activo: !!u.activo,
        creadoPor: u.creado_por || null,
        creadoEn: u.creado_en || null,
        ultimoAcceso: u.ultimo_acceso || null,
        modificadoPor: u.modificado_por || null,
        modificadoEn: u.modificado_en || null,
        desactivadoPor: u.desactivado_por || null,
        desactivadoEn: u.desactivado_en || null,
        passwordHash: u.password_hash || '',
        mustChangePassword: !!u.must_change_password,
        passwordChangedAt: u.password_changed_at || null,
      }));

      const config = {};
      for (const c of cfg.rows) config[c.key] = c.value;

      const lookupMap = {};
      for (const l of lookups.rows) {
        if (!lookupMap[l.category]) lookupMap[l.category] = [];
        lookupMap[l.category].push(l.value);
      }

      return {
        carreras,
        usuarios,
        config,
        auditLog: logs.rows.map((l) => ({
          ts: l.ts,
          action: l.action,
          entity: l.entity,
          detail: l.detail,
          user: l.user_email,
          rol: l.rol,
        })),
        unidadesAcademicas: lookupMap.unidadesAcademicas || [],
        regionales: lookupMap.regionales || [],
        localidades: lookupMap.localidades || [],
        disciplinas: lookupMap.disciplinas || [],
        tiposDocumento: lookupMap.tiposDocumento || [],
        organismos: lookupMap.organismos || [],
      };
    } finally {
      client.release();
    }
  }

  async saveState(state) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query('TRUNCATE TABLE career_documents, career_speakers, career_tags, career_units, careers, users_admin, app_config, audit_logs, lookup_values RESTART IDENTITY CASCADE');

      for (const c of toArray(state.carreras)) {
        const extra = { ...c };
        const knownKeys = new Set([
          'id', 'nombre', 'esCurso', 'tipo', 'subtipo', 'disciplina', 'modalidad', 'duracion', 'tags', 'disertantes',
          'unidadesAcademicas', 'unidadAcademica', 'regional', 'descripcion', 'contacto', 'telefonoContacto', 'requisitosTexto',
          'formularioInscripcion', 'programa', 'documentos', 'inscripcionAbierta', 'activo', 'nueva', 'popular',
          'planEstudiosPDF', 'creadoPor', 'creadoEn', 'modificadoPor', 'modificadoEn', 'desactivadoPor', 'desactivadoEn',
        ]);
        for (const key of Object.keys(extra)) {
          if (knownKeys.has(key)) delete extra[key];
        }

        await client.query(
          `INSERT INTO careers (
            id, nombre, es_curso, tipo, subtipo, disciplina, modalidad, duracion, descripcion, contacto, telefono_contacto,
            requisitos_texto, formulario_inscripcion, programa, unidad_academica, regional,
            inscripcion_abierta_valor, inscripcion_abierta_fecha_hasta, activo_valor, activo_fecha_hasta,
            nueva, popular, plan_estudios_pdf, creado_por, creado_en, modificado_por, modificado_en,
            desactivado_por, desactivado_en, extra
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
            $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30
          )`,
          [
            c.id,
            c.nombre || '',
            !!c.esCurso,
            c.tipo || '',
            c.subtipo || '',
            c.disciplina || '',
            c.modalidad || '',
            c.duracion || '',
            c.descripcion || '',
            c.contacto || '',
            c.telefonoContacto || '',
            c.requisitosTexto || '',
            c.formularioInscripcion || '',
            c.programa || '',
            c.unidadAcademica || (toArray(c.unidadesAcademicas)[0] || ''),
            c.regional || '',
            !!(c.inscripcionAbierta && c.inscripcionAbierta.valor),
            c.inscripcionAbierta?.fechaHasta || null,
            c.activo?.valor !== undefined ? !!c.activo.valor : c.activo !== false,
            c.activo?.fechaHasta || null,
            !!c.nueva,
            !!c.popular,
            c.planEstudiosPDF || null,
            c.creadoPor || null,
            c.creadoEn || null,
            c.modificadoPor || null,
            c.modificadoEn || null,
            c.desactivadoPor || null,
            c.desactivadoEn || null,
            extra,
          ]
        );

        for (const [ord, unidad] of toArray(c.unidadesAcademicas).entries()) {
          await client.query('INSERT INTO career_units (career_id, ord, unidad) VALUES ($1,$2,$3)', [c.id, ord, unidad]);
        }
        for (const [ord, tag] of toArray(c.tags).entries()) {
          await client.query('INSERT INTO career_tags (career_id, ord, tag) VALUES ($1,$2,$3)', [c.id, ord, tag]);
        }
        for (const [ord, speaker] of toArray(c.disertantes).entries()) {
          await client.query('INSERT INTO career_speakers (career_id, ord, speaker) VALUES ($1,$2,$3)', [c.id, ord, speaker]);
        }
        for (const [ord, d] of toArray(c.documentos).entries()) {
          await client.query(
            'INSERT INTO career_documents (career_id, ord, tipo, organismo, numero, anio, pdf) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [c.id, ord, d?.tipo || '', d?.organismo || '', d?.numero || '', d?.anio || '', d?.pdf || null]
          );
        }
      }

      for (const u of toArray(state.usuarios)) {
        await client.query(
          `INSERT INTO users_admin (
            id, nombre, apellido, dni, email, telefono, rol, unidades, activo, creado_por, creado_en,
            ultimo_acceso, modificado_por, modificado_en, desactivado_por, desactivado_en,
            password_hash, must_change_password, password_changed_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
          )`,
          [
            u.id,
            u.nombre || '',
            u.apellido || '',
            u.dni || '',
            u.email || '',
            u.telefono || '',
            u.rol || '',
            JSON.stringify(toArray(u.unidades)),
            u.activo !== false,
            u.creadoPor || null,
            u.creadoEn || null,
            u.ultimoAcceso || null,
            u.modificadoPor || null,
            u.modificadoEn || null,
            u.desactivadoPor || null,
            u.desactivadoEn || null,
            u.passwordHash || '',
            u.mustChangePassword !== undefined ? !!u.mustChangePassword : true,
            u.passwordChangedAt || null,
          ]
        );
      }

      for (const [key, value] of Object.entries(state.config || {})) {
        await client.query('INSERT INTO app_config (key, value) VALUES ($1, $2::jsonb)', [key, JSON.stringify(value)]);
      }

      for (const l of toArray(state.auditLog).slice(0, 500)) {
        await client.query(
          'INSERT INTO audit_logs (ts, action, entity, detail, user_email, rol) VALUES ($1,$2,$3,$4,$5,$6)',
          [l.ts || new Date().toISOString(), l.action || '', l.entity || '', l.detail || '', l.user || '?', l.rol || '?']
        );
      }

      const lookupSets = {
        unidadesAcademicas: toArray(state.unidadesAcademicas),
        regionales: toArray(state.regionales),
        localidades: toArray(state.localidades),
        disciplinas: toArray(state.disciplinas),
        tiposDocumento: toArray(state.tiposDocumento),
        organismos: toArray(state.organismos),
      };
      for (const [category, values] of Object.entries(lookupSets)) {
        for (const [ord, value] of values.entries()) {
          await client.query('INSERT INTO lookup_values (category, ord, value) VALUES ($1,$2,$3)', [category, ord, value]);
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = { PgStore };
