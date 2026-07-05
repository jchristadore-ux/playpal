import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const W = loadPlayPal();
const jeq = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
const SS = W.StatsService;

const course = {
  id: 'test', name: 'Stat Park', location: 'NJ',
  rating: 72, slope: 113,
  holes: Array.from({ length: 18 }, (_, i) => ({
    num: i + 1,
    par: i % 6 === 2 ? 3 : i % 6 === 5 ? 5 : 4,   // mixed pars: six 3s/5s pattern
    yds: 400, hdcp: i + 1,
  })),
};
const players = [{ id: 'a', name: 'Al', color: '#111' }, { id: 'b', name: 'Bo', color: '#222' }];

function makeData(overrides = {}) {
  return {
    syncCode: 'TEST01',
    course, players,
    scores: { a: Array(18).fill(4), b: Array(18).fill(5) },
    putts: { a: Array(18).fill(2), b: Array(18).fill(2) },
    firData: {}, girData: {}, extraStats: {},
    date: 'Jan 1, 2026', savedAt: 1000,
    games: [], formats: [],
    ...overrides,
  };
}

test('computePlayerRound: totals, to-par, distribution, front/back', () => {
  const data = makeData();
  const r = SS.computePlayerRound(data, 'a');
  assert.equal(r.gross, 72);
  assert.equal(r.holesPlayed, 18);
  assert.equal(r.complete, true);
  const par = course.holes.reduce((x, h) => x + h.par, 0);
  assert.equal(r.toPar, 72 - par);
  assert.equal(r.front + r.back, 72);
  const c = r.counts;
  assert.equal(c.aces + c.eagles + c.birdies + c.pars + c.bogeys + c.doubles + c.triplePlus, 18);
});

test('computePlayerRound: putts, FIR/GIR percentages, longest drive/putt', () => {
  const data = makeData({
    putts: { a: [3, 1, ...Array(16).fill(2)] },
    firData: { a: [true, false, null, true, ...Array(14).fill(null)] },
    girData: { a: [true, true, false, ...Array(15).fill(null)] },
    extraStats: { a: { 0: { drv: 285 }, 1: { lp: 22 } } },
  });
  const r = SS.computePlayerRound(data, 'a');
  assert.equal(r.putts.total, 36);
  assert.equal(r.putts.threePutts, 1);
  assert.equal(r.putts.onePutts, 1);
  // hole 3 (index 2) is a par 3 → FIR-ineligible; true,false,true among eligible
  assert.equal(r.fir.eligible, 3);
  assert.equal(r.fir.hit, 2);
  assert.equal(r.gir.eligible, 3);
  assert.equal(r.gir.pct, 67);
  assert.equal(r.longestDrive, 285);
  assert.equal(r.longestPutt, 22);
});

test('computePlayerRound: best nine and par-type averages', () => {
  const scores = { a: [...Array(9).fill(4), ...Array(9).fill(5)] };
  const r = SS.computePlayerRound(makeData({ scores }), 'a');
  assert.equal(r.bestNine.label, 'Front 9');
  assert.ok(r.parAverages[3] > 0 && r.parAverages[4] > 0 && r.parAverages[5] > 0);
});

test('roundDataFromSnapshot reads completed-round holeScores shape', () => {
  const completed = {
    round: {
      syncCode: 'ABC123', course, players,
      holeScores: {
        a: course.holes.map(() => ({ strokes: 4, putts: 2, gettingPop: false })),
        b: course.holes.map(() => ({ strokes: 6, putts: 3, gettingPop: false })),
      },
      date: 'Feb 2, 2026',
    },
    savedAt: 99,
  };
  const data = SS.roundDataFromSnapshot(completed);
  assert.equal(data.scores.a[0], 4);
  assert.equal(data.putts.b[0], 3);
  assert.equal(data.syncCode, 'ABC123');
  const r = SS.computePlayerRound(data, 'b');
  assert.equal(r.gross, 108);
});

test('aggregatePlayer: averages, bests, oldest-first trend', () => {
  const d1 = makeData({ savedAt: 1, scores: { a: Array(18).fill(5) } });             // 90
  const d2 = makeData({ savedAt: 2, scores: { a: Array(18).fill(4) } });             // 72
  const d3 = makeData({ savedAt: 3, scores: { a: [4, 4, null, ...Array(15).fill(null)] } }); // partial
  const agg = SS.aggregatePlayer([d3, d1, d2], 'a');
  assert.equal(agg.roundsPlayed, 3);
  assert.equal(agg.completeRounds, 2);
  assert.equal(agg.avgGross, 81);
  assert.equal(agg.bests.gross.value, 72);
  jeq(agg.trend.map(t => t.gross), [90, 72, 8]);
});

test('compareRounds lines up holes and computes diffs', () => {
  const d1 = makeData({ scores: { a: Array(18).fill(5) } });
  const d2 = makeData({ scores: { a: Array(18).fill(4) } });
  const cmp = SS.compareRounds(d1, d2, 'a');
  assert.equal(cmp.rows.length, 18);
  assert.equal(cmp.rows[0].diff, 1);
  assert.equal(cmp.a.gross - cmp.b.gross, 18);
});
