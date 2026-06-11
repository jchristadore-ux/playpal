import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const W = loadPlayPal();

const courseStub = {
  name: 'Test Course',
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hdcp: i + 1 })),
};
const players = [
  { id: 'a', name: 'Alice', handicap: 0 },
  { id: 'b', name: 'Bob', handicap: 0 },
  { id: 'c', name: 'Cara', handicap: 0 },
  { id: 'd', name: 'Dan', handicap: 0 },
];

test('built-in engine regression suite passes (runPlayPalTests)', () => {
  const result = W.runPlayPalTests();
  assert.equal(result.fail, 0, `${result.fail} built-in engine tests failed`);
  assert.ok(result.pass > 0, 'built-in suite ran no tests');
});

test('scoreName classifies every score relative to par', () => {
  assert.equal(W.scoreName(2, 4).label, 'Eagle');
  assert.equal(W.scoreName(3, 4).label, 'Birdie');
  assert.equal(W.scoreName(4, 4).label, 'Par');
  assert.equal(W.scoreName(5, 4).label, 'Bogey');
  assert.equal(W.scoreName(6, 4).label, 'Double');
  assert.equal(W.scoreName(8, 4).label, '+4');
  assert.equal(W.scoreName(2, 5).label, 'Albatross');
});

test('calcStablefordPoints follows the 5/3/2/1/0 scale', () => {
  assert.equal(W.calcStablefordPoints(2, 4), 5);  // eagle
  assert.equal(W.calcStablefordPoints(3, 4), 3);  // birdie
  assert.equal(W.calcStablefordPoints(4, 4), 2);  // par
  assert.equal(W.calcStablefordPoints(5, 4), 1);  // bogey
  assert.equal(W.calcStablefordPoints(6, 4), 0);  // double+
  assert.equal(W.calcStablefordPoints(0, 4), 0);  // no score yet
});

test('getHoleStrokes distributes handicap strokes by hole index', () => {
  assert.equal(W.getHoleStrokes(0, 1), 0);
  assert.equal(W.getHoleStrokes(9, 9), 1);   // 9 strokes on hdcp 1-9
  assert.equal(W.getHoleStrokes(9, 10), 0);
  assert.equal(W.getHoleStrokes(18, 18), 1); // a stroke on every hole
  assert.equal(W.getHoleStrokes(20, 2), 2);  // 18+2: two strokes on hdcp 1-2
  assert.equal(W.getHoleStrokes(20, 3), 1);
});

test('getAdjustedHoleScore subtracts pops and never returns below 1', () => {
  const scores = { a: [4, 1] };
  assert.equal(W.getAdjustedHoleScore(scores, {}, 'a', 0), 4);
  assert.equal(W.getAdjustedHoleScore(scores, { a: { 0: true } }, 'a', 0), 3);
  assert.equal(W.getAdjustedHoleScore(scores, { a: { 1: true } }, 'a', 1), 1);
  assert.equal(W.getAdjustedHoleScore(scores, {}, 'missing', 0), 0);
});

test('generateSyncCode emits unambiguous uppercase codes', () => {
  for (let i = 0; i < 50; i++) {
    const code = W.generateSyncCode();
    assert.match(code, /^[A-Z0-9]{4,12}$/);
  }
});

test('calcSkins awards carryovers and zero-sum payouts', () => {
  // Bob wins hole 1 outright; everything else ties.
  const scores = {
    a: Array(18).fill(4), b: Array(18).fill(4),
    c: Array(18).fill(4), d: Array(18).fill(4),
  };
  scores.b = [...scores.b];
  scores.b[0] = 3;
  const { skins, payouts } = W.calcSkins(scores, players, courseStub, 5, {});
  assert.equal(skins.b, 1);
  assert.equal(skins.a + skins.c + skins.d, 0);
  const sum = Object.values(payouts).reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(sum) < 1e-9, 'skins payouts must be zero-sum');
  assert.ok(payouts.b > 0);
});

test('skins carry over after a tied hole', () => {
  const scores = {
    a: Array(18).fill(4), b: Array(18).fill(4),
    c: Array(18).fill(4), d: Array(18).fill(4),
  };
  // hole 1 ties; Cara wins hole 2 → worth 2 skins (1 + carryover)
  scores.c = [...scores.c];
  scores.c[1] = 3;
  const { skins } = W.calcSkins(scores, players, courseStub, 5, {});
  assert.equal(skins.c, 2);
});

test('getWolfForHole rotates through the player list', () => {
  assert.equal(W.getWolfForHole(players, 0).id, 'a');
  assert.equal(W.getWolfForHole(players, 3).id, 'd');
  assert.equal(W.getWolfForHole(players, 4).id, 'a');
});

test('resolveWolfHole: lone wolf win earns 2 points, field earns none', () => {
  const scores = { a: [3], b: [5], c: [5], d: [5] };
  const r = W.resolveWolfHole(scores, 0, 'a', null, true, players);
  assert.equal(r.wolfWins, true);
  assert.equal(r.deltas.a, 2);
  assert.equal(r.deltas.b + r.deltas.c + r.deltas.d, 0);
});

test('resolveWolfHole: field beats the lone wolf', () => {
  const scores = { a: [6], b: [3], c: [4], d: [5] };
  const r = W.resolveWolfHole(scores, 0, 'a', null, true, players);
  assert.equal(r.otherWins, true);
  assert.equal(r.deltas.a, 0);
  assert.ok(r.deltas.b >= 1, 'best opponent scores a point');
});

test('totalScore sums only entered holes', () => {
  const scores = { a: [4, 5, null, 3] };
  assert.equal(W.totalScore(scores, 'a'), 12);
  assert.equal(W.totalScore(scores, 'nobody'), 0);
});

test('calcBBBStandings tallies bingo/bango/bongo points', () => {
  const bbb = { 0: { confirmed: true, bingo: 'a', bango: 'b', bongo: 'a' } };
  const standings = W.calcBBBStandings(bbb, players);
  assert.equal(standings.a.total, 2);
  assert.equal(standings.b.total, 1);
  assert.equal(standings.c.total, 0);
});

test('calcTeeBallStandings counts hole winners', () => {
  const tee = {
    0: { confirmed: true, winner: 'a' },
    1: { confirmed: true, winner: 'a' },
    2: { confirmed: true, winner: 'b' },
    3: { confirmed: true, winner: null },
  };
  const pts = W.calcTeeBallStandings(tee, players);
  assert.equal(pts.a, 2);
  assert.equal(pts.b, 1);
  assert.equal(pts.c, 0);
});

test('FORMAT_INFO covers every format constant', () => {
  for (const key of Object.values(W.FORMATS ?? {})) {
    assert.ok(W.FORMAT_INFO?.[key], `FORMAT_INFO missing entry for ${key}`);
  }
});
