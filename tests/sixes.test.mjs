// Sixes: three 6-hole 2v2 matches, partners rotate (AB v CD, AC v BD, AD v BC),
// best net ball per side, match play per segment, $stake per match per player.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const jeq = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

const W = loadPlayPal();
const ME = W.MatchEngine;
const P = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, name: id.toUpperCase() + 'name', handicap: 0, color: '#000' }));
const flat18 = { id: 'f', name: 'Flat', rating: 72, slope: 113, holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hdcp: i + 1 })) };
const fill = (v, n = 18) => Array(n).fill(v);
const run = (scores, opts = {}) => {
  const game = { id: 'g', formatId: 'sixes', config: { scoringBasis: opts.basis || 'gross', allowancePct: 100, relative: true, stake: opts.stake ?? 5 } };
  const raw = { course: opts.course || flat18, players: opts.players || P, scores, startingTee: opts.startingTee || 1, gameState: {} };
  const res = ME.compute(game, raw);
  return { res, pay: ME.payouts(game, raw, res) };
};

test('rotation pairings and segment boundaries (18 holes)', () => {
  const { res } = run({ a: fill(4), b: fill(4), c: fill(4), d: fill(4) });
  const m = res.matches;
  jeq(m.map(x => x.sides.map(s => s.playerIds.join(''))), [['ab', 'cd'], ['ac', 'bd'], ['ad', 'bc']]);
  jeq(m.map(x => x.range), ['1–6', '7–12', '13–18']);
  jeq(m.map(x => x.holes), [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11], [12, 13, 14, 15, 16, 17]]);
});

test('starting on 10: segments follow play order', () => {
  const { res } = run({ a: fill(4), b: fill(4), c: fill(4), d: fill(4) }, { startingTee: 10 });
  jeq(res.matches.map(x => x.range), ['10–15', '16–3', '4–9']);
});

test('all halved → three halved matches, $0 each, 0-0-3', () => {
  const { res, pay } = run({ a: fill(4), b: fill(4), c: fill(4), d: fill(4) });
  res.matches.forEach(m => assert.equal(m.status, 'Halved'));
  jeq(pay, { a: 0, b: 0, c: 0, d: 0 });
  res.entries.forEach(e => { assert.equal(e.detail, '0-0-3 (W-L-H)'); assert.equal(e.totalLabel, '$0'); });
});

test('best ball counts; a side waits until both partners have posted', () => {
  // Hole 1: A 5, B 3 (AB best 3) v C 4, D 4 → AB wins.
  const s = { a: [5, ...fill(4, 17)], b: [3, ...fill(4, 17)], c: fill(4), d: fill(4) };
  let { res } = run(s);
  assert.equal(res.matches[0].perHole[0].winner, 0);
  // Missing C on hole 2 → the hole isn't scored yet.
  const s2 = { a: [4, 4, null], b: [3, 4, null], c: [4, null, null], d: [4, 4, null] };
  ({ res } = run(s2));
  assert.equal(res.matches[0].played, 1);
  assert.equal(res.matches[0].status, 'Aname & Bname 1 UP thru 1');
});

test('best NET ball uses the shared pops (off the low)', () => {
  // D gets 1 pop → SI 1 = hole 1 on this card. D's 5 nets 4 = halve with A's 4.
  const players = P.map(p => (p.id === 'd' ? { ...p, handicap: 1 } : p));
  const s = { a: fill(4), b: fill(5), c: fill(5), d: [5, ...fill(5, 17)] };
  const { res } = run(s, { basis: 'net', players });
  assert.equal(res.matches[0].perHole[0].winner, null, 'hole 1 halved on the pop');
  assert.equal(res.matches[0].perHole[1].winner, 0, 'hole 2 no pop → AB wins');
});

test('close-out: 4&2 ends the match early; later holes ignored', () => {
  const s = { a: fill(3), b: fill(5), c: fill(5), d: fill(5) };
  const { res } = run(s);
  const m = res.matches[0];
  assert.equal(m.status, 'Aname & Bname won 4&2');
  assert.equal(m.played, 4);
});

test('in progress: UP / dormie / all square status, no money until decided', () => {
  const s = { a: [3, 3, 4, 4], b: fill(5, 4), c: fill(5, 4), d: [5, 5, 4, 4] };
  const { res, pay } = run(s);
  assert.equal(res.matches[0].status, 'Aname & Bname 2 UP thru 4 (dormie)');
  jeq(pay, { a: 0, b: 0, c: 0, d: 0 });
  assert.match(res.status, /^M1 \(holes 1–6\): Aname & Bname 2 UP thru 4/);
});

test('$ settlement: winners +stake, losers −stake per match; totals and record', () => {
  // M1 AB win (A birdies), M2 AC v BD halved, M3 BC beat AD (B birdies 13-18).
  const a = [...fill(3, 6), ...fill(4, 12)];
  const b = [...fill(5, 6), ...fill(4, 6), ...fill(3, 6)];
  const { res, pay } = run({ a, b, c: fill(5), d: fill(5) }, { stake: 5 });
  jeq(res.matches.map(m => m.result), ['4&2', 'halved', '4&2']);
  jeq(pay, { a: 0, b: 10, c: 0, d: -10 });
  const e = Object.fromEntries(res.entries.map(x => [x.id, x]));
  assert.equal(e.b.totalLabel, '+$10'); assert.equal(e.b.detail, '2-0-1 (W-L-H)');
  assert.equal(e.c.totalLabel, '$0');   assert.equal(e.c.detail, '1-1-1 (W-L-H)');
  assert.equal(e.d.totalLabel, '−$10'); assert.equal(e.d.detail, '0-2-1 (W-L-H)');
  assert.equal(Object.values(pay).reduce((x, y) => x + y, 0), 0);
  assert.equal(res.complete, true);
});

test('9-hole round: three 3-hole matches', () => {
  const nine = { ...flat18, holes: flat18.holes.slice(0, 9) };
  const { res } = run({ a: fill(3, 9), b: fill(5, 9), c: fill(5, 9), d: fill(5, 9) }, { course: nine });
  jeq(res.matches.map(m => m.range), ['1–3', '4–6', '7–9']);
  res.matches.forEach(m => assert.equal(m.result, '2&1'));
});

// ── JD's live round (Harkers Hollow, 2 Oct 2026, holes 1-6 stored scores) ──
const SI = [7, 5, 11, 1, 15, 13, 9, 3, 17, 2, 16, 8, 4, 14, 12, 18, 10, 6];
const PAR = [4, 4, 4, 5, 3, 4, 4, 4, 3, 5, 3, 4, 4, 4, 4, 3, 4, 4];
const harkers = (rating, slope) => ({ id: 'hh', name: 'Harkers Hollow', rating, slope,
  tees: [{ id: 'default', name: 'Standard', rating, slope }],
  holes: SI.map((s, i) => ({ num: i + 1, par: PAR[i], hdcp: s })) });
const jdPlayers = [
  { id: 'john', name: 'John', handicap: 19.9 }, { id: 'tj', name: 'TJ', handicap: 29.4 },
  { id: 'brian', name: 'Brian', handicap: 24.2 }, { id: 'mike', name: 'Mike', handicap: 29 },
];
const pad = a => [...a, ...fill(null, 12)];
const jdScores = {
  john: pad([4, 5, 5, 7, 3, 5]), tj: pad([6, 6, 8, 7, 7, 5]),
  brian: pad([7, 6, 7, 7, 4, 8]), mike: pad([6, 4, 6, 7, 4, 5]),
};

test('JD snapshot: old points tally 8/8/4/4 is now one 6-hole match', () => {
  const { res, pay } = run(jdScores, { basis: 'net', players: jdPlayers, course: harkers(71, 130) });
  const m1 = res.matches[0];
  assert.equal(m1.sides[0].label, 'John & TJ');
  // Round's tee (71/130): Mike gets 10 off John (SI 1-10) → W L W ½ W = 2&1.
  jeq(m1.perHole.slice(0, 5).map(h => h.winner), [0, 1, 0, null, 0]);
  assert.equal(m1.status, 'John & TJ won 2&1');
  jeq(pay, { john: 5, tj: 5, brian: -5, mike: -5 });
  assert.equal(res.matches[1].sides.map(s => s.label).join(' v '), 'John & Brian v TJ & Mike');
});

test('JD snapshot: with Mike on 11 pops (stroke on hole 3, SI 11) it is 1 UP, as JD scored it', () => {
  // Blue tee 72.3/137: Mike 11 off John → hole 3 halved → W L ½ ½ W ½ = 1 UP.
  const { res } = run(jdScores, { basis: 'net', players: jdPlayers, course: harkers(72.3, 137) });
  const m1 = res.matches[0];
  jeq(m1.perHole.map(h => h.winner), [0, 1, null, null, 0, null]);
  assert.equal(m1.status, 'John & TJ won 1 UP');
});
