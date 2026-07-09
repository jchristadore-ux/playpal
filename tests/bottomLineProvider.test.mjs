// bottomLineProvider.test.mjs — the EGT Bottom Line data provider.
//
// The provider is pure: it takes a "world" snapshot (Firestore docs, trips,
// players) and returns cached facts, a rotating ticker feed, and alert cards
// diffed between snapshots. These tests drive it with synthetic rounds shaped
// exactly like the app's sync payloads.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlayPal } from './helpers/load.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadWithSeed() {
  const w = loadPlayPal();
  w.EGT_SEED = JSON.parse(readFileSync(join(root, 'fixtures/egt-2026-seed.json'), 'utf8'));
  return w;
}

const HOLES = Array.from({ length: 18 }, (_, i) => ({
  num: i + 1,
  par: [4, 4, 3, 5, 4, 4, 3, 5, 4][i % 9],
  hdcp: i + 1,
}));
const COURSE = { id: 'c1', name: 'Test National', holes: HOLES };
const PLAYERS = [
  { id: 'p1', name: 'Alice', initials: 'AL', handicap: 6, color: '#111111' },
  { id: 'p2', name: 'Bob', initials: 'BO', handicap: 12, color: '#222222' },
];

function liveDoc({ scores, putts, currentHoleIdx = 5, ts = Date.now(), formats = [{ type: 'skins', stakes: 5 }] }) {
  return {
    syncCode: 'TEST01',
    savedAt: ts - 1000,
    round: {
      id: 1, name: 'Test Round', syncCode: 'TEST01',
      players: PLAYERS, course: COURSE, formats, games: [],
    },
    liveScores: {
      scores, putts: putts || {}, popFlags: {}, wolfData: {}, bbbData: {},
      teeBallData: {}, firData: {}, girData: {}, extraStats: {},
      currentHoleIdx, roundId: 1, _writtenBy: 'other-device', _ts: ts,
    },
  };
}

function partialScores(throughA, throughB, offA = 0, offB = 1) {
  const a = Array(18).fill(null), b = Array(18).fill(null);
  for (let i = 0; i < throughA; i++) a[i] = HOLES[i].par + offA;
  for (let i = 0; i < throughB; i++) b[i] = HOLES[i].par + offB;
  return { p1: a, p2: b };
}

test('computeFacts: empty world produces an empty-but-valid fact set', () => {
  const w = loadWithSeed();
  const facts = w.BottomLineProvider.computeFacts({ docs: [], trips: [], players: [], now: Date.now() });
  assert.equal(facts.rounds.length, 0);
  assert.equal(facts.liveRounds.length, 0);
  assert.deepEqual(facts.moneyBoard, []);
  const feed = w.BottomLineProvider.buildFeed(facts);
  // Even with no scores anywhere, the EGT seed produces schedule segments.
  assert.ok(feed.length >= 1, 'schedule segments expected from the seed');
  assert.ok(feed.some(s => s.category === 'schedule'));
});

test('computeFacts: live round is detected, leaders and thru counts computed', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const doc = liveDoc({ scores: partialScores(6, 5), now });
  const facts = w.BottomLineProvider.computeFacts({ docs: [doc], trips: [], players: [], now });
  assert.equal(facts.liveRounds.length, 1);
  const r = facts.liveRounds[0];
  assert.equal(r.status, 'live');
  assert.equal(r.thru.p1, 6);
  assert.equal(r.thru.p2, 5);
  assert.equal(r.lines[0].name, 'Alice');       // even par leads
  assert.equal(r.lines[0].toPar, 0);
  assert.equal(r.lines[1].toPar, 5);            // Bob is +1 a hole thru 5
});

test('stale partial round is not "live"', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const doc = liveDoc({ scores: partialScores(6, 5), ts: now - 7 * 60 * 60 * 1000 });
  doc.savedAt = now - 7 * 60 * 60 * 1000;
  const facts = w.BottomLineProvider.computeFacts({ docs: [doc], trips: [], players: [], now });
  assert.equal(facts.liveRounds.length, 0);
  assert.equal(facts.rounds[0].status, 'partial');
});

test('completed round: money matches calcAllPayouts and record book fills', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const doc = liveDoc({ scores: partialScores(18, 18), now });
  const facts = w.BottomLineProvider.computeFacts({ docs: [doc], trips: [], players: [], now });
  const r = facts.rounds[0];
  assert.equal(r.status, 'final');
  // Alice wins every skin: 18 skins → zero-sum payout at $5.
  const expected = w.calcSkins(r.scores, PLAYERS, COURSE, 5, {}).payouts;
  assert.deepEqual(r.money, expected);
  assert.ok(facts.moneyBoard[0].name === 'Alice' && facts.moneyBoard[0].total > 0);
  assert.equal(facts.records.bestRound.name, 'Alice');
  assert.equal(facts.records.worstRound.name, 'Bob');
  assert.ok(facts.records.lowNine, 'low nine recorded');
});

test('buildFeed rotates categories instead of dumping one at a time', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const doc = liveDoc({ scores: partialScores(9, 9), now });
  const facts = w.BottomLineProvider.computeFacts({ docs: [doc], trips: [], players: [], now });
  const feed = w.BottomLineProvider.buildFeed(facts);
  assert.ok(feed.length > 5);
  // The first N segments must span multiple categories (round-robin), and
  // every segment must satisfy the renderer contract.
  const firstCats = new Set(feed.slice(0, 5).map(s => s.category));
  assert.ok(firstCats.size >= 3, `expected rotation, got ${[...firstCats].join(',')}`);
  feed.forEach(s => {
    assert.ok(s.id && s.category && Array.isArray(s.parts), `bad segment ${JSON.stringify(s)}`);
    s.parts.forEach(p => assert.ok(typeof p.t === 'string' && typeof p.s === 'string'));
  });
});

test('diffAlerts: birdie, double, and lead change are detected between snapshots', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const before = w.BottomLineProvider.computeFacts({
    docs: [liveDoc({ scores: partialScores(5, 5, 0, 0), now })], trips: [], players: [], now,
  });
  // Hole 6 (par 4): Alice doubles, Bob birdies → Bob takes the lead.
  const scores = partialScores(5, 5, 0, 0);
  scores.p1[5] = HOLES[5].par + 2;
  scores.p2[5] = HOLES[5].par - 1;
  const after = w.BottomLineProvider.computeFacts({
    docs: [liveDoc({ scores, now: now + 1000 })], trips: [], players: [], now: now + 1000,
  });
  const alerts = w.BottomLineProvider.diffAlerts(before, after);
  const labels = alerts.map(a => a.label);
  assert.ok(labels.includes('BIRDIE'), `birdie alert missing: ${labels}`);
  assert.ok(labels.includes('DOUBLE BOGEY ALERT'), `double alert missing: ${labels}`);
  assert.ok(labels.includes('LEAD CHANGE'), `lead change missing: ${labels}`);
  alerts.forEach(a => assert.equal(a.alert, true));
});

test('diffAlerts: hot streak fires after three straight under-par holes', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const s0 = partialScores(2, 0, -1, 0);
  const before = w.BottomLineProvider.computeFacts({
    docs: [liveDoc({ scores: s0, now })], trips: [], players: [], now,
  });
  const s1 = partialScores(3, 0, -1, 0); // third straight birdie
  const after = w.BottomLineProvider.computeFacts({
    docs: [liveDoc({ scores: s1, now: now + 1000 })], trips: [], players: [], now: now + 1000,
  });
  const alerts = w.BottomLineProvider.diffAlerts(before, after);
  assert.ok(alerts.some(a => a.label === 'HOT STREAK'), alerts.map(a => a.label).join(','));
});

test('EGT rounds sync into the Cup: standings and money appear on the feed', () => {
  const w = loadWithSeed();
  const now = Date.now();
  // Build the EGT R2 native round exactly like the app does, then simulate
  // the whole four-ball finishing (John/Brian well over, TJ/Mike at par).
  const model = w.EgtImporter.importSeed(w.EGT_SEED);
  const native = w.EgtBridge.toNativeRound(model, 'R2');
  const scores = {};
  native.players.forEach((p, k) => {
    scores[p.id] = native.course.holes.map(h => h.par + (p.id === 'john' || p.id === 'brian' ? 2 : 0));
  });
  const doc = {
    syncCode: native.syncCode,
    savedAt: now,
    round: native,
    liveScores: {
      scores, putts: {}, firData: {}, girData: {}, extraStats: {},
      wolfData: {}, bbbData: {}, teeBallData: {}, popFlags: {},
      currentHoleIdx: 17, roundId: native.id, _writtenBy: 'dev', _ts: now,
    },
  };
  const facts = w.BottomLineProvider.computeFacts({ docs: [doc], trips: [], players: [], now });
  assert.ok(facts.egt && facts.egt.live, 'EGT live update expected');
  assert.equal(facts.egt.state.finalized.length, 1);
  const standings = facts.egt.live.standings;
  assert.ok(['tj', 'mike'].includes(standings[0].player), 'TJ/Mike side should lead after R2');
  // Money nets to zero by construction.
  const sum = Object.values(facts.egt.live.money.total).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum) < 1e-6);
  const feed = w.BottomLineProvider.buildFeed(facts);
  assert.ok(feed.some(s => s.id === 'egt:standings'));
  assert.ok(feed.some(s => s.id === 'egt:money'));
});

test('EGT liveScores-only doc (no round object) still feeds the Cup', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const model = w.EgtImporter.importSeed(w.EGT_SEED);
  const native = w.EgtBridge.toNativeRound(model, 'R3');
  const scores = {};
  native.players.forEach(p => { scores[p.id] = native.course.holes.map(h => h.par); });
  scores[native.players[0].id][0] = native.course.holes[0].par - 1;
  const doc = {
    syncCode: native.syncCode,
    savedAt: now,
    // No round: the app creates EGT docs with a liveScores-only merge write.
    liveScores: {
      scores, putts: {}, firData: {}, girData: {}, extraStats: {},
      wolfData: {}, bbbData: {}, teeBallData: {}, popFlags: {},
      currentHoleIdx: 17, roundId: native.id, _writtenBy: 'dev', _ts: now,
    },
  };
  const facts = w.BottomLineProvider.computeFacts({ docs: [doc], trips: [], players: [], now });
  assert.equal(facts.rounds.length, 1, 'round synthesized from the seed');
  assert.equal(facts.rounds[0].egtRoundId, 'R3');
  assert.ok(facts.egt.state.scores.R3, 'scores bridged into the Cup state');
});

test('trip leaderboard segments appear for trip-tagged rounds', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const doc = liveDoc({ scores: partialScores(18, 18), now });
  doc.round.tripId = 'trip_123';
  const trips = [{ id: 'trip_123', name: 'Myrtle 2026', createdAt: now }];
  const facts = w.BottomLineProvider.computeFacts({ docs: [doc], trips, players: [], now });
  assert.equal(facts.trips.length, 1);
  assert.equal(facts.trips[0].leaderboard[0].name, 'Alice');
  const feed = w.BottomLineProvider.buildFeed(facts);
  assert.ok(feed.some(s => s.id === 'trip:trip_123'));
});

test('format boards: wolf and stableford standings surface', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const doc = liveDoc({
    scores: partialScores(9, 9),
    formats: [{ type: 'stableford', stakes: 2 }, { type: 'skins', stakes: 5 }],
    now,
  });
  const facts = w.BottomLineProvider.computeFacts({ docs: [doc], trips: [], players: [], now });
  const boards = facts.rounds[0].formatBoards;
  assert.ok(boards.some(b => b.type === 'stableford' && b.leader === 'Alice'));
  const feed = w.BottomLineProvider.buildFeed(facts);
  assert.ok(feed.some(s => s.category === 'format'));
});

test('provider is registry-driven: a custom builder surfaces in the feed', () => {
  const w = loadWithSeed();
  w.BottomLineProvider.register({
    id: 'custom', category: 'stats',
    build: () => [{ id: 'custom:1', category: 'stats', icon: '🧪', label: 'CUSTOM',
      parts: [{ t: 'text', s: 'hello' }] }],
  });
  const facts = w.BottomLineProvider.computeFacts({ docs: [], trips: [], players: [], now: Date.now() });
  const feed = w.BottomLineProvider.buildFeed(facts);
  assert.ok(feed.some(s => s.id === 'custom:1'));
});
