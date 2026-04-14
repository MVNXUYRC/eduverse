/**
 * Mailer — Notificaciones a interesados en propuestas Próximamente
 *
 * Variables de entorno requeridas:
 *   NOTIFY_SMTP_HOST   — servidor SMTP (ej: smtp-mail.outlook.com)
 *   NOTIFY_SMTP_PORT   — puerto SMTP (default: 587)
 *   NOTIFY_SMTP_USER   — usuario/email de la cuenta de envío
 *   NOTIFY_SMTP_PASS   — contraseña o app password
 *   NOTIFY_FROM        — dirección "From" (ej: EAD Novedades <joel_barrera@outlook.com>)
 *   PUBLIC_URL         — URL base del sitio (opcional, para links en el email)
 */

const nodemailer = require('nodemailer');

function hasMailConfig() {
  const host = String(process.env.NOTIFY_SMTP_HOST || '').trim();
  const user = String(process.env.NOTIFY_SMTP_USER || '').trim();
  const pass = String(process.env.NOTIFY_SMTP_PASS || '').trim();
  const from = String(process.env.NOTIFY_FROM || '').trim();
  return !!(host && user && pass && from);
}

function createTransporter() {
  const port = parseInt(String(process.env.NOTIFY_SMTP_PORT || '587'), 10);
  return nodemailer.createTransport({
    host: process.env.NOTIFY_SMTP_HOST,
    port: Number.isFinite(port) ? port : 587,
    secure: port === 465,
    auth: {
      user: process.env.NOTIFY_SMTP_USER,
      pass: process.env.NOTIFY_SMTP_PASS,
    },
  });
}

function buildEmailHtml(carrera) {
  const siteUrl = String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const nombre = String(carrera.nombre || 'Propuesta formativa');
  const tipo = String(carrera.tipo || '');
  const modalidad = String(carrera.modalidad || '');
  const duracion = String(carrera.duracion || '');
  const unidad = String(
    (Array.isArray(carrera.unidadesAcademicas) && carrera.unidadesAcademicas[0])
      || carrera.unidadAcademica
      || ''
  );
  const inscripcion = String(carrera.formularioInscripcion || '');

  const detalles = [
    tipo      && `<li><strong>Tipo:</strong> ${tipo}</li>`,
    modalidad && `<li><strong>Modalidad:</strong> ${modalidad}</li>`,
    duracion  && `<li><strong>Duración:</strong> ${duracion}</li>`,
    unidad && unidad.toLowerCase() !== 'educación a distancia' && unidad.toLowerCase() !== 'educacion a distancia' && `<li><strong>Unidad académica:</strong> ${unidad}</li>`,
  ].filter(Boolean).join('\n');

  const btnInscripcion = inscripcion
    ? `<p style="margin-top:24px;"><a href="${inscripcion}" style="background:#1a56db;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Inscribirme ahora</a></p>`
    : '';

  const btnSitio = siteUrl
    ? `<p style="margin-top:12px;"><a href="${siteUrl}" style="color:#1a56db;font-size:14px;">Ver todas las propuestas en el sitio</a></p>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>${nombre}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:#1a56db;padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:13px;letter-spacing:.5px;text-transform:uppercase;">UNaM — Educación a Distancia</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 8px;font-size:22px;color:#111;">${nombre}</h1>
          <p style="margin:0 0 24px;color:#555;font-size:15px;">
            La propuesta formativa que registraste como interés <strong>ya está disponible</strong>.
          </p>
          ${detalles ? `<ul style="padding-left:20px;color:#333;line-height:1.8;">${detalles}</ul>` : ''}
          ${btnInscripcion}
          ${btnSitio}
          <hr style="margin:32px 0;border:none;border-top:1px solid #eee;">
          <p style="margin:0;color:#999;font-size:12px;">
            Recibís este correo porque registraste tu interés en esta propuesta.<br>
            Si no reconocés este registro, podés ignorar este mensaje.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Envía una notificación de disponibilidad al interesado.
 * @param {object} interesado  — registro de la tabla interesados (necesita .email)
 * @param {object} carrera     — registro de la tabla carreras
 * @returns {Promise<{sent: boolean, error?: string}>}
 */
async function sendInterestedNotification(interesado, carrera) {
  if (!hasMailConfig()) {
    return { sent: false, error: 'Sin configuración SMTP (NOTIFY_SMTP_*)' };
  }

  const from = String(process.env.NOTIFY_FROM || '').trim();
  const to   = String(interesado.email || '').trim();
  const subject = `Ya está disponible: ${String(carrera.nombre || 'Propuesta formativa')}`;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from,
      to,
      subject,
      html: buildEmailHtml(carrera),
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message || String(err) };
  }
}

// ── Newsletter digest ──────────────────────────────────────

function hasNewsletterMailConfig() {
  const host = String(process.env.NEWSLETTER_SMTP_HOST || process.env.NOTIFY_SMTP_HOST || '').trim();
  const user = String(process.env.NEWSLETTER_SMTP_USER || process.env.NOTIFY_SMTP_USER || '').trim();
  const pass = String(process.env.NEWSLETTER_SMTP_PASS || process.env.NOTIFY_SMTP_PASS || '').trim();
  const from = String(process.env.NEWSLETTER_FROM || process.env.NOTIFY_FROM || '').trim();
  return !!(host && user && pass && from);
}

function createNewsletterTransporter() {
  const port = parseInt(
    String(process.env.NEWSLETTER_SMTP_PORT || process.env.NOTIFY_SMTP_PORT || '587'),
    10,
  );
  return nodemailer.createTransport({
    host: process.env.NEWSLETTER_SMTP_HOST || process.env.NOTIFY_SMTP_HOST,
    port: Number.isFinite(port) ? port : 587,
    secure: port === 465,
    auth: {
      user: process.env.NEWSLETTER_SMTP_USER || process.env.NOTIFY_SMTP_USER,
      pass: process.env.NEWSLETTER_SMTP_PASS || process.env.NOTIFY_SMTP_PASS,
    },
  });
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDateEs(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });
}

function buildDigestSection(title, carreras, siteUrl, showClosingDate) {
  if (!carreras.length) return '';
  const rows = carreras.map((c) => {
    const tipo = c.esCurso ? 'Curso' : (c.tipo || 'Carrera');
    const badge = `<span style="display:inline-block;background:#e8f0fe;color:#1a56db;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;margin-left:6px;vertical-align:middle">${escHtml(tipo)}</span>`;
    const updatedBadge = c.actualizadaEnVentana === true
      ? '<span style="display:inline-block;background:#fff7ed;color:#9a3412;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;margin-left:6px;vertical-align:middle">Actualizada</span>'
      : '';
    const modalidadLine = c.modalidad ? `<div style="color:#666;font-size:13px;margin-top:3px">${escHtml(c.modalidad)}</div>` : '';
    let closingLine = '';
    if (showClosingDate && c.inscripcionFechaHasta) {
      const fmtd = fmtDateEs(c.inscripcionFechaHasta);
      if (fmtd) closingLine = `<div style="color:#b45309;font-size:13px;margin-top:3px;font-weight:600">Cierre: ${escHtml(fmtd)}</div>`;
    }
    const inscripcionBtn = c.formularioInscripcion
      ? `<a href="${escHtml(c.formularioInscripcion)}" style="display:inline-block;margin-top:8px;background:#1a56db;color:#fff;padding:7px 16px;border-radius:5px;text-decoration:none;font-size:13px;font-weight:600">Inscribirme</a>`
      : (siteUrl ? `<a href="${escHtml(siteUrl)}" style="display:inline-block;margin-top:8px;color:#1a56db;font-size:13px;text-decoration:underline">Ver en el sitio</a>` : '');
    return `<tr><td style="padding:12px 0;border-bottom:1px solid #f0f0f0">
      <div style="font-weight:600;font-size:15px;color:#111">${escHtml(c.nombre)}${badge}${updatedBadge}</div>
      ${modalidadLine}${closingLine}
      ${inscripcionBtn}
    </td></tr>`;
  }).join('');
  return `<h2 style="margin:28px 0 8px;font-size:16px;color:#1a56db;border-bottom:2px solid #e8f0fe;padding-bottom:6px">${escHtml(title)}</h2>
<table width="100%" cellpadding="0" cellspacing="0"><tbody>${rows}</tbody></table>`;
}

function buildDigestEmailHtml(diff, siteUrl) {
  const cleanSiteUrl = String(siteUrl || '').replace(/\/$/, '');
  const totalChanged = diff.total || 0;

  const sections = [
    buildDigestSection('Nuevas propuestas', diff.nueva || [], cleanSiteUrl, false),
    buildDigestSection('Inscripciones abiertas', diff.inscripcionAbierta || [], cleanSiteUrl, false),
    buildDigestSection('Próximamente disponibles', diff.proximamente || [], cleanSiteUrl, false),
    buildDigestSection('Inscripciones con cierre próximo', diff.cierreProximo || [], cleanSiteUrl, true),
    buildDigestSection('Inscripciones cerradas recientemente', diff.cierreReciente || [], cleanSiteUrl, false),
    buildDigestSection('Propuestas actualizadas', diff.actualizadas || [], cleanSiteUrl, false),
  ].filter(Boolean).join('');

  const introLine = totalChanged === 1
    ? 'Esta semana hay <strong>1 novedad</strong> en las propuestas formativas de UNaM.'
    : `Esta semana hay <strong>${totalChanged} novedades</strong> en las propuestas formativas de UNaM.`;

  const btnSitio = cleanSiteUrl
    ? `<p style="margin-top:24px"><a href="${escHtml(cleanSiteUrl)}" style="background:#1a56db;color:#fff;padding:11px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">Ver toda la oferta académica</a></p>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Novedades en la oferta académica</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:#1a56db;padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:13px;letter-spacing:.5px;text-transform:uppercase;">UNaM — Educación a Distancia</p>
          <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700;">Novedades en la oferta académica</h1>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 16px;color:#444;font-size:15px;line-height:1.6">${introLine}</p>
          ${sections}
          ${btnSitio}
          <hr style="margin:32px 0;border:none;border-top:1px solid #eee;">
          <p style="margin:0;color:#999;font-size:12px;line-height:1.6">
            Recibís este correo porque estás suscripto/a al newsletter de propuestas formativas de UNaM.<br>
            Si no querés recibir más estos correos, contactate con el equipo de EAD.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Envía el digest semanal a todos los suscriptores activos.
 * @param {string[]} recipients  — arreglo de emails activos
 * @param {object}  diff         — resultado de buildNewsletterDiff
 * @param {string}  siteUrl      — PUBLIC_URL del sitio
 * @returns {Promise<{sentCount: number, sentEmails: string[], failed: Array<{email,error}>}>}
 */
async function sendNewsletterDigest(recipients, diff, siteUrl) {
  if (!hasNewsletterMailConfig()) {
    return { sentCount: 0, sentEmails: [], error: 'Sin configuración SMTP para newsletter (NOTIFY_SMTP_* o NEWSLETTER_SMTP_*)' };
  }
  if (!recipients || !recipients.length) {
    return { sentCount: 0, sentEmails: [], error: 'Sin destinatarios' };
  }

  const from = String(process.env.NEWSLETTER_FROM || process.env.NOTIFY_FROM || '').trim();
  const subject = 'Novedades en la oferta académica — UNaM';
  const html = buildDigestEmailHtml(diff, siteUrl);
  const transporter = createNewsletterTransporter();

  let sentCount = 0;
  const sentEmails = [];
  const failed = [];

  for (const email of recipients) {
    try {
      await transporter.sendMail({ from, to: email, subject, html });
      sentEmails.push(email);
      sentCount++;
    } catch (err) {
      failed.push({ email, error: err.message || String(err) });
    }
  }

  return { sentCount, sentEmails, failed };
}

module.exports = { sendInterestedNotification, hasMailConfig, sendNewsletterDigest, hasNewsletterMailConfig };
