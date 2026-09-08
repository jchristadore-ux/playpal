// proService.js — PlayPal Pro entitlement (Stripe one-time unlock).
//
// Cache locally, verify against users/{uid} on launch, fail OPEN if the
// network is down and the cache says the user already paid (APP_STORE_AUDIT §5.4).

const ProService = (function () {
  const CACHE_KEY = 'pp_pro_entitlement';
  const PRICE_DISPLAY = '$9.99';
  let _state = { pro: false, source: 'default', doc: null };
  let _listeners = [];

  function _cfg() {
    return (typeof window !== 'undefined' && window.PLAYPAL_CONFIG) || {};
  }

  function _apiBase() {
    const c = _cfg();
    if (c.apiBaseUrl) return String(c.apiBaseUrl).replace(/\/$/, '');
    // Same origin when the static app is hosted on Vercel alongside /api.
    try { return window.location.origin; } catch (e) { return ''; }
  }

  function _readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function _writeCache(doc) {
    try {
      if (doc) localStorage.setItem(CACHE_KEY, JSON.stringify(doc));
      else localStorage.removeItem(CACHE_KEY);
    } catch (e) {}
  }

  function _emit() {
    _listeners.forEach(fn => { try { fn(_state); } catch (e) {} });
    try { window.dispatchEvent(new CustomEvent('pp:pro', { detail: { ..._state } })); } catch (e) {}
  }

  function _set(next) {
    _state = next;
    if (next.doc) _writeCache(next.doc);
    _emit();
  }

  // Resolve using the pure helper when available (tests + browser after build).
  function _resolve(remote, cached, networkError) {
    if (window.EntitlementHelpers && window.EntitlementHelpers.resolveEntitlement) {
      return window.EntitlementHelpers.resolveEntitlement({ remote, cached, networkError });
    }
    if (remote && typeof remote.pro === 'boolean') return { pro: !!remote.pro, source: 'remote', doc: remote };
    if (networkError && cached && cached.pro === true) return { pro: true, source: 'cache_fail_open', doc: cached };
    if (cached && typeof cached.pro === 'boolean') return { pro: !!cached.pro, source: 'cache', doc: cached };
    return { pro: false, source: 'default', doc: null };
  }

  function isPro() { return !!_state.pro; }
  function state() { return { ..._state }; }
  function priceDisplay() { return PRICE_DISPLAY; }

  function onChange(fn) {
    _listeners.push(fn);
    try { fn(_state); } catch (e) {}
    return () => { _listeners = _listeners.filter(f => f !== fn); };
  }

  function bootFromCache() {
    const cached = _readCache();
    _set(_resolve(null, cached, false));
  }

  async function refresh() {
    const cached = _readCache();
    const auth = window.AuthService;
    const user = auth && auth.currentUser && auth.currentUser();
    if (!user || user.isAnonymous) {
      _set(_resolve(null, cached, false));
      return _state;
    }
    if (!window.firebase || !window.firebase.firestore) {
      _set(_resolve(null, cached, true));
      return _state;
    }
    try {
      const snap = await window.firebase.firestore().collection('users').doc(user.uid).get();
      const remote = snap.exists ? snap.data() : { pro: false };
      _set(_resolve(remote, cached, false));
    } catch (e) {
      console.warn('[ProService] refresh failed, fail-open if cached:', e && e.message);
      _set(_resolve(null, cached, true));
    }
    return _state;
  }

  /**
   * Create a Stripe Checkout Session via the Vercel API and redirect.
   * Requires a non-anonymous signed-in Firebase user.
   */
  async function startCheckout() {
    const auth = window.AuthService;
    if (!auth || !auth.isSignedIn || !auth.isSignedIn()) {
      const err = new Error('Sign in before upgrading to Pro.');
      err.code = 'auth_required';
      throw err;
    }
    const token = await auth.getIdToken(true);
    if (!token) {
      const err = new Error('Could not get auth token.');
      err.code = 'auth_token';
      throw err;
    }
    const origin = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
    const successUrl = origin + 'index.html?pro=success';
    const cancelUrl = origin + 'index.html?pro=cancel';
    const res = await fetch(_apiBase() + '/api/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({ successUrl, cancelUrl }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      const err = new Error(data.error || 'Checkout failed');
      err.code = data.code || 'checkout_failed';
      throw err;
    }
    window.location.href = data.url;
    return data;
  }

  /** Handle ?pro=success|cancel return from Stripe Checkout. */
  function handleReturnParams() {
    try {
      const params = new URLSearchParams(window.location.search);
      const flag = params.get('pro');
      if (!flag) return null;
      const url = new URL(window.location.href);
      url.searchParams.delete('pro');
      window.history.replaceState({}, '', url.toString());
      if (flag === 'success') {
        refresh();
        return 'success';
      }
      if (flag === 'cancel') return 'cancel';
      return flag;
    } catch (e) { return null; }
  }

  /** Soft gate: Pro features stay usable when fail-open says pro. */
  function canUse(featureKey) {
    if (!featureKey) return isPro();
    if (window.EntitlementHelpers && window.EntitlementHelpers.featureRequiresPro) {
      if (!window.EntitlementHelpers.featureRequiresPro(featureKey)) return true;
    }
    return isPro();
  }

  return {
    bootFromCache,
    refresh,
    isPro,
    state,
    onChange,
    startCheckout,
    handleReturnParams,
    canUse,
    priceDisplay,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { ProService });
}
