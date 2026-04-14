/**
 * UNaM — Control de acceso al sitio público (modo OAuth restringido)
 *
 * Estos emails pueden acceder al sitio cuando está en modo restringido.
 * Agregá o quitá emails según necesites.
 */

const envEmails = String(process.env.ALLOWED_PUBLIC_EMAILS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const rootEmail = String(process.env.ROOT_EMAIL || 'joel_barrera@outlook.com').trim().toLowerCase();

const ALLOWED_EMAILS = [...new Set([
  rootEmail,
  ...envEmails,
])];

module.exports = { ALLOWED_EMAILS };
