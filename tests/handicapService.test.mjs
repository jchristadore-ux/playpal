import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const W = loadPlayPal();
const jeq = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
const HS = W.HandicapService;

const holes18 = Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hdcp: i + 1 }));
const holes9  = holes18.slice(0, 9);

test('clampIndex bounds and parses input', () => {
  assert.equal(HS.clampIndex('12.4'), 12.4);
  assert.equal(HS.clampIndex(99), 54);
  assert.equal(HS.clampIndex(-20), -10);
  assert.equal(HS.clampIndex('garbage'), 0);
});

test('course handicap follows WHS: HI × slope/113 + (CR − par)', () => {
  // 10.0 index, slope 130, rating 72.5, par 72 → 11.504… + 0.5 ≈ 12.0
  const ch = HS.courseHandicap(10, 130, 72.5, 72, 18);
  assert.ok(Math.abs(ch - 12.0) < 0.01, `got ${ch}`);
  // Neutral tee: slope 113, rating == par → CH == HI
  assert.equal(HS.courseHandicap(9, 113, 72, 72, 18), 9);
});

test('9-hole course handicap halves the index', () => {
  const ch = HS.courseHandicap(10, 113, 36, 36, 9);
  assert.equal(ch, 5);
});

test('playing handicap applies the allowance percentage', () => {
  assert.equal(HS.playingHandicap(20, 50), 10);
  assert.equal(HS.playingHandicap(20, undefined), 20);
});

test('allocateStrokes: strokes land on hardest holes first, wraps past 18', () => {
  const nine = HS.allocateStrokes(9, holes18);
  assert.equal(nine[0], 1);          // hdcp 1
  assert.equal(nine[8], 1);          // hdcp 9
  assert.equal(nine[9], 0);          // hdcp 10
  const twenty = HS.allocateStrokes(20, holes18);
  assert.equal(twenty[0], 2);
  assert.equal(twenty[1], 2);
  assert.equal(twenty[2], 1);
  assert.equal(twenty.reduce((a, b) => a + b, 0), 20);
});

test('allocateStrokes: plus handicaps give strokes back on easiest holes', () => {
  const plus2 = HS.allocateStrokes(-2, holes18);
  assert.equal(plus2[17], -1);       // hdcp 18 (easiest)
  assert.equal(plus2[16], -1);
  assert.equal(plus2[0], 0);
  assert.equal(plus2.reduce((a, b) => a + b, 0), -2);
});

test('allocateStrokes works on 9-hole layouts', () => {
  const arr = HS.allocateStrokes(11, holes9);
  assert.equal(arr.length, 9);
  assert.equal(arr.reduce((a, b) => a + b, 0), 11);
  assert.equal(arr[0], 2); // hdcp 1 and 2 get the wrap strokes
  assert.equal(arr[1], 2);
  assert.equal(arr[2], 1);
});

test('netScore subtracts strokes but never goes below 1', () => {
  assert.equal(HS.netScore(5, 1), 4);
  assert.equal(HS.netScore(1, 2), 1);
  assert.equal(HS.netScore(0, 1), 0); // unscored stays unscored
});

test('playingHandicaps: relative mode zeroes the low man', () => {
  const players = [{ id: 'a', handicap: 5 }, { id: 'b', handicap: 17 }];
  const res = HS.playingHandicaps(players, holes18, { slope: 113, rating: 72 }, { allowancePct: 100, relative: true });
  assert.equal(res.a.rounded, 0);
  assert.equal(res.b.rounded, 12);
  assert.equal(res.b.strokes.reduce((x, y) => x + y, 0), 12);
});

test('playingHandicaps: manual overrides win', () => {
  const players = [{ id: 'a', handicap: 5 }];
  const res = HS.playingHandicaps(players, holes18, { slope: 113, rating: 72 }, { overrides: { a: 11 } });
  assert.equal(res.a.rounded, 11);
});

test('teamPlayingHandicap weights low course handicap first', () => {
  // [35, 15] of CHs (20, 8) → 8·0.35 + 20·0.15 = 5.8
  const ph = HS.teamPlayingHandicap([20, 8], [35, 15]);
  assert.ok(Math.abs(ph - 5.8) < 1e-9);
});

test('handicap provider degrades gracefully and accepts registrations', () => {
  assert.equal(HS.providerAvailable(), false);
  let result, error;
  HS.fetchIndex({ ghin: '123' }, (idx, err) => { result = idx; error = err; });
  assert.equal(result, null);
  assert.match(error, /No handicap service/);

  HS.registerProvider({ id: 'fake', label: 'Fake Net', fetchIndex: (_p, cb) => cb(60, null) });
  assert.equal(HS.providerAvailable(), true);
  HS.fetchIndex({ ghin: '123' }, (idx) => { result = idx; });
  assert.equal(result, 54, 'provider results are clamped to WHS bounds');
});
