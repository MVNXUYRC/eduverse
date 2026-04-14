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
  alcances_titulo TEXT DEFAULT '',
  formulario_inscripcion TEXT DEFAULT '',
  programa TEXT DEFAULT '',
  unidad_academica TEXT DEFAULT '',
  regional TEXT DEFAULT '',
  inscripcion_abierta_valor BOOLEAN NOT NULL DEFAULT FALSE,
  inscripcion_abierta_fecha_hasta TIMESTAMPTZ NULL,
  activo_valor BOOLEAN NOT NULL DEFAULT TRUE,
  activo_fecha_hasta TIMESTAMPTZ NULL,
  nueva BOOLEAN NOT NULL DEFAULT FALSE,
  proximamente BOOLEAN NOT NULL DEFAULT FALSE,
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
  login TEXT UNIQUE,
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

ALTER TABLE users_admin ADD COLUMN IF NOT EXISTS login TEXT;
ALTER TABLE careers ADD COLUMN IF NOT EXISTS proximamente BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE careers ADD COLUMN IF NOT EXISTS alcances_titulo TEXT DEFAULT '';

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

CREATE TABLE IF NOT EXISTS career_interested (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  career_id INTEGER NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  unidad_academica_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  informed_manual BOOLEAN NOT NULL DEFAULT FALSE,
  informed_at TIMESTAMPTZ NULL,
  informed_by TEXT NULL
);

ALTER TABLE career_interested ADD COLUMN IF NOT EXISTS informed_manual BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE career_interested ADD COLUMN IF NOT EXISTS informed_at TIMESTAMPTZ NULL;
ALTER TABLE career_interested ADD COLUMN IF NOT EXISTS informed_by TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_career_interested_email_career
  ON career_interested (LOWER(email), career_id);

CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'sitio',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS newsletter_dispatch_logs (
  id BIGSERIAL PRIMARY KEY,
  dispatch_type TEXT NOT NULL DEFAULT 'automatico',
  scheduled_for TIMESTAMPTZ NOT NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,
  changes_detected BOOLEAN NOT NULL DEFAULT FALSE,
  recipients_total INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  fail_count INTEGER NOT NULL DEFAULT 0,
  diff_total INTEGER NOT NULL DEFAULT 0,
  message TEXT DEFAULT ''
);

ALTER TABLE newsletter_dispatch_logs ADD COLUMN IF NOT EXISTS dispatch_type TEXT NOT NULL DEFAULT 'automatico';
ALTER TABLE newsletter_dispatch_logs ADD COLUMN IF NOT EXISTS fail_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE newsletter_dispatch_logs ADD COLUMN IF NOT EXISTS diff_total INTEGER NOT NULL DEFAULT 0;

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
CREATE INDEX IF NOT EXISTS idx_careers_proximamente ON careers (proximamente);
CREATE INDEX IF NOT EXISTS idx_career_speakers_speaker ON career_speakers (speaker);
CREATE INDEX IF NOT EXISTS idx_career_interested_career ON career_interested (career_id);
CREATE INDEX IF NOT EXISTS idx_career_interested_unidad ON career_interested (unidad_academica_id);
CREATE INDEX IF NOT EXISTS idx_career_interested_created ON career_interested (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscriptions_active ON newsletter_subscriptions (active);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscriptions_created ON newsletter_subscriptions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_newsletter_dispatch_logs_run ON newsletter_dispatch_logs (run_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_admin_email ON users_admin (email);
CREATE INDEX IF NOT EXISTS idx_users_admin_login ON users_admin (login);
CREATE INDEX IF NOT EXISTS idx_lookup_values_category ON lookup_values (category);
