// Zero putts — a hole holed out from off the green (a chip-in) is a tracked 0,
// not a blank cell. `0` in a putts array still means "nobody wrote it down";
// the ZERO_PUTTS sentinel (−1) is the tracked zero.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const W = loadPlayPal();
const ME = W.MatchEngine;
const Z = W.ZERO_PUTTS;

const course = {
  id: 'zp', name: 'Chip Inn', location: 'Testville, NJ',
  rating: 68, slope: 113,
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, yds: 400, hdcp: i + 1 })),
};

const A = { id: 'a', name: 'Al Smith',  handicap: 10, color: '#111111' };
const B = { id: 'b', name: 'Bo Jones',  handicap: 10, color: '#222222' };
const players = [A, B];

const flat = (n) => Array(18).fill(n);
const game = (formatId, config) => ({
  id: 'g_' + formatId, formatId,
  config: { ...ME.defaultConfig(formatId, players), ...(config || {}) },
});
const raw = (scores, stats) => ({ course, players, scores, stats: stats || {} });

// ── The helpers everything else reads cells through ─────────────────────────

test('a tracked zero counts as a recorded hole worth no strokes', () => {
  assert.equal(W.puttCount(Z), 0);
  assert.equal(W.puttCount(0), 0);
  assert.equal(W.puttCount(2), 2);
  assert.equal(W.puttsTracked(Z), true);
  assert.equal(W.puttsTracked(0), false);
  assert.equal(W.puttsTracked(2), true);
  assert.equal(W.isZeroPutt(Z), true);
  assert.equal(W.isZeroPutt(0), false);
});

test('putt arrays sum and count around the sentinel', () => {
  const arr = [2, Z, 1, 0, 3];
  assert.equal(W.sumPutts(arr), 6);          // the chip-in adds nothing
  assert.equal(W.countZeroPutts(arr), 1);
  assert.equal(W.countPuttHoles(arr), 4);    // four holes recorded, one blank
  assert.equal(W.puttCellText(Z, '·'), '0');
  assert.equal(W.puttCellText(0, '·'), '·');
  assert.equal(W.puttCellText(3, '·'), '3');
});

// ── FLATSTICK ───────────────────────────────────────────────────────────────

test('FLATSTICK: a chip-in is a tracked hole, so the card is not "missing" it', () => {
  const putts = { a: flat(2), b: flat(2) };
  putts.a[5] = Z;                                   // Al chipped in on 6
  const res = ME.compute(game('flatstick', { stake: 5 }), raw({ a: flat(4), b: flat(4) }, { putts }));
  const al = res.entries.find(e => e.id === 'a');
  assert.equal(al.total, 34, 'seventeen 2-putts, one chip-in');
  assert.ok(!/missing/i.test(al.detail), 'a chip-in must not read as an untracked hole');
  assert.deepEqual(res.winner.ids, ['a']);
});

test('FLATSTICK: an untracked hole still sits the player out', () => {
  const putts = { a: flat(2), b: flat(2) };
  putts.a[5] = 0;                                   // nobody wrote hole 6 down
  const res = ME.compute(game('flatstick'), raw({ a: flat(4), b: flat(4) }, { putts }));
  const al = res.entries.find(e => e.id === 'a');
  assert.equal(al.played, 0, 'ineligible, not a zero-putt winner');
  assert.match(al.detail, /missing/i);
});

test('FLATSTICK chip-in mode: most zero-putt holes takes the pot', () => {
  const putts = { a: flat(2), b: flat(2) };
  putts.a[3] = Z; putts.a[11] = Z;                  // Al: two chip-ins
  putts.b[7] = Z;                                   // Bo: one
  const g = game('flatstick', { mode: 'zeroPutts', stake: 5 });
  const res = ME.compute(g, raw({ a: flat(4), b: flat(5) }, { putts }));
  assert.equal(res.entries.find(e => e.id === 'a').total, 2);
  assert.equal(res.entries.find(e => e.id === 'b').total, 1);
  assert.deepEqual(res.winner.ids, ['a'], 'most chip-ins wins — higher is better here');
  const pay = ME.payouts(g, raw({ a: flat(4), b: flat(5) }, { putts }), res);
  assert.equal(pay.a, 5);
  assert.equal(pay.b, -5);
  assert.equal(pay.a + pay.b, 0);
});

test('FLATSTICK chip-in mode: nobody chipped in → no winner, no money', () => {
  const putts = { a: flat(2), b: flat(2) };
  const g = game('flatstick', { mode: 'zeroPutts', stake: 5 });
  const r = raw({ a: flat(4), b: flat(4) }, { putts });
  const res = ME.compute(g, r);
  assert.equal(res.winner, null);
  assert.equal(res.awardEmpty, true);
  const pay = ME.payouts(g, r, res);
  assert.equal(pay.a, 0);
  assert.equal(pay.b, 0);
});

test('FLATSTICK chip-in mode: putts have to be tracked at all', () => {
  const res = ME.compute(game('flatstick', { mode: 'zeroPutts' }),
    raw({ a: flat(4), b: flat(4) }, { putts: { a: flat(0), b: flat(0) } }));
  assert.equal(res.winner, null);
  assert.match(res.status, /track putts/i);
});

// ── Stats ───────────────────────────────────────────────────────────────────

test('StatsService counts a chip-in as a putted hole with zero putts', () => {
  const putts = flat(2).slice();
  putts[0] = Z; putts[1] = Z; putts[2] = 1;
  const st = W.StatsService.computePlayerRound({
    course, players, scores: { a: flat(4) }, putts: { a: putts },
    firData: {}, girData: {}, extraStats: {},
  }, 'a');
  assert.equal(st.putts.zeroPutts, 2);
  assert.equal(st.putts.holes, 18, 'every hole is recorded');
  assert.equal(st.putts.total, 1 + 15 * 2, 'chip-ins add no strokes');
  assert.equal(st.putts.onePutts, 1);
});

// ── Money games that read putts ─────────────────────────────────────────────

test('Pass the Money: a chip-in is never a 3-putt', () => {
  assert.equal(W.checkPTMPass(5, 4, Z), false, 'bogey + chip-in keeps the money');
  assert.equal(W.checkPTMWin18(5, 4, Z), true);
  assert.equal(W.checkPTMPass(5, 4, 3), true, 'a real 3-putt still passes');
});

// ── Sharing ─────────────────────────────────────────────────────────────────

test('CSV exports a chip-in as 0 and an untracked hole as blank', () => {
  const putts = flat(2).slice();
  putts[0] = Z; putts[1] = 0;
  const csv = W.SharingService.scorecardCSV(
    { course, players: [A] }, { a: flat(4) }, { a: putts });
  const rows = csv.split('\n');
  assert.match(rows[0], /Al Smith putts/);
  assert.equal(rows[1].split(',').pop(), '0', 'hole 1 chip-in');
  assert.equal(rows[2].split(',').pop(), '',  'hole 2 untracked');
  assert.equal(rows[rows.length - 1].split(',').pop(), String(16 * 2));
});
