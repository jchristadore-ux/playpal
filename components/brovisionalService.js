// brovisionalService.js — PlayPal -> The Brovisional handicap auto-sync (client).
//
// The Brovisional (https://brovisional.vercel.app) is an unofficial handicap
// app. When a round is saved, the client asks the PlayPal API to post it; the
// API re-reads the round from Firestore, builds and signs the card, sends it,
// and writes the result to the round doc's `brovisional` field. This file only
// decides toggle defaults, calls the API (fire-and-forget), retries failures
// with backoff on app launch, and turns the stored result into display text.
// It holds no secrets and no player-id mapping (that lives server-side in
// lib/brovisionalPlayers.mjs). Separate from the PlayPal Index, which stays
// tracking-only.

const BrovisionalService = (function () {

  // Partners play one ball / enter one team number: not individual gross.
  // Keep in sync with SHARED_SCORE_FORMATS in lib/brovisional.mjs (tested).
  const SHARED_SCORE_FORMATS = ['scramble', 'scramble2', 'alternateShot', 'foursomes', 'chapman'];

  const QUEUE_KEY     = 'pp_brov_queue';
  const STATUS_PREFIX = 'pp_brov_status_';
  const EVENT         = 'pp:brovisional';
  const DISABLED_KEY  = 'pp_brov_disabled';   // server said 'disabled' (no secret) at this time
  const DISABLED_TTL_MS = 24 * 3600 * 1000;
  const BACKOFF_BASE_MS = 60 * 1000;          // 1 min, 2, 4, 8 … 
  const BACKOFF_CAP_MS  = 6 * 3600 * 1000;    // … capped at 6 h
  const MAX_ATTEMPTS    = 6;                  // tries in total (first + 5 retries), then the daily server cron owns it

  const REASONS = {
    unlinked:         'not linked in The Brovisional yet',
    incomplete:       'incomplete round',
    missing_rating:   'no course rating',
    opted_out:        'opted out',
    egt_round:        'EGT Cup round (posted separately)',
    deleted:          'removed from The Brovisional',
    duplicate_player: 'duplicate player in this round',
    no_response:      'no result returned',
    unsupported_holes:'only 9- or 18-hole cards post',
    no_players:       'no players',
  };

  // ── Toggles ───────────────────────────────────────────────────────────────
  function defaultPostToHandicap(round) {
    const r = round || {};
    if ((r.games || []).some(g => g && SHARED_SCORE_FORMATS.indexOf(g.formatId) !== -1)) return false;
    // Markey Match / best ball / shamble: one ball each, so they stay on.
    return true;
  }
  function roundPostEnabled(round) {
    return round && typeof round.postToHandicap === 'boolean' ? round.postToHandicap : defaultPostToHandicap(round);
  }
  function playerPostEnabled(round, pid) {
    const m = (round && round.handicapPost) || {};
    return m[pid] !== false;
  }

  // ── Backoff ───────────────────────────────────────────────────────────────
  // attempts = failures so far (1 after the first failure).
  function backoffMs(attempts) {
    const n = Math.max(1, Math.floor(Number(attempts) || 1));
    return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, n - 1));
  }

  // ── Storage ───────────────────────────────────────────────────────────────
  function _ls() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
  function _read(key, fb) { const ls = _ls(); if (!ls) return fb; try { const v = ls.getItem(key); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function _write(key, v) { const ls = _ls(); if (!ls) return; try { if (v == null) ls.removeItem(key); else ls.setItem(key, JSON.stringify(v)); } catch (e) {} }

  function getCached(roundId) { return roundId ? _read(STATUS_PREFIX + roundId, null) : null; }
  function setCached(roundId, brov) {
    if (!roundId) return;
    _write(STATUS_PREFIX + roundId, brov);
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent(EVENT, { detail: { roundId, brovisional: brov } }));
      }
    } catch (e) {}
  }

  function _qkey(groupId, roundId) { return groupId + '/' + roundId; }
  function queue() { return _read(QUEUE_KEY, {}) || {}; }
  function enqueue(groupId, roundId, error, now) {
    const q = queue(); const k = _qkey(groupId, roundId);
    const attempts = ((q[k] && q[k].attempts) || 0) + 1;
    const t = now == null ? Date.now() : now;
    // attempts = failed tries so far; the 6th failure ends client retries.
    if (attempts >= MAX_ATTEMPTS) { delete q[k]; _write(QUEUE_KEY, q); return null; }
    q[k] = { groupId, roundId, attempts, lastError: error || null, lastAttemptAt: t, nextAt: t + backoffMs(attempts) };
    _write(QUEUE_KEY, q);
    return q[k];
  }
  function dequeue(groupId, roundId) { const q = queue(); delete q[_qkey(groupId, roundId)]; _write(QUEUE_KEY, q); }
  function dueEntries(now) {
    const t = now == null ? Date.now() : now;
    return Object.values(queue()).filter(e => e && e.nextAt <= t);
  }

  // Last server answer was 'disabled' (feature not switched on yet): the
  // summary hides the whole block. Re-checked on every save, so it clears as
  // soon as the secret is set; expires after a day regardless.
  function isDisabled(now) {
    const t = Number(_read(DISABLED_KEY, 0)) || 0;
    return t > 0 && (now == null ? Date.now() : now) - t < DISABLED_TTL_MS;
  }

  // ── Response handling ─────────────────────────────────────────────────────
  // Normalizes what the API (or a network failure) said into
  // { status, brovisional, retry } — retry = worth trying again later.
  function interpret(httpStatus, body, networkError) {
    if (networkError) return { status: 'failed', brovisional: { status: 'failed', lastError: String(networkError) }, retry: true };
    const b = body || {};
    if (b.status === 'disabled') return { status: 'disabled', brovisional: { status: 'disabled' }, retry: false };
    if (httpStatus === 200 && b.brovisional) {
      const st = b.brovisional.status || b.status;
      return { status: st, brovisional: b.brovisional, retry: st === 'failed' && b.brovisional.retryable !== false };
    }
    if (httpStatus === 200 && b.status) return { status: b.status, brovisional: { status: b.status }, retry: false };
    if (httpStatus === 409) return { status: 'not_completed', brovisional: null, retry: false };
    // 400/403 won't change on retry. 401 (expired sign-in) and 404 (round not
    // synced to the server yet, or the API mid-deploy) can.
    if (httpStatus === 403 || httpStatus === 400) {
      return { status: 'failed', brovisional: { status: 'failed', lastError: b.error || ('HTTP ' + httpStatus) }, retry: false };
    }
    return { status: 'failed', brovisional: { status: 'failed', lastError: b.error || ('HTTP ' + httpStatus) }, retry: true };
  }

  // ── Display ───────────────────────────────────────────────────────────────
  // The Brovisional also sends free-text reasons: 'duplicate of existing
  // score …', 'rejected: …', and on a posted 9-hole score '9-hole score held
  // until 54 holes' (informational).
  function reasonText(reason) {
    if (!reason) return 'skipped';
    const r = String(reason);
    if (REASONS[r]) return REASONS[r];
    if (/^duplicate of existing score/i.test(r)) return 'already in The Brovisional from another source';
    if (/^rejected:/i.test(r)) return 'rejected by The Brovisional';
    return r.replace(/_/g, ' ');
  }
  function _fmt1(v) { return typeof v === 'number' && isFinite(v) ? (Math.round(v * 10) / 10).toFixed(1) : null; }

  // -> { kind: 'hidden'|'pending'|'posted'|'partial'|'failed'|'skipped', headline, rows[], error }
  function view(brov, players) {
    if (!brov || !brov.status || brov.status === 'disabled') return { kind: 'hidden', rows: [] };
    const st = brov.status;
    const ps = brov.players || {};
    const rows = (players || []).map(p => {
      const r = ps[p.id];
      if (!r) return null;
      const counted = r.status === 'posted' || r.status === 'updated';
      const diff = _fmt1(r.differential), idx = _fmt1(r.index);
      return {
        pid: p.id, name: p.name, status: r.status, counted,
        text: counted ? ['Diff ' + (diff || '—'), 'Index ' + (idx || '—')].join(' · ') : reasonText(r.reason),
        note: counted && r.reason ? String(r.reason) : null,
        differential: diff, index: idx,
      };
    }).filter(Boolean);
    if (st === 'pending') return { kind: 'pending', headline: 'Posting…', rows };
    if (st === 'failed') return { kind: 'failed', headline: 'Not posted yet', error: brov.lastError || null, rows };
    if (st === 'posted') return { kind: 'posted', headline: 'Posted', rows };
    if (st === 'partial') return { kind: 'partial', headline: 'Posted (some players skipped)', rows };
    return { kind: 'skipped', headline: brov.reason ? 'Not posted — ' + reasonText(brov.reason) : 'Not posted', rows };
  }

  // ── Transport (injectable for tests) ──────────────────────────────────────
  const _deps = {
    fetch: null, getToken: null, apiBase: null, ready: null, now: null,
  };
  function setDeps(d) { Object.assign(_deps, d || {}); }
  function _now() { return _deps.now ? _deps.now() : Date.now(); }
  function _apiBase() {
    if (_deps.apiBase != null) return _deps.apiBase;
    const c = (typeof window !== 'undefined' && window.PLAYPAL_CONFIG) || {};
    if (c.apiBaseUrl) return String(c.apiBaseUrl).replace(/\/$/, '');
    try { return window.location.origin; } catch (e) { return ''; }
  }
  function _ready() {
    return new Promise(resolve => {
      const r = _deps.ready || (typeof window !== 'undefined' && typeof window._fbInit === 'function' ? window._fbInit : null);
      if (!r) { resolve(true); return; }
      try { r(ok => resolve(ok)); } catch (e) { resolve(false); }
    });
  }
  async function _token() {
    if (_deps.getToken) return _deps.getToken();
    try {
      const A = typeof window !== 'undefined' && window.AuthService;
      const t = A && A.getIdToken ? await A.getIdToken(false) : null;
      if (t) return t;
      const u = window.firebase && window.firebase.auth && window.firebase.auth().currentUser;
      return u ? await u.getIdToken() : null;
    } catch (e) { return null; }
  }
  async function _call(path, payload) {
    const f = _deps.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!f) return { networkError: 'no fetch' };
    await _ready();
    const token = await _token();
    if (!token) return { networkError: 'not signed in yet' };
    try {
      const resp = await f(_apiBase() + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(payload),
      });
      let body = null; try { body = await resp.json(); } catch (e) {}
      return { httpStatus: resp.status, body };
    } catch (e) { return { networkError: (e && e.message) || 'network error' }; }
  }

  // Post (or re-post) one round. Never throws.
  async function post(groupId, roundId, opts) {
    const o = opts || {};
    if (!groupId || !roundId) return { status: 'invalid' };
    if (o.optimistic !== false) setCached(roundId, Object.assign({}, getCached(roundId) || {}, { status: 'pending' }));
    const r = await _call('/api/handicap/post', { groupId, roundId, retry: !!o.retry });
    const out = interpret(r.httpStatus, r.body, r.networkError);
    if (!r.networkError) _write(DISABLED_KEY, out.status === 'disabled' ? _now() : null);
    if (out.status === 'disabled') { dequeue(groupId, roundId); setCached(roundId, out.brovisional); return out; }
    if (out.status === 'not_completed') { setCached(roundId, null); dequeue(groupId, roundId); return out; }
    if (out.brovisional) setCached(roundId, out.brovisional);
    if (out.retry) enqueue(groupId, roundId, out.brovisional && out.brovisional.lastError, _now());
    else dequeue(groupId, roundId);
    return out;
  }

  // The round-save hook (RoundSyncService.saveRound success): any save of a
  // FINISHED round — first save or a re-save after edits — re-posts it.
  // In-progress round writes (no holeScores yet) are ignored.
  function onRoundSaved(groupId, roundObj) {
    if (!roundObj || !roundObj.syncCode || !roundObj.holeScores) return null;
    if (roundObj.egtRoundId) return null;
    return post(groupId, roundObj.syncCode).catch(() => null);
  }

  // App launch / back online: retry whatever is due.
  async function retryDue() {
    const due = dueEntries(_now());
    const out = [];
    for (const e of due) out.push(await post(e.groupId, e.roundId, { retry: true, optimistic: false }));
    return out;
  }

  async function deleteRound(groupId, roundId) {
    const r = await _call('/api/handicap/delete', { groupId, roundId });
    if (r.networkError) return { status: 'failed', error: r.networkError };
    const b = r.body || {};
    if (b.status === 'deleted') setCached(roundId, { status: 'skipped', reason: 'deleted', players: {} });
    return b;
  }

  function subscribe(fn) {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return function () {};
    const h = e => { try { fn(e.detail); } catch (x) {} };
    window.addEventListener(EVENT, h);
    return function () { window.removeEventListener(EVENT, h); };
  }

  return {
    SHARED_SCORE_FORMATS, REASONS, MAX_ATTEMPTS, BACKOFF_BASE_MS, BACKOFF_CAP_MS,
    defaultPostToHandicap, roundPostEnabled, playerPostEnabled,
    backoffMs, enqueue, dequeue, dueEntries, queue,
    interpret, reasonText, view, isDisabled,
    getCached, setCached, subscribe, setDeps,
    post, onRoundSaved, retryDue, deleteRound,
  };
})();

if (typeof window !== 'undefined') {
  Object.assign(window, { BrovisionalService });
}
