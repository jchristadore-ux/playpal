// EGT tournament engine tests — the seed §8 acceptance suite plus unit coverage
// of the allocation rule, calculators, money zero-sum, SI-gap handling, and
// standings. The seed fixture is the golden reference throughout.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlayPal } from './helpers/load.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = JSON.parse(readFileSync(join(root, 'fixtures/egt-2026-seed.json'), 'utf8'));
const W = loadPlayPal();
const { EgtHandicap, EgtImporter, EgtScoring, EgtPoints, EgtMoney, EgtSideGames, EgtStandings, EgtStore, EgtEngine } = W;

const jeq = (a,b,msg)=>assert.equal(JSON.stringify(a),JSON.stringify(b),msg);
 const holesOf = pops => (pops || []).map(p => p.hole);
const freshModel = () => EgtImporter.importSeed(JSON.parse(JSON.stringify(SEED)));

// ── §2 core rule ────────────────────────────────────────────────────────────
test('roundHalfUp is standard half-up', () => {
  assert.equal(EgtHandicap.roundHalfUp(2.5), 3);
  assert.equal(EgtHandicap.roundHalfUp(2.49), 2);
  assert.equal(EgtHandicap.roundHalfUp(13.06), 13);
});

test('allocatePops distributes by SI with a 2nd stroke past 18', () => {
  const holes = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, si: i + 1 }));
  const nine = EgtHandicap.allocatePops(9, holes);
  jeq(holesOf(nine), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const twentyThree = EgtHandicap.allocatePops(23, holes); // base 1 + extra 5
  assert.equal(twentyThree.find(p => p.hole === 3).strokes, 2);
  assert.equal(twentyThree.find(p => p.hole === 6).strokes, 1);
  assert.equal(twentyThree.length, 18);
});

test('allocatePops returns null when any SI is pending', () => {
  const holes = [{ hole: 1, si: null }, { hole: 2, si: 2 }];
  assert.equal(EgtHandicap.allocatePops(5, holes), null);
});

test('isPermutation validates 1..n exactly once', () => {
  assert.equal(EgtHandicap.isPermutation([1, 2, 3], 3), true);
  assert.equal(EgtHandicap.isPermutation([1, 2, 2], 3), false);
  assert.equal(EgtHandicap.isPermutation([1, 2, 3, 4], 3), false);
  assert.equal(EgtHandicap.isPermutation([0, 1, 2], 3), false);
});

// ── §8 course handicaps (seed White-tee values are authoritative) ───────────
test('§8 course handicaps match the seed (White tees)', () => {
  const m = freshModel();
  // R2 Ballyowen — seed White: 13/18/23/23 (seed is the single source of truth).
  jeq(m.derived.R2.courseHandicaps, { john: 13, brian: 18, tj: 23, mike: 23 });
  // R6 Black Bear — 16/22/27/27, matching §8 exactly.
  jeq(m.derived.R6.courseHandicaps, { john: 16, brian: 22, tj: 27, mike: 27 });
  // R4 Crystal Springs — 17/22/28/28.
  jeq(m.derived.R4.courseHandicaps, { john: 17, brian: 22, tj: 28, mike: 28 });
});

test('two-loop 9s produce 18-hole-equivalent course handicaps', () => {
  const m = freshModel();
  jeq(m.derived.R1.courseHandicaps, { john: 14, tj: 23, mike: 23 }); // Minerals ×2
  jeq(m.derived.R5.courseHandicaps, { john: 17, brian: 22, tj: 28, mike: 28 }); // Cascades ×2
});

// ── §8 the golden proof: reproduce EVERY seed allocation from scratch ───────
test('§8 GOLDEN: every strokeAllocations[*].holes array reproduces from the SI rule', () => {
  const m = freshModel();
  let checks = 0;
  for (const round of m.rounds) {
    const seedAlloc = SEED.strokeAllocations[round.id];
    for (const pid of round.players) {
      const derived = m.derived[round.id].allocations[pid].games;
      for (const gk of Object.keys(seedAlloc[pid].games)) {
        const want = seedAlloc[pid].games[gk];
        assert.equal(derived[gk].strokes, want.strokes, `${round.id}/${pid}/${gk} strokes`);
        jeq(
          (derived[gk].holes || []).map(h => ({ hole: h.hole, strokes: h.strokes })),
          (want.holes || []).map(h => ({ hole: h.hole, strokes: h.strokes })),
          `${round.id}/${pid}/${gk} holes`);
        checks++;
      }
    }
  }
  assert.ok(checks >= 40, `expected many golden checks, ran ${checks}`);
});

test('§8 R2 four-ball pops match the callout', () => {
  const m = freshModel();
  const g = m.derived.R2.allocations;
  jeq(holesOf(g.brian.games.fourBallMatch.holes), [3, 7, 14, 16]);
  jeq(holesOf(g.tj.games.fourBallMatch.holes), [3, 5, 7, 8, 9, 13, 14, 16, 18]);
  jeq(g.john.games.fourBallMatch.holes, []);
});

test('§8 R6 Stableford pops: John skips 5 & 11; TJ/Mike 2nd on SI1-9; Brian 2nd on SI1-4', () => {
  const m = freshModel();
  const g = m.derived.R6.allocations;
  jeq(holesOf(g.john.games.stableford.holes), [1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18]);
  // TJ: all 18, strokes 2 exactly on the nine holes with SI 1..9.
  const course = m.courses.blackbear;
  const si = h => course.holes.find(x => x.hole === h).si;
  g.tj.games.stableford.holes.forEach(p => {
    assert.equal(p.strokes, si(p.hole) <= 9 ? 2 : 1, `TJ hole ${p.hole}`);
  });
  assert.equal(g.tj.games.stableford.holes.length, 18);
  g.brian.games.stableford.holes.forEach(p => {
    assert.equal(p.strokes, si(p.hole) <= 4 ? 2 : 1, `Brian hole ${p.hole}`);
  });
});

// ── §6 SI-gap handling ──────────────────────────────────────────────────────
test('§6 gap: clearing Crystal Springs SI leaves R4 counts but pending pops, then refills', () => {
  const m = freshModel();
  EgtImporter.clearStrokeIndex(m, 'crystalsprings');
  const tj = m.derived.R4.allocations.tj.games.teamStableford;
  assert.equal(tj.strokes, 24, 'stroke count still known while SI pending');
  assert.equal(tj.holes, null, 'holes resolve to pending (null)');
  assert.equal(tj.pending, true);
  assert.equal(m.courses.crystalsprings.strokeIndexVerified, false);

  // Invalid SI is rejected.
  assert.throws(() => EgtImporter.enterStrokeIndex(m, 'crystalsprings', [1, 2, 3]), /permutation/);
  const bad = SEED.courseLibrary.crystalsprings.holes.map(h => h.si); bad[0] = bad[1];
  assert.throws(() => EgtImporter.enterStrokeIndex(m, 'crystalsprings', bad), /permutation/);

  // Enter the real card SI → pops repopulate with no other change.
  const goodSi = SEED.courseLibrary.crystalsprings.holes.map(h => h.si);
  EgtImporter.enterStrokeIndex(m, 'crystalsprings', goodSi);
  const tj2 = m.derived.R4.allocations.tj.games.teamStableford;
  assert.equal(tj2.pending, false);
  jeq(
    tj2.holes.map(h => ({ hole: h.hole, strokes: h.strokes })),
    SEED.strokeAllocations.R4.tj.games.teamStableford.holes.map(h => ({ hole: h.hole, strokes: h.strokes })));
});

test('§6 gap: two-loop 9 accepts a 9-value SI and derives the 18-hole interleave', () => {
  const m = freshModel();
  EgtImporter.clearStrokeIndex(m, 'minerals');
  assert.equal(m.derived.R1.allocations.tj.games.nines.holes, null);
  // Enter the card's 9-hole SI (loop-1 holes' 9-hole values, in hole order 1..9).
  const nineSi = SEED.courseLibrary.minerals.holes.slice(0, 9).map(h => EgtHandicap.nineHoleSi(h.si));
  EgtImporter.enterStrokeIndex(m, 'minerals', nineSi);
  assert.equal(m.courses.minerals.strokeIndexVerified, true);
  jeq(
    holesOf(m.derived.R1.allocations.tj.games.nines.holes),
    holesOf(SEED.strokeAllocations.R1.tj.games.nines.holes));
});

// ── calculators ─────────────────────────────────────────────────────────────
test('Nines splits 9 pts by net with tie pooling', () => {
  const m = freshModel();
  const round = m.rounds.find(r => r.id === 'R1');
  const scores = {};
  round.players.forEach(pid => { scores[pid] = {}; for (let h = 10; h <= 18; h++) scores[pid][h] = { gross: 4 }; });
  // Make john clearly best on hole 10, tj & mike tie behind.
  scores.john[10] = { gross: 3 };
  const ctx = { players: round.players.map(id => m.playersById[id]), scores, alloc: m.derived.R1.allocations, course: m.courses.minerals, config: m.formatConfigs.R1 };
  const r = EgtScoring.nines(ctx);
  const h10 = r.perHole.find(x => x.hole === 10);
  // john net best → 5; tj & mike share (3+1)/2 = 2 each.
  assert.equal(h10.points.john, 5);
  assert.equal(h10.points.tj, 2);
  assert.equal(h10.points.mike, 2);
});

test('match-play engine reports closeout margin', () => {
  const holes = Array.from({ length: 18 }, (_, i) => i + 1);
  const a = { name: 'A', ballNet: h => (h <= 5 ? 3 : 5) };
  const b = { name: 'B', ballNet: () => 5 };
  const r = EgtScoring.playMatch(holes, a, b);
  assert.equal(r.winner, 'A');
  assert.equal(r.up, 5);
  assert.equal(r.label, '5&4');
});

test('skins carry over on a tie and pay the next outright low', () => {
  const players = [{ id: 'a' }, { id: 'b' }];
  const scores = { a: {}, b: {} };
  for (let h = 1; h <= 18; h++) { scores.a[h] = { gross: 4 }; scores.b[h] = { gross: 4 }; }
  scores.a[3] = { gross: 3 }; // a wins hole 3 outright, carrying holes 1-2
  const r = EgtScoring.skins({ players, scores, alloc: {} });
  const h3 = r.gross.perHole.find(x => x.hole === 3);
  assert.equal(h3.winner, 'a');
  assert.equal(h3.value, 3); // 1 + 2 carried
});

test('Stableford points table maps net-to-par correctly', () => {
  assert.equal(EgtScoring.stablefordPoints(-2), 4);
  assert.equal(EgtScoring.stablefordPoints(-1), 3);
  assert.equal(EgtScoring.stablefordPoints(0), 2);
  assert.equal(EgtScoring.stablefordPoints(1), 1);
  assert.equal(EgtScoring.stablefordPoints(2), 0);
});

// ── money zero-sum (§8) ─────────────────────────────────────────────────────
function fillPlausibleScores(m, state) {
  m.rounds.forEach(round => {
    const course = m.courses[round.courseId];
    state.scores[round.id] = {};
    round.players.forEach((pid, i) => {
      state.scores[round.id][pid] = {};
      course.holes.slice(0, 18).forEach(h => {
        state.scores[round.id][pid][h.hole] = { gross: h.par + ((h.hole + i) % 3), putts: 2, fir: (h.hole % 2 === 0), gir: (h.hole % 3 === 0) };
      });
    });
  });
  // R1 needs BBB events; R5 needs team gross; provide minimal ones.
  state.events.bbb.R1 = [{ hole: 1, bingo: 'john', bango: 'tj', bongo: 'mike' }];
  state.events.wolf.R3 = [{ hole: 1, wolf: 'tj', mode: 'lone' }, { hole: 2, wolf: 'mike', mode: 'pair', partner: 'brian' }];
  state.events.scrambleGross.R5 = { 'Team 1': {}, 'Team 2': {} };
  state.events.altShotGross.R5 = { 'Team 1': {}, 'Team 2': {} };
  for (let h = 1; h <= 9; h++) { state.events.scrambleGross.R5['Team 1'][h] = 4; state.events.scrambleGross.R5['Team 2'][h] = 5; }
  for (let h = 10; h <= 18; h++) { state.events.altShotGross.R5['Team 1'][h] = 4; state.events.altShotGross.R5['Team 2'][h] = 5; }
  state.events.ctp = [{ round: 'R2', hole: 4, player: 'john' }];
  state.events.longDrive = [{ round: 'R3', hole: 3, player: 'mike' }];
}

test('§8 money: every finalized round nets to $0', () => {
  const m = freshModel();
  const state = EgtStore.emptyState(m.trip.id);
  state.model = m;
  fillPlausibleScores(m, state);
  m.rounds.forEach(r => state.finalized.push(r.id));
  const live = EgtEngine.liveUpdate(state, { noPersist: true });
  Object.values(live.money.rounds).forEach(rm => {
    if (!rm.total) return;
    const sum = Object.values(rm.total).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum) < 1e-6, `round money must net zero, got ${sum}`);
  });
  const grand = Object.values(live.money.total).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(grand) < 1e-6, `total money must net zero, got ${grand}`);
});

// ── standings + reseed ──────────────────────────────────────────────────────
test('leaderboard ranks by points then tiebreakers; R6 reseeds 1v2 / 3v4', () => {
  const m = freshModel();
  const points = { john: { total: 10 }, brian: { total: 8 }, tj: { total: 12 }, mike: { total: 8 } };
  const board = EgtStandings.leaderboard(m, points, { r6Stableford: { brian: 5, mike: 3 } });
  assert.equal(board[0].player, 'tj');   // 12
  assert.equal(board[1].player, 'john'); // 10
  assert.equal(board[2].player, 'brian'); // 8, wins tie on R6 stableford
  assert.equal(board[3].player, 'mike');
  const pairings = EgtStandings.reseedR6(board);
  jeq(pairings[0], { a: 'tj', b: 'john', tier: 'Championship', seeds: [1, 2] });
  jeq(pairings[1], { a: 'brian', b: 'mike', tier: 'Bronze', seeds: [3, 4] });
});

test('withDeltas flags movement vs the prior snapshot', () => {
  const m = freshModel();
  const prev = { standings: [{ player: 'john', rank: 1 }, { player: 'tj', rank: 2 }] };
  const cur = [{ player: 'tj', name: 'TJ', rank: 1 }, { player: 'john', name: 'John', rank: 2 }];
  const withD = EgtStandings.withDeltas(cur, prev);
  assert.equal(withD[0].direction, 'up');
  assert.equal(withD[0].move, 1);
  assert.equal(withD[1].direction, 'down');
});

// ── importer idempotency ────────────────────────────────────────────────────
test('import is idempotent by trip id and preserves entered scores', () => {
  const state1 = EgtStore.importSeed(JSON.parse(JSON.stringify(SEED)));
  EgtStore.setHoleScore(state1, 'R2', 'john', 1, { gross: 4 });
  const state2 = EgtStore.importSeed(JSON.parse(JSON.stringify(SEED)));
  assert.equal(state2.scores.R2.john[1].gross, 4, 'entered score survives re-import');
  EgtStore.reset(SEED.trip.id);
});
