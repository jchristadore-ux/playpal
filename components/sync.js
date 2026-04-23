// sync.js — Pluggable cross-device sync for PlayPal
//
// Provides a small async API used by the UI:
//   PlayPalSync.isEnabled()
//   PlayPalSync.pushRound(syncCode, round)   -> { ok, error? }
//   PlayPalSync.pullRound(syncCode)          -> returns round or null
//   PlayPalSync.pushState(syncCode, state)   -> { scores, wolfData, putts, presses, chips, holeIdx }
//   PlayPalSync.pullState(syncCode)          -> same shape or null
//   PlayPalSync.subscribe(syncCode, cb)      -> returns unsubscribe fn (polling under the hood)
//   PlayPalSync.pushCourse(course)           -> { ok, error? }   stores at /courses/<id>
//   PlayPalSync.listCourses()                -> array of course objects (may be empty)
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

  const coursePath = (courseId) => {
    const auth = token ? `?auth=${encodeURIComponent(token)}` : '';
    const id   = courseId ? `/${encodeURIComponent(courseId)}` : '';
    return `${baseURL}/courses${id}.json${auth}`;
  };

  async function put(url, body) {
    if (!enabled) return { ok: false, error: 'disabled' };
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn('[PlayPalSync] PUT failed', res.status, url, text);
        return { ok: false, error: `HTTP ${res.status} ${text}` };
      }
      const data = await res.json();
      return { ok: true, data };
    } catch (err) {
      console.warn('[PlayPalSync] PUT error', err);
      return { ok: false, error: err?.message || 'network' };
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
    if (!enabled) return { ok: false, error: 'disabled' };
    if (!syncCode || !round) return { ok: false, error: 'missing arguments' };
    const r1 = await put(path(syncCode, 'round'), round);
    if (!r1.ok) return r1;
    await put(path(syncCode, 'updatedAt'), Date.now());
    return { ok: true };
  }

  async function pullRound(syncCode) {
    if (!enabled || !syncCode) return null;
    return await get(path(syncCode, 'round'));
  }

  async function pushState(syncCode, state) {
    if (!enabled || !syncCode) return { ok: false, error: 'disabled-or-missing-code' };
    // Store writer id + timestamp so subscribers can ignore their own echoes.
    const payload = { ...state, writerId: getWriterId(), updatedAt: Date.now() };
    const r1 = await put(path(syncCode, 'state'), payload);
    if (!r1.ok) return r1;
    await put(path(syncCode, 'updatedAt'), payload.updatedAt);
    return { ok: true };
  }

  // ── Courses (persisted permanently, shared across all devices) ───────────
  async function pushCourse(course) {
    if (!enabled) return { ok: false, error: 'disabled' };
    if (!course || !course.id) return { ok: false, error: 'missing course id' };
    return await put(coursePath(course.id), course);
  }

  async function listCourses() {
    if (!enabled) return [];
    const data = await get(coursePath());
    if (!data || typeof data !== 'object') return [];
    return Object.values(data).filter(Boolean);
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
    pushCourse,
    listCourses,
    getWriterId,
  };

  if (!enabled) {
    console.info('[PlayPalSync] Local-only mode (no cloud sync configured). See README.md to enable cross-device sync.');
  } else {
    console.info('[PlayPalSync] Enabled via', provider);
  }
})();
