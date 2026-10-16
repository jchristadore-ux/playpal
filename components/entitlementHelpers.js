// entitlementHelpers.js — browser build of lib/entitlement.mjs (no imports).
const EntitlementHelpers = (function () {
  const PRO_PRODUCT = {
    id: 'playpal_pro',
    name: 'PlayPal Pro',
    priceDisplay: '$9.99',
    mode: 'payment',
  };

  function buildProGrant({ uid, sessionId = null, customerId = null, paymentIntentId = null, grantedAt = null } = {}) {
    if (!uid || typeof uid !== 'string') throw new Error('uid is required to grant Pro');
    const at = grantedAt || new Date().toISOString();
    const patch = { pro: true, proGrantedAt: at, updatedAt: at };
    if (customerId) patch.stripeCustomerId = customerId;
    if (sessionId) patch.stripeCheckoutSessionId = sessionId;
    if (paymentIntentId) patch.stripePaymentIntentId = paymentIntentId;
    return patch;
  }

  function evaluateCheckoutCompleted(session) {
    if (!session || typeof session !== 'object') return { grant: false, reason: 'missing_session' };
    if (session.mode && session.mode !== 'payment') return { grant: false, reason: 'wrong_mode', mode: session.mode };
    const paid = session.payment_status === 'paid' || session.status === 'complete';
    if (!paid && session.payment_status !== 'no_payment_required') {
      return { grant: false, reason: 'not_paid', payment_status: session.payment_status };
    }
    const uid =
      (session.client_reference_id && String(session.client_reference_id)) ||
      (session.metadata && session.metadata.firebaseUid) ||
      null;
    if (!uid) return { grant: false, reason: 'missing_uid' };
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

  function entitlementIdempotencyKey({ sessionId, paymentIntentId } = {}) {
    if (paymentIntentId) return 'pi:' + paymentIntentId;
    if (sessionId) return 'cs:' + sessionId;
    return null;
  }

  function resolveEntitlement({ remote, cached, networkError }) {
    if (remote && typeof remote.pro === 'boolean') return { pro: !!remote.pro, source: 'remote', doc: remote };
    if (networkError && cached && cached.pro === true) return { pro: true, source: 'cache_fail_open', doc: cached };
    if (cached && typeof cached.pro === 'boolean') return { pro: !!cached.pro, source: 'cache', doc: cached };
    return { pro: false, source: 'default', doc: null };
  }

  const PRO_FEATURES = {
    trips: 'Multi-round trips & cumulative money',
    season: 'Season / cup standings for any group',
    statsHistory: 'Career stats, trends, round comparison',
    export: 'CSV export & printable recap book',
  };


  /**
   * Auth custom claims that unlock Pro: pro:true (Stripe webhook) or
   * admin:true / superuser:true (scripts/grant-superuser.mjs).
   */
  function claimsGrantPro(claims) {
    if (!claims || typeof claims !== 'object') return false;
    return claims.pro === true || claims.admin === true || claims.superuser === true;
  }

  function claimsIsAdmin(claims) {
    return !!(claims && typeof claims === 'object' && (claims.admin === true || claims.superuser === true));
  }

  // ── Group-level Pro (crew comp) ────────────────────────────────────────
  // Everyone whose CURRENT group is listed passes the Pro gates: guests,
  // future sign-ups and anyone who joins with the group's code. A group id is
  // also its join secret, so the list holds SHA-256 hex digests, never ids.
  // Adding a group is a code change (PR + review); nothing at runtime, and no
  // user or group owner, can add one. Only the UI gates (enforceProGates)
  // read this; no server API or Firestore rule depends on Pro.
  const PRO_GROUP_HASHES = [
    '72553dea3ba4142440939d109c694509db7860465454c44de2f18c9ffe73dee3', // JD's crew group (CB4B…)
    '6e779d3634705ea2ed91ee059566ec7290b305ef850ef3664f6ad2e63a27d5e9', // LEGACY (pre-groups data the crew still uses)
  ];

  // Small synchronous SHA-256 (UTF-8) so the gates stay synchronous.
  function sha256Hex(str) {
    const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const bytes = unescape(encodeURIComponent(String(str)));
    const len = bytes.length;
    const words = [];
    for (let i = 0; i < len; i++) words[i >> 2] |= (bytes.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
    words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
    const nBlocks = (((len + 8) >> 6) + 1) * 16;
    for (let i = 0; i < nBlocks; i++) words[i] = words[i] | 0;
    words[nBlocks - 1] = len * 8;
    let h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    const w = new Array(64);
    for (let j = 0; j < nBlocks; j += 16) {
      for (let i = 0; i < 16; i++) w[i] = words[j + i];
      for (let i = 16; i < 64; i++) {
        const s0 = r(w[i-15], 7) ^ r(w[i-15], 18) ^ (w[i-15] >>> 3);
        const s1 = r(w[i-2], 17) ^ r(w[i-2], 19) ^ (w[i-2] >>> 10);
        w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h = [(h[0]+a)|0, (h[1]+b)|0, (h[2]+c)|0, (h[3]+d)|0, (h[4]+e)|0, (h[5]+f)|0, (h[6]+g)|0, (h[7]+hh)|0];
    }
    return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }

  function groupGrantsPro(groupId) {
    const id = String(groupId || '').trim().toUpperCase();
    if (!id) return false;
    return PRO_GROUP_HASHES.includes(sha256Hex(id));
  }

  function featureRequiresPro(featureKey) {
    return Object.prototype.hasOwnProperty.call(PRO_FEATURES, featureKey);
  }

  return {
    PRO_PRODUCT,
    PRO_FEATURES,
    buildProGrant,
    evaluateCheckoutCompleted,
    entitlementIdempotencyKey,
    resolveEntitlement,
    featureRequiresPro,
    claimsGrantPro,
    claimsIsAdmin,
    PRO_GROUP_HASHES,
    sha256Hex,
    groupGrantsPro,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { EntitlementHelpers });
}
