// sync.js — Pluggable cross-device sync for PlayPal
//
// Provides a small async API used by the UI:
//   PlayPalSync.isEnabled()
//   PlayPalSync.pushRound(syncCode, round)
//   PlayPalSync.pullRound(syncCode)          -> returns round or null
//   PlayPalSync.pushState(syncCode, state)   -> { scores, wolfData, putts, presses, chips, holeIdx }
//   PlayPalSync.pullState(syncCode)          -> same shape or null
//   PlayPalSync.subscribe(syncCode, cb)      -> returns unsubscribe fn (polling under the hood)
//
// The current provider is "firebase" (Realtime Database via REST, no SDK).
// If no provider is configured, every call is a silent no-op and the app
// runs in local-only mode exactly like before.

(function () {
  const cfg = (window.PLAYPAL_SYNC || {});
  const provider = (cfg.provider || 'none').toLowerCase();
  const baseURL  = (cfg.databaseURL || '').replace(/\/+$/, '');
  const token    = cfg.authToken || null;

  const enabled = provider === 'firebase' && !!baseURL;

  const path = (syncCode, leaf) => {
    const code = String(syncCode || '').toUpperCase();
    const auth = token ? `?auth=${encodeURIComponent(token)}` : '';
    return `${baseURL}/rounds/${code}/${leaf}.json${auth}`;
  };

  async function put(url, body) {
    if (!enabled) return null;
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.warn('[PlayPalSync] PUT failed', res.status, url);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.warn('[PlayPalSync] PUT error', err);
      return null;
    }
  }

  async function get(url) {
    if (!enabled) return null;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      return data === null ? null : data;
    } catch (err) {
      console.warn('[PlayPalSync] GET error', err);
      return null;
    }
  }

  async function pushRound(syncCode, round) {
    if (!enabled || !syncCode || !round) return;
    await put(path(syncCode, 'round'), round);
    await put(path(syncCode, 'updatedAt'), Date.now());
  }

  async function pullRound(syncCode) {
    if (!enabled || !syncCode) return null;
    return await get(path(syncCode, 'round'));
  }

  async function pushState(syncCode, state) {
    if (!enabled || !syncCode) return;
    // Store writer id + timestamp so subscribers can ignore their own echoes.
    const payload = { ...state, writerId: getWriterId(), updatedAt: Date.now() };
    await put(path(syncCode, 'state'), payload);
    await put(path(syncCode, 'updatedAt'), payload.updatedAt);
  }

  async function pullState(syncCode) {
    if (!enabled || !syncCode) return null;
    return await get(path(syncCode, 'state'));
  }

  // Simple debounced writer so rapid UI changes don't flood the network.
  const debouncers = {};
  function pushStateDebounced(syncCode, stateFn, wait = 600) {
    if (!enabled || !syncCode) return;
    clearTimeout(debouncers[syncCode]);
    debouncers[syncCode] = setTimeout(() => {
      const state = typeof stateFn === 'function' ? stateFn() : stateFn;
      pushState(syncCode, state);
    }, wait);
  }

  // Lightweight polling subscription. Returns unsubscribe().
  function subscribe(syncCode, onChange, { intervalMs = 4000 } = {}) {
    if (!enabled || !syncCode) return () => {};
    let stopped = false;
    let lastStamp = 0;
    const tick = async () => {
      if (stopped) return;
      const stamp = await get(path(syncCode, 'updatedAt'));
      if (stamp && stamp !== lastStamp) {
        lastStamp = stamp;
        const state = await get(path(syncCode, 'state'));
        if (state && state.writerId !== getWriterId()) {
          try { onChange(state); } catch (err) { console.warn('[PlayPalSync] subscriber error', err); }
        }
      }
      if (!stopped) setTimeout(tick, intervalMs);
    };
    tick();
    return () => { stopped = true; };
  }

  function getWriterId() {
    let id = localStorage.getItem('pp_writer_id');
    if (!id) {
      id = 'w_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('pp_writer_id', id);
    }
    return id;
  }

  window.PlayPalSync = {
    isEnabled: () => enabled,
    provider,
    pushRound,
    pullRound,
    pushState,
    pullState,
    pushStateDebounced,
    subscribe,
    getWriterId,
  };

  if (!enabled) {
    console.info('[PlayPalSync] Local-only mode (no cloud sync configured). See README.md to enable cross-device sync.');
  } else {
    console.info('[PlayPalSync] Enabled via', provider);
  }
})();
