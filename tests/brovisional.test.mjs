// PlayPal -> The Brovisional auto-sync: signing, card building, toggles,
// response/status mapping, retry backoff, disabled no-op, API auth, cron,
// and an end-to-end run against a local mock receiver that verifies the HMAC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  signPayload, signedHeaders, verifySignature, ingestConfig, buildCard, mapIngestResponse,
  defaultPostToHandicap, roundPostEnabled, isoDateForRound, teeForRound, syncRound, deleteRound,
  cronEligible, runCron, SHARED_SCORE_FORMATS, CRON_MAX_ATTEMPTS, roundsCollection,
} from '../lib/brovisional.mjs';
import { resolvePlayerId, opaquePlayerId, BROVISIONAL_PLAYERS } from '../lib/brovisionalPlayers.mjs';
import { makePostHandler, makeDeleteHandler, makeCronHandler } from '../lib/brovisionalApi.mjs';
import { startMockBrovisional } from './helpers/mockBrovisional.mjs';
import { loadPlayPal } from './helpers/load.mjs';

const SECRET = 'test-secret-not-real';
const CB4B = 'CB4BYS07373NJPF63PBJ7F803M';
const STRANGER = 'ZZZZZZZZZZZZZZZZZZZZZZZZZZ';

// ── fixtures ───────────────────────────────────────────────────────────────
const PARS = [4, 3, 5, 3, 4, 5, 4, 4, 3, 5, 4, 3, 4, 3, 5, 4, 4, 3];
function course18(extra = {}) {
  return {
    id: 'custom_1777584626306', name: 'Fox Hollow', location: 'Branchburg, NJ', custom: true,
    holes: PARS.map((par, i) => ({ num: i + 1, par, yds: 300 + i, hdcp: ((i * 7) % 18) + 1 })),
    tees: [{ id: 'default', name: 'White', rating: 69.6, slope: 134, rated: true }],
    ...extra,
  };
}
function hs(arr) { return arr.map((s) => ({ strokes: s, putts: 0, gettingPop: false })); }
const FULL = [4, 2, 9, 2, 6, 6, 6, 7, 3, 8, 4, 5, 8, 4, 7, 6, 6, 4];
function roundDoc(over = {}) {
  const round = {
    id: 1777650145684, syncCode: 'AWXJL7', teeId: 'default',
    date: 'Friday, May 1, 2026',
    course: course18(),
    players: [{ id: 'p1', name: 'John Christadore' }, { id: 'p1777172757933', name: 'TJ Quimby' }, { id: 'p9', name: 'Guest Golfer' }],
    formats: [{ type: 'nassau' }, { type: 'stableford' }], games: [],
    holeScores: {
      p1: hs(FULL),
      p1777172757933: hs([...FULL.slice(0, 9), null, null, null, null, null, null, null, null, null]),
      p9: hs(FULL),
    },
    postToHandicap: true,
    ...(over.round || {}),
  };
  return { syncCode: 'AWXJL7', savedAt: Date.parse('2026-05-01T20:00:00Z'), round, ...(over.doc || {}) };
}

// Minimal Firestore Admin stand-in.
function fakeDb(collections) {
  const cols = collections;
  const docRef = (c, id) => ({
    id,
    async get() { const d = cols[c] && cols[c][id]; return { id, exists: !!d, data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined) }; },
    async update(patch) { if (!cols[c] || !cols[c][id]) throw new Error('NOT_FOUND'); Object.assign(cols[c][id], JSON.parse(JSON.stringify(patch))); },
  });
  return {
    cols,
    collection(c) {
      return {
        doc: (id) => docRef(c, id),
        where(field, op, v) {
          return { async get() {
            const docs = Object.entries(cols[c] || {}).filter(([, d]) => op === '>=' && Number(d[field]) >= v)
              .map(([id, d]) => ({ id, exists: true, data: () => JSON.parse(JSON.stringify(d)), ref: docRef(c, id) }));
            return { forEach: (fn) => docs.forEach(fn), docs };
          } };
        },
      };
    },
    async listCollections() { return Object.keys(cols).map((id) => ({ id })); },
  };
}
function mockRes() {
  return { statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; }, end() { return this; } };
}
const envWith = (url, extra = {}) => ({ PLAYPAL_INGEST_SECRET: SECRET, BROVISIONAL_INGEST_URL: url, ...extra });

// ── 1. HMAC signature format ───────────────────────────────────────────────
test('signature is sha256=<hex HMAC-SHA256 of `${timestamp}.${rawBody}`>', () => {
  const body = '{"roundId":"AWXJL7"}';
  const sig = signPayload(SECRET, '1790000000', body);
  assert.match(sig, /^sha256=[0-9a-f]{64}$/);
  assert.equal(sig, 'sha256=' + createHmac('sha256', SECRET).update('1790000000.' + body).digest('hex'));
  const h = signedHeaders(SECRET, body, 1790000000123);
  assert.equal(h['X-PlayPal-Timestamp'], '1790000000');       // unix SECONDS
  assert.equal(h['X-PlayPal-Signature'], sig);
});

test('receiver check: valid, tampered, wrong secret, stale (>300 s) and future timestamps', () => {
  const now = 1790000000000; const body = '{"a":1}';
  const h = signedHeaders(SECRET, body, now);
  const ts = h['X-PlayPal-Timestamp']; const sig = h['X-PlayPal-Signature'];
  assert.equal(verifySignature(SECRET, ts, sig, body, now).ok, true);
  assert.equal(verifySignature(SECRET, ts, sig, body, now + 299000).ok, true);
  assert.equal(verifySignature(SECRET, ts, sig, body + ' ', now).reason, 'bad_signature');
  assert.equal(verifySignature('other', ts, sig, body, now).reason, 'bad_signature');
  assert.equal(verifySignature(SECRET, ts, sig, body, now + 301000).reason, 'stale_timestamp');
  assert.equal(verifySignature(SECRET, ts, sig, body, now - 301000).reason, 'stale_timestamp');
  assert.equal(verifySignature(SECRET, 'abc', sig, body, now).reason, 'bad_timestamp');
});

test('ingestConfig: enabled only with a non-blank secret; URL overridable', () => {
  assert.equal(ingestConfig({}).enabled, false);
  assert.equal(ingestConfig({ PLAYPAL_INGEST_SECRET: '  ' }).enabled, false);
  assert.equal(ingestConfig({}).url, 'https://brovisional.vercel.app/api/ingest/playpal');
  assert.equal(ingestConfig({ PLAYPAL_INGEST_SECRET: 'x', BROVISIONAL_INGEST_URL: 'http://h/x/' }).url, 'http://h/x');
});

// ── 2. Card building ───────────────────────────────────────────────────────
test('card matches the export shape (playpal-full-history.json scorecards)', () => {
  const { card } = buildCard(roundDoc(), { groupId: CB4B, roundId: 'AWXJL7', env: {} });
  assert.deepEqual(Object.keys(card).sort(), ['back9', 'course', 'courseId', 'date', 'egtRoundId', 'format', 'front9', 'holes', 'holesCount', 'location', 'players', 'playpalRoundId', 'roundId', 'tee'].sort());
  assert.equal(card.roundId, 'AWXJL7');
  assert.equal(card.egtRoundId, null);
  assert.equal(card.playpalRoundId, 1777650145684);
  assert.equal(card.date, '2026-05-01');
  assert.equal(card.courseId, 'custom_1777584626306');
  assert.equal(card.course, 'Fox Hollow');
  assert.equal(card.location, 'Branchburg, NJ');
  assert.deepEqual(card.tee, { name: 'White', rating: 69.6, slope: 134, par: 70, yards: PARS.reduce((a, _, i) => a + 300 + i, 0) });
  assert.equal(card.front9, null); assert.equal(card.back9, null);
  assert.equal(card.holesCount, 18);
  assert.deepEqual(card.holes[0], { hole: 1, par: 4, si: 1 });
  assert.equal(card.format, 'Nassau · Stableford');
  const [john] = card.players;
  assert.deepEqual(Object.keys(john).sort(), ['gross', 'holesPlayed', 'id', 'in', 'name', 'out', 'post', 'scores', 'sourcePlayerIds', 'toPar']);
  assert.equal(john.id, 'john');
  assert.deepEqual(john.sourcePlayerIds, ['john', 'p1', 'p1781226599386', 'p1790599477726']);   // every alias can match a link
  assert.equal(john.gross, 97); assert.equal(john.holesPlayed, 18); assert.equal(john.out, 45); assert.equal(john.in, 52); assert.equal(john.toPar, 27);
  assert.equal(john.post, true);
});

test('unplayed holes are null (not 0), partial rounds are still sent as-is', () => {
  const { card } = buildCard(roundDoc(), { groupId: CB4B, roundId: 'AWXJL7', env: {} });
  const tj = card.players.find((p) => p.id === 'tj');
  assert.equal(tj.scores.length, 18);
  assert.deepEqual(tj.scores.slice(9), Array(9).fill(null));
  assert.equal(tj.holesPlayed, 9);
  assert.equal(tj.gross, FULL.slice(0, 9).reduce((a, b) => a + b, 0));
  assert.equal('toPar' in tj, false);
  const doc = roundDoc({ round: { holeScores: { p1: hs([0, ...FULL.slice(1)]) } } });
  assert.equal(buildCard(doc, { groupId: CB4B, roundId: 'AWXJL7', env: {} }).card.players[0].scores[0], null);
});

test('no real rating -> rating and slope null (rated:false, missing, 72/113 placeholder on a custom course)', () => {
  assert.deepEqual([teeForRound(course18({ tees: [{ id: 'default', name: 'W', rating: 72, slope: 113, rated: false }] }), 'default').rating], [null]);
  const t2 = teeForRound({ holes: [], name: 'X' }, null); assert.equal(t2.rating, null); assert.equal(t2.slope, null);
  const t3 = teeForRound({ custom: true, rating: 72, slope: 113, holes: [] }, null); assert.equal(t3.rating, null);
  const t4 = teeForRound({ rating: 70.1, slope: 125, holes: [] }, null); assert.deepEqual([t4.rating, t4.slope, t4.name], [70.1, 125, null]);
  const { card } = buildCard(roundDoc({ round: { course: course18({ tees: [{ id: 'default', name: 'W', rating: 72, slope: 113, rated: false }] }) } }), { groupId: CB4B, roundId: 'AWXJL7', env: {} });
  assert.equal(card.tee.rating, null); assert.equal(card.tee.slope, null);
});

test('9-hole course card: holesCount 9, no out/in', () => {
  const c = course18(); c.holes = c.holes.slice(0, 9); c.holeCount = 9;
  const doc = roundDoc({ round: { course: c, holeScores: { p1: hs(FULL.slice(0, 9)) }, players: [{ id: 'p1', name: 'John Christadore' }] } });
  const { card } = buildCard(doc, { groupId: CB4B, roundId: 'AWXJL7', env: {} });
  assert.equal(card.holesCount, 9); assert.equal(card.players[0].scores.length, 9);
  assert.equal('out' in card.players[0], false); assert.equal(card.players[0].toPar, FULL.slice(0, 9).reduce((a, b) => a + b, 0) - 35);
});

test('date: round.date label, else round start (round.id), else savedAt — America/New_York', () => {
  assert.equal(isoDateForRound({ date: 'Sunday, June 21, 2026' }, 0), '2026-06-21');
  assert.equal(isoDateForRound({ id: Date.parse('2026-07-04T02:00:00Z') }, 0), '2026-07-03'); // 10pm ET
  assert.equal(isoDateForRound({}, Date.parse('2026-08-28T15:00:00Z')), '2026-08-28');
});

test('per-player post toggle is sent as post:false', () => {
  const { card } = buildCard(roundDoc({ round: { handicapPost: { p1777172757933: false } } }), { groupId: CB4B, roundId: 'AWXJL7', env: {} });
  assert.equal(card.players.find((p) => p.id === 'tj').post, false);
  assert.equal(card.players.find((p) => p.id === 'john').post, true);
});

// ── 3. Player-id mapping ───────────────────────────────────────────────────
test('player ids: canonical in JD\'s groups by roster id or name, opaque elsewhere', () => {
  const pick = (r) => ({ id: r.id, linked: r.linked });
  assert.deepEqual(pick(resolvePlayerId(CB4B, 'p1790599477726', 'whoever', {})), { id: 'john', linked: true });
  assert.deepEqual(pick(resolvePlayerId('LEGACY', 'p2', 'Brian', {})), { id: 'brian', linked: true });
  assert.deepEqual(pick(resolvePlayerId(CB4B, 'pNEW', '  rob   KRALY ', {})), { id: 'rob', linked: true });
  // A stranger's roster also starts at p1 — must not become John.
  const s = resolvePlayerId(STRANGER, 'p1', 'John Christadore', {});
  assert.equal(s.linked, false);
  assert.match(s.id, /^pp-[0-9a-f]{8}-p1$/);
  assert.equal(s.id, opaquePlayerId(STRANGER, 'p1'));
  assert.equal(s.id.includes(STRANGER), false);                 // group code never leaves PlayPal
  assert.equal(resolvePlayerId(STRANGER, 'p1', 'x', { PLAYPAL_BROV_GROUPS: STRANGER }).id, 'john');
  assert.deepEqual(BROVISIONAL_PLAYERS.map((p) => p.id), ['john', 'tj', 'mike', 'brian', 'james', 'rob']);
  const { card } = buildCard(roundDoc(), { groupId: CB4B, roundId: 'AWXJL7', env: {} });
  assert.match(card.players[2].id, /^pp-[0-9a-f]{8}-p9$/);
  assert.deepEqual(card.players[2].sourcePlayerIds, []);              // raw roster ids of unknown players never offered
  const s2 = buildCard(roundDoc(), { groupId: STRANGER, roundId: 'AWXJL7', env: {} }).card;
  assert.deepEqual(s2.players.map((p) => p.sourcePlayerIds), [[], [], []]);
  assert.equal(s2.players.some((p) => ['john', 'tj'].includes(p.id)), false);
});

// ── 4. Toggle defaults (server and client agree) ───────────────────────────
test('post-to-handicap defaults: on, off for shared-score formats; explicit choice wins; client == server', () => {
  const w = loadPlayPal();
  const BS = w.BrovisionalService;
  assert.deepEqual(JSON.parse(JSON.stringify(BS.SHARED_SCORE_FORMATS)), SHARED_SCORE_FORMATS);
  const cases = [
    [{ formats: [{ type: 'nassau' }], games: [] }, true],
    [{ formats: [], games: [{ formatId: 'skins' }, { formatId: 'bestBall' }, { formatId: 'shamble' }] }, true],
    [{ formats: [], games: [{ formatId: 'scramble' }] }, false],
    [{ formats: [], games: [{ formatId: 'scramble2' }] }, false],
    [{ formats: [], games: [{ formatId: 'alternateShot' }] }, false],
    [{ formats: [], games: [{ formatId: 'foursomes' }] }, false],
    [{ formats: [], games: [{ formatId: 'chapman' }] }, false],
    [{ formats: [{ type: 'markeymatch', markeyMatchConfig: { team1: ['a', 'b'], team2: ['c', 'd'] } }] }, true],  // per-player entry
    [{ formats: [{ type: 'markeymatch', markeyMatchConfig: { team1: ['a'], team2: ['c'] } }] }, true],
    [{ cardOnly: true }, true],
    [{}, true],
  ];
  for (const [r, want] of cases) {
    assert.equal(defaultPostToHandicap(r), want, JSON.stringify(r));
    assert.equal(BS.defaultPostToHandicap(r), want, 'client ' + JSON.stringify(r));
  }
  assert.equal(roundPostEnabled({ games: [{ formatId: 'scramble' }], postToHandicap: true }), true);
  assert.equal(roundPostEnabled({ postToHandicap: false }), false);
  assert.equal(BS.roundPostEnabled({ games: [{ formatId: 'scramble' }] }), false);
  assert.equal(BS.playerPostEnabled({ handicapPost: { p1: false } }, 'p1'), false);
  assert.equal(BS.playerPostEnabled({}, 'p1'), true);
});

// ── 5. Response handling / status mapping ──────────────────────────────────
test('ingest response -> round status posted / partial / skipped, keyed by PlayPal roster id', () => {
  const idMap = { john: 'p1', tj: 'pT', 'pp-x-p9': 'p9' };
  const P = (playerId, status, reason, d = {}) => ({ playerId, status, reason, gross: 90, adjustedGross: 88, differential: 15.2, index: 14.1, ...d });
  let m = mapIngestResponse({ players: [P('john', 'posted'), P('tj', 'updated'), P('pp-x-p9', 'skipped', 'opted_out')] }, idMap);
  assert.equal(m.status, 'posted');                         // opted-out players don't make it partial
  assert.deepEqual(m.players.p1, { status: 'posted', reason: null, brovisionalId: 'john', group: null, holes: null, gross: 90, adjustedGross: 88, differential: 15.2, index: 14.1 });
  m = mapIngestResponse({ players: [P('john', 'posted'), P('tj', 'skipped', 'incomplete'), P('pp-x-p9', 'skipped', 'unlinked')] }, idMap);
  assert.equal(m.status, 'partial'); assert.equal(m.players.p9.reason, 'unlinked');
  m = mapIngestResponse({ players: [P('john', 'skipped', 'missing_rating'), P('tj', 'skipped', 'missing_rating'), P('pp-x-p9', 'skipped', 'unlinked')] }, idMap);
  assert.equal(m.status, 'skipped');
  m = mapIngestResponse({ players: [P('john', 'posted')] }, idMap);
  assert.equal(m.status, 'partial'); assert.equal(m.players.pT.reason, 'no_response');
  m = mapIngestResponse({ players: [P('john', 'posted'), P('tj', 'posted'), P('pp-x-p9', 'posted'), P('stranger', 'posted')] }, idMap, { pD: { status: 'skipped', reason: 'duplicate_player' } });
  assert.equal(m.players.stranger, undefined); assert.equal(m.status, 'partial');
});

test('client interpret(): disabled, results, 409, auth errors, 5xx and network', () => {
  const BS = loadPlayPal().BrovisionalService;
  assert.deepEqual(JSON.parse(JSON.stringify(BS.interpret(200, { status: 'disabled' }))), { status: 'disabled', brovisional: { status: 'disabled' }, retry: false });
  assert.equal(BS.interpret(200, { status: 'posted', brovisional: { status: 'posted' } }).retry, false);
  assert.equal(BS.interpret(200, { status: 'failed', brovisional: { status: 'failed', retryable: true } }).retry, true);
  assert.equal(BS.interpret(200, { status: 'failed', brovisional: { status: 'failed', retryable: false } }).retry, false);
  assert.equal(BS.interpret(409, { status: 'not_completed' }).status, 'not_completed');
  assert.equal(BS.interpret(403, { error: 'Not a member' }).retry, false);
  assert.equal(BS.interpret(500, {}).retry, true);
  assert.equal(BS.interpret(undefined, undefined, 'offline').retry, true);
});

test('client view(): plain reasons, differential/index, disabled hidden', () => {
  const BS = loadPlayPal().BrovisionalService;
  const players = [{ id: 'p1', name: 'John' }, { id: 'p2', name: 'TJ' }, { id: 'p3', name: 'Guest' }, { id: 'p4', name: 'Mike' }];
  const v = BS.view({ status: 'partial', players: {
    p1: { status: 'posted', differential: 18.04, index: 17.2 },
    p2: { status: 'skipped', reason: 'incomplete' }, p3: { status: 'skipped', reason: 'unlinked' }, p4: { status: 'skipped', reason: 'missing_rating' } } }, players);
  assert.equal(v.kind, 'partial');
  assert.equal(v.rows[0].text, 'Diff 18.0 · Index 17.2');
  assert.deepEqual(v.rows.slice(1).map((r) => r.text), ['incomplete round', 'not linked in The Brovisional yet', 'no course rating']);
  assert.equal(BS.reasonText('opted_out'), 'opted out');
  assert.equal(BS.view({ status: 'disabled' }, players).kind, 'hidden');
  assert.equal(BS.view(null, players).kind, 'hidden');
  assert.equal(BS.view({ status: 'failed', lastError: 'HTTP 503' }, players).kind, 'failed');
});

// ── 6. Retry backoff ───────────────────────────────────────────────────────
test('backoff doubles from 1 min and caps at 6 h; queue drops after MAX_ATTEMPTS', () => {
  const BS = loadPlayPal().BrovisionalService;
  assert.deepEqual([1, 2, 3, 4, 5].map(BS.backoffMs), [60e3, 120e3, 240e3, 480e3, 960e3]);
  assert.equal(BS.backoffMs(20), 6 * 3600e3);
  const t0 = 1_800_000_000_000;
  const e1 = BS.enqueue('G1', 'R1', 'HTTP 503', t0);
  assert.equal(e1.attempts, 1); assert.equal(e1.nextAt, t0 + 60e3);
  assert.equal(BS.dueEntries(t0 + 59e3).length, 0);
  assert.equal(BS.dueEntries(t0 + 60e3).length, 1);
  const e2 = BS.enqueue('G1', 'R1', 'HTTP 503', t0 + 60e3);
  assert.equal(e2.attempts, 2); assert.equal(e2.nextAt, t0 + 60e3 + 120e3);
  for (let i = 3; i < BS.MAX_ATTEMPTS; i++) assert.ok(BS.enqueue('G1', 'R1', 'x', t0));
  assert.equal(BS.enqueue('G1', 'R1', 'x', t0), null);      // 6th failed try      // gave up; the server cron owns it now
  assert.equal(Object.keys(BS.queue()).length, 0);
});

test('client post(): fire-and-forget with ID token; failure queues, retryDue clears it; disabled hides', async () => {
  const w = loadPlayPal();
  const BS = w.BrovisionalService;
  let now = 1_800_000_000_000;
  const calls = [];
  let reply = { status: 503, body: { error: 'down' } };
  BS.setDeps({
    apiBase: 'https://playpal-nine.vercel.app', now: () => now, ready: (cb) => cb(true), getToken: async () => 'tok123',
    fetch: async (url, init) => { calls.push({ url, init }); return { status: reply.status, json: async () => reply.body }; },
  });
  let out = await BS.post('G1', 'R1');
  assert.equal(calls[0].url, 'https://playpal-nine.vercel.app/api/handicap/post');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok123');
  assert.deepEqual(JSON.parse(calls[0].init.body), { groupId: 'G1', roundId: 'R1', retry: false });
  assert.equal(out.status, 'failed');
  assert.equal(BS.getCached('R1').status, 'failed');
  assert.equal(BS.dueEntries(now).length, 0);
  now += 61e3;
  reply = { status: 200, body: { status: 'posted', brovisional: { status: 'posted', players: {} } } };
  out = await BS.retryDue();
  assert.equal(out[0].status, 'posted');
  assert.equal(JSON.parse(calls[1].init.body).retry, true);
  assert.equal(Object.keys(BS.queue()).length, 0);
  assert.equal(BS.getCached('R1').status, 'posted');
  // in-progress writes and EGT rounds never post
  assert.equal(BS.onRoundSaved('G1', { syncCode: 'R2' }), null);
  assert.equal(BS.onRoundSaved('G1', { syncCode: 'R2', holeScores: {}, egtRoundId: 'R1' }), null);
  reply = { status: 200, body: { status: 'disabled' } };
  out = await BS.onRoundSaved('G1', { syncCode: 'R3', holeScores: { p1: [] } });
  assert.equal(out.status, 'disabled');
  assert.equal(BS.isDisabled(now), true);
  assert.equal(Object.keys(BS.queue()).length, 0);
});

// ── 7. Disabled no-op ──────────────────────────────────────────────────────
test('no PLAYPAL_INGEST_SECRET: everything is a no-op returning disabled', async () => {
  const touched = [];
  const db = { collection: () => { touched.push('db'); throw new Error('should not read'); }, listCollections: async () => { touched.push('db'); return []; } };
  const fetchImpl = async () => { touched.push('fetch'); throw new Error('should not send'); };
  assert.equal((await syncRound({ db, groupId: CB4B, roundId: 'AWXJL7', env: {}, fetchImpl })).status, 'disabled');
  assert.equal((await deleteRound({ db, groupId: CB4B, roundId: 'AWXJL7', env: {}, fetchImpl })).status, 'disabled');
  assert.equal((await runCron({ db, env: {}, fetchImpl })).status, 'disabled');
  const deps = { env: {}, getFirestore: () => db, verifyIdToken: async () => { touched.push('auth'); return { uid: 'u' }; }, fetch: fetchImpl };
  for (const h of [makePostHandler(deps), makeDeleteHandler(deps)]) {
    const res = mockRes();
    await h({ method: 'POST', headers: {}, body: { groupId: CB4B, roundId: 'AWXJL7' } }, res);
    assert.equal(res.statusCode, 200); assert.deepEqual(res.body, { status: 'disabled' });
  }
  const res = mockRes();
  await makeCronHandler({ ...deps, env: { CRON_SECRET: 'c' } })({ method: 'GET', headers: { authorization: 'Bearer c' } }, res);
  assert.deepEqual(res.body, { status: 'disabled' });
  assert.deepEqual(touched, []);
});

// ── 8. API auth ────────────────────────────────────────────────────────────
test('POST /api/handicap/post: token required, round must exist in the caller\'s group, 409 if unfinished', async () => {
  const m = await startMockBrovisional({ secret: SECRET });
  try {
    const db = fakeDb({ [roundsCollection(CB4B)]: { AWXJL7: roundDoc(), LIVE01: { syncCode: 'LIVE01', round: { course: course18(), players: [] } } } });
    const deps = { env: envWith(m.url), getFirestore: () => db,
      verifyIdToken: async (h) => { if (h !== 'Bearer good') { const e = new Error('bad'); e.statusCode = 401; throw e; } return { uid: 'anon1', firebase: { sign_in_provider: 'anonymous' } }; } };
    const h = makePostHandler(deps);
    let res = mockRes(); await h({ method: 'POST', headers: {}, body: { groupId: CB4B, roundId: 'AWXJL7' } }, res);
    assert.equal(res.statusCode, 401);
    res = mockRes(); await h({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { groupId: STRANGER, roundId: 'AWXJL7' } }, res);
    assert.equal(res.statusCode, 404);
    res = mockRes(); await h({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { groupId: 'bad id', roundId: 'x' } }, res);
    assert.equal(res.statusCode, 400);
    res = mockRes(); await h({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { groupId: CB4B, roundId: 'LIVE01' } }, res);
    assert.equal(res.statusCode, 409);
    res = mockRes(); await h({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 405);
    // Anonymous member: posts. Client card data in the body is ignored.
    res = mockRes(); await h({ method: 'POST', headers: { authorization: 'Bearer good' }, body: JSON.stringify({ groupId: CB4B, roundId: 'awxjl7', card: { players: [{ id: 'john', scores: [1] }] } }) }, res);
    assert.equal(res.statusCode, 200); assert.equal(res.body.status, 'partial');
    const sent = JSON.parse(m.requests.at(-1).body);
    assert.equal(sent.players[0].gross, 97);
  } finally { await m.close(); }
});

test('POST /api/handicap/delete: round gone -> only the account owner/member may delete', async () => {
  const m = await startMockBrovisional({ secret: SECRET });
  try {
    const db = fakeDb({ users: { owner: { groupId: CB4B } }, group_meta: {}, [roundsCollection(CB4B)]: {} });
    const h = makeDeleteHandler({ env: envWith(m.url), getFirestore: () => db, verifyIdToken: async (hd) => ({ uid: hd.slice(7) }) });
    let res = mockRes(); await h({ method: 'POST', headers: { authorization: 'Bearer someone' }, body: { groupId: CB4B, roundId: 'GONE01' } }, res);
    assert.equal(res.statusCode, 403);
    res = mockRes(); await h({ method: 'POST', headers: { authorization: 'Bearer owner' }, body: { groupId: CB4B, roundId: 'GONE01' } }, res);
    assert.equal(res.statusCode, 200); assert.equal(res.body.status, 'deleted');
    const last = m.requests.at(-1);
    assert.equal(last.method, 'DELETE'); assert.equal(last.url, '/api/ingest/playpal/GONE01'); assert.equal(last.verified, true);
  } finally { await m.close(); }
});

// ── 9. End-to-end against the mock receiver (HMAC verified there) ─────────
test('end to end: post, idempotent re-post, unlinked then linked, opt-out deletes, round toggle off deletes', async () => {
  const m = await startMockBrovisional({ secret: SECRET });
  try {
    const col = roundsCollection(CB4B);
    const db = fakeDb({ [col]: { AWXJL7: roundDoc() } });
    const env = envWith(m.url);
    let now = Date.now();   // the mock checks the 300 s window against real time
    let r = await syncRound({ db, groupId: CB4B, roundId: 'AWXJL7', env, nowMs: now });
    assert.equal(r.status, 'partial');
    assert.ok(m.requests.every((q) => q.verified), 'mock verified every HMAC');
    let b = db.cols[col].AWXJL7.brovisional;
    assert.equal(b.attempts, 1); assert.equal(b.lastError, null); assert.equal(b.postedAt, now);
    assert.equal(b.players.p1.status, 'posted'); assert.equal(b.players.p1.differential, Math.round((113 / 134) * (97 - 69.6) * 10) / 10);
    assert.equal(b.players.p1777172757933.status, 'posted');          // front nine only = 9-hole post
    assert.equal(b.players.p9.reason, 'unlinked');

    // throttle: an immediate second call is not re-sent
    const n = m.requests.length;
    r = await syncRound({ db, groupId: CB4B, roundId: 'AWXJL7', env, nowMs: now + 1000 });
    assert.equal(r.throttled, true); assert.equal(m.requests.length, n);

    // admin links the guest -> a later re-post posts them; others 'updated'
    m.link(opaquePlayerId(CB4B, 'p9'));
    now += 60e3;
    r = await syncRound({ db, groupId: CB4B, roundId: 'AWXJL7', env, nowMs: now });
    b = db.cols[col].AWXJL7.brovisional;
    assert.equal(r.status, 'posted'); assert.equal(b.players.p1.status, 'updated'); assert.equal(b.players.p9.status, 'posted');
    assert.equal(m.store.size, 3);                                      // idempotent on roundId + player id

    // per-player opt-out deletes that player's score
    db.cols[col].AWXJL7.round.handicapPost = { p9: false };
    now += 60e3;
    r = await syncRound({ db, groupId: CB4B, roundId: 'AWXJL7', env, nowMs: now });
    assert.equal(r.status, 'posted'); assert.equal(db.cols[col].AWXJL7.brovisional.players.p9.reason, 'opted_out');
    assert.equal(m.store.has('AWXJL7:' + opaquePlayerId(CB4B, 'p9')), false);

    // round-level toggle off -> DELETE the round
    db.cols[col].AWXJL7.round.postToHandicap = false;
    now += 60e3;
    r = await syncRound({ db, groupId: CB4B, roundId: 'AWXJL7', env, nowMs: now });
    assert.equal(r.status, 'skipped'); assert.equal(db.cols[col].AWXJL7.brovisional.reason, 'opted_out');
    assert.equal(m.requests.at(-1).method, 'DELETE'); assert.equal(m.store.size, 0);
  } finally { await m.close(); }
});

test('failures: 5xx is retryable, 401 (wrong secret) and 400 are recorded; EGT rounds are never sent', async () => {
  const m = await startMockBrovisional({ secret: SECRET, failNext: 1 });
  try {
    const col = roundsCollection(CB4B);
    const T0 = Date.now();
    const db = fakeDb({ [col]: { AWXJL7: roundDoc(), EGTK336: roundDoc({ round: { egtRoundId: 'R1' } }) } });
    let r = await syncRound({ db, groupId: CB4B, roundId: 'AWXJL7', env: envWith(m.url), nowMs: T0 });
    let b = db.cols[col].AWXJL7.brovisional;
    assert.equal(r.status, 'failed'); assert.equal(b.retryable, true); assert.match(b.lastError, /HTTP 503/); assert.equal(b.attempts, 1);
    r = await syncRound({ db, groupId: CB4B, roundId: 'AWXJL7', env: envWith(m.url, { PLAYPAL_INGEST_SECRET: 'wrong' }), nowMs: T0 + 10e3 });
    b = db.cols[col].AWXJL7.brovisional;
    assert.equal(r.status, 'failed'); assert.equal(b.httpStatus, 401); assert.match(b.lastError, /signature/); assert.equal(b.attempts, 2);
    r = await syncRound({ db, groupId: CB4B, roundId: 'AWXJL7', env: envWith('http://127.0.0.1:9/api/ingest/playpal'), nowMs: T0 + 20e3 });
    assert.equal(r.status, 'failed'); assert.match(db.cols[col].AWXJL7.brovisional.lastError, /^network/);
    const c7 = course18(); c7.holes[0].par = 7;                         // receiver accepts par 3–6 only
    db.cols[col].BADPAR = roundDoc({ round: { course: c7 } });
    r = await syncRound({ db, groupId: CB4B, roundId: 'BADPAR', env: envWith(m.url), nowMs: T0 });
    b = db.cols[col].BADPAR.brovisional;
    assert.equal(r.status, 'failed'); assert.equal(b.httpStatus, 400); assert.equal(b.retryable, false);
    assert.match(b.lastError, /^validation: invalid_payload .*holes\[0\]\.par/);
    // cards the receiver can never accept are skipped locally, nothing sent
    const sentBefore = m.requests.length;
    db.cols[col].NOPLAY = roundDoc({ round: { players: [], holeScores: { x: [] } } });
    assert.equal((await syncRound({ db, groupId: CB4B, roundId: 'NOPLAY', env: envWith(m.url), nowMs: T0 })).brovisional.reason, 'no_players');
    const c12 = course18(); c12.holes = c12.holes.slice(0, 12);
    db.cols[col].TWELVE = roundDoc({ round: { course: c12 } });
    assert.equal((await syncRound({ db, groupId: CB4B, roundId: 'TWELVE', env: envWith(m.url), nowMs: T0 })).brovisional.reason, 'unsupported_holes');
    assert.equal(m.requests.length, sentBefore);
    const before = m.requests.length;
    r = await syncRound({ db, groupId: CB4B, roundId: 'EGTK336', env: envWith(m.url), nowMs: T0 });
    assert.equal(r.status, 'skipped'); assert.equal(db.cols[col].EGTK336.brovisional.reason, 'egt_round'); assert.equal(m.requests.length, before);
  } finally { await m.close(); }
});

// ── 10. Cron backstop ──────────────────────────────────────────────────────
test('cron eligibility: failed (capped), never-tried 1.22+ rounds, unlinked re-check; never history', () => {
  const now = Date.parse('2026-10-01T10:00:00Z');
  const fresh = (b, round = {}) => ({ ...roundDoc({ round }), savedAt: now - 86400e3, ...(b === undefined ? {} : { brovisional: b }) });
  assert.equal(cronEligible(fresh(undefined), now), true);                                   // postToHandicap:true, never tried
  assert.equal(cronEligible(fresh(undefined, { postToHandicap: undefined }), now), false);  // pre-1.22 round: never back-fill
  assert.equal(cronEligible(fresh(undefined, { postToHandicap: false }), now), false);
  assert.equal(cronEligible(fresh({ status: 'failed', attempts: 2, retryable: true }), now), true);
  assert.equal(cronEligible(fresh({ status: 'failed', attempts: CRON_MAX_ATTEMPTS, retryable: true }), now), false);
  assert.equal(cronEligible(fresh({ status: 'failed', attempts: 1, retryable: false, httpStatus: 400 }), now), false);
  assert.equal(cronEligible(fresh({ status: 'posted', attempts: 1 }), now), false);
  assert.equal(cronEligible(fresh({ status: 'partial', attempts: 1, lastAttemptAt: now - 21 * 3600e3, players: { p9: { reason: 'unlinked' } } }), now), true);
  assert.equal(cronEligible(fresh({ status: 'partial', attempts: 1, lastAttemptAt: now - 3600e3, players: { p9: { reason: 'unlinked' } } }), now), false);
  assert.equal(cronEligible({ ...fresh(undefined), savedAt: now - 30 * 86400e3 }, now), false); // outside lookback
  assert.equal(cronEligible(fresh(undefined, { egtRoundId: 'R2' }), now), false);
});

test('runCron scans every group rounds collection and retries what is eligible', async () => {
  const m = await startMockBrovisional({ secret: SECRET });
  try {
    const now = Date.now();
    const recent = (b, over) => ({ ...roundDoc(over), savedAt: now - 3600e3, ...(b ? { brovisional: b } : {}) });
    const db = fakeDb({
      [roundsCollection(CB4B)]: { AAAA01: recent({ status: 'failed', attempts: 1, retryable: true }), AAAA02: recent({ status: 'posted', attempts: 1 }) },
      [roundsCollection(STRANGER)]: { BBBB01: recent(null) },
      playpal_rounds: { OLD001: { ...roundDoc({ round: { postToHandicap: undefined } }), savedAt: now - 3600e3 } },
      users: { u1: { groupId: CB4B } },
    });
    const out = await runCron({ db, env: envWith(m.url), nowMs: now });
    assert.equal(out.collections, 3);
    assert.equal(out.eligible, 2); assert.equal(out.attempted, 2);
    assert.deepEqual(out.results.map((r) => r.roundId).sort(), ['AAAA01', 'BBBB01']);
    assert.equal(db.cols[roundsCollection(CB4B)].AAAA01.brovisional.source, 'cron');
    assert.equal(db.cols.playpal_rounds.OLD001.brovisional, undefined);
    assert.ok(m.requests.every((q) => q.verified));
    // stranger's players are sent with opaque ids -> unlinked
    assert.equal(db.cols[roundsCollection(STRANGER)].BBBB01.brovisional.status, 'skipped');
  } finally { await m.close(); }
});

test('cron endpoint: fails closed without CRON_SECRET, 401 on a wrong bearer', async () => {
  const h = (env) => makeCronHandler({ env, getFirestore: () => fakeDb({}) });
  let res = mockRes(); await h({ PLAYPAL_INGEST_SECRET: SECRET })({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 503);
  res = mockRes(); await h({ PLAYPAL_INGEST_SECRET: SECRET, CRON_SECRET: 'c' })({ method: 'GET', headers: { authorization: 'Bearer nope' } }, res);
  assert.equal(res.statusCode, 401);
  res = mockRes(); await h({ PLAYPAL_INGEST_SECRET: SECRET, CRON_SECRET: 'c' })({ method: 'GET', headers: { authorization: 'Bearer c' } }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.status, 'ok');
});

test('the client bundle carries no player-id mapping or crew names (server-side only)', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['components/brovisionalService.js', 'dist/brovisionalService.js']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    for (const p of BROVISIONAL_PLAYERS) {
      assert.equal(src.includes(p.name), false, f + ' contains ' + p.name);
      for (const id of p.sourcePlayerIds.filter((x) => x.length > 4)) assert.equal(src.includes(id), false, f + ' contains ' + id);
    }
    assert.equal(/PLAYPAL_INGEST_SECRET|createHmac/.test(src), false);
  }
});

test('final spec details: scores outside 1–20 are null, field limits, per-group entries, free-text reasons', async () => {
  const doc = roundDoc({ round: { holeScores: { p1: hs([21, 2.5, ...FULL.slice(2)]) }, players: [{ id: 'p1', name: 'John Christadore' }],
    course: course18({ name: 'X'.repeat(130), location: 'L'.repeat(150), tees: [{ id: 'default', name: 'T'.repeat(60), rating: 70, slope: 120, rated: true }] }) } });
  const { card } = buildCard(doc, { groupId: CB4B, roundId: 'AWXJL7', env: {} });
  assert.deepEqual(card.players[0].scores.slice(0, 3), [null, null, 9]);
  assert.equal(card.course.length, 100); assert.equal(card.location.length, 120); assert.equal(card.tee.name.length, 40);

  // linked in two groups -> two entries; counted if any group posted
  const m = await startMockBrovisional({ secret: SECRET, groups: { john: ['Second Group'] } });
  try {
    const col = roundsCollection(CB4B);
    const db = fakeDb({ [col]: { AWXJL7: roundDoc() } });
    await syncRound({ db, groupId: CB4B, roundId: 'AWXJL7', env: envWith(m.url) });
    const p1 = db.cols[col].AWXJL7.brovisional.players.p1;
    assert.equal(p1.status, 'posted'); assert.deepEqual(p1.groups.map((g) => g.group), ['Mock Group', 'Second Group']);
    const tj = db.cols[col].AWXJL7.brovisional.players.p1777172757933;
    assert.equal(tj.status, 'posted'); assert.equal(tj.holes, 9); assert.equal(tj.reason, '9-hole score held until 54 holes'); assert.equal(tj.index, null);
  } finally { await m.close(); }
  const idMap = { john: 'p1' };
  const mm = mapIngestResponse({ players: [{ playerId: 'john', status: 'skipped', reason: 'unlinked', group: 'A' }, { playerId: 'john', status: 'posted', group: 'B', differential: 10 }] }, idMap);
  assert.equal(mm.players.p1.status, 'posted'); assert.equal(mm.players.p1.group, 'B'); assert.equal(mm.status, 'posted');

  const BS = loadPlayPal().BrovisionalService;
  assert.equal(BS.reasonText('duplicate of existing score 123 (manual)'), 'already in The Brovisional from another source');
  assert.equal(BS.reasonText('rejected: check constraint'), 'rejected by The Brovisional');
  const v = BS.view({ status: 'posted', players: { p1: { status: 'posted', reason: '9-hole score held until 54 holes', differential: 9.1, index: null } } }, [{ id: 'p1', name: 'TJ' }]);
  assert.equal(v.rows[0].note, '9-hole score held until 54 holes'); assert.equal(v.rows[0].text, 'Diff 9.1 · Index —');
});

test('1.22.8: 404/5xx/network are retryable; 400 and bad-signature 401 are not; stale-timestamp 401 is', async () => {
  const { isRetryableHttp } = await import('../lib/brovisional.mjs');
  for (const s of [0, 404, 408, 429, 500, 502, 503]) assert.equal(isRetryableHttp(s), true, String(s));
  for (const s of [400, 401, 403, 409, 422]) assert.equal(isRetryableHttp(s), false, String(s));
  const now = Date.now();
  const doc = (b) => ({ savedAt: now - 86400e3, round: { course: { holes: [] }, players: [{ id: 'p1' }], holeScores: { p1: [4] } }, brovisional: b });
  // The stranded 6PWZPP shape: a 404 stored as retryable:false.
  assert.equal(cronEligible(doc({ status: 'failed', attempts: 3, retryable: false, httpStatus: 404 }), now), true);
  assert.equal(cronEligible(doc({ status: 'failed', attempts: 3, retryable: false, httpStatus: 0 }), now), true);
  assert.equal(cronEligible(doc({ status: 'failed', attempts: 3, retryable: false, httpStatus: 400 }), now), false);
  assert.equal(cronEligible(doc({ status: 'failed', attempts: CRON_MAX_ATTEMPTS, retryable: false, httpStatus: 404 }), now), false);
  assert.equal(cronEligible({ ...doc({ status: 'failed', attempts: 1, httpStatus: 404, retryable: false }), savedAt: now - 15 * 86400e3 }, now), false);
  const BS = loadPlayPal().BrovisionalService;
  assert.equal(BS.interpret(404, { error: 'Round not found in this group' }).retry, true);
  assert.equal(BS.interpret(400, {}).retry, false);
  assert.equal(BS.interpret(403, {}).retry, false);
  assert.equal(BS.interpret(502, { status: 'failed', brovisional: { status: 'failed', retryable: true } }).retry, true);
});

test('1.22.8: syncRound records an upstream 404 as retryable; stale 401 retryable, bad-signature 401 not', async () => {
  const { postCard } = await import('../lib/brovisional.mjs');
  const mk = (status, body) => async () => ({ status, text: async () => body });
  const card = { roundId: 'X' };
  let r = await postCard(card, { secret: 's', url: 'https://x.test', fetchImpl: mk(404, '<html>404</html>') });
  assert.equal(r.retryable, true); assert.equal(r.httpStatus, 404);
  r = await postCard(card, { secret: 's', url: 'https://x.test', fetchImpl: mk(401, '{"error":"stale timestamp"}') });
  assert.equal(r.retryable, true);
  r = await postCard(card, { secret: 's', url: 'https://x.test', fetchImpl: mk(401, '{"error":"bad signature"}') });
  assert.equal(r.retryable, false); assert.match(r.error, /signature/);
  r = await postCard(card, { secret: 's', url: 'https://x.test', fetchImpl: async () => { throw new Error('ECONNRESET'); } });
  assert.equal(r.retryable, true);
});
