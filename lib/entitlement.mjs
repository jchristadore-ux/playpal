/**
 * PlayPal Pro entitlement helpers — pure, testable, no Firebase/Stripe I/O.
 *
 * Pro is a one-time unlock ($9.99). The Stripe webhook writes users/{uid}
 * with pro:true; the client reads its own doc and caches locally.
 */

export const PRO_PRODUCT = {
  id: 'playpal_pro',
  name: 'PlayPal Pro',
  priceDisplay: '$9.99',
  mode: 'payment', // Stripe Checkout one-time
};

/** Build the Firestore user-doc patch that grants Pro (idempotent merge). */
export function buildProGrant({
  uid,
  sessionId = null,
  customerId = null,
  paymentIntentId = null,
  grantedAt = null,
} = {}) {
  if (!uid || typeof uid !== 'string') {
    throw new Error('uid is required to grant Pro');
  }
  const at = grantedAt || new Date().toISOString();
  const patch = {
    pro: true,
    proGrantedAt: at,
    updatedAt: at,
  };
  if (customerId) patch.stripeCustomerId = customerId;
  if (sessionId) patch.stripeCheckoutSessionId = sessionId;
  if (paymentIntentId) patch.stripePaymentIntentId = paymentIntentId;
  return patch;
}

/**
 * Decide whether a webhook event should grant Pro.
 * Returns { grant: boolean, reason, uid, sessionId, customerId, paymentIntentId }.
 */
export function evaluateCheckoutCompleted(session) {
  if (!session || typeof session !== 'object') {
    return { grant: false, reason: 'missing_session' };
  }
  if (session.mode && session.mode !== 'payment') {
    return { grant: false, reason: 'wrong_mode', mode: session.mode };
  }
  // Only unpaid→paid completion (or already paid) grants.
  const paid = session.payment_status === 'paid' || session.status === 'complete';
  if (!paid && session.payment_status !== 'no_payment_required') {
    return { grant: false, reason: 'not_paid', payment_status: session.payment_status };
  }

  const uid =
    (session.client_reference_id && String(session.client_reference_id)) ||
    (session.metadata && session.metadata.firebaseUid) ||
    null;

  if (!uid) {
    return { grant: false, reason: 'missing_uid' };
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent && session.payment_intent.id) || null;

  return {
    grant: true,
    reason: 'ok',
    uid,
    sessionId: session.id || null,
    customerId:
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer && session.customer.id) || null,
    paymentIntentId,
  };
}

/**
 * Idempotency key for a grant — prefer payment intent, else session id.
 * Used so replaying the same webhook does not create duplicate side effects
 * beyond a harmless Firestore merge.
 */
export function entitlementIdempotencyKey({ sessionId, paymentIntentId } = {}) {
  if (paymentIntentId) return `pi:${paymentIntentId}`;
  if (sessionId) return `cs:${sessionId}`;
  return null;
}

/**
 * Client-side fail-open: if we cannot reach the server, keep the last known
 * Pro cache so a paying golfer is never locked out of their trip dashboard.
 */
export function resolveEntitlement({ remote, cached, networkError }) {
  if (remote && typeof remote.pro === 'boolean') {
    return { pro: !!remote.pro, source: 'remote', doc: remote };
  }
  if (networkError && cached && cached.pro === true) {
    return { pro: true, source: 'cache_fail_open', doc: cached };
  }
  if (cached && typeof cached.pro === 'boolean') {
    return { pro: !!cached.pro, source: 'cache', doc: cached };
  }
  return { pro: false, source: 'default', doc: null };
}

/** Features gated behind Pro (audit §5.3). Free tier keeps in-round scoring. */
export const PRO_FEATURES = {
  trips: 'Multi-round trips & cumulative money',
  season: 'Season / cup standings for any group',
  statsHistory: 'Career stats, trends, round comparison',
  export: 'CSV export & printable recap book',
};

export function featureRequiresPro(featureKey) {
  return Object.prototype.hasOwnProperty.call(PRO_FEATURES, featureKey);
}
