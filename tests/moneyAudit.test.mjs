// Regression tests for the App Store submission audit (v1.16.0).
//
// Three properties this suite refuses to let regress:
//   1. Every format that can carry a stake settles, and settles to zero.
//   2. The layout being played decides the maths — a nine-hole round is not
//      an eighteen-hole round with nine blanks.
//   3. What the screen says a player owes is what the Venmo request asks for.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const W = loadPlayPal();

// The app runs inside a vm realm, so its arrays are not `instanceof` this
// realm's Array and deepStrictEqual rejects them on prototype alone. Compare
// by value instead.
const same = (actual, expected, msg) =>
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), msg);

const holes = (n, pars) => Array.from({ length: n }, (_, i) => ({
  num: i + 1, par: pars ? pars[i % pars.length] : 4, yds: 400, hdcp: i + 1,
}));
const course18 = { id: 'c18', name: 'Eighteen', holes: holes(18), rating: 72, slope: 113 };
const course9  = { id: 'c9',  name: 'Nine',     holes: holes(9),  rating: 35, slope: 113 };

const P = (n) => Array.from({ length: n }, (_, i) => ({
  id: 'p' + (i + 1), name: 'Player ' + (i + 1),
  handicap: [0, 8, 16, 24, 30, 36][i] ?? 10,
  color: '#123456', email: 'p' + (i + 1) + '@example.com', venmo: 'player-' + (i + 1),
}));

const flat = (players, holeCount, per) =>
  Object.fromEntries(players.map((p, i) => [p.id, Array.from({ length: holeCount }, (_, h) => per(i, h))]));

// ── 1. Every MatchEngine format pays out, and pays out to zero ───────────────

test('every MatchEngine format settles a stake and nets to zero', () => {
  const players = P(4);
  const scores = flat(players, 18, (i, h) => 4 + ((i + h) % 3));
  let settled = 0;

  for (const f of W.MatchEngine.list()) {
    if (f.aliasOf) continue;
    const config = { ...W.MatchEngine.defaultConfig(f.id, players), stake: 5 };
    const game = { id: 'g_' + f.id, formatId: f.id, config };
    const raw = { course: course18, players, scores, startingTee: 1, gameState: { wolf: {}, bbb: {} } };

    const result = W.MatchEngine.compute(game, raw);
    const pay = W.MatchEngine.payouts(game, raw, result);

    const sum = Object.values(pay).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum) < 1e-9, `${f.id} is not zero-sum (${sum})`);
    assert.ok(Object.keys(pay).length > 0, `${f.id} produced no payout map`);
    if (Object.values(pay).some(v => Math.abs(v) > 1e-9)) settled++;
  }
  // Most formats decide on this data; a couple (wolf, BBB) need per-hole input.
  assert.ok(settled >= 14, `only ${settled} formats moved money`);
});

test('a game with no stake moves no money', () => {
  const players = P(4);
  const scores = flat(players, 18, (i, h) => 4 + ((i + h) % 3));
  const config = { ...W.MatchEngine.defaultConfig('strokePlay', players), stake: 0 };
  const pay = W.MatchEngine.payouts({ id: 'g', formatId: 'strokePlay', config },
    { course: course18, players, scores, startingTee: 1, gameState: {} });
  assert.ok(Object.values(pay).every(v => v === 0));
});

test('engine skins settles identically to the built-in skins game', () => {
  const players = P(4);
  const scores = flat(players, 18, (i, h) => (i === 1 && h === 3) ? 3 : (i === 0 ? 4 : 5));
  const legacy = W.calcSkins(scores, players, course18, 5, {}).payouts;
  const config = { ...W.MatchEngine.defaultConfig('skins', players), stake: 5, scoringBasis: 'gross', relative: false };
  const engine = W.MatchEngine.payouts({ id: 'g', formatId: 'skins', config },
    { course: course18, players, scores, startingTee: 1, gameState: {} });
  same(engine, legacy);
});

test('a halved match play pays nobody', () => {
  const players = P(2);
  const scores = flat(players, 18, () => 4);
  const config = {
    ...W.MatchEngine.defaultConfig('matchPlay', players),
    stake: 20, scoringBasis: 'gross', relative: false,
    teams: [{ id: 't1', name: 'A', playerIds: ['p1'] }, { id: 't2', name: 'B', playerIds: ['p2'] }],
  };
  const raw = { course: course18, players, scores, startingTee: 1, gameState: {} };
  const res = W.MatchEngine.compute({ id: 'g', formatId: 'matchPlay', config }, raw);
  assert.equal(res.winner.label, 'Halved');
  const pay = W.MatchEngine.payouts({ id: 'g', formatId: 'matchPlay', config }, raw, res);
  assert.ok(Object.values(pay).every(v => v === 0));
});

test('engine nassau pays the overall bet double', () => {
  const players = P(2);
  // p1 wins every hole, so all three segments go one way: 1 + 1 + 2 = 4 units.
  const scores = { p1: Array(18).fill(3), p2: Array(18).fill(5) };
  const config = {
    ...W.MatchEngine.defaultConfig('nassau', players),
    stake: 5, scoringBasis: 'gross', relative: false,
    teams: [{ id: 't1', name: 'A', playerIds: ['p1'] }, { id: 't2', name: 'B', playerIds: ['p2'] }],
  };
  const pay = W.MatchEngine.payouts({ id: 'g', formatId: 'nassau', config },
    { course: course18, players, scores, startingTee: 1, gameState: {} });
  assert.equal(pay.p1, 20);
  assert.equal(pay.p2, -20);
});

test('calcRoundPayouts settles money games and engine games together', () => {
  const players = P(4);
  const scores = flat(players, 18, (i) => 4 + i);
  const round = {
    players, course: course18, startingTee: 1, teeId: null,
    formats: [{ type: 'skins', stakes: 2 }],
    games: [{ id: 'g1', formatId: 'strokePlay', config: { ...W.MatchEngine.defaultConfig('strokePlay', players), stake: 10 } }],
  };
  const withBoth = W.calcRoundPayouts(round, { scores, popFlags: {} });
  const withGameOnly = W.calcRoundPayouts({ ...round, formats: [] }, { scores, popFlags: {} });
  const withFormatOnly = W.calcRoundPayouts({ ...round, games: [] }, { scores, popFlags: {} });

  assert.ok(Math.abs(Object.values(withBoth).reduce((a, b) => a + b, 0)) < 1e-9);
  // p1 is low every hole, so both games pay him and the total is the sum.
  assert.ok(withGameOnly.p1 > 0 && withFormatOnly.p1 > 0);
  players.forEach(p => {
    assert.ok(Math.abs(withBoth[p.id] - (withGameOnly[p.id] + withFormatOnly[p.id])) < 0.011,
      `${p.id}: combined total does not equal the parts`);
  });
});

// ── 2. Nine-hole layouts ────────────────────────────────────────────────────

test('a nine-hole Nassau is one bet, not three', () => {
  const players = P(2);
  const cfg = { matchType: '1v1', playersInMatch: ['p1', 'p2'], popHoles: {} };
  const nine = W.calcNassauPayouts({ p1: Array(9).fill(4), p2: Array(9).fill(5) },
    players, course9, 5, [], {}, cfg);
  assert.equal(nine.p1, 5, 'nine holes should settle a single bet');

  const full = W.calcNassauPayouts({ p1: Array(18).fill(4), p2: Array(18).fill(5) },
    players, course18, 5, [], {}, cfg);
  assert.equal(full.p1, 20, 'eighteen holes settles front + back + double overall');
});

test('nassauSegments sizes off the layout', () => {
  assert.equal(W.nassauSegments(course9, 5).length, 1);
  const segs = W.nassauSegments(course18, 5);
  assert.equal(segs.length, 3);
  same(segs.map(s => s.stake), [5, 5, 10]);
});

test('skins only counts the holes the course actually has', () => {
  const players = P(2);
  const scores = { p1: Array(9).fill(3), p2: Array(9).fill(4) };
  const { skins } = W.calcSkins(scores, players, course9, 1, {});
  assert.equal(skins.p1, 9);
  assert.equal(skins.p2, 0);
});

test('wolf standings stop at the last hole of the layout', () => {
  const players = P(3);
  const wolfData = {};
  for (let i = 0; i < 18; i++) wolfData[i] = { wolfId: 'p1', partnerId: 'p2', confirmed: true, lone: false };
  const scores = { p1: Array(9).fill(3), p2: Array(9).fill(3), p3: Array(9).fill(9) };
  const pts = W.calcWolfStandings(scores, wolfData, players, course9);
  assert.equal(pts.p1, 9, 'only the nine holes played should score');
});

test('Markey Match on nine holes plays nine holes and spawns no turn press', () => {
  const players = P(2);
  const fmt = { type: 'markeymatch', markeyMatchConfig: { team1: ['p1'], team2: ['p2'], stake: 5, markeyPopStrokes: {} } };
  const scores = { p1: Array(9).fill(4), p2: Array(9).fill(5) };
  const states = W.calcMarkeyMatchState(scores, {}, players, fmt, 9);
  assert.ok(states.length >= 1);
  assert.ok(states.every(m => !m.isTurnPress), 'nine holes has no turn');
  assert.ok(states.every(m => m.holeResults.length === 9));
});

// ── 3. Small fields ─────────────────────────────────────────────────────────

test('wolf with two players is a push, never a walkover', () => {
  const players = P(2);
  const scores = { p1: Array(18).fill(3), p2: Array(18).fill(9) };
  const partnered = W.resolveWolfHole(scores, 0, 'p1', 'p2', false, players);
  assert.equal(partnered.tied, true);
  const lone = W.resolveWolfHole(scores, 0, 'p1', null, true, players);
  assert.equal(lone.tied, true);
});

test('a solo round settles to zero across every money game', () => {
  const players = P(1);
  const scores = { p1: Array(18).fill(4) };
  const formats = [
    { type: 'skins', stakes: 5 }, { type: 'stableford', stakes: 5 },
    { type: 'passmoney', stakes: 5 }, { type: 'wolf', stakes: 5 },
    { type: 'bingobangobongo', stakes: 5 }, { type: 'teeball', stakes: 5 },
  ];
  const pay = W.calcAllPayouts(scores, {}, players, course18, formats, [], 'p1', {}, null, {}, {});
  assert.equal(pay.p1, 0, 'there is nobody to win money from');
});

// ── 4. Handicaps and pops ───────────────────────────────────────────────────

test('getHoleStrokes handles plus handicaps and wraps past a full round', () => {
  assert.equal(W.getHoleStrokes(0, 1), 0);
  assert.equal(W.getHoleStrokes(9, 9), 1);
  assert.equal(W.getHoleStrokes(9, 10), 0);
  assert.equal(W.getHoleStrokes(20, 2), 2, '20 gets a second stroke on the two hardest');
  assert.equal(W.getHoleStrokes(20, 3), 1);
  // A plus-2 gives strokes back on the two EASIEST holes.
  assert.equal(W.getHoleStrokes(-2, 18), -1);
  assert.equal(W.getHoleStrokes(-2, 17), -1);
  assert.equal(W.getHoleStrokes(-2, 16), 0);
  assert.ok(!Object.is(W.getHoleStrokes(-2, 16), -0), 'never a signed zero');
  // Nine-hole layouts wrap at nine, not eighteen.
  assert.equal(W.getHoleStrokes(11, 2, 9), 2);
});

test('pop flags carry stroke counts and still read old boolean rounds', () => {
  const scores = { p1: [6] };
  assert.equal(W.getAdjustedHoleScore(scores, { p1: [true] }, 'p1', 0), 5, 'legacy true = one stroke');
  assert.equal(W.getAdjustedHoleScore(scores, { p1: [2] }, 'p1', 0), 4);
  assert.equal(W.getAdjustedHoleScore(scores, { p1: [0] }, 'p1', 0), 6);
  assert.equal(W.getAdjustedHoleScore(scores, {}, 'p1', 0), 6);
  assert.equal(W.getAdjustedHoleScore({ p1: [2] }, { p1: [5] }, 'p1', 0), 1, 'never below one');
});

test('autoPopStrokes allocates off the low course handicap', () => {
  const players = P(3);           // handicaps 0, 8, 16
  const pops = W.autoPopStrokes(players, course18, null, { allowancePct: 100, relative: true });
  const total = id => pops[id].reduce((a, b) => a + b, 0);
  assert.equal(total('p1'), 0, 'the low man gets nothing');
  assert.equal(total('p2'), 8);
  assert.equal(total('p3'), 16);
  // Strokes land on the hardest holes first (stroke index 1 upward).
  assert.equal(pops.p2[0], 1);
  assert.equal(pops.p2[8], 0, 'index 9 is outside an 8-stroke allocation');
});

test('autoPopStrokes wraps past a full round for a big spread', () => {
  const players = [{ id: 'a', name: 'A', handicap: 0 }, { id: 'b', name: 'B', handicap: 27 }];
  const pops = W.autoPopStrokes(players, course18, null, { allowancePct: 100, relative: true });
  assert.equal(pops.b.reduce((x, y) => x + y, 0), 27);
  assert.equal(pops.b[0], 2, 'the hardest hole takes a second stroke');
  assert.equal(pops.b[17], 1);
});

// ── 5. Money reads the same everywhere ──────────────────────────────────────

test('fmtMoney shows cents only when there are cents', () => {
  assert.equal(W.fmtMoney(12), '$12');
  assert.equal(W.fmtMoney(12.5), '$12.50');
  assert.equal(W.fmtMoney(-12.5), '−$12.50');
  assert.equal(W.fmtMoney(12.5, { signed: true }), '+$12.50');
  assert.equal(W.fmtMoney(-12.5, { signed: true }), '−$12.50');
  assert.equal(W.fmtMoney(0, { signed: true }), '—');
  assert.equal(W.fmtMoney(0.005), '$0.01');
});

test('roundMoneyMap rounds to cents and stays zero-sum', () => {
  const thirds = { a: 10 / 3, b: 10 / 3, c: 10 / 3, d: -10 };
  const out = W.roundMoneyMap(thirds);
  const sum = Object.values(out).reduce((x, y) => x + y, 0);
  assert.equal(Math.round(sum * 100) / 100, 0);
  Object.values(out).forEach(v => assert.equal(v, Math.round(v * 100) / 100));
});

test('settleDebts nets to the ledger and consumes each creditor in turn', () => {
  const players = P(4);
  const payouts = { p1: 30, p2: 10, p3: -25, p4: -15 };
  const debts = W.SharingService.settleDebts(players, payouts);
  const moved = Object.fromEntries(players.map(p => [p.id, 0]));
  debts.forEach(d => { moved[d.from.id] -= d.amount; moved[d.to.id] += d.amount; });
  players.forEach(p => assert.equal(moved[p.id], payouts[p.id]));
});

test('the Venmo request asks for exactly what the screen shows', () => {
  const from = { id: 'p1', name: 'A', venmo: '@player-1' };
  const req = W.SharingService.venmoRequest({ from, to: { name: 'B' }, amount: 12.5 }, 'PlayPal');
  assert.equal(req.handle, 'player-1', 'a leading @ is stripped');
  assert.equal(req.amount, '12.50');
  assert.equal(W.fmtMoney(12.5), '$12.50');
  assert.ok(req.deepLink.includes('amount=12.50'));
  assert.ok(req.webLink.startsWith('https://venmo.com/player-1?'));
  assert.ok(req.deepLink.includes('txn=charge'));
});

test('a player with no Venmo handle gets no link rather than a broken one', () => {
  assert.equal(W.SharingService.venmoRequest({ from: { name: 'A', venmo: '' }, amount: 5 }), null);
  assert.equal(W.SharingService.venmoRequest({ from: { name: 'A' }, amount: 5 }), null);
});

// ── 6. The round report ─────────────────────────────────────────────────────

function sampleRound() {
  const players = P(4);
  const scores = flat(players, 18, (i, h) => 4 + ((i + h) % 3));
  const round = {
    players, course: course18, startingTee: 1, teeId: null, date: 'Saturday',
    tripName: 'Test Trip',
    formats: [{ type: 'skins', stakes: 5 }],
    games: [{ id: 'g1', formatId: 'stableford', name: 'Stableford',
              config: { ...W.MatchEngine.defaultConfig('stableford', players), stake: 10 } }],
  };
  const data = {
    scores, putts: flat(players, 18, () => 2), popFlags: {},
    wolfData: {}, bbbData: {}, teeBallData: {},
    firData: { p1: Array(18).fill(true) }, girData: { p1: Array(18).fill(true) },
    extraStats: { p2: { 0: { pen: 1 } } },
  };
  return { round, data };
}

test('the round report covers scores, net, every game, stats and the settlement', () => {
  const { round, data } = sampleRound();
  const rep = W.SharingService.roundReport(round, data);
  ['LEADERBOARD', 'NET', 'GAMES', 'STATS', 'MONEY', 'SETTLE UP'].forEach(section => {
    assert.ok(rep.short.includes(section), `report is missing ${section}`);
  });
  assert.ok(rep.short.includes('Skins'), 'money game missing');
  assert.ok(rep.short.includes('Stableford'), 'engine game missing');
  assert.ok(rep.short.includes('Test Trip'), 'trip name missing');
  assert.ok(rep.full.includes('SCORECARD'), 'full report is missing the hole-by-hole grid');
  assert.ok(rep.full.length > rep.short.length);
  assert.ok(Math.abs(Object.values(rep.payouts).reduce((a, b) => a + b, 0)) < 0.011);
});

test('the mail body fits inside a mailto: URL', () => {
  const { round, data } = sampleRound();
  const rep = W.SharingService.roundReport(round, data);
  assert.ok(encodeURIComponent(rep.mail).length <= 1800,
    `mail body is ${encodeURIComponent(rep.mail).length} encoded chars`);
  // Whatever gets shed, the money always survives.
  assert.ok(rep.mail.includes('MONEY'));
  assert.ok(rep.mail.includes('SETTLE UP'));
  assert.ok(rep.mail.includes('LEADERBOARD'));
});

test('the report is honest about a round with no money on it', () => {
  const players = P(3);
  const scores = flat(players, 18, (i, h) => 4 + ((i + h) % 2));
  const rep = W.SharingService.roundReport(
    { players, course: course18, formats: [], games: [], startingTee: 1 },
    { scores, popFlags: {} });
  assert.ok(rep.short.includes('Nothing on this round.'));
  assert.equal(rep.debts.length, 0);
  assert.equal(rep.anyMoney, false);
});

test('the report handles a nine-hole solo round', () => {
  const players = P(1);
  const rep = W.SharingService.roundReport(
    { players, course: course9, formats: [], games: [], startingTee: 1 },
    { scores: { p1: Array(9).fill(4) }, popFlags: {} });
  assert.ok(rep.short.includes('9 holes'));
  assert.ok(rep.short.includes('Player 1'));
  assert.equal(rep.debts.length, 0);
});

// ── 7. Scorecard import ─────────────────────────────────────────────────────

test('a labelled scorecard with OUT/IN/TOTAL parses cleanly', () => {
  const text = [
    'HOLE     1  2  3  4  5  6  7  8  9  OUT  10 11 12 13 14 15 16 17 18  IN  TOT',
    'PAR      4  5  3  4  4  5  3  4  4   36   4  4  3  4  5  4  4  3  5   36  72',
    'YARDS  381 502 388 331 188 513 106 418 464 3291 446 380 202 399 573 397 402 208 543 3550 6841',
    'HCP     11  7 13 17  9  3 15  1  5        2 10 12  8  4 14 16  6 18',
  ].join('\n');
  const r = W.ScorecardImport.parseScorecard(text, 18);
  assert.equal(r.par.length, 18);
  assert.equal(r.par.reduce((a, b) => a + b, 0), 72);
  assert.equal(r.hdcp[0], 11);
  assert.equal(r.yds[0], 381);
  assert.equal(r.yds[17], 543);
  same(W.ScorecardImport.validate(r, 18), []);
});

test('unlabelled rows are identified by their shape', () => {
  const text = [
    '4 5 3 4 4 5 3 4 4 4 4 3 4 5 4 4 3 5',
    '381 502 388 331 188 513 106 418 464 446 380 202 399 573 397 402 208 543',
    '11 7 13 17 9 3 15 1 5 2 10 12 8 4 14 16 6 18',
  ].join('\n');
  const r = W.ScorecardImport.parseScorecard(text, 18);
  assert.equal(r.par.reduce((a, b) => a + b, 0), 72);
  assert.equal(r.hdcp[7], 1);
  assert.equal(r.yds[0], 381);
});

test('front and back nine rows stitch into one card', () => {
  const text = [
    'Par  4 5 3 4 4 5 3 4 4', 'Par  4 4 3 4 5 4 4 3 5',
    'S.I. 11 7 13 17 9 3 15 1 5', 'S.I. 2 10 12 8 4 14 16 6 18',
  ].join('\n');
  const r = W.ScorecardImport.parseScorecard(text, 18);
  assert.equal(r.par.length, 18);
  assert.equal(r.hdcp.length, 18);
  same(W.ScorecardImport.validate(r, 18), []);
});

test('a nine-hole card parses and validates', () => {
  const r = W.ScorecardImport.parseScorecard(
    'Par 4 4 3 5 4 4 3 5 4\nHandicap 5 1 9 3 7 2 8 4 6\nYards 380 410 165 505 395 372 150 498 388', 9);
  assert.equal(r.par.reduce((a, b) => a + b, 0), 36);
  assert.equal(r.hdcp.length, 9);
  same(W.ScorecardImport.validate(r, 9), []);
});

test('the parser says what it could not read instead of guessing', () => {
  const r = W.ScorecardImport.parseScorecard('4 5 3 4 4 5 3 4 4 4 4 3 4 5 4 4 3 5', 18);
  assert.ok(r.par);
  assert.equal(r.hdcp, null);
  assert.ok(r.notes.some(n => /stroke-index/.test(n)));
});

test('validate rejects a stroke index that is not a permutation', () => {
  const bad = { par: null, hdcp: Array(18).fill(1), yds: null, notes: [] };
  assert.ok(W.ScorecardImport.validate(bad, 18).length > 0);
  const badPar = { par: Array(18).fill(6), hdcp: null, yds: null, notes: [] };
  assert.ok(W.ScorecardImport.validate(badPar, 18).some(m => /Total par/.test(m)));
});

// ── 8. Groups ───────────────────────────────────────────────────────────────

test('a new group id is long enough to be unguessable', () => {
  const id = W.GroupService.newGroupId();
  assert.equal(id.length, 26);
  assert.ok(/^[0-9A-Z]+$/.test(id));
  assert.ok(!/[ILOU]/.test(id), 'the alphabet drops letters that are misread');
  assert.notEqual(W.GroupService.newGroupId(), id);
});

test('group codes survive being typed by a human', () => {
  const id = W.GroupService.newGroupId();
  const pretty = W.GroupService.displayCode(id);
  assert.ok(pretty.includes('-'));
  assert.equal(W.GroupService.normalizeCode(pretty), id);
  assert.equal(W.GroupService.normalizeCode(pretty.toLowerCase()), id);
  assert.equal(W.GroupService.normalizeCode(' ' + pretty + ' '), id);
});

test('lookalike characters normalize to the real ones', () => {
  assert.equal(W.GroupService.normalizeCode('IL0O'), '1100');
  assert.equal(W.GroupService.normalizeCode('U'), 'V');
});

test('a short or empty code is not a group', () => {
  assert.equal(W.GroupService.isValidCode(''), false);
  assert.equal(W.GroupService.isValidCode('ABC'), false);
  assert.equal(W.GroupService.isValidCode(W.GroupService.newGroupId()), true);
});

// ── 9. A public build ships no personal data ────────────────────────────────

test('a fresh install starts with an empty roster', () => {
  same(W.DEFAULT_PLAYERS, [],
    'shipping sample profiles puts strangers\u2019 names, emails and Venmo handles in a public build');
});
