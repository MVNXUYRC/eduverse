CREATE TABLE IF NOT EXISTS careers (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  es_curso BOOLEAN NOT NULL DEFAULT FALSE,
  tipo TEXT NOT NULL,
  subtipo TEXT DEFAULT '',
  disciplina TEXT DEFAULT '',
  modalidad TEXT DEFAULT '',
  duracion TEXT DEFAULT '',
  descripcion TEXT DEFAULT '',
  contacto TEXT DEFAULT '',
  telefono_contacto TEXT DEFAULT '',
  requisitos_texto TEXT DEFAULT '',
  formulario_inscripcion TEXT DEFAULT '',
  programa TEXT DEFAULT '',
  unidad_academica TEXT DEFAULT '',
  regional TEXT DEFAULT '',
  inscripcion_abierta_valor BOOLEAN NOT NULL DEFAULT FALSE,
  inscripcion_abierta_fecha_hasta TIMESTAMPTZ NULL,
  activo_valor BOOLEAN NOT NULL DEFAULT TRUE,
  activo_fecha_hasta TIMESTAMPTZ NULL,
  nueva BOOLEAN NOT NULL DEFAULT FALSE,
  popular BOOLEAN NOT NULL DEFAULT FALSE,
  plan_estudios_pdf TEXT NULL,
  creado_por TEXT NULL,
  creado_en TIMESTAMPTZ NULL,
  modificado_por TEXT NULL,
  modificado_en TIMESTAMPTZ NULL,
  desactivado_por TEXT NULL,
  desactivado_en TIMESTAMPTZ NULL,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS career_units (
  career_id INTEGER NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,
  unidad TEXT NOT NULL,
  PRIMARY KEY (career_id, ord)
);

CREATE TABLE IF NOT EXISTS career_tags (
  career_id INTEGER NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (career_id, ord)
);

CREATE TABLE IF NOT EXISTS career_speakers (
  career_id INTEGER NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,
  speaker TEXT NOT NULL,
  PRIMARY KEY (career_id, ord)
);

CREATE TABLE IF NOT EXISTS career_documents (
  career_id INTEGER NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,
  tipo TEXT DEFAULT '',
  organismo TEXT DEFAULT '',
  numero TEXT DEFAULT '',
  anio TEXT DEFAULT '',
  pdf TEXT NULL,
  PRIMARY KEY (career_id, ord)
);

CREATE TABLE IF NOT EXISTS users_admin (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  dni TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  telefono TEXT DEFAULT '',
  rol TEXT NOT NULL,
  unidades JSONB NOT NULL DEFAULT '[]'::jsonb,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por TEXT NULL,
  creado_en TIMESTAMPTZ NULL,
  ultimo_acceso TIMESTAMPTZ NULL,
  modificado_por TEXT NULL,
  modificado_en TIMESTAMPTZ NULL,
  desactivado_por TEXT NULL,
  desactivado_en TIMESTAMPTZ NULL,
  password_hash TEXT DEFAULT '',
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  password_changed_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  detail TEXT NOT NULL,
  user_email TEXT NOT NULL,
  rol TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lookup_values (
  category TEXT NOT NULL,
  ord INTEGER NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (category, ord)
);

CREATE INDEX IF NOT EXISTS idx_careers_nombre ON careers (nombre);
CREATE INDEX IF NOT EXISTS idx_careers_tipo ON careers (tipo);
CREATE INDEX IF NOT EXISTS idx_careers_es_curso ON careers (es_curso);
CREATE INDEX IF NOT EXISTS idx_careers_disciplina ON careers (disciplina);
CREATE INDEX IF NOT EXISTS idx_careers_modalidad ON careers (modalidad);
CREATE INDEX IF NOT EXISTS idx_careers_regional ON careers (regional);
CREATE INDEX IF NOT EXISTS idx_careers_activo ON careers (activo_valor, activo_fecha_hasta);
CREATE INDEX IF NOT EXISTS idx_career_speakers_speaker ON career_speakers (speaker);
CREATE INDEX IF NOT EXISTS idx_users_admin_email ON users_admin (email);
CREATE INDEX IF NOT EXISTS idx_lookup_values_category ON lookup_values (category);
