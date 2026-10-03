/**
 * PlayPal -> The Brovisional handicap auto-sync (server side).
 *
 * Pure helpers (card building, HMAC signing, response mapping, cron
 * eligibility) plus thin I/O orchestration with injectable `db` (Firestore
 * Admin) and `fetch`, so everything runs under `node --test` with no network.
 *
 * Contract with The Brovisional (spec from OUHS; see docs/BROVISIONAL_SYNC.md):
 *   POST   <BROVISIONAL_INGEST_URL>              one card per request (JSON)
 *   DELETE <BROVISIONAL_INGEST_URL>/<roundId>    empty body
 *   X-PlayPal-Timestamp: <unix seconds>
 *   X-PlayPal-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
 * Secret: env PLAYPAL_INGEST_SECRET. Unset -> every entry point is a no-op
 * returning status 'disabled' (nothing is sent and nothing is written).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolvePlayerId } from './brovisionalPlayers.mjs';

export const DEFAULT_INGEST_URL = 'https://brovisional.vercel.app/api/ingest/playpal';
export const SIGNATURE_WINDOW_SEC = 300;
export const REQUEST_TIMEOUT_MS = 10000;
export const THROTTLE_MS = 5000;                // ignore double-taps on the same round
export const CRON_LOOKBACK_DAYS = 14;
export const CRON_MAX_ROUNDS = 25;              // per run
export const CRON_MAX_ATTEMPTS = 8;             // failed rounds stop retrying after this
export const CRON_RECHECK_MS = 20 * 3600 * 1000; // partial/unlinked re-check at most daily

// Formats where partners play one ball / enter one team score: their per-player
// "scores" are not individual gross, so posting defaults OFF (editable).
export const SHARED_SCORE_FORMATS = ['scramble', 'scramble2', 'alternateShot', 'foursomes', 'chapman'];

// components/gameData.js FORMAT_INFO labels (legacy money formats).
const FORMAT_LABELS = { wolf: 'Wolf', nassau: 'Nassau', stableford: 'Stableford', passmoney: 'Pass the Money', skins: 'Skins',
  bingobangobongo: 'Bingo Bango Bongo', teeball: 'Tee Ball', markeymatch: 'Markey Match' };

// ── Config ────────────────────────────────────────────────────────────────
export function ingestConfig(env = process.env) {
  const secret = typeof env.PLAYPAL_INGEST_SECRET === 'string' ? env.PLAYPAL_INGEST_SECRET.trim() : '';
  const url = String(env.BROVISIONAL_INGEST_URL || DEFAULT_INGEST_URL).replace(/\/+$/, '');
  return { enabled: secret.length > 0, secret, url };
}

// ── Signing ───────────────────────────────────────────────────────────────
export function signPayload(secret, timestamp, rawBody) {
  return 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

export function signedHeaders(secret, rawBody, nowMs = Date.now()) {
  const ts = String(Math.floor(nowMs / 1000));
  return { 'X-PlayPal-Timestamp': ts, 'X-PlayPal-Signature': signPayload(secret, ts, rawBody) };
}

/** Receiver-side check (used by the mock receiver + tests). */
export function verifySignature(secret, timestamp, signature, rawBody, nowMs = Date.now(), windowSec = SIGNATURE_WINDOW_SEC) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || !/^\d+$/.test(String(timestamp))) return { ok: false, reason: 'bad_timestamp' };
  if (Math.abs(nowMs / 1000 - ts) > windowSec) return { ok: false, reason: 'stale_timestamp' };
  const want = Buffer.from(signPayload(secret, String(timestamp), rawBody));
  const got = Buffer.from(String(signature || ''));
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'bad_signature' };
  return { ok: true };
}

// ── Round helpers ─────────────────────────────────────────────────────────
export function roundsCollection(groupId) {
  return groupId === 'LEGACY' ? 'playpal_rounds' : `g_${groupId}_rounds`;
}
export function isValidGroupId(g) { return g === 'LEGACY' || /^[0-9A-Z]{8,40}$/.test(String(g || '')); }
export function isValidRoundId(r) { return /^[A-Z0-9]{4,12}$/.test(String(r || '')); }

/** Same rule as the client (components/brovisionalService.js). */
export function defaultPostToHandicap(round) {
  const r = round || {};
  if ((r.games || []).some((g) => g && SHARED_SCORE_FORMATS.includes(g.formatId))) return false;
  // Markey Match is entered per player (best ball), so it stays ON; a crew
  // that types one team number (e.g. YK7209) turns it off per round.
  return true;
}
export function roundPostEnabled(round) {
  return round && typeof round.postToHandicap === 'boolean' ? round.postToHandicap : defaultPostToHandicap(round);
}
export function playerPostEnabled(round, rosterId) {
  const m = (round && round.handicapPost) || {};
  return m[rosterId] !== false;
}

/** A finished round: the client writes round.holeScores only in handleSaveRound. */
export function isCompletedRoundDoc(doc) {
  const r = doc && doc.round;
  return !!(r && r.course && Array.isArray(r.players) && r.holeScores && typeof r.holeScores === 'object' && Object.keys(r.holeScores).length);
}
export function isEgtRoundDoc(doc) {
  const r = (doc && doc.round) || {};
  return !!(r.egtRoundId || String((doc && doc.liveScores && doc.liveScores.roundId) || '').startsWith('egt-'));
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
function nyDay(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  return p; // en-CA -> YYYY-MM-DD
}
/** ISO day: round.date label ("Friday, May 1, 2026", as the export), else the round's start (round.id ms), else savedAt. */
export function isoDateForRound(round, savedAt) {
  const m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(String((round && round.date) || ''));
  if (m && MONTHS.includes(m[1].toLowerCase())) {
    return `${m[3]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  }
  const id = Number(round && round.id);
  if (Number.isFinite(id) && id > 1.5e12 && id < 4e12) return nyDay(id);
  if (Number.isFinite(Number(savedAt)) && Number(savedAt) > 0) return nyDay(Number(savedAt));
  return null;
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

/** Mirrors IndexService.teeRating: real rating/slope or nulls (never 72/113 placeholders). */
export function teeForRound(course, teeId) {
  const c = course || {};
  const tees = Array.isArray(c.tees) ? c.tees : [];
  const tee = tees.find((t) => t && t.id === teeId) || tees[0] || null;
  let rating = num(tee && tee.rating) || num(c.rating);
  let slope = num(tee && tee.slope) || num(c.slope);
  if (tee && tee.rated === false) { rating = null; slope = null; }
  if (!(rating > 0) || !(slope > 0)) { rating = null; slope = null; }
  if (c.custom && !(tee && tee.rated === true) && rating === 72 && slope === 113) { rating = null; slope = null; }
  return { tee, name: (tee && tee.name) || null, rating, slope: slope === null ? null : Math.round(slope) };
}

// Spec: integer 1–20 or null. Anything else is sent as null (not played)
// rather than invented or clamped — the receiver then skips 'incomplete'.
function strokesOf(h) {
  const v = h && typeof h === 'object' ? h.strokes : h;
  return Number.isInteger(v) && v >= 1 && v <= 20 ? v : null;
}
const clip = (v, n) => (v == null ? v : String(v).slice(0, n));

/**
 * Build the Brovisional card from a Firestore round doc (export shape of
 * playpal-full-history.json scorecards). Never invents data: unplayed holes
 * are null; the 9/18-hole and rating rules are the receiver's job.
 * -> { card, idMap: {brovId: rosterId}, local: {rosterId: {status, reason}} }
 */
export function buildCard(doc, { groupId, roundId, env = process.env } = {}) {
  const round = doc.round;
  const course = round.course || {};
  const holesRaw = Array.isArray(course.holes) ? course.holes : [];
  const n = holesRaw.length;
  // hole = 1..n in order; par as PlayPal scores it (missing -> 4, same as
  // CourseService); si only when it's an integer (receiver ignores a non-permutation).
  const holes = holesRaw.map((h, i) => ({ hole: i + 1, par: Number.isInteger(Number(h.par)) && Number(h.par) > 0 ? Number(h.par) : 4,
    si: Number.isInteger(Number(h.hdcp)) && Number(h.hdcp) > 0 ? Number(h.hdcp) : null }));
  const par = holes.reduce((a, h) => a + (h.par || 0), 0);
  const t = teeForRound(course, round.teeId);
  const ydsArr = t.tee && Array.isArray(t.tee.yds) && t.tee.yds.length === n ? t.tee.yds : holesRaw.map((h) => h.yds);
  const yds = ydsArr.map((y) => Number(y) || 0);
  const yards = n && yds.every((y) => y > 0 && y < 700) ? yds.reduce((a, b) => a + b, 0) : null;
  // Same label the client writes to saved_rounds (FORMAT_INFO label / game name).
  const fmt = [
    ...(round.formats || []).map((f) => f && (FORMAT_LABELS[f.type] || f.type)),
    ...(round.games || []).map((g) => g && (g.name || g.formatId)),
  ].filter(Boolean).join(' · ') || (round.cardOnly ? 'Scorecard' : '');

  const idMap = {}; const local = {}; const players = [];
  for (const rp of round.players) {
    if (!rp || rp.id == null) continue;
    const { id, linked, aliases } = resolvePlayerId(groupId, rp.id, rp.name, env);
    if (idMap[id] !== undefined) { local[rp.id] = { status: 'skipped', reason: 'duplicate_player' }; continue; }
    idMap[id] = rp.id;
    const arr = (round.holeScores || {})[rp.id];
    const scores = Array.from({ length: n }, (_, i) => strokesOf(Array.isArray(arr) ? arr[i] : arr && arr[i]));
    const played = scores.filter((s) => s !== null);
    const gross = played.reduce((a, b) => a + b, 0);
    // sourcePlayerIds: any of them can match a Brovisional link, so only crew
    // players carry PlayPal roster ids. A raw id like 'p1' from an unknown
    // group must never be offered (it would match whoever 'p1' is linked to).
    const src = linked ? [...new Set([...aliases, String(rp.id)])].sort() : [];
    const p = { id, sourcePlayerIds: src, name: clip(rp.name || 'Player', 100), scores, gross, holesPlayed: played.length };
    if (n === 18) { p.out = scores.slice(0, 9).reduce((a, b) => a + (b || 0), 0); p.in = scores.slice(9).reduce((a, b) => a + (b || 0), 0); }
    if (played.length === n && n > 0) p.toPar = gross - par;
    p.post = playerPostEnabled(round, rp.id);
    players.push(p);
  }

  const card = {
    roundId,
    egtRoundId: round.egtRoundId || null,
    playpalRoundId: round.id != null ? round.id : null,
    date: isoDateForRound(round, doc.savedAt),
    courseId: course.id != null ? String(course.id) : null,
    course: clip(course.name || 'Unnamed course', 100),
    location: course.location ? clip(course.location, 120) : null,
    tee: { name: t.name ? clip(t.name, 40) : null, rating: t.rating, slope: t.slope, par, yards },
    front9: null,
    back9: null,
    holesCount: n,
    holes,
    format: fmt,
    players,
  };
  return { card, idMap, local };
}

/** Cards the receiver would 400 on whatever we do: skip without sending. */
export function localReject(card) {
  if (card.holesCount !== 9 && card.holesCount !== 18) return 'unsupported_holes';
  if (!card.players.length) return 'no_players';
  if (card.players.length > 50) return 'too_many_players';
  return null;
}

// ── Transport ─────────────────────────────────────────────────────────────
/**
 * Worth retrying later: 404 (endpoint not deployed yet / transient routing —
 * 1.22.7 marked these permanent, stranding 6PWZPP), 408/425/429, 5xx and
 * network errors (status 0). 400 (validation) and 401 (bad signature) are not.
 */
export function isRetryableHttp(status) {
  const s = Number(status);
  return s === 0 || s === 404 || s === 408 || s === 425 || s === 429 || s >= 500;
}

async function send(fetchImpl, url, method, rawBody, secret, nowMs) {
  const headers = { ...signedHeaders(secret, rawBody, nowMs), 'User-Agent': 'PlayPal-Brovisional-Sync/1' };
  if (rawBody) headers['Content-Type'] = 'application/json';
  let resp;
  try {
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined;
    resp = await fetchImpl(url, { method, headers, body: rawBody || undefined, signal });
  } catch (e) {
    return { ok: false, httpStatus: 0, retryable: true, error: 'network: ' + String((e && e.message) || e).slice(0, 200) };
  }
  let body = null; let text = '';
  try { text = await resp.text(); body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
  if (resp.status >= 200 && resp.status < 300) return { ok: true, httpStatus: resp.status, body };
  const detail = body && (body.error || body.message) ? String(body.error || body.message) : text.slice(0, 200);
  const d = body && body.details ? ' ' + JSON.stringify(body.details).slice(0, 300) : '';
  if (resp.status === 401) {
    // A stale timestamp (clock skew / slow request) is fixed by re-signing;
    // a bad signature means the secret is wrong and retrying won't help.
    const stale = /stale|timestamp|expired|clock/i.test(detail + d);
    return { ok: false, httpStatus: 401, retryable: stale, error: 'unauthorized (' + (stale ? 'stale timestamp' : 'bad signature') + ')' + (detail ? ': ' + detail : '') + d };
  }
  if (resp.status === 400) {
    return { ok: false, httpStatus: 400, retryable: false, error: 'validation: ' + (detail || 'bad request') + d };
  }
  return { ok: false, httpStatus: resp.status, retryable: isRetryableHttp(resp.status), error: `HTTP ${resp.status}` + (detail ? ': ' + detail : '') };
}

export function postCard(card, { secret, url, fetchImpl = fetch, nowMs = Date.now() }) {
  return send(fetchImpl, url, 'POST', JSON.stringify(card), secret, nowMs);
}
export function deleteRemote(roundId, { secret, url, fetchImpl = fetch, nowMs = Date.now() }) {
  return send(fetchImpl, `${url}/${encodeURIComponent(roundId)}`, 'DELETE', '', secret, nowMs);
}

// ── Response -> round doc status ──────────────────────────────────────────
const COUNTED = ['posted', 'updated'];

/**
 * Map a 200 body to { status, players } keyed by PlayPal roster id.
 * posted  = every player not opted out was posted/updated
 * partial = some posted/updated, some skipped for another reason
 * skipped = nobody posted/updated
 */
export function mapIngestResponse(body, idMap, local = {}) {
  const players = {};
  for (const [rid, v] of Object.entries(local)) players[rid] = { ...v };
  const seen = new Set();
  // A player linked in several Brovisional groups comes back once per group:
  // the player counts as posted if any group posted; the first posted entry
  // supplies the headline numbers, every entry is kept under `groups`.
  for (const r of (body && Array.isArray(body.players) ? body.players : [])) {
    if (!r || r.playerId == null) continue;
    const rid = idMap[r.playerId];
    if (rid === undefined) continue;
    seen.add(String(r.playerId));
    const st = ['posted', 'updated', 'skipped'].includes(r.status) ? r.status : 'skipped';
    const entry = {
      status: st,
      reason: r.reason ? String(r.reason).slice(0, 200) : null,
      brovisionalId: String(r.playerId),
      group: r.group ? String(r.group).slice(0, 100) : null,
      holes: num(r.holes),
      gross: num(r.gross),
      adjustedGross: num(r.adjustedGross),
      differential: num(r.differential),
      index: num(r.index),
    };
    const cur = players[rid];
    if (!cur || !cur.groups) { players[rid] = { ...entry, groups: [entry] }; continue; }
    cur.groups.push(entry);
    if (COUNTED.includes(st) && !COUNTED.includes(cur.status)) Object.assign(cur, entry, { groups: cur.groups });
  }
  for (const v of Object.values(players)) if (v.groups && v.groups.length < 2) delete v.groups;
  for (const [bid, rid] of Object.entries(idMap)) {
    if (!seen.has(bid)) players[rid] = { status: 'skipped', reason: 'no_response', brovisionalId: bid, gross: null, adjustedGross: null, differential: null, index: null };
  }
  const vals = Object.values(players);
  const counted = vals.filter((p) => COUNTED.includes(p.status)).length;
  const otherSkips = vals.filter((p) => !COUNTED.includes(p.status) && p.reason !== 'opted_out').length;
  const status = counted === 0 ? 'skipped' : otherSkips === 0 ? 'posted' : 'partial';
  return { status, players };
}

function hadPosted(prev) {
  return !!(prev && (prev.postedAt || Object.values(prev.players || {}).some((p) => p && COUNTED.includes(p.status))));
}

// ── Orchestration ─────────────────────────────────────────────────────────
/**
 * Re-read the round with Admin, decide, send, and write `brovisional` on the
 * round doc. Returns { status, brovisional, httpStatus? }.
 * opts: { db, groupId, roundId, docSnap?, env, fetchImpl, nowMs, force, source }
 */
export async function syncRound(opts) {
  const { db, groupId, roundId, env = process.env, fetchImpl = fetch, nowMs = Date.now(), force = false } = opts;
  const cfg = ingestConfig(env);
  if (!cfg.enabled) return { status: 'disabled', brovisional: null };
  const ref = db.collection(roundsCollection(groupId)).doc(roundId);
  const snap = opts.docSnap || await ref.get();
  if (!snap.exists) return { status: 'not_found', brovisional: null };
  const doc = snap.data() || {};
  const prev = doc.brovisional || {};
  if (!force && prev.lastAttemptAt && nowMs - Number(prev.lastAttemptAt) < THROTTLE_MS && prev.status) {
    return { status: prev.status, brovisional: prev, throttled: true };
  }
  if (!isCompletedRoundDoc(doc)) return { status: 'not_completed', brovisional: prev.status ? prev : null };

  const base = { attempts: (Number(prev.attempts) || 0) + 1, lastAttemptAt: nowMs, postedAt: prev.postedAt || null, source: opts.source || 'api' };
  let next;

  if (isEgtRoundDoc(doc)) {
    // EGT Cup rounds were imported separately (refs egt2026:<R>:<player>);
    // posting them again under playpal:<roundId> would double-count.
    next = { ...base, attempts: prev.attempts || 0, status: 'skipped', reason: 'egt_round', lastError: null, players: {} };
  } else if (prev.reason === 'deleted' || !roundPostEnabled(doc.round)) {
    // Toggled off (or deleted via /api/handicap/delete while the doc lingers):
    // remove anything already posted, never post.
    const why = prev.reason === 'deleted' ? 'deleted' : 'opted_out';
    if (hadPosted(prev) || prev.pendingDelete) {
      const r = await deleteRemote(roundId, { secret: cfg.secret, url: cfg.url, fetchImpl, nowMs });
      next = r.ok
        ? { ...base, status: 'skipped', reason: why, pendingDelete: false, lastError: null, retryable: false, postedAt: null, deletedAt: nowMs, players: {} }
        : { ...base, status: 'failed', reason: why, pendingDelete: true, lastError: r.error, retryable: r.retryable !== false, httpStatus: r.httpStatus, players: prev.players || {} };
    } else {
      next = { ...base, attempts: prev.attempts || 0, status: 'skipped', reason: why, lastError: null, players: {} };
    }
  } else {
    const { card, idMap, local } = buildCard(doc, { groupId, roundId, env });
    const bad = localReject(card);
    if (bad) {
      next = { ...base, attempts: prev.attempts || 0, status: 'skipped', reason: bad, lastError: null, retryable: false, players: {} };
    } else {
      const r = await postCard(card, { secret: cfg.secret, url: cfg.url, fetchImpl, nowMs });
      if (r.ok) {
        const m = mapIngestResponse(r.body, idMap, local);
        next = { ...base, status: m.status, reason: null, lastError: null, retryable: false, httpStatus: r.httpStatus,
          postedAt: m.status === 'skipped' ? (prev.postedAt || null) : nowMs, players: m.players };
      } else {
        next = { ...base, status: 'failed', reason: null, lastError: r.error, retryable: r.retryable !== false, httpStatus: r.httpStatus, players: prev.players || {} };
      }
    }
  }
  await ref.update({ brovisional: next });
  return { status: next.status, brovisional: next, httpStatus: next.httpStatus };
}

/** Round deleted (or being deleted) in PlayPal: remove it from The Brovisional. */
export async function deleteRound({ db, groupId, roundId, env = process.env, fetchImpl = fetch, nowMs = Date.now() }) {
  const cfg = ingestConfig(env);
  if (!cfg.enabled) return { status: 'disabled' };
  const r = await deleteRemote(roundId, { secret: cfg.secret, url: cfg.url, fetchImpl, nowMs });
  if (db) {
    try {
      const ref = db.collection(roundsCollection(groupId)).doc(roundId);
      const snap = await ref.get();
      if (snap.exists) {
        const prev = (snap.data() || {}).brovisional || {};
        await ref.update({ brovisional: r.ok
          ? { ...prev, status: 'skipped', reason: 'deleted', pendingDelete: false, lastError: null, deletedAt: nowMs, lastAttemptAt: nowMs, postedAt: null, players: {} }
          : { ...prev, status: 'failed', reason: 'deleted', pendingDelete: true, lastError: r.error, retryable: r.retryable !== false, lastAttemptAt: nowMs } });
      }
    } catch (e) { /* the doc is usually gone already; nothing to record */ }
  }
  return r.ok ? { status: 'deleted', httpStatus: r.httpStatus } : { status: 'failed', error: r.error, retryable: r.retryable !== false, httpStatus: r.httpStatus };
}

// ── Cron backstop ─────────────────────────────────────────────────────────
/**
 * Should the daily backstop (re)send this doc?
 *  - status 'failed' (retryable or pendingDelete) and attempts < CRON_MAX_ATTEMPTS
 *  - no status yet, and the round was set up with the toggle explicitly ON
 *    (1.22.0+ clients write round.postToHandicap) — never back-fills history
 *    that was imported into The Brovisional by hand
 *  - 'partial'/'skipped' with an 'unlinked' player, last tried > 20h ago
 *    (an admin may have linked them since)
 */
export function cronEligible(doc, nowMs, { lookbackDays = CRON_LOOKBACK_DAYS } = {}) {
  if (!isCompletedRoundDoc(doc) || isEgtRoundDoc(doc)) return false;
  if (!(Number(doc.savedAt) >= nowMs - lookbackDays * 86400000)) return false;
  const b = doc.brovisional;
  if (!b || !b.status) return doc.round.postToHandicap === true;
  // httpStatus is re-checked so docs written before 1.22.8 (404 stored as
  // retryable:false) are picked up again.
  if (b.status === 'failed') return (Number(b.attempts) || 0) < CRON_MAX_ATTEMPTS && (b.retryable !== false || b.pendingDelete === true || b.httpStatus === 401 || (b.httpStatus != null && isRetryableHttp(b.httpStatus)));
  if ((b.status === 'partial' || b.status === 'skipped') && roundPostEnabled(doc.round)) {
    const unlinked = Object.values(b.players || {}).some((p) => p && p.reason === 'unlinked');
    return unlinked && nowMs - (Number(b.lastAttemptAt) || 0) > CRON_RECHECK_MS && (Number(b.attempts) || 0) < CRON_MAX_ATTEMPTS + CRON_LOOKBACK_DAYS;
  }
  return false;
}

export function isRoundsCollectionId(id) { return id === 'playpal_rounds' || /^g_[0-9A-Z]{8,40}_rounds$/.test(id); }
export function groupIdFromCollection(id) { return id === 'playpal_rounds' ? 'LEGACY' : id.slice(2, -7); }

export async function runCron({ db, env = process.env, fetchImpl = fetch, nowMs = Date.now(), maxRounds = CRON_MAX_ROUNDS, lookbackDays = CRON_LOOKBACK_DAYS }) {
  const cfg = ingestConfig(env);
  if (!cfg.enabled) return { status: 'disabled', scanned: 0, attempted: 0, results: [] };
  const since = nowMs - lookbackDays * 86400000;
  const cols = (await db.listCollections()).map((c) => c.id).filter(isRoundsCollectionId);
  const candidates = [];
  for (const col of cols) {
    const qs = await db.collection(col).where('savedAt', '>=', since).get();
    qs.forEach((s) => {
      const d = s.data();
      if (cronEligible(d, nowMs, { lookbackDays })) candidates.push({ groupId: groupIdFromCollection(col), roundId: s.id, snap: s, savedAt: Number(d.savedAt) || 0 });
    });
  }
  candidates.sort((a, b) => b.savedAt - a.savedAt);
  const results = [];
  for (const c of candidates.slice(0, maxRounds)) {
    try {
      const r = await syncRound({ db, groupId: c.groupId, roundId: c.roundId, docSnap: c.snap, env, fetchImpl, nowMs, force: true, source: 'cron' });
      results.push({ groupId: c.groupId === 'LEGACY' ? 'LEGACY' : c.groupId.slice(0, 4) + '…', roundId: c.roundId, status: r.status });
    } catch (e) {
      results.push({ roundId: c.roundId, status: 'error', error: String((e && e.message) || e).slice(0, 200) });
    }
  }
  return { status: 'ok', collections: cols.length, eligible: candidates.length, attempted: results.length, results };
}
