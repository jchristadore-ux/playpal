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
//   PlayPalSync.joinRound(code)              -> { ok, round, error? }  SINGLE ENTRY POINT
//
// The "joinRound" function is the canonical way to attach a device to an
// existing round. Both the QR-scan auto-join path and the manual "Join
// Round" button must go through it — no other code should open a round
// from a sync code.
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

  // Firebase RTDB serializes sparse arrays as objects with numeric string keys
  // (e.g. [,,5] round-trips to {"2": 5}). That breaks any consumer that calls
  // .reduce / .map / .length on the value. Re-hydrate by walking the tree and
  // converting those objects back into arrays. Dense-keyed objects with keys
  // "0".."N" become arrays of length N+1 with holes filled as 0/null.
  function hydrate(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(hydrate);
    const keys = Object.keys(value);
    const allNumeric = keys.length > 0 && keys.every(k => /^\d+$/.test(k));
    if (allNumeric) {
      const max = keys.reduce((m, k) => Math.max(m, parseInt(k, 10)), -1);
      const arr = new Array(max + 1).fill(0);
      keys.forEach(k => { arr[parseInt(k, 10)] = hydrate(value[k]); });
      return arr;
    }
    const out = {};
    for (const k of keys) out[k] = hydrate(value[k]);
    return out;
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
    const url = path(syncCode, 'round');
    console.info('[PlayPalSync] Firebase lookup:', url.replace(baseURL, ''));
    const raw = await get(url);
    if (!raw) {
      console.warn('[PlayPalSync] Round not found in Firebase:', syncCode);
      return null;
    }
    const round = hydrate(raw);
    console.info('[PlayPalSync] Round found:', syncCode, '— players:', round.players?.length, 'course:', round.course?.name);
    return round;
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

  async function markCancelled(syncCode) {
    if (!enabled || !syncCode) return { ok: false, error: 'disabled-or-missing' };
    return await put(path(syncCode, 'cancelled'), true);
  }

  // ── Players (persisted permanently, shared across all devices) ──────────
  const playerPath = (playerId) => {
    const auth = token ? `?auth=${encodeURIComponent(token)}` : '';
    const id   = playerId ? `/${encodeURIComponent(playerId)}` : '';
    return `${baseURL}/players${id}.json${auth}`;
  };

  async function pushPlayer(player) {
    if (!enabled) return { ok: false, error: 'disabled' };
    if (!player || !player.id) return { ok: false, error: 'missing player id' };
    console.info('[SYNC] Writing player to Firebase:', player.id);
    return await put(playerPath(player.id), player);
  }

  // Returns array of players, or throws on network error (empty DB path → [])
  async function listPlayers() {
    if (!enabled) return null;
    console.info('[SYNC] Loading players from Firebase');
    const url = playerPath();
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || typeof data !== 'object') return [];
    return Object.values(data).filter(Boolean);
  }

  async function deletePlayer(playerId) {
    if (!enabled) return { ok: false, error: 'disabled' };
    if (!playerId) return { ok: false, error: 'missing player id' };
    console.info('[SYNC] Deleting player from Firebase:', playerId);
    try {
      const url = playerPath(playerId);
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, error: `HTTP ${res.status} ${text}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || 'network' };
    }
  }

  // ── Courses (persisted permanently, shared across all devices) ───────────
  async function pushCourse(course) {
    if (!enabled) return { ok: false, error: 'disabled' };
    if (!course || !course.id) return { ok: false, error: 'missing course id' };
    console.info('[SYNC] Writing course to Firebase:', course.id);
    return await put(coursePath(course.id), course);
  }

  async function listCourses() {
    if (!enabled) return [];
    console.info('[SYNC] Loading courses from Firebase');
    const data = await get(coursePath());
    if (!data || typeof data !== 'object') return [];
    return Object.values(data).filter(Boolean);
  }

  async function deleteCourse(courseId) {
    if (!enabled) return { ok: false, error: 'disabled' };
    if (!courseId) return { ok: false, error: 'missing course id' };
    try {
      const auth = token ? `?auth=${encodeURIComponent(token)}` : '';
      const url = `${baseURL}/courses/${encodeURIComponent(courseId)}.json${auth}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn('[PlayPalSync] DELETE course failed', res.status, text);
        return { ok: false, error: `HTTP ${res.status} ${text}` };
      }
      return { ok: true };
    } catch (err) {
      console.warn('[PlayPalSync] DELETE course error', err);
      return { ok: false, error: err?.message || 'network' };
    }
  }

  async function pullState(syncCode) {
    if (!enabled || !syncCode) return null;
    const raw = await get(path(syncCode, 'state'));
    return raw ? hydrate(raw) : null;
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
    console.info('[PlayPalSync] Subscription active:', syncCode);
    let stopped = false;
    let lastStamp = 0;
    const tick = async () => {
      if (stopped) return;
      const stamp = await get(path(syncCode, 'updatedAt'));
      if (stamp && stamp !== lastStamp) {
        lastStamp = stamp;
        const raw = await get(path(syncCode, 'state'));
        const state = raw ? hydrate(raw) : null;
        if (state && state.writerId !== getWriterId()) {
          try { onChange(state); } catch (err) { console.warn('[PlayPalSync] subscriber error', err); }
        }
      }
      if (!stopped) setTimeout(tick, intervalMs);
    };
    tick();
    return () => { stopped = true; console.info('[PlayPalSync] Subscription stopped:', syncCode); };
  }

  // ── joinRound: the ONE entry point for attaching a device to a round ─────
  // Both the QR / URL auto-join flow and the manual "Join Round" button
  // MUST call this. It encapsulates:
  //   1. Normalize + validate the code
  //   2. Cloud-first lookup (the QR flow is always cross-device)
  //   3. localStorage fallback (same-device scorer re-opening the app)
  //   4. Cache the found round locally so refresh reconnects instantly
  //   5. Uniform {ok, round, error} return contract
  async function joinRound(rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    console.info('[PlayPal] Attempting to join round:', code);
    if (!code || code.length < 4) {
      return { ok: false, error: 'Enter a valid round code' };
    }

    // 1. Authoritative source: Firebase. Always check first — the QR scenario
    //    is cross-device so localStorage on the guest never has the round.
    if (enabled) {
      try {
        const remote = await pullRound(code);
        if (remote && String(remote.syncCode || '').toUpperCase() === code) {
          localStorage.setItem('pp_round', JSON.stringify(remote));
          console.info('[PlayPal] Joined via Firebase:', code);
          return { ok: true, round: remote };
        }
      } catch (err) {
        console.error('[PlayPal] Firebase join failed:', err);
        return { ok: false, error: 'Network error reaching sync server' };
      }
    } else {
      console.warn('[PlayPal] Cloud sync disabled — joinRound will only find rounds saved on THIS device. See README.md to enable Firebase.');
    }

    // 2. Same-device fallback (scorer reopening their own browser)
    try {
      const raw = localStorage.getItem('pp_round');
      if (raw) {
        const local = JSON.parse(raw);
        if (String(local.syncCode || '').toUpperCase() === code) {
          console.info('[PlayPal] Joined via localStorage (same device):', code);
          return { ok: true, round: local };
        }
      }
    } catch (err) {
      console.error('[PlayPal] localStorage parse error during join:', err);
    }

    // 3. Genuine miss — craft a precise error
    if (!enabled) {
      return { ok: false, error: `Round "${code}" not found on this device. Enable cloud sync (see README) so guests can join from any device.` };
    }
    return { ok: false, error: `Round "${code}" not found. Make sure the host has started the round and is online.` };
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
    pushPlayer,
    listPlayers,
    deletePlayer,
    pushCourse,
    listCourses,
    deleteCourse,
    markCancelled,
    joinRound,
    getWriterId,
  };

  if (!enabled) {
    console.info('[PlayPalSync] Local-only mode (no cloud sync configured). See README.md to enable cross-device sync.');
  } else {
    console.info('[PlayPalSync] Enabled via', provider);
  }
})();
