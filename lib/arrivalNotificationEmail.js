const ARRIVAL_ALERT_PRIMARY_EMAIL = 'angelezequielojeda01@gmail.com';
const ARRIVAL_ALERT_BACKUP_EMAIL = 'soporte@21-moon.com';
const DEFAULT_ARRIVAL_ALERT_SUBJECT = 'Nueva carta de llegada';
const DEFAULT_ARRIVAL_ALERT_FROM = '21-Moon <onboarding@resend.dev>';

function normalizeOrigin(origin) {
  const text = String(origin || '').trim();
  if (!text) return '';
  return text.replace(/\/+$/, '');
}

function getPublicAppOrigin(req) {
  const configuredOrigin =
    process.env.APP_ORIGIN ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.URL;

  const normalizedConfiguredOrigin = normalizeOrigin(configuredOrigin);
  if (normalizedConfiguredOrigin) {
    return normalizedConfiguredOrigin;
  }

  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').trim();
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').trim();
  const host = forwardedHost || String(req?.headers?.host || '').trim();
  if (host) {
    return `${forwardedProto || 'https'}://${host}`;
  }

  const originHeader = normalizeOrigin(req?.headers?.origin);
  if (originHeader) {
    return originHeader;
  }

  return 'https://21-moon.com';
}

function buildArrivalAdminRoomUrl(req) {
  return new URL('/arrival-admin.html', `${getPublicAppOrigin(req)}/`).toString();
}

function shouldSendArrivalAdminNotification(existingArrivalRequest) {
  return !existingArrivalRequest?.id;
}

function getArrivalNotificationRecipients() {
  const includeBackup = process.env.ARRIVAL_ALERT_CC_BACKUP !== '0';
  return {
    to: [ARRIVAL_ALERT_PRIMARY_EMAIL],
    cc: includeBackup ? [ARRIVAL_ALERT_BACKUP_EMAIL] : []
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatOptionalLine(label, value) {
  const normalizedValue = String(value || '').trim();
  return normalizedValue ? `${label}: ${normalizedValue}` : null;
}

function buildArrivalNotificationText({ arrivalRequest, adminRoomUrl }) {
  const lines = [
    'Entró una nueva carta de llegada para revisión.',
    '',
    `Nombre: ${arrivalRequest.name}`,
    `Email: ${arrivalRequest.email}`,
    `Experiencia deseada: ${arrivalRequest.desired_experience}`,
    `Momentos deseados: ${arrivalRequest.desired_moments}`,
    formatOptionalLine('Nota', arrivalRequest.optional_note),
    `Estado inicial: ${arrivalRequest.status || 'requested'}`,
    '',
    `Sala privada de llegadas: ${adminRoomUrl}`
  ].filter(Boolean);

  return lines.join('\n');
}

function buildArrivalNotificationHtml({ arrivalRequest, adminRoomUrl }) {
  const optionalNote = String(arrivalRequest.optional_note || '').trim();
  const fields = [
    ['Nombre', arrivalRequest.name],
    ['Email', arrivalRequest.email],
    ['Experiencia deseada', arrivalRequest.desired_experience],
    ['Momentos deseados', arrivalRequest.desired_moments],
    optionalNote ? ['Nota', optionalNote] : null,
    ['Estado inicial', arrivalRequest.status || 'requested']
  ].filter(Boolean);

  const itemsHtml = fields
    .map(([label, value]) => `<li style="margin:0 0 10px;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`)
    .join('');

  return [
    '<div style="font-family:Inter,Arial,sans-serif;color:#111827;line-height:1.6;">',
    '<p style="margin:0 0 16px;">Entró una nueva carta de llegada para revisión.</p>',
    `<ul style="padding-left:20px;margin:0 0 20px;">${itemsHtml}</ul>`,
    `<p style="margin:0;">Abrir sala privada: <a href="${escapeHtml(adminRoomUrl)}">${escapeHtml(adminRoomUrl)}</a></p>`,
    '</div>'
  ].join('');
}

async function sendArrivalAdminNotification({
  arrivalRequest,
  req,
  fetchImpl = global.fetch
}) {
  const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!resendApiKey) {
    return {
      attempted: false,
      skipped: 'missing_resend_api_key'
    };
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch_unavailable_for_arrival_notification');
  }

  const adminRoomUrl = buildArrivalAdminRoomUrl(req);
  const recipients = getArrivalNotificationRecipients();
  const payload = {
    from: process.env.ARRIVAL_ALERT_FROM || DEFAULT_ARRIVAL_ALERT_FROM,
    to: recipients.to,
    cc: recipients.cc,
    subject: process.env.ARRIVAL_ALERT_SUBJECT || DEFAULT_ARRIVAL_ALERT_SUBJECT,
    text: buildArrivalNotificationText({ arrivalRequest, adminRoomUrl }),
    html: buildArrivalNotificationHtml({ arrivalRequest, adminRoomUrl })
  };

  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseText = await response.text();
  let responseData = {};
  if (responseText) {
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }
  }

  if (!response.ok) {
    const error = new Error(`resend_arrival_notification_failed:${response.status}`);
    error.status = response.status;
    error.responseData = responseData;
    throw error;
  }

  return {
    attempted: true,
    ok: true,
    provider: 'resend',
    adminRoomUrl,
    id: responseData?.id || null
  };
}

module.exports = {
  ARRIVAL_ALERT_PRIMARY_EMAIL,
  ARRIVAL_ALERT_BACKUP_EMAIL,
  buildArrivalAdminRoomUrl,
  buildArrivalNotificationHtml,
  buildArrivalNotificationText,
  getArrivalNotificationRecipients,
  sendArrivalAdminNotification,
  shouldSendArrivalAdminNotification
};
