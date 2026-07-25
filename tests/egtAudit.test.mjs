// egtAudit.test.mjs — the 2026 settlement, locked to the scores actually posted.
//
// Every other EGT test drives the engine with synthetic scorecards. This one
// replays the real trip (fixtures/egt-2026-results.json, recovered from the
// rounds the app synced) and pins the money each round paid out, the off-course
// ledger, and the final "who owes whom". If a scoring or stake change ever moves
// one of these numbers, it moves a number the four of them already settled on —
// so it should fail loudly here first.
//
// The wagers, as agreed at the tee:
//   R1 Minerals   — front-9 BBB and back-9 Nines, $5 to each winner from the
//                   other two. Brian wasn't there. Nines runs on 9-hole
//                   handicaps off John (the low ball plays scratch).
//   R2 Ballyowen  — 18-hole four-ball, John+TJ v Brian+Mike, $5 to each winner
//                   from each opponent.
//   R3 Wild Turkey— Wolf, $5 to the unit leader from each player, plus a
//                   TJ v John $2 Nassau.
//   R4 Crystal Sp.— 2v2 aggregate Stableford over all 18 (no segment matches),
//                   $5 to each winner from each opponent.
//   R5 Cascades   — full-18 BBB ($5 from each) plus the six-match round robin
//                   at $1 front / $1 back / $2 overall.
//   R6 Black Bear — individual Stableford ($5 from each) plus two $2 Nassaus:
//                   TJ v John and Mike v Brian.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlayPal } from './helpers/load.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = JSON.parse(readFileSync(join(root, 'fixtures/egt-2026-seed.json'), 'utf8'));
const RESULTS = JSON.parse(readFileSync(join(root, 'fixtures/egt-2026-results.json'), 'utf8')).rounds;
const W = loadPlayPal();
const { EgtImporter, EgtStore, EgtBridge, EgtEngine } = W;

const ROUND_IDS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];

// Replay the trip exactly as the app did: bridge each synced round's native
// payload into the tournament store, finalize it, then run the season pass.
function playedTrip() {
  const model = EgtImporter.importSeed(JSON.parse(JSON.stringify(SEED)));
  const state = EgtStore.emptyState(model.trip.id);
  state.model = model;
  ROUND_IDS.forEach(rid => {
    const r = RESULTS[rid];
    EgtBridge.bridge(model, state, rid, {
      scores: r.scores, wolfData: r.wolfData || {}, bbbData: r.bbbData || {},
      putts: {}, firData: {}, girData: {}, extraStats: {},
    });
    state.finalized.push(rid);
  });
  return { model, state, live: EgtEngine.liveUpdate(state, { noPersist: true, season: true }) };
}

const money = (() => { let c = null; return () => (c = c || playedTrip()); })();
const round = (m, rid) => m.live.money.rounds[rid].total;
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.005, `${what}: expected ${b}, got ${a}`);
// The engine runs in a VM realm, so its objects/arrays fail deepEqual against
// literals here on prototype identity alone. Copy into this realm first.
const plain = o => Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => (a < b ? -1 : 1)));
const eq = (actual, expected, what) => assert.deepEqual(plain(actual), plain(expected), what);
const eqList = (actual, expected, what) => assert.deepEqual([...(actual || [])], expected, what);
const vec = (actual, expected, what) =>
  Object.entries(expected).forEach(([pid, amt]) => near(actual[pid] ?? 0, amt, `${what} ${pid}`));

test('the replayed scorecards match what everyone shot', () => {
  const totals = rid => Object.fromEntries(
    Object.entries(RESULTS[rid].scores).map(([pid, s]) => [pid, s.reduce((a, b) => a + b, 0)]));
  assert.deepEqual(totals('R1'), { mike: 104, tj: 111, john: 90 });
  assert.deepEqual(totals('R2'), { tj: 100, john: 93, mike: 108, brian: 107 });
  assert.deepEqual(totals('R3'), { mike: 105, brian: 118, john: 108, tj: 109 });
  assert.deepEqual(totals('R4'), { brian: 116, mike: 112, john: 104, tj: 114 });
  assert.deepEqual(totals('R5'), { brian: 104, mike: 114, john: 97, tj: 107 });
  assert.deepEqual(totals('R6'), { brian: 106, mike: 113, john: 99, tj: 109 });
});

test('R1 Minerals — TJ takes the BBB, John takes the Nines', () => {
  const m = money();
  const r = m.live.resultsByRound.R1;
  eq(r.bbb.totals, { john: 8, tj: 11, mike: 8 }, 'R1 BBB');
  eqList(r.bbb.champions, ['tj'], 'R1 BBB winner');
  eq(r.nines.totals, { john: 30, tj: 23, mike: 28 }, 'R1 Nines');
  eqList(r.nines.champions, ['john'], 'R1 Nines winner');
  // Each game pays its winner $5 off the other two, so the two cancel for TJ
  // and John and Mike carries the round.
  vec(round(m, 'R1'), { john: 5, brian: 0, tj: 5, mike: -10 }, 'R1');
});

test('R1 Nines runs off the low ball — only TJ and Mike get strokes', () => {
  const alloc = money().model.derived.R1.allocations;
  assert.equal(alloc.john.games.nines.strokes, 0, 'John is the low ball');
  assert.equal(alloc.tj.games.nines.strokes, 4);
  eqList(alloc.mike.games.nines.holes.map(h => h.hole), [12, 13, 15, 16], 'Nines pop holes');
});

test('R2 Ballyowen — John+TJ win the four-ball 6 up', () => {
  const m = money();
  const ov = m.live.resultsByRound.R2.fourBall.segments.overall;
  assert.equal(ov.winnerTeam, 'Team 1');
  assert.equal(ov.up, 6);
  vec(round(m, 'R2'), { john: 10, tj: 10, brian: -10, mike: -10 }, 'R2');
});

test('R3 Wild Turkey — Mike runs away with the Wolf, TJ wins the side Nassau', () => {
  const m = money();
  const units = m.live.resultsByRound.R3.wolf.units;
  eq(units, { john: -2, brian: -4, tj: -4, mike: 10 }, 'Wolf units');
  // Wolf pays Mike $15. The $2 Nassau went TJ (front, 5 up) · John (back, 1 up)
  // · TJ (overall, 4 up) = TJ +$4, so TJ leaves the round only $1 down.
  vec(round(m, 'R3'), { john: -9, brian: -5, tj: -1, mike: 15 }, 'R3');
});

test('R4 Crystal Springs — Stableford off the low ball, Brian+Mike by 26 to 18', () => {
  const m = money();
  const ts = m.live.resultsByRound.R4.teamStableford;
  eq(ts.playerPoints, { john: 7, tj: 11, brian: 10, mike: 16 }, 'R4 Stableford points');
  assert.equal(ts.teamTotals['Team 1'], 18);
  assert.equal(ts.teamTotals['Team 2'], 26);
  assert.equal(ts.overallWinner, 'Team 2');
  vec(round(m, 'R4'), { brian: 10, mike: 10, john: -10, tj: -10 }, 'R4');
});

test('R4 gives John no strokes — the low course handicap plays scratch', () => {
  const alloc = money().model.derived.R4.allocations;
  assert.equal(alloc.john.games.teamStableford.strokes, 0);
  assert.equal(alloc.brian.games.teamStableford.strokes, 5);
  assert.equal(alloc.tj.games.teamStableford.strokes, 11);
  assert.equal(alloc.mike.games.teamStableford.strokes, 11);
});

test('R5 Cascades — John takes the BBB, TJ takes the round robin', () => {
  const m = money();
  eq(m.live.resultsByRound.R5.bbb.totals, { john: 17, brian: 14, tj: 9, mike: 14 }, 'R5 BBB');
  eqList(m.live.resultsByRound.R5.bbb.champions, ['john'], 'R5 BBB winner');
  // All six 1v1s play, at $1 a segment.
  assert.equal(m.live.resultsByRound.R5.matchPlay.matches.length, 6);
  // BBB pays John $15; the round robin nets John +2, Brian -2, TJ +6, Mike -6.
  vec(round(m, 'R5'), { john: 17, brian: -7, tj: 1, mike: -11 }, 'R5');
});

test('R6 Black Bear — TJ sweeps his Nassau and the Stableford', () => {
  const m = money();
  const st = m.live.resultsByRound.R6.stableford.totals;
  eq(st, { john: 25, brian: 25, tj: 27, mike: 26 }, 'R6 Stableford');
  // TJ beats John 3&…/1 up/4 up for the full $8, and Mike v Brian splits the
  // front and back with a halved overall, so that Nassau pays nothing.
  vec(round(m, 'R6'), { john: -13, brian: -5, tj: 23, mike: -5 }, 'R6');
});

test('the golf ledger nets to zero and lands where the trip ended', () => {
  const m = money();
  vec(m.live.money.golfOnly, { john: 0, brian: -17, tj: 28, mike: -11 }, 'golf');
  const sum = Object.values(m.live.money.golfOnly).reduce((a, b) => a + b, 0);
  near(sum, 0, 'golf ledger');
});

test('The Rock stays out of the money unless the seed says it was played', () => {
  const m = money();
  assert.equal(m.live.money.rounds.passTheMoney, undefined, 'no PTM settlement');
  assert.ok(m.live.ptm && m.live.ptm.finalHolder, 'the ledger is still derived for display');
});

test('off-course costs settle on the same ledger', () => {
  const extras = money().live.money.extras;
  const byId = Object.fromEntries(extras.items.map(i => [i.id, i.total]));
  vec(byId.banner, { john: 90, brian: -30, tj: -30, mike: -30 }, 'banner');
  vec(byId.gas, { john: 60, brian: -20, tj: -20, mike: -20 }, 'gas');
  // $120 in, $84 to Mike and $36 to TJ back out.
  vec(byId.poker, { john: -40, brian: -40, tj: 16, mike: 64 }, 'poker');
  vec(extras.total, { john: 110, brian: -90, tj: -34, mike: 14 }, 'extras');
  assert.ok(extras.netsToZero);
  eq(extras.prepaid, { brian: 40 }, "Brian's buy-in already in the pot");
});

test('the final settlement: John +110, Brian -107, TJ -6, Mike +3', () => {
  const m = money();
  vec(m.live.money.total, { john: 110, brian: -107, tj: -6, mike: 3 }, 'final');
  assert.ok(m.live.money.netsToZero, 'the whole trip still nets to zero');
});

test('who pays whom, netted per matchup', () => {
  const s = money().live.money.settlements;
  const paid = (from, to) => (s.find(x => x.from === from && x.to === to) || {}).amount ?? 0;
  near(paid('brian', 'john'), 55, 'Brian → John');
  near(paid('brian', 'tj'), 15, 'Brian → TJ');
  near(paid('brian', 'mike'), 37, 'Brian → Mike');
  near(paid('tj', 'john'), 30, 'TJ → John');
  near(paid('mike', 'john'), 25, 'Mike → John');
  near(paid('mike', 'tj'), 9, 'Mike → TJ');
  // Every transfer runs one way per matchup — six pairings, six entries.
  assert.equal(s.length, 6);
  const net = {};
  s.forEach(x => { net[x.from] = (net[x.from] || 0) - x.amount; net[x.to] = (net[x.to] || 0) + x.amount; });
  vec(net, { john: 110, brian: -107, tj: -6, mike: 3 }, 'settlement net');
});

// ── the shared money summary (app Money tab · SportsCenter · settlement board) ──

test('the money summary describes the trip the ledger settled', () => {
  const m = money();
  const sum = W.EgtMoneySummary.build(m.model, m.live);
  // Ordered by who is up the most.
  eqList(sum.standings.map(s => s.name), ['John', 'Mike', 'TJ', 'Brian'], 'standing order');
  const john = sum.standings[0];
  near(john.total, 110, 'John total');
  near(john.golf, 0, 'John golf');
  near(john.extras, 110, 'John off-course');
  assert.equal(john.verdict, 'collects');
  assert.equal(sum.standings[3].verdict, 'pays out');
  // Six rounds, in the order they were played, plus the three off-course items.
  eqList(sum.rounds.map(r => r.id), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'], 'round order');
  eqList(sum.extras.map(x => x.id), ['banner', 'gas', 'poker'], 'off-course items');
  assert.ok(sum.hasExtras && sum.complete && sum.netsToZero);
  vec(sum.total, { john: 110, brian: -107, tj: -6, mike: 3 }, 'summary total');
  vec(sum.golfOnly, { john: 0, brian: -17, tj: 28, mike: -11 }, 'summary golf');
});

test('the settle-up credits cash already in the pot against that pot only', () => {
  const sum = W.EgtMoneySummary.build(money().model, money().live);
  const find = (from, to) => sum.settle.find(s => s.from === from && s.to === to) || {};
  // Brian's $40 poker buy-in splits across the poker winners by share of the
  // winnings ($8 TJ, $32 Mike) — and touches nothing else he owes.
  near(find('brian', 'john').credit, 0, 'no credit against the banner/gas John fronted');
  near(find('brian', 'john').due, 55, 'Brian → John');
  near(find('brian', 'tj').credit, 8, 'TJ share of the pot');
  near(find('brian', 'tj').due, 7, 'Brian → TJ');
  near(find('brian', 'mike').credit, 32, 'Mike share of the pot');
  near(find('brian', 'mike').due, 5, 'Brian → Mike');
  // The credit never exceeds what was actually prepaid.
  const credited = sum.settle.reduce((a, s) => a + s.credit, 0);
  near(credited, 40, 'total credited equals the cash in the pot');
  // Brian still owes $107 on the ledger; $67 of it is cash he has yet to hand over.
  const note = sum.prepaidNote.find(n => n.id === 'brian');
  near(note.owed, 107, 'ledger'); near(note.due, 67, 'still to pay');
});

test('the summary explains where each round\'s money came from', () => {
  const sum = W.EgtMoneySummary.build(money().model, money().live);
  const work = rid => sum.rounds.find(r => r.id === rid).work.join('\n');
  assert.match(work('R1'), /Bingo Bango Bongo — TJ 11 .* → TJ takes the stake/);
  assert.match(work('R1'), /The Nines — John 30 .* → John takes the stake/);
  assert.match(work('R2'), /Four-ball — John \+ TJ by 6/);
  assert.match(work('R3'), /Wolf units — Mike \+10 .* → Mike takes the stake/);
  assert.match(work('R3'), /TJ v John — front TJ by 5 · back John by 1 · overall TJ by 4 → TJ \+\$4/);
  assert.match(work('R4'), /Teams — John \+ TJ 18 v Brian \+ Mike 26 → Brian \+ Mike take it/);
  assert.match(work('R5'), /TJ v Mike — .* → TJ \+\$4/);
  assert.match(work('R6'), /TJ v John — .* → TJ \+\$8/);
  assert.match(work('R6'), /Mike v Brian — .* overall halved → no money/);
});

test('the summary degrades to golf-only partway through the trip', () => {
  const model = EgtImporter.importSeed(JSON.parse(JSON.stringify(SEED)));
  const state = EgtStore.emptyState(model.trip.id);
  state.model = model;
  ['R1', 'R2'].forEach(rid => {
    const r = RESULTS[rid];
    EgtBridge.bridge(model, state, rid, {
      scores: r.scores, wolfData: r.wolfData || {}, bbbData: r.bbbData || {},
      putts: {}, firData: {}, girData: {}, extraStats: {},
    });
    state.finalized.push(rid);
  });
  const live = EgtEngine.liveUpdate(state, { noPersist: true });   // not the season pass
  const sum = W.EgtMoneySummary.build(model, live);
  eqList(sum.rounds.map(r => r.id), ['R1', 'R2'], 'only the finalized rounds');
  assert.equal(sum.hasExtras, false, 'no off-course ledger before the trip closes');
  assert.equal(sum.complete, false);
  // R1 + R2 only: John +15, Brian -10, TJ +15, Mike -20.
  vec(sum.total, { john: 15, brian: -10, tj: 15, mike: -20 }, 'partial total');
});

test('an unscored trip yields an empty summary rather than throwing', () => {
  const model = EgtImporter.importSeed(JSON.parse(JSON.stringify(SEED)));
  const state = EgtStore.emptyState(model.trip.id);
  state.model = model;
  const sum = W.EgtMoneySummary.build(model, EgtEngine.liveUpdate(state, { noPersist: true }));
  assert.equal(sum.rounds.length, 0);
  assert.equal(sum.settle.length, 0);
  assert.equal(sum.standings.length, 4, 'still lists the field');
  assert.ok(sum.standings.every(s => s.total === 0));
});

test('a pot credit never reverses a bill — the excess comes back instead', () => {
  const m = money();
  // Same trip, but pretend Brian floated $200 into the poker pot. His share of
  // the credit ($40 to TJ, $160 to Mike) now dwarfs what he owes them, so the
  // settle-up must clamp at zero rather than invent transfers running backwards.
  const live = JSON.parse(JSON.stringify({
    money: {
      settlements: m.live.money.settlements,
      extras: {
        items: m.live.money.extras.items.map(i => (i.id === 'poker'
          ? Object.assign({}, i, { prepaid: { brian: 200 } }) : i)),
        prepaid: { brian: 200 },
        total: m.live.money.extras.total,
      },
      total: m.live.money.total, golfOnly: m.live.money.golfOnly,
      rounds: m.live.money.rounds, netsToZero: true,
    },
    resultsByRound: {},
  }));
  const sum = W.EgtMoneySummary.build(m.model, live);
  sum.settle.forEach(s => {
    assert.ok(s.due >= 0, `${s.from}→${s.to} stays a one-way transfer, got ${s.due}`);
    assert.ok(s.credit <= s.amount, `${s.from}→${s.to} credit never exceeds the bill`);
  });
  const note = sum.prepaidNote.find(n => n.id === 'brian');
  assert.ok(note.refund > 0, 'the unusable remainder is reported as coming back');
  // Nothing is lost: what was applied plus what comes back is what went in.
  const applied = sum.settle.filter(s => s.from === 'brian').reduce((a, s) => a + s.credit, 0);
  near(applied + note.refund, 200, 'every dollar of the float is accounted for');
});
