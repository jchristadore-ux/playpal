/**
 * POST /api/stripe-webhook
 * Stripe signature-verified webhook. Grants PlayPal Pro on
 * checkout.session.completed by writing users/{uid} via Admin SDK.
 */
import { getStripe, constructWebhookEvent } from '../lib/stripeClient.mjs';
import { getFirestore, getFirebaseAdmin } from '../lib/firebaseAdmin.mjs';
import {
  evaluateCheckoutCompleted,
  buildProGrant,
  entitlementIdempotencyKey,
} from '../lib/entitlement.mjs';

export const config = {
  api: { bodyParser: false },
};

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function grantProIdempotent(decision) {
  const db = getFirestore();
  const key = entitlementIdempotencyKey(decision);
  const userRef = db.collection('users').doc(decision.uid);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    const existing = snap.exists ? snap.data() : {};

    // Already granted for this payment / session — no-op.
    if (
      key &&
      existing.entitlementKey === key &&
      existing.pro === true
    ) {
      return;
    }
    // Already Pro from a prior purchase — still record the latest session refs.
    const patch = buildProGrant({
      uid: decision.uid,
      sessionId: decision.sessionId,
      customerId: decision.customerId,
      paymentIntentId: decision.paymentIntentId,
    });
    if (key) patch.entitlementKey = key;
    if (!existing.createdAt) patch.createdAt = patch.updatedAt;
    if (existing.email) patch.email = existing.email;
    if (existing.groupId) patch.groupId = existing.groupId;

    tx.set(userRef, patch, { merge: true });
  });

  // Also set Auth custom claim so the client can unlock Pro without needing
  // Firestore rules that allow users/{uid} reads (claim lands on next token refresh).
  try {
    const auth = getFirebaseAdmin().auth();
    const user = await auth.getUser(decision.uid);
    const claims = { ...(user.customClaims || {}), pro: true };
    await auth.setCustomUserClaims(decision.uid, claims);
  } catch (err) {
    console.error('[stripe-webhook] setCustomUserClaims failed:', err && err.message);
    // Firestore grant already succeeded; client may still unlock after rules deploy.
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method not allowed');
  }

  let event;
  try {
    const rawBody = await readRawBody(req);
    const sig = req.headers['stripe-signature'];
    if (!sig) return res.status(400).send('Missing stripe-signature');
    event = constructWebhookEvent(rawBody, sig);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const decision = evaluateCheckoutCompleted(session);
      if (decision.grant) {
        await grantProIdempotent(decision);
        console.log('[stripe-webhook] Pro granted for', decision.uid, decision.sessionId);
      } else {
        console.warn('[stripe-webhook] skipped grant:', decision.reason, session && session.id);
      }
    }
    // Acknowledge other event types so Stripe does not retry forever.
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[stripe-webhook] handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}

// Re-export helpers for tests that import this module's pure path via entitlement.
export { evaluateCheckoutCompleted, buildProGrant, entitlementIdempotencyKey };
