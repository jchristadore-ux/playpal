import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const W = loadPlayPal();
const ME = W.MatchEngine;

// slope 113 / rating 72 / par 72 → course handicap == index.
const course = {
  id: 't', name: 'Test', rating: 72, slope: 113,
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, yds: 400, hdcp: i + 1 })),
};
const A = { id: 'a', name: 'Al', handicap: 0, color: '#1' };
const B = { id: 'b', name: 'Bo', handicap: 0, color: '#2' };
const C = { id: 'c', name: 'Cy', handicap: 0, color: '#3' };
const D = { id: 'd', name: 'Dee', handicap: 0, color: '#4' };
const players = [A, B, C, D];
const fill = (n) => Array(18).fill(n);
const game = (cfg = {}) => ({ formatId: 'sixesRoundRobin', config: { ...ME.defaultConfig('sixesRoundRobin', players), ...cfg } });
const run = (g, scores, extra = {}) => {
  const raw = { course, players, scores, ...extra };
  const res = ME.compute(g, raw);
  return { res, pay: ME.payouts(g, raw, res) };
};
const sum = (m) => Object.values(m).reduce((a, b) => a + b, 0);

test('sixesRR: registered as a 4-player team format with rotation settlement', () => {
  const f = ME.list().find(x => x.id === 'sixesRoundRobin');
  assert.ok(f);
  assert.equal(f.settlement, 'rotation');
  assert.deepEqual({ ...f.players }, { min: 4, max: 4 });
  assert.equal(ME.validateGame(game(), players).ok, true);
  assert.equal(ME.validateGame(game(), [A, B, C]).ok, false);
  assert.equal(ME.validateGame(game({ pairingOrder: [0, 0, 1] }), players).ok, false);
});

test('sixesRR: rotation — everyone partners everyone exactly once; order is reorderable', () => {
  const rot = ME.sixesRotation(['a', 'b', 'c', 'd']);
  assert.deepEqual(JSON.parse(JSON.stringify(rot)), [[['a', 'b'], ['c', 'd']], [['a', 'c'], ['b', 'd']], [['a', 'd'], ['b', 'c']]]);
  const partners = {};
  rot.forEach(seg => seg.forEach(([x, y]) => {
    (partners[x] = partners[x] || []).push(y);
    (partners[y] = partners[y] || []).push(x);
  }));
  for (const id of ['a', 'b', 'c', 'd']) assert.equal(new Set(partners[id]).size, 3, id + ' partners 3 different players');
  const re = ME.sixesRotation(['a', 'b', 'c', 'd'], [2, 0, 1]);
  assert.deepEqual(JSON.parse(JSON.stringify(re[0])), [['a', 'd'], ['b', 'c']]);
  assert.deepEqual(JSON.parse(JSON.stringify(re[2])), [['a', 'c'], ['b', 'd']]);
  // Bad order falls back to default.
  assert.deepEqual(JSON.parse(JSON.stringify(ME.sixesRotation(['a', 'b', 'c', 'd'], [1, 1, 1]))), JSON.parse(JSON.stringify(rot)));
});

test('sixesRR: three independent 6-hole matches, closeouts, per-match stakes, zero-sum', () => {
  // Al birdies holes 1–4 → AB beat CD in M1 4&2. M2 (AC v BD): Bo birdies 7,8 → BD 2 UP, then all par → BD win 2 UP.
  // M3 (AD v BC): all par → halved.
  const s = { a: fill(4), b: fill(4), c: fill(4), d: fill(4) };
  [0, 1, 2, 3].forEach(i => { s.a[i] = 3; });
  [6, 7].forEach(i => { s.b[i] = 3; });
  const g = game({ scoringBasis: 'gross', stake: 5, matchStakes: [null, 10, null] });
  const { res, pay } = run(g, s);
  assert.equal(res.kind, 'rotation');
  assert.equal(res.matches.length, 3);
  const [m1, m2, m3] = res.matches;
  assert.equal(m1.range, '1–6');
  assert.equal(m1.winnerIdx, 0);
  assert.equal(m1.result, '4&2');
  assert.equal(m1.played, 4, 'closed out after 4 holes');
  assert.equal(m2.range, '7–12');
  assert.equal(m2.winnerIdx, 1);
  assert.equal(m2.stake, 10);
  assert.equal(m3.halved, true);
  assert.equal(res.complete, true);
  // perPlayer: M1 a,b +5 / c,d −5; M2 b,d +10 / a,c −10; M3 push.
  assert.deepEqual({ ...pay }, { a: -5, b: 15, c: -15, d: 5 });
  assert.equal(sum(pay), 0);
  assert.equal(res.entries.find(e => e.id === 'b').totalLabel, '2-0-1');
});

test('sixesRR: eachOpponent payout doubles the 2v2 money; halved matches push', () => {
  const s = { a: fill(4), b: fill(4), c: fill(4), d: fill(4) };
  s.a[0] = 3;               // AB win M1 1 UP
  const g = game({ scoringBasis: 'gross', stake: 2, payout: 'eachOpponent' });
  const { res, pay } = run(g, s);
  assert.equal(res.matches[0].winnerIdx, 0);
  assert.equal(res.matches[0].result, '1 UP');
  assert.equal(res.matches[1].halved, true);
  assert.equal(res.matches[2].halved, true);
  assert.deepEqual({ ...pay }, { a: 4, b: 4, c: -4, d: -4 });
});

test('sixesRR: pops off the low man decide holes (net best ball) and are exposed per match', () => {
  // Dee is a 6 → with everyone else scratch, gets a pop on SI 1–6 (holes 1–6).
  const dee = { ...D, handicap: 6 };
  const ps = [A, B, C, dee];
  const s = { a: fill(4), b: fill(4), c: fill(4), d: fill(4) };
  [0, 1, 2].forEach(i => { s.d[i] = 4; });   // Dee net 3 on holes 1–3 → CD win 3 holes
  const g = { formatId: 'sixesRoundRobin', config: { ...ME.defaultConfig('sixesRoundRobin', ps), stake: 1 } };
  const raw = { course, players: ps, scores: s };
  const res = ME.compute(g, raw);
  const m1 = res.matches[0];
  assert.deepEqual(m1.pops.d, [1, 1, 1, 1, 1, 1]);
  assert.deepEqual(m1.pops.a, [0, 0, 0, 0, 0, 0]);
  assert.equal(m1.winnerIdx, 1, 'CD win M1 on Dee\'s pops');
  assert.equal(res.matches[1].pops.d.every(v => v === 0), true, 'no pops on 7–12');
  // Gross basis ignores pops.
  const gross = ME.compute({ ...g, config: { ...g.config, scoringBasis: 'gross' } }, raw);
  assert.equal(gross.matches[0].halved, true);
  // Allowance setting respected: 50% → 3 pops on SI 1–3.
  const half = ME.compute({ ...g, config: { ...g.config, allowancePct: 50 } }, raw);
  assert.deepEqual(half.matches[0].pops.d, [1, 1, 1, 0, 0, 0]);
});

test('sixesRR: in-progress — half-entered hole does not count; status shows live match', () => {
  const s = { a: fill(null), b: fill(null), c: fill(null), d: fill(null) };
  s.a[0] = 3; s.b[0] = 4; s.c[0] = 4; s.d[0] = 4;
  s.a[1] = 3; s.b[1] = 4; s.c[1] = 4;          // Dee missing on 2
  const { res, pay } = run(game({ scoringBasis: 'gross', stake: 5 }), s);
  assert.equal(res.matches[0].played, 1);
  assert.equal(res.matches[0].complete, false);
  assert.match(res.status, /Now: M1/);
  assert.equal(sum(pay), 0);
  assert.equal(Object.values(pay).every(v => v === 0), true, 'nothing settles until a match is done');
});

test('sixesRR: a side that walks in concedes only matches not yet decided', () => {
  const s = { a: fill(4), b: fill(4), c: fill(4), d: fill(4) };
  // Cy and Dee both leave after 8 holes. M1 (AB v CD) was halved over 1–6.
  // M2 (AC v BD): Cy gone but Al plays on; Dee gone but Bo plays on → continues.
  // M3 (AD v BC): Dee gone, Al plays; Cy gone, Bo plays → continues. All par → halved.
  const drop = { c: { thru: 8 }, d: { thru: 8 } };
  const { res } = run(game({ scoringBasis: 'gross', stake: 5 }), s, { dropouts: drop });
  assert.equal(res.matches[0].halved, true, 'M1 keeps its result');
  assert.equal(res.matches[1].complete, true);
  // Now both of one side leave: C and D gone in M1 before it finishes.
  const drop2 = { c: { thru: 3 }, d: { thru: 3 } };
  const { res: r2, pay } = run(game({ scoringBasis: 'gross', stake: 5 }), s, { dropouts: drop2 });
  assert.equal(r2.matches[0].conceded, true);
  assert.equal(r2.matches[0].winnerIdx, 0);
  assert.equal(pay.a, 5); assert.equal(pay.c, -5);
});

test('sixesRR: settles through calcRoundPayouts with per-match stakes and a zero base stake', () => {
  const s = { a: fill(4), b: fill(4), c: fill(4), d: fill(4) };
  s.a[0] = 3;
  const g = { id: 'g1', ...game({ scoringBasis: 'gross', stake: 0, matchStakes: [7, null, null] }) };
  assert.equal(ME.hasStake(g), true);
  assert.equal(ME.stakeLabel(g), '$7/$0/$0');
  assert.equal(ME.stakeLabel(game({ stake: 5 })), '$5 ×3');
  const round = { players, course, formats: [], games: [g] };
  const money = W.calcRoundPayouts(round, { scores: s });
  assert.deepEqual({ ...money }, { a: 7, b: 7, c: -7, d: -7 });
});
