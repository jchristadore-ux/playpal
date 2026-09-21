/**
 * GET /api/health
 * Ops + client degrade signal: boolean flags for whether the payments path
 * is configured. Never echoes secret values — presence only.
 */
function present(value) {
  return typeof value === 'string' ? value.trim().length > 0 : !!value;
}

function firebaseJsonLooksValid(raw) {
  if (!present(raw)) return false;
  try {
    const sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return !!(sa && typeof sa === 'object' && (sa.client_email || sa.project_id || sa.type));
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeSecretKey = present(process.env.STRIPE_SECRET_KEY);
  const stripePriceId = present(process.env.STRIPE_PRICE_ID);
  const stripeWebhookSecret = present(process.env.STRIPE_WEBHOOK_SECRET);
  const firebaseAdmin = firebaseJsonLooksValid(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

  const paymentsConfigured =
    stripeSecretKey && stripePriceId && stripeWebhookSecret && firebaseAdmin;

  return res.status(200).json({
    ok: true,
    service: 'playpal',
    paymentsConfigured,
    stripeSecretKey,
    stripePriceId,
    stripeWebhookSecret,
    firebaseAdmin,
    // Client feature flag mirror is not env-driven server-side; clients read
    // window.PLAYPAL_CONFIG.enforceProGates themselves.
    checkedAt: new Date().toISOString(),
  });
}
