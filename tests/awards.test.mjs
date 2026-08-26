// Awards — the mini-cup trophies (FLATSTICK, FIR KING, BOGEY BRO, PAR PRINCE,
// BIRDIE BRO). Each is one stat, one pot, one stake, settled through the same
// MatchEngine machinery as every other format.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const W = loadPlayPal();
const ME = W.MatchEngine;

// Par 68: fourteen par 4s and four par 3s, so FIR has exactly 14 chances.
// Rating 68 / slope 113 → course handicap === handicap index.
const PAR3 = [3, 8, 12, 17];
const course = {
  id: 'awards', name: 'Award National', location: 'Testville, NJ',
  rating: 68, slope: 113,
  holes: Array.from({ length: 18 }, (_, i) => ({
    num: i + 1, par: PAR3.includes(i + 1) ? 3 : 4, yds: 400, hdcp: i + 1,
  })),
};

const A = { id: 'a', name: 'Al Smith',  handicap: 18, color: '#111111' };
const B = { id: 'b', name: 'Bo Jones',  handicap: 20, color: '#222222' };
const C = { id: 'c', name: 'Cy Brown',  handicap: 24, color: '#333333' };
const D = { id: 'd', name: 'Dee White', handicap: 27, color: '#444444' };
const players = [A, B, C, D];

const par = (i) => course.holes[i].par;
// A full card built from a per-hole "vs par" list (repeated to 18 holes).
const card = (diffs) => Array.from({ length: 18 }, (_, i) => par(i) + diffs[i % diffs.length]);
const flat = (diff) => card([diff]);

const game = (formatId, config) => ({
  id: 'g_' + formatId, formatId,
  config: { ...ME.defaultConfig(formatId, players), ...(config || {}) },
});
const raw = (scores, stats) => ({ course, players, scores, stats: stats || {} });
const run = (g, scores, stats) => ME.compute(g, raw(scores, stats));
const money = (g, scores, stats) => ME.payouts(g, raw(scores, stats));
const sum = (pay) => Object.values(pay).reduce((a, b) => a + b, 0);
const winnerIds = (res) => (res.winner ? res.winner.ids : []);

// ── Registry ─────────────────────────────────────────────────────────────────

test('the five awards register as their own category', () => {
  const ids = Array.from(ME.AWARD_FORMAT_IDS);
  assert.deepEqual(ids, ['flatstick', 'firKing', 'bogeyBro', 'parPrince', 'birdieBro']);
  assert.ok(ME.CATEGORY_INFO.awards, 'awards category exists');
  const listed = Array.from(ME.list()).filter(f => f.category === 'awards').map(f => f.id);
  assert.deepEqual(listed.sort(), ids.slice().sort());
  ids.forEach(id => {
    const def = ME.get(id);
    assert.equal(def.settlement, 'pot', id + ' settles as its own pot');
    assert.ok(def.stakeHint, id + ' explains its stake');
  });
});

test('each award carries its own stake, so a mini cup is five separate pots', () => {
  const scores = { a: flat(0), b: flat(1), c: flat(1), d: flat(2) };
  const pars   = money(game('parPrince', { stake: 5 }), scores);
  const bogeys = money(game('bogeyBro',  { stake: 1 }), scores);
  // Al takes every par; Bo and Cy split the bogey pot.
  assert.equal(pars.a, 15);
  assert.equal(pars.d, -5);
  assert.equal(bogeys.b, 1);
  assert.equal(bogeys.c, 1);
  assert.equal(bogeys.a, -1);
  assert.equal(sum(pars), 0);
  assert.equal(sum(bogeys), 0);
});

// ── PAR PRINCE ───────────────────────────────────────────────────────────────

test('PAR PRINCE counts gross pars by default and splits a tie', () => {
  const g = game('parPrince', { stake: 2 });
  assert.equal(ME.get('parPrince').defaultBasis, 'gross');
  assert.equal(g.config.scoringBasis, 'gross');
  const scores = {
    a: card([0, 1, 1, 1, 1, 1]),   // 3 pars
    b: card([0, 1, 1, 1, 1, 1]),   // 3 pars
    c: card([1, 1, 1, 1, 1, 1]),   // 0
    d: card([2, 2, 2, 2, 2, 2]),   // 0
  };
  const res = run(g, scores);
  assert.deepEqual(winnerIds(res).sort(), ['a', 'b']);
  const pay = money(g, scores);
  assert.equal(pay.a, 2);          // two losers ante $2, split two ways
  assert.equal(pay.b, 2);
  assert.equal(pay.c, -2);
  assert.equal(sum(pay), 0);
});

test('PAR PRINCE in "par or better" mode counts birdies too', () => {
  const scores = { a: card([0, 1]), b: card([-1, 2]), c: flat(1), d: flat(2) };
  const exact = run(game('parPrince'), scores);
  assert.deepEqual(winnerIds(exact), ['a']);
  const orBetter = run(game('parPrince', { mode: 'orBetter' }), scores);
  assert.deepEqual(winnerIds(orBetter).sort(), ['a', 'b']);
});

// ── BIRDIE BRO ───────────────────────────────────────────────────────────────

test('BIRDIE BRO runs net by default, so a popped par is a birdie', () => {
  const g = game('birdieBro', { stake: 2 });
  assert.equal(g.config.scoringBasis, 'net');
  // Al (18) pops every hole: gross par = net birdie, 18 of them.
  const scores = { a: flat(0), b: flat(1), c: flat(2), d: flat(2) };
  const res = run(g, scores);
  assert.deepEqual(winnerIds(res), ['a']);
  assert.equal(res.entries[0].total, 18);
  assert.equal(sum(money(g, scores)), 0);
});

test('BIRDIE BRO on gross pays nobody when the group makes none', () => {
  const g = game('birdieBro', { stake: 5, scoringBasis: 'gross' });
  const scores = { a: flat(1), b: flat(1), c: flat(2), d: flat(2) };
  const res = run(g, scores);
  assert.equal(res.winner, null, 'no birdies → no winner');
  assert.ok(res.awardEmpty);
  assert.match(res.status, /No birdies/);
  const pay = money(g, scores);
  assert.deepEqual(pay, { a: 0, b: 0, c: 0, d: 0 }, 'a dead award moves no money');
});

test('BIRDIE BRO counts an eagle as birdie-or-better', () => {
  const scores = { a: card([-2, 1, 1, 1, 1, 1]), b: card([-1, 1, 1, 1, 1, 1]), c: flat(2), d: flat(2) };
  const res = run(game('birdieBro', { scoringBasis: 'gross' }), scores);
  assert.deepEqual(winnerIds(res).sort(), ['a', 'b'], 'three each — eagles count once');
});

// ── BOGEY BRO ────────────────────────────────────────────────────────────────

test('BOGEY BRO pays exactly-bogey by default — pars are too good to count', () => {
  const g = game('bogeyBro', { stake: 1 });
  assert.equal(g.config.scoringBasis, 'gross');
  const scores = {
    a: flat(0),                    // 18 pars, 0 bogeys
    b: card([1, 1, 1, 0, 2, 2]),   // 9 bogeys
    c: card([1, 1, 0, 2, 2, 2]),   // 6 bogeys
    d: flat(3),                    // 0
  };
  const res = run(g, scores);
  assert.deepEqual(winnerIds(res), ['b']);
  const pay = money(g, scores);
  assert.equal(pay.b, 3);
  assert.equal(pay.a, -1);
  assert.equal(sum(pay), 0);
});

test('BOGEY BRO in "bogey or better" mode is the no-blow-up award', () => {
  const scores = {
    a: flat(0),                    // 18 at bogey-or-better, 0 exact bogeys
    b: card([1, 1, 1, 2, 2, 2]),   // 9 exact bogeys, 9 at bogey-or-better
    c: flat(2), d: flat(3),
  };
  assert.deepEqual(winnerIds(run(game('bogeyBro'), scores)), ['b']);
  assert.deepEqual(winnerIds(run(game('bogeyBro', { mode: 'orBetter' }), scores)), ['a']);
});

// ── FLATSTICK ────────────────────────────────────────────────────────────────

const putts = (n) => Array(18).fill(n);

test('FLATSTICK takes fewest putts and ignores anyone who tracked none', () => {
  const g = game('flatstick', { stake: 2 });
  const scores = { a: flat(1), b: flat(1), c: flat(1), d: flat(1) };
  const stats = { putts: { a: putts(2), b: putts(1), c: putts(3), d: Array(18).fill(0) } };
  const res = run(g, scores, stats);
  assert.deepEqual(winnerIds(res), ['b']);
  const dee = res.entries.find(e => e.id === 'd');
  assert.equal(dee.played, 0, 'untracked player is out of the award');
  assert.equal(dee.detail, 'No putts tracked');
  const pay = money(g, scores, stats);
  assert.equal(pay.b, 4, 'only the eligible players ante');
  assert.equal(pay.d, 0);
  assert.equal(sum(pay), 0);
});

test('FLATSTICK with nothing tracked crowns nobody', () => {
  const g = game('flatstick', { stake: 2 });
  const scores = { a: flat(1), b: flat(1), c: flat(1), d: flat(1) };
  const res = run(g, scores);
  assert.equal(res.winner, null);
  assert.match(res.status, /Track putts/);
  assert.deepEqual(money(g, scores), { a: 0, b: 0, c: 0, d: 0 });
});

test('FLATSTICK can count three-putts instead of total putts', () => {
  const g = game('flatstick', { stake: 1, mode: 'threePutts' });
  const scores = { a: flat(1), b: flat(1), c: flat(1), d: flat(1) };
  // Bo lags fewest greens but three-putts constantly; Al hits greens and rarely does.
  const stats = { putts: {
    a: Array.from({ length: 18 }, (_, i) => (i < 2 ? 3 : 2)),   // 2 three-putts, 34 total
    b: Array.from({ length: 18 }, (_, i) => (i < 6 ? 3 : 1)),   // 6 three-putts, 30 total
    c: putts(2), d: putts(2),                                   // 0 three-putts, 36 total
  } };
  assert.deepEqual(winnerIds(run(game('flatstick'), scores, stats)), ['b'], 'total putts favors the chipper');
  const res = run(g, scores, stats);
  assert.deepEqual(winnerIds(res).sort(), ['c', 'd'], 'three-putt mode rewards the steady putter');
  assert.equal(sum(money(g, scores, stats)), 0);
});

// ── FIR KING ─────────────────────────────────────────────────────────────────

const fir = (hitHoles) => Array.from({ length: 18 }, (_, i) =>
  (PAR3.includes(i + 1) ? null : hitHoles.includes(i + 1)));

test('FIR KING counts driving holes only and never the par 3s', () => {
  const g = game('firKing', { stake: 2 });
  const scores = { a: flat(1), b: flat(1), c: flat(1), d: flat(1) };
  const stats = { fir: {
    a: fir([1, 2, 4, 5, 6]),          // 5
    b: fir([1, 2, 4]),                // 3
    c: fir([1]),                      // 1
    d: Array.from({ length: 18 }, () => true),   // par 3s claimed — still 14 max
  } };
  const res = run(g, scores, stats);
  assert.deepEqual(winnerIds(res), ['d']);
  assert.equal(res.entries[0].total, 14, 'four par 3s are excluded');
  assert.equal(res.entries.find(e => e.id === 'a').detail, '5/14 fairways · thru 18');
  assert.equal(sum(money(g, scores, stats)), 0);
});

test('FIR KING needs FIR tracked to award anything', () => {
  const g = game('firKing', { stake: 2 });
  const scores = { a: flat(1), b: flat(1), c: flat(1), d: flat(1) };
  assert.equal(run(g, scores).winner, null);
  assert.deepEqual(money(g, scores), { a: 0, b: 0, c: 0, d: 0 });
});

// ── Live behavior + whole-round money ────────────────────────────────────────

test('an award is live mid-round and only settles when the card is full', () => {
  const g = game('parPrince', { stake: 2 });
  const partial = {
    a: [...Array(9).fill(null).map((_, i) => par(i)), ...Array(9).fill(null)],
    b: [...Array(9).fill(null).map((_, i) => par(i) + 1), ...Array(9).fill(null)],
    c: [...Array(9).fill(null).map((_, i) => par(i) + 2), ...Array(9).fill(null)],
    d: [...Array(9).fill(null).map((_, i) => par(i) + 2), ...Array(9).fill(null)],
  };
  const res = run(g, partial);
  assert.equal(res.complete, false);
  assert.match(res.status, /Al leads/);
  assert.deepEqual(money(g, partial), { a: 0, b: 0, c: 0, d: 0 }, 'nothing pays until the round is done');
});

test('awards settle inside the round total, alongside the other formats', () => {
  const scores = { a: flat(0), b: flat(1), c: flat(1), d: flat(2) };
  const round = {
    id: 'r1', players, course, formats: [],
    games: [
      { id: 'g1', formatId: 'strokePlay', config: { stake: 5 } },
      { id: 'g2', formatId: 'parPrince',  config: { ...ME.defaultConfig('parPrince', players), stake: 2 } },
      { id: 'g3', formatId: 'flatstick',  config: { ...ME.defaultConfig('flatstick', players), stake: 1 } },
    ],
  };
  const data = { scores, putts: { a: putts(2), b: putts(2), c: putts(1), d: putts(2) } };
  const total = W.calcRoundPayouts(round, data);
  // Al wins stroke play (+15) and PAR PRINCE (+6); Cy takes FLATSTICK (+3).
  assert.equal(total.a, 15 + 6 - 1);
  assert.equal(total.c, -5 - 2 + 3);
  assert.equal(Math.round(sum(total) * 100) / 100, 0, 'the round still nets to zero');
});

test('FLATSTICK sits out a card with putts missing — a gap can only help you', () => {
  const g = game('flatstick', { stake: 2 });
  const scores = { a: flat(1), b: flat(1), c: flat(1), d: flat(1) };
  // Bo would "win" on 17 recorded holes; the 18th is blank, so he is out.
  const gappy = Array.from({ length: 18 }, (_, i) => (i === 17 ? 0 : 1));
  const stats = { putts: { a: putts(2), b: gappy, c: putts(3), d: putts(3) } };
  const res = run(g, scores, stats);
  assert.deepEqual(winnerIds(res), ['a']);
  const bo = res.entries.find(e => e.id === 'b');
  assert.equal(bo.detail, 'Putts missing on 1 hole');
  const pay = money(g, scores, stats);
  assert.equal(pay.b, 0, 'an untracked card neither antes nor wins');
  assert.equal(pay.a, 4);
  assert.equal(sum(pay), 0);
});
