// Mid-round dropouts — somebody walks in after nine and the round still has to
// finish, score and settle for everyone else.
//
// The rules under test:
//   · whole-round games (stroke play, points games, awards) show the walk-off's
//     part round but leave them out of the standings and out of the pot;
//   · match play and Nassau treat walking in as a concession;
//   · hole-by-hole games (skins, Wolf) play on with whoever is left;
//   · every settlement still nets to $0.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const W = loadPlayPal();
const ME = W.MatchEngine;

const course = {
  id: 'wd', name: 'Walkoff Links', location: 'Testville, NJ',
  rating: 68, slope: 113,
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, yds: 400, hdcp: i + 1 })),
};

const A = { id: 'a', name: 'Al Smith',  handicap: 0, color: '#111111' };
const B = { id: 'b', name: 'Bo Jones',  handicap: 0, color: '#222222' };
const C = { id: 'c', name: 'Cy Brown',  handicap: 0, color: '#333333' };
const D = { id: 'd', name: 'Dee White', handicap: 0, color: '#444444' };
const players = [A, B, C, D];

const flat = (n) => Array(18).fill(n);
// A card that stops after `thru` holes — what a walk-off's scores look like.
const upTo = (n, thru) => Array.from({ length: 18 }, (_, i) => (i < thru ? n : null));

const game = (formatId, config) => ({
  id: 'g_' + formatId, formatId,
  config: { ...ME.defaultConfig(formatId, players), ...(config || {}) },
});
const raw = (scores, dropouts, extra) => ({
  course, players, scores, dropouts: dropouts || {}, ...(extra || {}),
});
const sum = (pay) => Object.values(pay).reduce((a, v) => a + v, 0);
// The engine runs in its own vm realm, so its arrays are copied before compare.
const winnerIds = (res) => Array.from(res.winner ? res.winner.ids : []);

// ── The dropout record itself ───────────────────────────────────────────────

test('dropout helpers read a walk-off in play-order terms', () => {
  const drops = W.setDropout({}, 'c', 9, 'work call');
  assert.equal(W.dropoutThru(drops, 'c'), 9);
  assert.equal(W.isDropped(drops, 'c'), true);
  assert.equal(W.isDropped(drops, 'a'), false);
  assert.equal(W.activeAtSeq(drops, 'c', 8), true,  'still in for the ninth hole');
  assert.equal(W.activeAtSeq(drops, 'c', 9), false, 'gone for the tenth');
  assert.equal(W.activeAtSeq(drops, 'a', 17), true);
  assert.equal(W.dropoutLabel(drops, 'c'), 'Walked in after 9');
  assert.equal(W.dropoutThru(W.setDropout(drops, 'c', null), 'c'), null, 'back in the round');
});

// ── Whole-round games ───────────────────────────────────────────────────────

test('stroke play: the walk-off is out of the pot and never holds the game open', () => {
  const scores = { a: flat(4), b: flat(5), c: upTo(3, 9), d: flat(6) };
  const g = game('strokePlay', { stake: 5 });
  const r = raw(scores, { c: { thru: 9 } });
  const res = ME.compute(g, r);

  const cy = res.entries.find(e => e.id === 'c');
  assert.equal(cy.void, true, 'nine holes of 3s cannot win an 18-hole game');
  assert.equal(cy.played, 9, 'their card still shows what they shot');
  assert.match(cy.detail, /walked in after 9/);
  assert.equal(res.complete, true, 'the other three finished — so the game is finished');
  assert.deepEqual(winnerIds(res), ['a'], 'Al wins on the field that played 18');

  const pay = ME.payouts(g, r, res);
  assert.equal(pay.c, 0, 'no ante, no win');
  assert.equal(pay.a, 10);
  assert.equal(pay.b, -5);
  assert.equal(pay.d, -5);
  assert.equal(sum(pay), 0);
});

test('stroke play with nobody out is unchanged', () => {
  const scores = { a: flat(4), b: flat(5), c: flat(6), d: flat(6) };
  const g = game('strokePlay', { stake: 5 });
  const res = ME.compute(g, raw(scores));
  assert.equal(res.complete, true);
  assert.ok(res.entries.every(e => !e.void));
  assert.equal(ME.payouts(g, raw(scores), res).a, 15);
});

test('stableford: a part round sits the points pot out', () => {
  const scores = { a: flat(3), b: flat(4), c: upTo(3, 9), d: flat(5) };
  const g = game('stableford', { stake: 4 });
  const r = raw(scores, { c: { thru: 9 } });
  const res = ME.compute(g, r);
  assert.equal(res.entries.find(e => e.id === 'c').void, true);
  assert.equal(res.complete, true);
  assert.deepEqual(winnerIds(res), ['a']);
  const pay = ME.payouts(g, r, res);
  assert.equal(pay.c, 0);
  assert.equal(sum(pay), 0);
});

test('awards: a walk-off is ineligible but does not hold the trophy open', () => {
  const scores = { a: flat(3), b: flat(4), c: upTo(3, 11), d: flat(4) };
  const g = game('birdieBro', { stake: 2 });
  const r = raw(scores, { c: { thru: 11 } });
  const res = ME.compute(g, r);
  const cy = res.entries.find(e => e.id === 'c');
  assert.equal(cy.void, true);
  assert.match(cy.detail, /walked in after 11/i);
  assert.equal(res.complete, true);
  assert.deepEqual(winnerIds(res), ['a'], 'eleven birdies cannot beat eighteen');
  const pay = ME.payouts(g, r, res);
  assert.equal(pay.c, 0);
  assert.equal(sum(pay), 0);
});

// ── Match play ──────────────────────────────────────────────────────────────

test('singles match: walking in concedes the match', () => {
  // Cy is 9 up after nine and then goes home: he still loses.
  const scores = { a: flat(5), b: flat(5), c: upTo(3, 9), d: flat(5) };
  const g = game('matchPlay', { stake: 10, playerIds: ['a', 'c'], teams: [] });
  const r = raw(scores, { c: { thru: 9 } });
  const res = ME.compute(g, r);
  assert.equal(res.complete, true);
  assert.equal(res.conceded, true);
  assert.deepEqual(winnerIds(res), ['a']);
  assert.match(res.status, /walked in thru 9/);
  const pay = ME.payouts(g, r, res);
  assert.equal(pay.a, 10);
  assert.equal(pay.c, -10);
  assert.equal(sum(pay), 0);
});

test('singles match: a match already closed out stays closed', () => {
  // Al wins the first ten holes — 10&8 — before Cy walks in.
  const scores = {
    a: flat(3),
    c: Array.from({ length: 18 }, (_, i) => (i < 10 ? 5 : null)),
  };
  const g = game('matchPlay', { stake: 10, playerIds: ['a', 'c'], teams: [] });
  const res = ME.compute(g, raw(scores, { c: { thru: 10 } }));
  assert.equal(res.complete, true);
  assert.deepEqual(winnerIds(res), ['a']);
  assert.match(res.status, /wins \d+&\d+/, 'the closed-out result, not a concession');
});

test('four ball: a side with one player left plays on, no concession', () => {
  const scores = { a: flat(4), b: upTo(4, 9), c: flat(5), d: flat(5) };
  const g = game('fourBall', {
    stake: 10,
    teams: [{ id: 't1', name: 'Team A', playerIds: ['a', 'b'] },
            { id: 't2', name: 'Team B', playerIds: ['c', 'd'] }],
  });
  const r = raw(scores, { b: { thru: 9 } });
  const res = ME.compute(g, r);
  assert.ok(!res.conceded, 'Al is still out there with the better ball');
  assert.equal(res.complete, true);
  assert.deepEqual(winnerIds(res), ['t1']);
  const pay = ME.payouts(g, r, res);
  assert.equal(pay.a, 10);
  assert.equal(pay.b, 10, 'the partner who walked in still shares the team result');
  assert.equal(sum(pay), 0);
});

test('team totals: a side that cannot field enough balls is out of the pot', () => {
  const scores = { a: flat(4), b: upTo(4, 9), c: flat(5), d: flat(5) };
  const g = game('teamGross', {
    stake: 6,
    teams: [{ id: 't1', name: 'Team A', playerIds: ['a', 'b'] },
            { id: 't2', name: 'Team B', playerIds: ['c', 'd'] }],
  });
  const r = raw(scores, { b: { thru: 9 } });
  const res = ME.compute(g, r);
  assert.equal(res.entries.find(e => e.id === 't1').void, true, 'two balls needed, one left');
  assert.equal(res.complete, true);
  const pay = ME.payouts(g, r, res);
  assert.equal(sum(pay), 0);
  assert.equal(pay.a, 0);
  assert.equal(pay.b, 0);
});

test('Nassau: an unfinished segment is conceded, a finished one stands', () => {
  // Cy wins every hole of the front nine, then walks in.
  const scores = { a: flat(5), c: upTo(3, 9) };
  const g = game('nassau', { stake: 5, playerIds: ['a', 'c'], teams: [] });
  const r = raw(scores, { c: { thru: 9 } });
  const res = ME.compute(g, r);
  const seg = (k) => res.segments.find(s => s.key === k);
  assert.equal(seg('F9').complete, true);
  assert.ok(!seg('F9').conceded, 'the front nine was played out — Cy keeps it');
  assert.ok(seg('F9').up < 0, 'and he won it');
  assert.equal(seg('B9').conceded, true);
  assert.equal(seg('18').conceded, true);
  assert.equal(res.complete, true);

  const pay = ME.payouts(g, r, res);
  // Cy takes the front ($5); Al takes the back ($5) and the double-value overall
  // ($10) by concession → Al +10, Cy −10.
  assert.equal(pay.a, 10);
  assert.equal(pay.c, -10);
  assert.equal(sum(pay), 0);
});

// ── Hole-by-hole games ──────────────────────────────────────────────────────

test('skins: the rest of the field plays on for the back nine', () => {
  const scores = { a: flat(4), b: flat(5), c: upTo(3, 9), d: flat(5) };
  const g = game('skins', { stake: 1 });
  const r = raw(scores, { c: { thru: 9 } });
  const res = ME.compute(g, r);
  assert.equal(res.thru, 18, 'every hole was contested by somebody');
  assert.equal(res.complete, true);
  assert.equal(res.entries.find(e => e.id === 'c').total, 9, 'Cy won the nine he played');
  assert.equal(res.entries.find(e => e.id === 'a').total, 9, 'Al won the nine after he left');
  assert.equal(sum(ME.payouts(g, r, res)), 0);
});

test('skins: with one player left the holes just carry', () => {
  const scores = { a: flat(4), b: upTo(5, 9), c: upTo(5, 9), d: upTo(5, 9) };
  const drops = { b: { thru: 9 }, c: { thru: 9 }, d: { thru: 9 } };
  const res = ME.compute(game('skins', { stake: 1 }), raw(scores, drops));
  assert.equal(res.thru, 9, 'nine holes had a field; the rest had one player');
  assert.equal(res.complete, true);
  assert.equal(res.entries.find(e => e.id === 'a').total, 9);
});

test('Wolf: holes without the full rotation do not count, and the game still closes', () => {
  const wolf = {};
  for (let i = 0; i < 18; i++) wolf[i] = { wolfId: players[i % 4].id, partnerId: null, confirmed: true, lone: true };
  const scores = { a: flat(4), b: flat(5), c: flat(5), d: upTo(5, 12) };
  const res = ME.compute(game('wolf', { stake: 1 }),
    raw(scores, { d: { thru: 12 } }, { gameState: { wolf } }));
  // Three players are still out there, so wolf carries on — but hole 16, where
  // Dee was due to be the wolf, can't be played and holds nothing open.
  assert.equal(res.thru, 17);
  assert.equal(res.complete, true);
});

// ── The whole round ─────────────────────────────────────────────────────────

test('calcRoundPayouts stays zero-sum when somebody walks in', () => {
  const round = {
    players, course, teeId: null, startingTee: 1,
    formats: [{ type: 'skins', stakes: 2 }],
    games: [game('strokePlay', { stake: 5 }), game('flatstick', { stake: 2 })],
    dropouts: { c: { thru: 9 } },
  };
  const putts = { a: flat(2), b: flat(2), c: [...upTo(2, 9)].map(v => v || 0), d: flat(2) };
  putts.a[0] = W.ZERO_PUTTS;
  const pay = W.calcRoundPayouts(round, {
    scores: { a: flat(4), b: flat(5), c: upTo(3, 9), d: flat(5) },
    putts, popFlags: {}, wolfData: {}, bbbData: {}, teeBallData: {},
  });
  assert.ok(Math.abs(sum(pay)) < 1e-9, 'the money still nets to zero');
  assert.ok(Math.abs(pay.a) > 0, 'and it actually settled');
});

test('legacy skins contest the holes the field is still playing', () => {
  const scores = { a: flat(4), b: flat(5), c: upTo(3, 9), d: flat(5) };
  const withDrop = W.calcSkins(scores, players, course, 1, {}, { c: { thru: 9 } });
  assert.equal(withDrop.skins.c, 9);
  assert.equal(withDrop.skins.a, 9, 'the back nine is still worth skins');
  assert.ok(Math.abs(sum(withDrop.payouts)) < 1e-9);

  const noDrop = W.calcSkins(scores, players, course, 1, {});
  assert.equal(noDrop.skins.a, 0, 'without the record, the back nine is just an unfinished card');
});

test('Pass the Money moves off a player who walks in', () => {
  // Al holds the money and never gives it up on the card, but leaves after 9.
  const scores = { a: upTo(4, 9), b: flat(4), c: flat(4), d: flat(4) };
  const st = W.computePTMState(scores, { a: flat(2), b: flat(2), c: flat(2), d: flat(2) },
    players, course, 'a', { a: { thru: 9 } });
  assert.notEqual(st.holderId, 'a', 'you cannot hold the pot from the car park');
  assert.equal(st.holderId, 'b');
  assert.ok(st.log.some(l => l.reason === 'Walked in'));
});

test('a round nobody left scores exactly as it did before', () => {
  const scores = { a: flat(4), b: flat(5), c: flat(6), d: flat(6) };
  const g = game('nassau', { stake: 5, playerIds: ['a', 'b'], teams: [] });
  const res = ME.compute(g, raw(scores));
  assert.equal(res.complete, true);
  assert.ok(res.segments.every(s => !s.conceded));
  assert.deepEqual(winnerIds(res), ['a']);
});
