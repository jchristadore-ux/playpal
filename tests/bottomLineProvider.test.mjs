// bottomLineProvider.test.mjs — the EGT Bottom Line data provider.
//
// The Bottom Line is an EGT Cup broadcast: the provider ONLY surfaces data
// entered in EGT tournament rounds. Any other round or golf trip synced to the
// same Firebase project is ignored. These tests drive the provider with real
// EGT rounds (built from the seed exactly as the app builds them) plus a
// non-EGT round to prove it is filtered out.

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

// Build a Firestore-shaped doc for a real EGT round. `fill(pid, k, i, hole)`
// returns a gross score (or null) for player pid on hole index i.
function egtDoc(w, roundId, fill, opts = {}) {
  const model = w.EgtImporter.importSeed(w.EGT_SEED);
  const native = w.EgtBridge.toNativeRound(model, roundId);
  const holes = native.course.holes;
  const scores = {}, putts = {};
  native.players.forEach((p, k) => {
    const arr = Array(18).fill(null), parr = Array(18).fill(null);
    for (let i = 0; i < 18; i++) {
      const v = fill(p.id, k, i, holes[i]);
      if (v != null) { arr[i] = v; parr[i] = 2; }
    }
    scores[p.id] = arr; putts[p.id] = parr;
  });
  const ts = opts.ts != null ? opts.ts : Date.now();
  return {
    doc: {
      syncCode: native.syncCode, savedAt: ts,
      round: opts.liveOnly ? undefined : native,
      liveScores: {
        scores, putts, firData: {}, girData: {}, extraStats: {},
        wolfData: {}, bbbData: {}, teeBallData: {}, popFlags: {},
        currentHoleIdx: opts.hole != null ? opts.hole : 8,
        roundId: native.id, _writtenBy: 'phone', _ts: ts,
      },
    },
    native, model, holes,
  };
}

// A non-EGT casual round synced to the same project — must be ignored.
function casualDoc() {
  const holes = Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hdcp: i + 1 }));
  return {
    syncCode: 'CASUAL1', savedAt: Date.now(),
    round: {
      id: 7, name: 'Saturday Casual', syncCode: 'CASUAL1',
      players: [{ id: 'x', name: 'Randall', handicap: 10 }, { id: 'y', name: 'Stu', handicap: 20 }],
      course: { id: 'muni', name: 'City Muni', holes },
      formats: [{ type: 'skins', stakes: 5 }],
    },
    liveScores: {
      scores: { x: holes.map(() => 4), y: holes.map(() => 5) },
      putts: {}, firData: {}, girData: {}, extraStats: {},
      wolfData: {}, bbbData: {}, teeBallData: {}, popFlags: {},
      currentHoleIdx: 17, roundId: 7, _writtenBy: 'z', _ts: Date.now(),
    },
  };
}

// offset-per-player fill through N holes.
const throughFill = (offsets, thru) => (pid, k, i, hole) =>
  i < thru ? hole.par + (offsets[pid] != null ? offsets[pid] : 0) : null;

test('empty world → schedule segments from the seed, nothing else', () => {
  const w = loadWithSeed();
  const facts = w.BottomLineProvider.computeFacts({ docs: [], trips: [], players: [], now: Date.now() });
  assert.equal(facts.rounds.length, 0);
  assert.equal(facts.trips.length, 0);
  const feed = w.BottomLineProvider.buildFeed(facts);
  assert.ok(feed.length >= 1);
  assert.ok(feed.every(s => s.category === 'schedule'));
});

test('non-EGT rounds are ignored entirely', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const facts = w.BottomLineProvider.computeFacts({ docs: [casualDoc()], trips: [], players: [], now });
  assert.equal(facts.rounds.length, 0, 'casual round must not appear');
  assert.equal(facts.liveRounds.length, 0);
  assert.equal(facts.moneyBoard.length, 0);
  assert.equal(facts.records.bestRound, null);
  const feed = w.BottomLineProvider.buildFeed(facts);
  assert.ok(feed.every(s => s.category === 'schedule'), 'only schedule with no EGT data');
  assert.ok(!feed.some(s => /Randall|Stu|City Muni/.test(JSON.stringify(s.parts))));
});

test('a non-EGT round alongside an EGT round: only the EGT round surfaces', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const egt = egtDoc(w, 'R2', throughFill({ john: 0, brian: 1, tj: 1, mike: 2 }, 6));
  const facts = w.BottomLineProvider.computeFacts({ docs: [casualDoc(), egt.doc], trips: [], players: [], now });
  assert.equal(facts.rounds.length, 1);
  assert.equal(facts.rounds[0].egtRoundId, 'R2');
  assert.ok(!JSON.stringify(facts.rounds).includes('Randall'));
});

test('live EGT round: detected, leaders and thru computed', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const egt = egtDoc(w, 'R2', throughFill({ john: 0, brian: 1, tj: 1, mike: 2 }, 6), { now });
  const facts = w.BottomLineProvider.computeFacts({ docs: [egt.doc], trips: [], players: [], now });
  assert.equal(facts.liveRounds.length, 1);
  const r = facts.liveRounds[0];
  assert.equal(r.status, 'live');
  assert.equal(r.thru.john, 6);
  assert.equal(r.lines[0].name, 'John');   // even par leads
  assert.equal(r.lines[0].toPar, 0);
});

test('stale EGT round is not "live"', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const egt = egtDoc(w, 'R2', throughFill({ john: 0, brian: 1 }, 6), { ts: now - 7 * 60 * 60 * 1000 });
  const facts = w.BottomLineProvider.computeFacts({ docs: [egt.doc], trips: [], players: [], now });
  assert.equal(facts.liveRounds.length, 0);
  assert.equal(facts.rounds[0].status, 'partial');
});

test('completed EGT round: EGT Cup standings, coherent money, records fill', () => {
  const w = loadWithSeed();
  const now = Date.now();
  // Full R2 (teams John+Mike vs Brian+TJ): John/Mike +2 a hole, Brian/TJ at par
  // → the Brian/TJ side wins.
  const egt = egtDoc(w, 'R2', throughFill({ john: 2, mike: 2, brian: 0, tj: 0 }, 18), { now });
  const facts = w.BottomLineProvider.computeFacts({ docs: [egt.doc], trips: [], players: [], now });
  const r = facts.rounds[0];
  assert.equal(r.status, 'final');
  assert.ok(facts.egt && facts.egt.live, 'EGT engine ran');
  assert.equal(facts.egt.state.finalized.length, 1);
  assert.ok(['brian', 'tj'].includes(facts.egt.live.standings[0].player));

  // Money board is EGT-engine-authoritative and nets to zero.
  const sum = facts.moneyBoard.reduce((a, m) => a + m.total, 0);
  assert.ok(Math.abs(sum) < 1e-6, 'zero-sum bankroll');
  const engineSum = Object.values(facts.egt.live.money.total).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(engineSum) < 1e-6);
  // Every bankroll name maps to an EGT player.
  const egtNames = new Set(Object.keys(facts.egt.model.playersById).map(pid => facts.egt.model.playersById[pid].name));
  facts.moneyBoard.forEach(m => assert.ok(egtNames.has(m.name), `${m.name} is an EGT player`));

  // Record book fills from the EGT round.
  assert.ok(facts.records.bestRound, 'best round recorded');
  assert.ok(['Brian', 'TJ'].includes(facts.records.bestRound.name));
});

test('buildFeed rotates categories with EGT data', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const egt = egtDoc(w, 'R2', throughFill({ john: 0, brian: 1, tj: 1, mike: 2 }, 9), { now });
  const facts = w.BottomLineProvider.computeFacts({ docs: [egt.doc], trips: [], players: [], now });
  const feed = w.BottomLineProvider.buildFeed(facts);
  assert.ok(feed.length > 5);
  const firstCats = new Set(feed.slice(0, 5).map(s => s.category));
  assert.ok(firstCats.size >= 3, `expected rotation, got ${[...firstCats].join(',')}`);
  feed.forEach(s => {
    assert.ok(s.id && s.category && Array.isArray(s.parts));
    s.parts.forEach(p => assert.ok(typeof p.t === 'string' && typeof p.s === 'string'));
  });
});

test('diffAlerts: birdie, double, and lead change on an EGT round', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const par = i => [4, 4, 3, 5, 4, 4, 3, 5, 4][i % 9]; // ballyowen front pars are close enough for shape

  // Before: TJ leads at -1 thru 5, John even thru 5.
  const beforeFill = (pid, k, i, hole) => {
    if (pid === 'john') return i < 5 ? hole.par : null;
    if (pid === 'tj')   return i < 5 ? (i === 0 ? hole.par - 1 : hole.par) : null;
    return null;
  };
  // After: John birdies hole 6 → John -1 thru 6 (leads on thru). Mike doubles hole 1.
  const afterFill = (pid, k, i, hole) => {
    if (pid === 'john') return i < 6 ? (i === 5 ? hole.par - 1 : hole.par) : null;
    if (pid === 'tj')   return i < 5 ? (i === 0 ? hole.par - 1 : hole.par) : null;
    if (pid === 'mike') return i === 0 ? hole.par + 2 : null;
    return null;
  };
  const before = w.BottomLineProvider.computeFacts({ docs: [egtDoc(w, 'R2', beforeFill, { ts: now }).doc], trips: [], players: [], now });
  const after  = w.BottomLineProvider.computeFacts({ docs: [egtDoc(w, 'R2', afterFill, { ts: now + 1000 }).doc], trips: [], players: [], now: now + 1000 });
  const alerts = w.BottomLineProvider.diffAlerts(before, after);
  const labels = alerts.map(a => a.label);
  assert.ok(labels.includes('BIRDIE'), `birdie missing: ${labels}`);
  assert.ok(labels.includes('DOUBLE BOGEY ALERT'), `double missing: ${labels}`);
  assert.ok(labels.includes('LEAD CHANGE'), `lead change missing: ${labels}`);
  alerts.forEach(a => assert.equal(a.alert, true));
});

test('diffAlerts: hot streak after three straight birdies', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const streak = n => (pid, k, i, hole) => (pid === 'john' && i < n) ? hole.par - 1 : null;
  const before = w.BottomLineProvider.computeFacts({ docs: [egtDoc(w, 'R2', streak(2), { ts: now }).doc], trips: [], players: [], now });
  const after  = w.BottomLineProvider.computeFacts({ docs: [egtDoc(w, 'R2', streak(3), { ts: now + 1000 }).doc], trips: [], players: [], now: now + 1000 });
  const alerts = w.BottomLineProvider.diffAlerts(before, after);
  assert.ok(alerts.some(a => a.label === 'HOT STREAK'), alerts.map(a => a.label).join(','));
});

test('EGT liveScores-only doc (no round object) still feeds the Cup', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const egt = egtDoc(w, 'R3', (pid, k, i, hole) => hole.par - (pid === 'john' && i === 0 ? 1 : 0), { now, liveOnly: true });
  const facts = w.BottomLineProvider.computeFacts({ docs: [egt.doc], trips: [], players: [], now });
  assert.equal(facts.rounds.length, 1, 'round synthesized from the seed');
  assert.equal(facts.rounds[0].egtRoundId, 'R3');
  assert.ok(facts.egt.state.scores.R3, 'scores bridged into the Cup state');
});

test('EGT Cup segments appear on the feed; no duplicate money card', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const egt = egtDoc(w, 'R2', throughFill({ john: 2, brian: 2, tj: 0, mike: 0 }, 18), { now });
  const facts = w.BottomLineProvider.computeFacts({ docs: [egt.doc], trips: [], players: [], now });
  const feed = w.BottomLineProvider.buildFeed(facts);
  assert.ok(feed.some(s => s.id === 'egt:standings'));
  assert.ok(feed.some(s => s.id === 'money:bank'), 'running bankroll present');
  assert.ok(!feed.some(s => s.id === 'egt:money'), 'no separate EGT money card');
});

test('format boards: skins and stableford standings surface for EGT rounds', () => {
  const w = loadWithSeed();
  const now = Date.now();
  // R6 native formats include stableford + skins; make John run away with it.
  const egt = egtDoc(w, 'R6', throughFill({ john: -1, brian: 1, tj: 1, mike: 2 }, 18), { now });
  const facts = w.BottomLineProvider.computeFacts({ docs: [egt.doc], trips: [], players: [], now });
  const boards = facts.rounds[0].formatBoards;
  assert.ok(boards.some(b => b.type === 'stableford'), 'stableford board present');
  const feed = w.BottomLineProvider.buildFeed(facts);
  assert.ok(feed.some(s => s.category === 'format'));
});

test('SportsCenter reconstructs configured match play from the synced round formats', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const model = w.EgtImporter.importSeed(w.EGT_SEED);
  // The app syncs the native round WITH its overlay match config baked into the
  // Nassau format. The provider must recover it so R5 match play + its money
  // show on the broadcast, not just BBB + skins.
  const matchConfigs = [
    { id: 'm1', matchType: '1v1', playersInMatch: ['john', 'brian'], teams: null, popHoles: {}, stakes: 5 },
  ];
  const native = w.EgtBridge.toNativeRound(model, 'R5', null, { matchConfigs });
  const holes = native.course.holes;
  const scores = {}, putts = {};
  native.players.forEach((p, k) => {
    scores[p.id] = holes.map(h => h.par + k); // john lowest → wins his match
    putts[p.id] = holes.map(() => 2);
  });
  const doc = {
    syncCode: native.syncCode, savedAt: now - 8 * 3600 * 1000,
    round: native,
    liveScores: { scores, putts, firData: {}, girData: {}, extraStats: {},
      wolfData: {}, bbbData: {}, teeBallData: {}, popFlags: {},
      currentHoleIdx: 17, roundId: native.id, _writtenBy: 'phone', _ts: now - 8 * 3600 * 1000 },
  };
  const facts = w.BottomLineProvider.computeFacts({ docs: [doc], trips: [], players: [], now });
  const mp = facts.egt.live.resultsByRound.R5.matchPlay;
  assert.equal(mp.matches.length, 1, 'configured R5 match recovered from synced formats');
  const rm = facts.egt.live.money.rounds.R5;
  const labels = Object.values(rm.breakdown).flat().map(x => x.label);
  assert.ok(labels.some(l => /^Match /.test(l)), 'R5 match play settles for money on the broadcast');
  const sum = Object.values(rm.total).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum) < 1e-6, `R5 broadcast money nets zero, got ${sum}`);
});

test('SportsCenter recovers Rounds-tab stake overrides from the synced formats', () => {
  const w = loadWithSeed();
  const now = Date.now();
  const model = w.EgtImporter.importSeed(w.EGT_SEED);
  // The organizer bumped R3 stakes on the Rounds tab; the app bakes them into
  // the synced round's format objects. The broadcast must run its money engine
  // at those rates, not the tournament defaults.
  const stakes = { R3: { wolfPerUnit: 7, skinsAnte: 9 } };
  const mkDoc = stk => {
    const native = w.EgtBridge.toNativeRound(model, 'R3', stk);
    const holes = native.course.holes;
    const scores = {}, putts = {};
    native.players.forEach((p, k) => {
      scores[p.id] = holes.map(h => h.par + k); // first player outright low everywhere
      putts[p.id] = holes.map(() => 2);
    });
    return {
      syncCode: native.syncCode, savedAt: now - 8 * 3600 * 1000,
      round: native,
      liveScores: { scores, putts, firData: {}, girData: {}, extraStats: {},
        wolfData: {}, bbbData: {}, teeBallData: {}, popFlags: {},
        currentHoleIdx: 17, roundId: native.id, _writtenBy: 'phone', _ts: now - 8 * 3600 * 1000 },
    };
  };
  const withOverride = w.BottomLineProvider.computeFacts({ docs: [mkDoc(stakes)], trips: [], players: [], now });
  assert.equal(withOverride.egt.state.stakes.R3.wolfPerUnit, 7, 'wolf stake recovered');
  assert.equal(withOverride.egt.state.stakes.R3.skinsAnte, 9, 'skins ante recovered');
  const withDefaults = w.BottomLineProvider.computeFacts({ docs: [mkDoc(null)], trips: [], players: [], now });
  // Same scores, higher ante → the skins winner's engine money must grow.
  const top = f => Math.max(...Object.values(f.egt.live.money.rounds.R3.total));
  assert.ok(top(withOverride) > top(withDefaults),
    `override money ${top(withOverride)} should beat default ${top(withDefaults)}`);
  const sum = Object.values(withOverride.egt.live.money.rounds.R3.total).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum) < 1e-6, 'still zero-sum at the overridden rates');
});

// ── Broadcast layer (SportsCenter dashboard) ────────────────────────────────

test('playerInfo resolves EGT ids and names to logo + alias + color', () => {
  const w = loadWithSeed();
  const P = w.BottomLineProvider;
  const brian = P.playerInfo('brian');
  assert.equal(brian.alias, 'Birdman');
  assert.ok(/icons\/players\/brian\.png/.test(brian.logo));
  assert.equal(P.playerInfo('TJ').alias, 'Straight T');
  assert.equal(P.playerInfo('Mike').alias, 'H7');
  const unknown = P.playerInfo('Randall');
  assert.equal(unknown.alias, null); // graceful fallback
});

test('broadcastMode: pre with no scores, live while scoring, post after', () => {
  const w = loadWithSeed();
  const P = w.BottomLineProvider;
  const now = Date.now();
  assert.equal(P.broadcastMode(P.computeFacts({ docs: [], trips: [], players: [], now })), 'pre');
  const live = P.computeFacts({ docs: [egtDoc(w, 'R2', throughFill({ john: 0, brian: 1 }, 6), { now }).doc], trips: [], players: [], now });
  assert.equal(P.broadcastMode(live), 'live');
  const done = P.computeFacts({ docs: [egtDoc(w, 'R2', throughFill({ john: 2, brian: 2, tj: 0, mike: 0 }, 18), { ts: now - 8 * 3600 * 1000 }).doc], trips: [], players: [], now });
  assert.equal(P.broadcastMode(done), 'post');
  assert.equal(P.broadcastMode(done, { force: 'pre' }), 'pre'); // manual override
});

test('broadcastModules pre: schedule/format/pairings from the seed', () => {
  const w = loadWithSeed();
  const P = w.BottomLineProvider;
  const facts = P.computeFacts({ docs: [], trips: [], players: [], now: Date.now() });
  const mods = P.broadcastModules(facts, 'pre');
  const types = mods.map(m => m.type);
  assert.ok(types.includes('pre-round'));
  assert.ok(types.includes('format-rules'));
  assert.ok(types.includes('pairings'));
  assert.ok(types.includes('schedule'));
  const hero = mods.find(m => m.type === 'pre-round');
  assert.equal(hero.round, 'R1');
  assert.ok(hero.courseName && hero.formatLabel);
  assert.equal(hero.teeTime, 'Loop 1 10:00 AM · Loop 2 12:36 PM'); // updated tee times
  // Cart pairings surface on the pre-round pairings stage (R1: John+TJ, Mike solo).
  const pairing = mods.find(m => m.type === 'pairings');
  assert.ok(Array.isArray(pairing.carts) && pairing.carts.length === 2);
  assert.deepEqual(pairing.carts.map(c => c.map(p => p.name)), [['John', 'TJ'], ['Mike']]);
});

test('broadcastModules live: leaderboard/money/format/on-course carry logos', () => {
  const w = loadWithSeed();
  const P = w.BottomLineProvider;
  const now = Date.now();
  const facts = P.computeFacts({ docs: [egtDoc(w, 'R2', throughFill({ john: 0, brian: 1, tj: 1, mike: 2 }, 9), { now }).doc], trips: [], players: [], now });
  const mods = P.broadcastModules(facts, 'live');
  const lb = mods.find(m => m.type === 'live-leaderboard');
  assert.ok(lb, 'leaderboard module present');
  assert.equal(lb.lines[0].name, 'John');
  assert.ok(/players\/john/.test(lb.lines[0].logo));
  assert.ok(mods.some(m => m.type === 'live-money'));
  assert.ok(mods.some(m => m.type === 'on-course'));
});

test('broadcastModules post: SportsCenter recap, player cards, stat pages', () => {
  const w = loadWithSeed();
  const P = w.BottomLineProvider;
  const now = Date.now();
  const doc = egtDoc(w, 'R2', (pid, k, i, hole) => hole.par + (pid === 'john' || pid === 'brian' ? 2 : 0), { ts: now - 8 * 3600 * 1000 }).doc;
  // add FIR/GIR so stat pages populate
  doc.liveScores.firData = {}; doc.liveScores.girData = {};
  const facts = P.computeFacts({ docs: [doc], trips: [], players: [], now });
  const mods = P.broadcastModules(facts, 'post');
  const types = mods.map(m => m.type);
  assert.ok(types.includes('standings'));
  assert.ok(types.includes('round-recap'));
  assert.ok(types.includes('player-of-round'));
  assert.equal(mods.filter(m => m.type === 'player-card').length, 4, 'a card per player');
  assert.ok(types.includes('stat-leaderboard'));
  const recap = mods.find(m => m.type === 'round-recap');
  assert.ok(['TJ', 'Mike'].includes(recap.winner.name));
  assert.ok(/players\//.test(recap.winner.logo));
  // player cards carry the alias + logo identity
  const card = mods.find(m => m.type === 'player-card');
  assert.ok(card.player.alias && card.player.logo);
});

test('broadcastModules post: Skins King and Birdie King leader pages surface', () => {
  const w = loadWithSeed();
  const P = w.BottomLineProvider;
  const now = Date.now();
  // Mike outright low on every hole → he sweeps the gross skins pot.
  const doc = egtDoc(w, 'R2', throughFill({ john: 2, brian: 2, tj: 1, mike: 0 }, 18), { ts: now - 8 * 3600 * 1000 }).doc;
  const facts = P.computeFacts({ docs: [doc], trips: [], players: [], now });
  const mods = P.broadcastModules(facts, 'post');
  const skins = mods.find(m => m.id === 'stat-skins');
  assert.ok(skins, 'Skins King race page present');
  assert.equal(skins.rows[0].name, 'Mike');
  const birdies = mods.find(m => m.id === 'stat-netbirdies');
  assert.ok(birdies, 'Birdie King (net) race page present');
});

test('aggregateEgtStats sums per player across EGT rounds', () => {
  const w = loadWithSeed();
  const P = w.BottomLineProvider;
  const now = Date.now();
  const facts = P.computeFacts({ docs: [egtDoc(w, 'R2', throughFill({ john: 1, brian: 1, tj: 1, mike: 1 }, 18), { now }).doc], trips: [], players: [], now });
  const agg = P.aggregateEgtStats(facts.rounds);
  assert.equal(agg.length, 4);
  agg.forEach(a => { assert.equal(a.rounds, 1); assert.equal(a.holes, 18); assert.ok(a.scoringAvg > 0); });
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
