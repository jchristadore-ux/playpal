import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const W = loadPlayPal();

function makeRoundDoc({ scores, payouts }) {
  const holes = Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hdcp: i + 1 }));
  const players = [
    { id: 'a', name: 'Alice', color: '#15803D', initials: 'AL' },
    { id: 'b', name: 'Bob', color: '#DC2626', initials: 'BO' },
  ];
  const holeScores = {};
  for (const p of players) {
    holeScores[p.id] = holes.map((_, i) => ({ strokes: scores[p.id][i], putts: 2, gettingPop: false }));
  }
  return {
    syncCode: 'TEST01',
    savedAt: Date.now(),
    round: {
      players,
      course: { name: 'Test Course', holes },
      formats: [{ type: 'skins', stake: 5 }],
      holeScores,
      payouts: payouts || {},
      date: 'Monday, June 1, 2026',
    },
  };
}

test('buildTripLeaderboard ranks players and aggregates earnings', () => {
  const doc = makeRoundDoc({
    scores: { a: Array(18).fill(4), b: Array(18).fill(5) },
    payouts: { a: 10, b: -10 },
  });
  const board = W.buildTripLeaderboard([doc]);
  assert.ok(Array.isArray(board));
  assert.equal(board.length, 2);
  const alice = board.find((r) => r.id === 'a');
  const bob = board.find((r) => r.id === 'b');
  assert.ok(alice && bob, 'both players appear on the leaderboard');
  assert.equal(board[0].id, 'a', 'lower scorer ranks first');
  assert.equal(alice.rounds, 1);
  assert.equal(alice.totalStrokes, 72);
  assert.equal(alice.totalEarnings, 10);
  assert.equal(bob.totalEarnings, -10);
  assert.ok(alice.avgVsPar < bob.avgVsPar);
});

test('buildTripLeaderboard handles an empty trip', () => {
  const board = W.buildTripLeaderboard([]);
  assert.ok(Array.isArray(board));
  assert.equal(board.length, 0);
});

test('calculateTripAwards returns awards without throwing on minimal data', () => {
  const doc = makeRoundDoc({
    scores: { a: Array(18).fill(3), b: Array(18).fill(6) },
    payouts: { a: 20, b: -20 },
  });
  const awards = W.calculateTripAwards([doc]);
  assert.ok(Array.isArray(awards));
});
