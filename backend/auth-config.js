/**
 * UNaM — Control de acceso al sitio público (modo OAuth restringido)
 *
 * Estos emails pueden acceder al sitio cuando está en modo restringido.
 * Agregá o quitá emails según necesites.
 */

const ALLOWED_EMAILS = [
  "joel_barrera@outlook.com",   // root — siempre autorizado

  // Agregá más emails autorizados abajo:
  // "otro@unam.edu.ar",
];

module.exports = { ALLOWED_EMAILS };
