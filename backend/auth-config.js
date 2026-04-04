/**
 * EduVerse — Control de acceso
 *
 * Agregá o quitá emails de esta lista para controlar
 * quién puede acceder a la plataforma.
 *
 * Los emails deben coincidir exactamente con la cuenta de Google
 * (en minúsculas, sin espacios).
 */

const ALLOWED_EMAILS = [
  // ── Administradores ──────────────────────────────────
  "joel_barrera@outlook.com",          // Cambiar por tu email real

  // ── Usuarios autorizados ─────────────────────────────
  // "estudiante1@gmail.com",
  // "profesor@universidad.edu",
  // "coordinador@institucion.com",
];

module.exports = { ALLOWED_EMAILS };
