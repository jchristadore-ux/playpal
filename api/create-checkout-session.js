/**
 * POST /api/create-checkout-session
 * Auth: Firebase ID token (Authorization: Bearer …)
 * Body: { successUrl?, cancelUrl? }
 * Returns: { url, sessionId }
 */
import { getStripe, getPriceId } from '../lib/stripeClient.mjs';
import { verifyIdToken } from '../lib/firebaseAdmin.mjs';
import { PRO_PRODUCT } from '../lib/entitlement.mjs';

function originFromReq(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const decoded = await verifyIdToken(req.headers.authorization || '');
    const uid = decoded.uid;
    if (decoded.firebase && decoded.firebase.sign_in_provider === 'anonymous') {
      return res.status(403).json({
        error: 'Sign in with email or Google before upgrading to Pro.',
        code: 'anonymous_not_allowed',
      });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const origin = originFromReq(req);
    const successUrl = body.successUrl || `${origin}/?pro=success`;
    const cancelUrl = body.cancelUrl || `${origin}/?pro=cancel`;

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: PRO_PRODUCT.mode,
      line_items: [{ price: getPriceId(), quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: uid,
      metadata: {
        firebaseUid: uid,
        product: PRO_PRODUCT.id,
      },
      // Do NOT set payment_method_types — Stripe enables methods from Dashboard.
      customer_creation: 'if_required',
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const status = err.statusCode || 500;
    console.error('[create-checkout-session]', err.message || err);
    return res.status(status).json({
      error: status === 401 ? err.message : 'Could not create checkout session',
      detail: process.env.NODE_ENV === 'development' ? String(err.message || err) : undefined,
    });
  }
}
