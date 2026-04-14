const crypto = require('crypto');

const RELATIVE_URL_PREFIXES = ['/uploads/', '/public/', '/api/'];
const SAFE_HTML_TAGS = new Set(['p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'a']);

function sanitizeText(value, max = 5000) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function sanitizeUrl(value, { allowMailto = false, allowRelative = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (allowRelative && RELATIVE_URL_PREFIXES.some((prefix) => raw.startsWith(prefix))) return raw;
  try {
    const parsed = new URL(raw);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === 'http:' || protocol === 'https:' || (allowMailto && protocol === 'mailto:')) return raw;
  } catch {
    return '';
  }
  return '';
}

function stripDangerousBlocks(html) {
  let out = String(html || '');
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
  out = out.replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '');
  out = out.replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '');
  out = out.replace(/<embed[\s\S]*?>/gi, '');
  out = out.replace(/<form[\s\S]*?>[\s\S]*?<\/form>/gi, '');
  out = out.replace(/<input[\s\S]*?>/gi, '');
  out = out.replace(/<button[\s\S]*?>[\s\S]*?<\/button>/gi, '');
  out = out.replace(/<textarea[\s\S]*?>[\s\S]*?<\/textarea>/gi, '');
  out = out.replace(/<select[\s\S]*?>[\s\S]*?<\/select>/gi, '');
  out = out.replace(/<meta[\s\S]*?>/gi, '');
  out = out.replace(/<link[\s\S]*?>/gi, '');
  out = out.replace(/<base[\s\S]*?>/gi, '');
  out = out.replace(/<svg[\s\S]*?>[\s\S]*?<\/svg>/gi, '');
  out = out.replace(/<math[\s\S]*?>[\s\S]*?<\/math>/gi, '');
  out = out.replace(/<img[\s\S]*?>/gi, '');
  out = out.replace(/<video[\s\S]*?>[\s\S]*?<\/video>/gi, '');
  out = out.replace(/<audio[\s\S]*?>[\s\S]*?<\/audio>/gi, '');
  return out;
}

function sanitizeRichHtml(html, max = 180000) {
  let out = stripDangerousBlocks(html);
  out = out.replace(/<\/?([a-z0-9:-]+)([^>]*)>/gi, (full, rawTag, rawAttrs) => {
    const tag = String(rawTag || '').toLowerCase();
    const closing = full.startsWith('</');
    if (!SAFE_HTML_TAGS.has(tag)) return '';
    if (closing || tag === 'br') return `<${closing ? '/' : ''}${tag}>`;
    if (tag !== 'a') return `<${tag}>`;
    const hrefMatch = String(rawAttrs || '').match(/\shref\s*=\s*(['"])(.*?)\1/i);
    const safeHref = sanitizeUrl(hrefMatch ? hrefMatch[2] : '', { allowMailto: true, allowRelative: true });
    if (!safeHref) return '<a>';
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">`;
  });
  out = out.replace(/\s{2,}/g, ' ').trim();
  return out.slice(0, max);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createPasswordHash(plain, secret) {
  const password = String(plain || '');
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, secret + salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function legacyPasswordHash(plain, secret) {
  return crypto.createHash('sha256').update(String(plain || '') + secret).digest('hex');
}

function verifyPasswordHash(plain, storedHash, secret) {
  const stored = String(storedHash || '').trim();
  if (!stored) return false;
  if (!stored.startsWith('scrypt$')) return legacyPasswordHash(plain, secret) === stored;
  const parts = stored.split('$');
  if (parts.length !== 3 || !parts[1] || !parts[2]) return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(String(plain || ''), secret + parts[1], expected.length);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function isLegacyPasswordHash(storedHash) {
  const stored = String(storedHash || '').trim();
  return !!stored && !stored.startsWith('scrypt$');
}

module.exports = {
  sanitizeText,
  sanitizeUrl,
  sanitizeRichHtml,
  escapeHtml,
  createPasswordHash,
  legacyPasswordHash,
  verifyPasswordHash,
  isLegacyPasswordHash,
};
