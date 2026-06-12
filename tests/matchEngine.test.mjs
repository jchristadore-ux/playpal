import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const W = loadPlayPal();
const jeq = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
const ME = W.MatchEngine;

// Par-72, slope 113, rating 72 → Course Handicap === Handicap Index exactly,
// which keeps net math easy to assert.
const course = {
  id: 'test', name: 'Test National', location: 'Testville, NJ',
  rating: 72, slope: 113,
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, yds: 400, hdcp: i + 1 })),
};

const A = { id: 'a', name: 'Al Smith',  handicap: 0,  color: '#111111' };
const B = { id: 'b', name: 'Bo Jones',  handicap: 9,  color: '#222222' };
const C = { id: 'c', name: 'Cy Brown',  handicap: 18, color: '#333333' };
const D = { id: 'd', name: 'Dee White', handicap: 27, color: '#444444' };
const players = [A, B, C, D];

const fill = (n) => Array(18).fill(n);
const raw = (scores, extra = {}) => ({ course, players, scores, ...extra });

// ── Registry ──────────────────────────────────────────────────────────────────

test('engine ships the full required format library', () => {
  const ids = ME.list().map(f => f.id);
  const required = [
    'strokePlay', 'matchPlay', 'scramble', 'scramble2', 'bestBall', 'betterBall',
    'fourBall', 'alternateShot', 'foursomes', 'shamble', 'skins', 'nassau',
    'stableford', 'quota', 'wolf', 'bingoBangoBongo', 'sixes', 'chapman',
    'individualGross', 'individualNet', 'teamGross', 'teamNet',
  ];
  for (const id of required) assert.ok(ids.includes(id), `missing format ${id}`);
  assert.equal(required.length, 22);
});

test('aliases resolve to their canonical implementation', () => {
  const better = ME.get('betterBall');
  assert.equal(typeof better.compute, 'function');
  assert.equal(better.label, 'Better Ball');
  const fs = ME.get('foursomes');
  assert.ok(fs.teamEntry, 'foursomes inherits alternate-shot team entry');
});

test('registering a new format needs no engine changes; duplicates throw', () => {
  ME.register({
    id: 'testOnly', label: 'Test Only', category: 'individual', basis: 'gross',
    compute: () => ({ kind: 'leaderboard', entries: [], leaderIds: [], thru: 0, complete: false, status: 'ok', winner: null }),
  });
  assert.equal(ME.compute({ formatId: 'testOnly' }, raw({})).status, 'ok');
  assert.throws(() => ME.register({ id: 'testOnly', label: 'Dup', compute: () => ({}) }));
});

test('unknown format degrades gracefully', () => {
  const res = ME.compute({ formatId: 'nope' }, raw({}));
  assert.equal(res.status, 'Unknown format');
  jeq(res.entries, []);
});

// ── Stroke play & net ─────────────────────────────────────────────────────────

test('stroke play: lowest gross wins with margin', () => {
  const res = ME.compute({ formatId: 'strokePlay' }, raw({
    a: fill(4), b: fill(5), c: fill(5), d: fill(6),
  }));
  assert.equal(res.complete, true);
  jeq(res.leaderIds, ['a']);
  assert.equal(res.entries[0].total, 72);
  assert.equal(res.winner.text, 'Al wins by 18');
});

test('stroke play: partial round reports live leader, no winner', () => {
  const scores = { a: fill(null), b: fill(null), c: fill(null), d: fill(null) };
  scores.a = [4, 4, 4, ...Array(15).fill(null)];
  scores.b = [5, 5, 5, ...Array(15).fill(null)];
  scores.c = [5, 5, 5, ...Array(15).fill(null)];
  scores.d = [5, 5, 5, ...Array(15).fill(null)];
  const res = ME.compute({ formatId: 'strokePlay' }, raw(scores));
  assert.equal(res.complete, false);
  assert.equal(res.winner, null);
  assert.match(res.status, /Al leads by 3 thru 3/);
});

test('individual net: course handicap strokes convert gross into net', () => {
  // B (9 index) strokes on hdcp 1–9; everyone shoots 5s → B nets 4 on nine holes.
  const res = ME.compute({ formatId: 'individualNet', config: { playerIds: ['a', 'b'] } }, raw({
    a: fill(5), b: fill(5),
  }));
  const bEntry = res.entries.find(e => e.id === 'b');
  assert.equal(bEntry.total, 81);
  jeq(res.leaderIds, ['b']);
});

test('manual handicap override beats the profile index', () => {
  const res = ME.compute({
    formatId: 'individualNet',
    config: { playerIds: ['a', 'b'], handicapOverrides: { b: 0 } },
  }, raw({ a: fill(5), b: fill(5) }));
  assert.equal(res.leaderIds.length, 2, 'override to 0 makes it a tie');
});

// ── Points games ──────────────────────────────────────────────────────────────

test('stableford: WHS points off net scores', () => {
  // A scratch shoots all pars → 2 pts/hole = 36.
  const res = ME.compute({
    formatId: 'stableford',
    config: { playerIds: ['a', 'b'], allowancePct: 100 },
  }, raw({ a: fill(4), b: fill(6) }));
  const aE = res.entries.find(e => e.id === 'a');
  const bE = res.entries.find(e => e.id === 'b');
  assert.equal(aE.total, 36);
  // B: 9 holes net 5 (bogey → 1pt), 9 holes net 6 (double → 0)
  assert.equal(bE.total, 9);
  assert.equal(res.winner.text, 'Al wins by 27');
});

test('stableford honors a custom points table', () => {
  const res = ME.compute({
    formatId: 'stableford',
    config: { playerIds: ['a'], allowancePct: 100, pointsTable: { 0: 10 } },
  }, raw({ a: fill(4) }));
  assert.equal(res.entries[0].total, 180);
});

test('quota: points minus (36 − playing handicap) target', () => {
  // A (0) target 36, all pars → 36 pts → 0. C (18) target 18, all pars → 36 → +18.
  const res = ME.compute({ formatId: 'quota', config: { playerIds: ['a', 'c'] } }, raw({
    a: fill(4), c: fill(4),
  }));
  const aE = res.entries.find(e => e.id === 'a');
  const cE = res.entries.find(e => e.id === 'c');
  assert.equal(aE.total, 0);
  assert.equal(cE.total, 18);
  jeq(res.leaderIds, ['c']);
});

// ── Match play family ─────────────────────────────────────────────────────────

test('match play singles: dominant player closes it out early', () => {
  const res = ME.compute({ formatId: 'matchPlay', config: { playerIds: ['a', 'b'], scoringBasis: 'gross' } }, raw({
    a: fill(3), b: fill(5),
  }));
  assert.equal(res.complete, true);
  assert.equal(res.winner.text, 'Al wins 10&8');
});

test('match play: net relative gives the higher handicap strokes', () => {
  // Gross identical; B gets 9 strokes relative to A → B wins 9 holes, rest halved.
  const res = ME.compute({ formatId: 'matchPlay', config: { playerIds: ['a', 'b'], scoringBasis: 'net' } }, raw({
    a: fill(4), b: fill(4),
  }));
  assert.equal(res.winner.ids[0], 'b');
});

test('match play: all-square match halves', () => {
  const res = ME.compute({ formatId: 'matchPlay', config: { playerIds: ['a', 'b'], scoringBasis: 'gross' } }, raw({
    a: fill(4), b: fill(4),
  }));
  assert.equal(res.complete, true);
  assert.equal(res.winner.text, 'Match halved');
});

test('match play live status reports UP/thru and dormie', () => {
  const scores = { a: [...fill(null)], b: [...fill(null)] };
  for (let i = 0; i < 9; i++) { scores.a[i] = 4; scores.b[i] = 5; }
  const res = ME.compute({ formatId: 'matchPlay', config: { playerIds: ['a', 'b'], scoringBasis: 'gross' } }, raw(scores));
  assert.equal(res.complete, false);
  assert.match(res.status, /Al 9 UP thru 9 · dormie/);
});

test('four ball: 2v2 better-ball match with team config', () => {
  const config = {
    scoringBasis: 'gross',
    teams: [
      { id: 't1', name: 'Team A', playerIds: ['a', 'd'] },
      { id: 't2', name: 'Team B', playerIds: ['b', 'c'] },
    ],
  };
  const res = ME.compute({ formatId: 'fourBall', config }, raw({
    a: fill(3), b: fill(4), c: fill(4), d: fill(6),
  }));
  assert.equal(res.winner.label, 'Team A');
});

test('nassau: front, back, and overall are scored independently', () => {
  // A wins every front hole, B wins every back hole by 2 (takes overall on countback? no:
  // overall = +9 B? front +9 A, back −9... equal holes won → overall AS → split 1–1.
  const scores = { a: [...fill(null)], b: [...fill(null)] };
  for (let i = 0; i < 9; i++)  { scores.a[i] = 4; scores.b[i] = 5; }
  for (let i = 9; i < 18; i++) { scores.a[i] = 5; scores.b[i] = 4; }
  const res = ME.compute({ formatId: 'nassau', config: { playerIds: ['a', 'b'], scoringBasis: 'gross' } }, raw(scores));
  assert.equal(res.complete, true);
  assert.match(res.winner.text, /splits 1–1/);
  const aE = res.entries.find(e => e.id === 'a');
  assert.match(aE.detail, /F9 \+9/);
});

test('sixes: partners rotate every six holes', () => {
  // A & whoever partners A always win the hole (A shoots 3, everyone else 5).
  const res = ME.compute({ formatId: 'sixes', config: { scoringBasis: 'gross' } }, raw({
    a: fill(3), b: fill(5), c: fill(5), d: fill(5),
  }));
  const totals = Object.fromEntries(res.entries.map(e => [e.id, e.total]));
  // A wins all 18 holes (36 pts); each partner shares 6 holes (12 pts).
  assert.equal(totals.a, 36);
  assert.equal(totals.b, 12);
  assert.equal(totals.c, 12);
  assert.equal(totals.d, 12);
  assert.equal(res.winner.ids[0], 'a');
});

// ── Skins ─────────────────────────────────────────────────────────────────────

test('skins: outright wins only, ties carry the pot', () => {
  const scores = { a: fill(4), b: fill(4), c: fill(4), d: fill(4) };
  scores.b = [...scores.b]; scores.b[2] = 3;     // ties on 1–2 carry → hole 3 worth 3
  const res = ME.compute({ formatId: 'skins', config: { scoringBasis: 'gross' } }, raw(scores));
  const bE = res.entries.find(e => e.id === 'b');
  assert.equal(bE.total, 3);
  assert.match(bE.detail, /3 \(×3\)/);
});

test('skins: carryover can be disabled', () => {
  const scores = { a: fill(4), b: fill(4), c: fill(4), d: fill(4) };
  scores.b = [...scores.b]; scores.b[2] = 3;
  const res = ME.compute({ formatId: 'skins', config: { scoringBasis: 'gross', carryover: false } }, raw(scores));
  assert.equal(res.entries.find(e => e.id === 'b').total, 1);
});

test('skins: holes missing any score are skipped, not awarded', () => {
  const scores = { a: fill(4), b: fill(4), c: fill(4), d: [...fill(4)] };
  scores.a = [...scores.a]; scores.a[0] = 3;
  scores.d[0] = null;                            // hole 1 incomplete
  const res = ME.compute({ formatId: 'skins', config: { scoringBasis: 'gross' } }, raw(scores));
  assert.equal(res.entries.find(e => e.id === 'a').total, 0);
});

// ── Team formats ──────────────────────────────────────────────────────────────

const teams2v2 = (n1, n2) => ([
  { id: 't1', name: n1 || 'Team A', playerIds: ['a', 'd'] },
  { id: 't2', name: n2 || 'Team B', playerIds: ['b', 'c'] },
]);

test('best ball: one best ball per team, lower total wins', () => {
  const res = ME.compute({ formatId: 'bestBall', config: { scoringBasis: 'gross', teams: teams2v2() } }, raw({
    a: fill(4), d: fill(7), b: fill(5), c: fill(5),
  }));
  assert.equal(res.entries[0].label, 'Team A');
  assert.equal(res.entries[0].total, 72);
  assert.equal(res.entries[1].total, 90);
});

test('best ball: two best balls when configured', () => {
  const res = ME.compute({ formatId: 'bestBall', config: { scoringBasis: 'gross', countBalls: 2, teams: teams2v2() } }, raw({
    a: fill(4), d: fill(7), b: fill(5), c: fill(5),
  }));
  assert.equal(res.entries.find(e => e.label === 'Team A').total, (4 + 7) * 18);
  assert.equal(res.entries.find(e => e.label === 'Team B').total, (5 + 5) * 18);
});

test('team gross and team net aggregate every member', () => {
  const gross = ME.compute({ formatId: 'teamGross', config: { teams: teams2v2() } }, raw({
    a: fill(4), d: fill(5), b: fill(4), c: fill(4),
  }));
  assert.equal(gross.entries.find(e => e.label === 'Team A').total, (4 + 5) * 18);
  assert.equal(gross.entries.find(e => e.label === 'Team B').total, (4 + 4) * 18);

  // Net: D (27) gets 27 strokes, C (18) 18, B (9) 9 — A scratch.
  const net = ME.compute({ formatId: 'teamNet', config: { teams: teams2v2() } }, raw({
    a: fill(4), d: fill(5), b: fill(4), c: fill(4),
  }));
  const a = net.entries.find(e => e.label === 'Team A').total;  // 72 + (90−27) = 135
  const b = net.entries.find(e => e.label === 'Team B').total;  // (72−9) + (72−18) = 117
  assert.equal(a, 135);
  assert.equal(b, 117);
});

test('scramble: team score is entered once on any card; 35/15 handicap blend', () => {
  // Only the "captain" enters scores. Team A: CHs 0 & 27 → 0.35·0 + 0.15·27 = 4.05 → 4 strokes.
  // Team B: CHs 9 & 18 → 0.35·9 + 0.15·18 = 5.85 → 6 strokes.
  const scores = { a: fill(4), b: fill(4), c: fill(null), d: fill(null) };
  const res = ME.compute({ formatId: 'scramble', config: { scoringBasis: 'net', teams: teams2v2() } }, raw(scores));
  const tA = res.entries.find(e => e.label === 'Team A');
  const tB = res.entries.find(e => e.label === 'Team B');
  assert.equal(tA.total, 72 - 4);
  assert.equal(tB.total, 72 - 6);
  assert.equal(res.complete, true, 'one entered score per team per hole completes the round');
});

test('alternate shot uses 50% combined; chapman uses 60/40', () => {
  const scores = { a: fill(5), b: fill(5), c: fill(null), d: fill(null) };
  const alt = ME.compute({ formatId: 'alternateShot', config: { scoringBasis: 'net', teams: teams2v2() } }, raw(scores));
  // Team A: (0+27)/2 = 13.5 → 14; Team B: (9+18)/2 = 13.5 → 14 → tie
  assert.equal(alt.entries[0].total, alt.entries[1].total);

  const chap = ME.compute({ formatId: 'chapman', config: { scoringBasis: 'net', teams: teams2v2() } }, raw(scores));
  // Team A: 0.6·0 + 0.4·27 = 10.8 → 11; Team B: 0.6·9 + 0.4·18 = 12.6 → 13
  const tA = chap.entries.find(e => e.label === 'Team A');
  const tB = chap.entries.find(e => e.label === 'Team B');
  assert.equal(tA.total, 90 - 11);
  assert.equal(tB.total, 90 - 13);
});

test('2-person scramble validates exact team sizes', () => {
  const bad = ME.validateGame({ formatId: 'scramble2', config: { teams: [
    { id: 't1', name: 'Team A', playerIds: ['a'] },
    { id: 't2', name: 'Team B', playerIds: ['b', 'c'] },
  ] } }, players);
  assert.equal(bad.ok, false);
  const good = ME.validateGame({ formatId: 'scramble2', config: { teams: teams2v2() } }, players);
  assert.equal(good.ok, true);
});

// ── Input-driven formats ──────────────────────────────────────────────────────

test('engine wolf: lone wolf doubles up, partners split', () => {
  const wolf = {
    0: { wolfId: 'a', partnerId: null, lone: true,  confirmed: true },
    1: { wolfId: 'b', partnerId: 'a',  lone: false, confirmed: true },
  };
  const scores = {
    a: [3, 4, ...fill(null).slice(2)],
    b: [5, 4, ...fill(null).slice(2)],
    c: [5, 5, ...fill(null).slice(2)],
    d: [5, 5, ...fill(null).slice(2)],
  };
  const res = ME.compute({ formatId: 'wolf', config: { scoringBasis: 'gross' } }, raw(scores, { gameState: { wolf } }));
  const totals = Object.fromEntries(res.entries.map(e => [e.id, e.total]));
  assert.equal(totals.a, 3); // 2 (lone win) + 1 (partner win)
  assert.equal(totals.b, 1);
  assert.equal(totals.c, 0);
});

test('engine bingo bango bongo tallies awarded points', () => {
  const bbb = { 0: { bingo: 'a', bango: 'b', bongo: 'a', confirmed: true } };
  const res = ME.compute({ formatId: 'bingoBangoBongo' }, raw({}, { gameState: { bbb } }));
  const totals = Object.fromEntries(res.entries.map(e => [e.id, e.total]));
  assert.equal(totals.a, 2);
  assert.equal(totals.b, 1);
});

// ── Config & validation helpers ───────────────────────────────────────────────

test('defaultConfig builds handicap-balanced serpentine teams', () => {
  const cfg = ME.defaultConfig('bestBall', players);
  assert.equal(cfg.teams.length, 2);
  // Sorted by hcp: a(0), b(9), c(18), d(27) → serpentine: t1 [a,d], t2 [b,c]
  jeq(cfg.teams[0].playerIds, ['a', 'd']);
  jeq(cfg.teams[1].playerIds, ['b', 'c']);
});

test('validateGame catches duplicate assignment and player counts', () => {
  const dup = ME.validateGame({ formatId: 'bestBall', config: { teams: [
    { id: 't1', name: 'A', playerIds: ['a', 'b'] },
    { id: 't2', name: 'B', playerIds: ['b', 'c'] },
  ] } }, players);
  assert.equal(dup.ok, false);
  assert.match(dup.error, /two teams/);

  const tooFew = ME.validateGame({ formatId: 'sixes' }, [A, B]);
  assert.equal(tooFew.ok, false);
});

// ── 9-hole + back-tee starts ──────────────────────────────────────────────────

test('engine handles 9-hole courses end to end', () => {
  const nine = { ...course, holeCount: 9, holes: course.holes.slice(0, 9) };
  const res = ME.compute({ formatId: 'strokePlay' }, {
    course: nine, players: [A, B],
    scores: { a: Array(9).fill(4), b: Array(9).fill(5) },
  });
  assert.equal(res.complete, true);
  assert.equal(res.entries[0].total, 36);
  assert.equal(res.winner.ids[0], 'a');
});

test('10th-tee starts close out matches in play order', () => {
  const scores = { a: [...fill(null)], b: [...fill(null)] };
  // Only back nine played so far (10th-tee start) — A sweeps it.
  for (let i = 9; i < 18; i++) { scores.a[i] = 4; scores.b[i] = 5; }
  const res = ME.compute(
    { formatId: 'matchPlay', config: { playerIds: ['a', 'b'], scoringBasis: 'gross' } },
    raw(scores, { startingTee: 10 })
  );
  assert.equal(res.complete, false);
  assert.match(res.status, /9 UP thru 9/);
});

// ── Engine-wide invariants ────────────────────────────────────────────────────

test('every non-input format returns a normalized result on a finished round', () => {
  const scores = { a: fill(4), b: fill(5), c: fill(6), d: fill(7) };
  for (const meta of ME.list()) {
    if (meta.needsInput) continue;
    const cfg = ME.defaultConfig(meta.id, players);
    const res = ME.compute({ formatId: meta.id, config: cfg }, raw(scores));
    assert.ok(['leaderboard', 'match', 'segments'].includes(res.kind), meta.id + ' kind');
    assert.ok(Array.isArray(res.entries), meta.id + ' entries');
    assert.ok(typeof res.status === 'string' && res.status.length > 0, meta.id + ' status');
    for (const e of res.entries) {
      assert.ok(typeof e.total === 'number' && !isNaN(e.total), meta.id + ' entry total');
      assert.ok(typeof e.totalLabel === 'string', meta.id + ' totalLabel');
    }
  }
});
