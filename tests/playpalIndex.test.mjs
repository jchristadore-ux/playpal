import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const W = loadPlayPal();
const IS = W.IndexService;
const plain = (x) => JSON.parse(JSON.stringify(x));

const holes18 = Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, yds: 400, hdcp: i + 1 }));
const holes9 = Array.from({ length: 9 }, (_, i) => ({ num: i + 1, par: 4, yds: 400, hdcp: i + 1 }));
const course18 = { id: 'sv', name: 'Smoke Valley', rating: 71.2, slope: 128, holes: holes18,
  tees: [{ id: 'blue', name: 'Blue', rating: 71.2, slope: 128 }] };
const course9 = { id: 'n9', name: 'Nine', holeCount: 9, rating: 35.5, slope: 120, holes: holes9,
  tees: [{ id: 't', name: 'White', rating: 35.5, slope: 120 }] };

let seq = 0;
function rd({ course = course18, scores, handicap = 10, dropouts = {}, roundId, syncCode, savedAt, teeId = null } = {}) {
  seq++;
  return {
    roundId: roundId !== undefined ? roundId : 'r' + seq,
    syncCode: syncCode !== undefined ? syncCode : 'S' + seq,
    teeId, course, players: [{ id: 'p', name: 'Pat', handicap }],
    scores: { p: scores }, putts: {}, firData: {}, girData: {}, extraStats: {}, dropouts,
    savedAt: savedAt || (1780000000000 + seq * 86400000),
  };
}
const fill = (n, v) => Array(n).fill(v);
const player = (extra = {}) => W.ProfileService.normalizePlayer({ id: 'p', name: 'Pat', handicap: 10, ...extra });
const diffs = (vals) => vals.map((v, i) => ({ roundId: 'd' + i, syncCode: 'D' + i, differential: v, playedAt: 1e12 - i }));

test('net double bogey caps a hole at par + 2 + strokes (1 stroke)', () => {
  // Index 10 @ 128/71.2/par72 → CH 10.53 → 11 strokes on SI 1–11.
  const s = fill(18, 5); s[0] = 9;              // SI 1 → max 4+2+1 = 7
  const r = IS.roundDifferential(rd({ scores: s }), 'p');
  assert.equal(r.postable, true);
  assert.equal(r.gross, 94);
  assert.equal(r.ags, 92);
  assert.equal(r.perHole[0].max, 7);
  assert.equal(r.perHole[11].max, 6, 'SI 12 gets no stroke');
});

test('net double bogey with 2 strokes received on a hole', () => {
  // Index 30 → CH 33.18 → 33 strokes: 2 on SI 1–15, 1 on SI 16–18.
  const s = fill(18, 6); s[0] = 12; s[17] = 10;
  const r = IS.roundDifferential(rd({ scores: s, handicap: 30 }), 'p');
  assert.equal(r.perHole[0].strokes, 2);
  assert.equal(r.perHole[0].max, 8);
  assert.equal(r.perHole[0].capped, 8);
  assert.equal(r.perHole[17].max, 7);
  assert.equal(r.ags, 16 * 6 + 8 + 7);
});

test('differential formula matches a hand-checked example', () => {
  // (113/128) × (92 − 71.2) = 0.8828125 × 20.8 = 18.3625 → 18.4
  const s = fill(18, 5); s[0] = 9;
  assert.equal(IS.roundDifferential(rd({ scores: s }), 'p').differential, 18.4);
  assert.equal(IS.scoreDifferential(92, 71.2, 128), 18.4);
});

test('allowance table: every row', () => {
  const rows = [
    [3, 1, -2.0], [4, 1, -1.0], [5, 1, 0], [6, 2, -1.0], [7, 2, 0], [8, 2, 0],
    [9, 3, 0], [10, 3, 0], [11, 3, 0], [12, 4, 0], [13, 4, 0], [14, 4, 0],
    [15, 5, 0], [16, 5, 0], [17, 6, 0], [18, 6, 0], [19, 7, 0], [20, 8, 0],
  ];
  for (const [n, use, adj] of rows) {
    const vals = Array.from({ length: n }, (_, i) => 30 - i);   // lowest are the last ones
    const c = IS.computeIndex(diffs(vals));
    const lowest = vals.slice().sort((a, b) => a - b).slice(0, use);
    const expect = IS.trunc1(lowest.reduce((a, b) => a + b, 0) / use + adj);
    assert.equal(c.count, n);
    assert.equal(c.used, use, 'n=' + n + ' uses lowest ' + use);
    assert.equal(c.adjustment, adj, 'n=' + n + ' adjustment');
    assert.equal(c.index, expect, 'n=' + n + ' index');
  }
  // More than 20 on the list: only the most recent 20 count.
  assert.equal(IS.computeIndex(diffs(Array.from({ length: 25 }, () => 10))).count, 20);
});

test('fewer than 3 differentials → no index yet', () => {
  assert.equal(IS.computeIndex([]).index, null);
  assert.equal(IS.computeIndex(diffs([10])).index, null);
  const c = IS.computeIndex(diffs([10, 12]));
  assert.equal(c.index, null);
  assert.equal(c.needed, 1);
});

test('index truncates to one decimal (never rounds)', () => {
  // 7 diffs → avg lowest 2: (11.9 + 12.0)/2 = 11.95 → 11.9 (rounding would say 12.0)
  assert.equal(IS.computeIndex(diffs([11.9, 12.0, 20, 20, 20, 20, 20])).index, 11.9);
  // 6 diffs → lowest 2 − 1.0: (12.9 + 13.0)/2 − 1 = 11.95 → 11.9
  assert.equal(IS.computeIndex(diffs([12.9, 13.0, 20, 20, 20, 20])).index, 11.9);
  assert.equal(IS.trunc1(11.99), 11.9);
  assert.equal(IS.trunc1(-1.25), -1.2);
  // Clamp at 54.
  assert.equal(IS.computeIndex(diffs([80, 80, 80, 80, 80])).index, 54);
});

test('20-round rolling window drops the oldest', () => {
  let p = player({ ppIndexMode: 'manual' });
  // Oldest round is a 60 (worst); then 20 rounds of 5s.
  p = IS.postRound(p, rd({ scores: fill(18, 12), handicap: 10 }));
  const oldest = p.ppDifferentials[0].roundId;
  for (let i = 0; i < 20; i++) p = IS.postRound(p, rd({ scores: fill(18, 5) }));
  assert.equal(p.ppDifferentials.length, 20);
  assert.ok(!p.ppDifferentials.some(d => d.roundId === oldest), 'oldest round dropped');
  assert.ok(p.ppDifferentials[0].playedAt > p.ppDifferentials[19].playedAt, 'newest first');
});

test('posting the same round twice changes nothing (roundId and syncCode dedupe)', () => {
  let p = player();
  const r = rd({ scores: fill(18, 5) });
  const once = IS.postRound(p, r);
  const twice = IS.postRound(once, r);
  assert.deepEqual(plain(twice), plain(once));
  // Re-sync with a new object but same syncCode → still deduped.
  const again = IS.postRound(once, { ...r, roundId: null });
  assert.deepEqual(plain(again), plain(once));
  const rep = IS.postRoundReport(once, r);
  assert.equal(rep.posted, false);
  assert.equal(rep.result.duplicate, true);
});

test('9-hole course round doubles and is tagged estimated', () => {
  // Index 10 on 9 holes → CH 5×120/113 + (35.5−36) = 4.81 → 5 strokes.
  const r = IS.roundDifferential(rd({ course: course9, scores: fill(9, 5) }), 'p');
  assert.equal(r.postable, true);
  assert.equal(r.holes, 9);
  assert.equal(r.estimated, true);
  // AGS 45 → (113/120)(45 − 35.5) = 8.9458 → 8.9 → ×2 = 17.8
  assert.equal(r.ags, 45);
  assert.equal(r.differential, 17.8);
});

test('18-hole layout with only 9 finished uses rating/2 and doubles', () => {
  const s = fill(18, null); for (let i = 0; i < 9; i++) s[i] = 5;
  const r = IS.roundDifferential(rd({ scores: s }), 'p');
  assert.equal(r.postable, true);
  assert.equal(r.holes, 9);
  assert.equal(r.estimated, true);
  assert.equal(r.rating, 35.6);
  // (113/128)(45 − 35.6) = 8.298 → 8.3 → 16.6
  assert.equal(r.differential, 16.6);
});

test('no rating/slope → postable:false, no-course-rating (never invented)', () => {
  const bare = { id: 'c', name: 'Muni', holes: holes18 };
  const r = IS.roundDifferential(rd({ course: bare, scores: fill(18, 5) }), 'p');
  assert.deepEqual({ postable: r.postable, reason: r.reason }, { postable: false, reason: 'no-course-rating' });
  // Custom course saved with blank fields (72/113 placeholders, flagged unrated).
  const custom = { id: 'x', name: 'Backyard', custom: true, rating: 72, slope: 113, holes: holes18,
    tees: [{ id: 'default', name: 'Standard', rating: 72, slope: 113, rated: false }] };
  assert.equal(IS.roundDifferential(rd({ course: custom, scores: fill(18, 5) }), 'p').reason, 'no-course-rating');
  // Legacy custom course with the exact placeholder pair and no flag.
  const legacy = { ...custom, tees: [{ id: 'default', name: 'Standard', rating: 72, slope: 113 }] };
  assert.equal(IS.roundDifferential(rd({ course: legacy, scores: fill(18, 5) }), 'p').reason, 'no-course-rating');
  // Explicitly rated 72/113 custom tee does post.
  const rated = { ...custom, tees: [{ id: 'default', name: 'Standard', rating: 72, slope: 113, rated: true }] };
  assert.equal(IS.roundDifferential(rd({ course: rated, scores: fill(18, 5) }), 'p').postable, true);
  // Player unchanged when it can't post.
  const p = player();
  assert.deepEqual(plain(IS.postRound(p, rd({ course: bare, scores: fill(18, 5) }))), plain(p));
});

test('walk-in after 11 holes posts a 9-hole differential; after 5 posts nothing', () => {
  const s11 = fill(18, null); for (let i = 0; i < 11; i++) s11[i] = 5;
  const r11 = IS.roundDifferential(rd({ scores: s11, dropouts: { p: { thru: 11 } } }), 'p');
  assert.equal(r11.postable, true);
  assert.equal(r11.holes, 9);
  assert.equal(r11.estimated, true);
  assert.equal(r11.differential, 16.6);
  const s5 = fill(18, null); for (let i = 0; i < 5; i++) s5[i] = 5;
  const r5 = IS.roundDifferential(rd({ scores: s5, dropouts: { p: { thru: 5 } } }), 'p');
  assert.equal(r5.postable, false);
  assert.equal(r5.reason, 'walked-in-before-9');
  assert.equal(IS.roundDifferential(rd({ scores: s5 }), 'p').reason, 'fewer-than-9-holes');
});

test('soft cap and hard cap', () => {
  assert.equal(IS.applyCaps(12.0, 10.0), 12.0, 'within 3.0 → unchanged');
  assert.equal(IS.applyCaps(15.0, 10.0), 14.0, 'soft: 3 + (5−3)/2 = 4');
  assert.equal(IS.applyCaps(22.0, 10.0), 15.0, 'hard: increase capped at 5.0');
  assert.equal(IS.applyCaps(15.0, null), 15.0, 'no low yet → uncapped');
  // Wired through postRound: low of 5.0 held, raw index jumps to 20+.
  let p = player({ ppIndexMode: 'manual', ppLowIndex365: 5.0, ppLowIndex365At: 1780000000000,
    ppDifferentials: diffs([25, 25, 25, 25]).map((d, i) => ({ ...d, playedAt: 1780000000000 - i })) });
  p = IS.postRound(p, rd({ scores: fill(18, 7), savedAt: 1780000000000 + 1000 }), { now: 1780000000000 + 1000 });
  assert.equal(p.ppIndex, 10.0, 'hard-capped at low + 5.0');
  assert.equal(p.ppLowIndex365, 5.0);
});

test('posting rounds never touches player.handicap or handicapSource (tracking only)', () => {
  let a = player({ handicap: 29.4, handicapSource: 'provider' });
  for (let i = 0; i < 3; i++) a = IS.postRound(a, rd({ scores: fill(18, 5), handicap: 29.4 }));
  assert.equal(typeof a.ppIndex, 'number');
  assert.notEqual(a.ppIndex, 29.4);
  assert.equal(a.handicap, 29.4);
  assert.equal(a.handicapSource, 'provider');
  assert.equal(a.ppDifferentials.length, 3);
  // A legacy 'auto' flag from older builds is ignored.
  let legacy = player({ handicap: 18, handicapSource: 'manual', ppIndexMode: 'auto' });
  for (let i = 0; i < 3; i++) legacy = IS.postRound(legacy, rd({ scores: fill(18, 5), handicap: 18 }));
  assert.equal(legacy.handicap, 18);
  assert.equal(legacy.handicapSource, 'manual');
  let m = player({ handicap: 18, ppIndexMode: 'manual' });
  for (let i = 0; i < 3; i++) m = IS.postRound(m, rd({ scores: fill(18, 5), handicap: 18 }));
  assert.equal(typeof m.ppIndex, 'number');
  assert.equal(m.handicap, 18);
  assert.equal(m.handicapSource, 'manual');
});

test('migration backfill (schema v3) is idempotent and additive', () => {
  const W2 = loadPlayPal();
  const ls = W2.localStorage;
  const rounds = [0, 1, 2, 3].map(i => ({
    round: { id: 1000 + i, syncCode: 'MIG' + i, course: course18, teeId: 'blue',
      players: [{ id: 'p', name: 'Pat', handicap: 10 }],
      holeScores: { p: fill(18, 0).map(() => ({ strokes: 5 + (i % 2), putts: 2 })) } },
    savedAt: 1780000000000 + i * 86400000,
  }));
  rounds.forEach(s => ls.setItem('pp_round_snap_' + s.round.syncCode, JSON.stringify(s)));
  const players = [{ id: 'p', name: 'Pat', handicap: 10 }, { id: 'q', name: 'Quinn', handicap: 5 }];
  const once = W2.migratePlayersV3(players);
  assert.equal(once[0].ppDifferentials.length, 4);
  assert.equal(once[0].handicap, 10, 'backfill never touches handicap');
  assert.notEqual(once[0].handicapSource, 'playpal');
  assert.equal(once[1].handicap, 5);
  assert.equal(typeof once[0].ppIndex, 'number');
  assert.deepEqual(plain(once[1].ppDifferentials), [], 'no rounds → nothing invented');
  assert.equal(once[1].ppIndex, null);
  const twice = W2.migratePlayersV3(once);
  assert.deepEqual(plain(twice), plain(once));
  // Through runMigrations from schema 2.
  ls.setItem('pp_players', JSON.stringify(players));
  ls.setItem('pp_schema_version', '2');
  const res = W2.runMigrations();
  assert.equal(res.to, 3);
  const stored = JSON.parse(ls.getItem('pp_players'));
  assert.equal(stored[0].ppDifferentials.length, 4);
  assert.equal(stored[0].handicap, 10, 'runMigrations leaves handicap as set');
  assert.equal(W2.runMigrations().ran, false, 'second run is a no-op');
});

test('roundDataFromSnapshot carries roundId / teeId for posting', () => {
  const d = W.StatsService.roundDataFromSnapshot({ round: { id: 42, syncCode: 'AB', teeId: 'blue', course: course18, players: [] }, scores: {} });
  assert.equal(d.roundId, 42);
  assert.equal(d.teeId, 'blue');
});

test('disclaimer is the plain unofficial line', () => {
  assert.equal(IS.DISCLAIMER, 'An unofficial index built from your PlayPal rounds — WHS-style math, but not a USGA Handicap Index and not valid for official competition.');
});
