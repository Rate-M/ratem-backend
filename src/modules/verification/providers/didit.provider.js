const crypto = require('crypto');

const API_URL = 'https://verification.didit.me';
const TIMESTAMP_TOLERANCE_SECONDS = 300;

const STATUS_MAP = {
  Approved: 'approved',
  Declined: 'rejected',
  Abandoned: 'expired',
  Expired: 'expired',
  'Kyc Expired': 'expired',
};

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function getConfig(name) {
  const value = process.env[name];

  if (!value) {
    fail(`Falta configurar ${name}`, 500);
  }

  return value;
}

async function createSession({ userId }) {
  const apiKey = getConfig('DIDIT_API_KEY');
  const body = {
    workflow_id: getConfig('DIDIT_WORKFLOW_ID'),
    vendor_data: String(userId),
  };

  if (process.env.DIDIT_CALLBACK_URL) {
    body.callback = process.env.DIDIT_CALLBACK_URL;
  }

  let response;

  try {
    response = await fetch(`${API_URL}/v3/session/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    fail('No se pudo conectar con el proveedor de verificación', 502);
  }

  if (!response.ok) {
    fail('El proveedor de verificación rechazó la solicitud', 502);
  }

  const data = await response.json();

  if (typeof data.session_id !== 'string' || typeof data.url !== 'string') {
    fail('Respuesta inválida del proveedor de verificación', 502);
  }

  return {
    providerSessionId: data.session_id,
    verificationUrl: data.url,
  };
}

function signatureMatches(rawBody, received, secret) {
  if (typeof received !== 'string' || !/^[a-f0-9]{64}$/i.test(received)) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest();

  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}

function verifyWebhook({ rawBody, headers, now = Date.now() }) {
  const secret = getConfig('DIDIT_WEBHOOK_SECRET');
  const timestamp = Number(headers['x-timestamp']);

  if (!Buffer.isBuffer(rawBody) || !Number.isFinite(timestamp)) {
    return false;
  }

  if (Math.abs(now / 1000 - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) {
    return false;
  }

  return (
    signatureMatches(rawBody, headers['x-signature'], secret) ||
    signatureMatches(rawBody, headers['x-signature-previous'], secret)
  );
}

function findDateOfBirth(decision) {
  const verifications = decision?.id_verifications;

  if (!Array.isArray(verifications)) {
    return null;
  }

  const match = verifications.find(
    (item) => typeof item?.date_of_birth === 'string'
  );

  return match ? match.date_of_birth : null;
}

function parseWebhook(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    fail('Notificación del proveedor inválida');
  }

  if (body.webhook_type !== 'status.updated') {
    return null;
  }

  if (typeof body.session_id !== 'string' || typeof body.status !== 'string') {
    fail('La notificación no incluye la sesión o el estado');
  }

  return {
    providerSessionId: body.session_id,
    providerStatus: body.status,
    status: STATUS_MAP[body.status] ?? null,
    dateOfBirth: findDateOfBirth(body.decision),
  };
}

module.exports = {
  name: 'didit',
  createSession,
  verifyWebhook,
  parseWebhook,
};
