import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

// Profile, round-history, sharing, and migration coverage in one suite —
// they share the same storage-backed fixture round.

const W = loadPlayPal();
const jeq = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

const course = {
  id: 'c1', name: 'Compare Hills', location: 'NJ', rating: 72, slope: 113,
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, yds: 410, hdcp: i + 1 })),
};
const players = [
  { id: 'a', name: 'Al Smith', color: '#111', handicap: 4 },
  { id: 'b', name: 'Bo Jones', color: '#222', handicap: 12 },
];

function snapshot(code, savedAt, grossA) {
  return {
    round: {
      syncCode: code, course, players,
      formats: [{ type: 'skins', stakes: 5 }],
      games: [{ id: 'g1', formatId: 'strokePlay', config: {} }],
      date: 'Mar 3, 2026',
    },
    scores: { a: Array(18).fill(grossA), b: Array(18).fill(5) },
    putts: { a: Array(18).fill(2), b: Array(18).fill(2) },
    savedAt,
  };
}

// ── ProfileService ────────────────────────────────────────────────────────────

test('normalizePlayer adds profile defaults without touching existing fields', () => {
  const p = W.ProfileService.normalizePlayer({ id: 'x', name: 'X', handicap: 7, venmo: 'x-v' });
  assert.equal(p.handicap, 7);
  assert.equal(p.venmo, 'x-v');
  assert.equal(p.dominantHand, 'R');
  jeq(p.favoriteFormats, []);
  assert.equal(p.preferredTee, '');
});

test('career derives most-played course and format', () => {
  const data = [
    W.StatsService.roundDataFromSnapshot(snapshot('AAA111', 1, 4)),
    W.StatsService.roundDataFromSnapshot(snapshot('BBB222', 2, 5)),
  ];
  const career = W.ProfileService.career('a', data);
  assert.equal(career.roundsPlayed, 2);
  assert.equal(career.mostPlayedCourse.name, 'Compare Hills');
  assert.equal(career.mostPlayedCourse.count, 2);
  assert.ok(['strokePlay', 'skins'].includes(career.mostPlayedFormat.name));
});

// ── RoundHistoryService ───────────────────────────────────────────────────────

test('listRoundData reads snapshots newest-first and skips corrupt entries', () => {
  W.localStorage.setItem('pp_round_snap_OLD111', JSON.stringify(snapshot('OLD111', 10, 5)));
  W.localStorage.setItem('pp_round_snap_NEW222', JSON.stringify(snapshot('NEW222', 20, 4)));
  W.localStorage.setItem('pp_round_snap_BAD333', '{not json');
  const list = W.RoundHistoryService.listRoundData();
  assert.equal(list.length, 2);
  assert.equal(list[0].syncCode, 'NEW222');
});

test('unfinishedRound: live round resumes, finished round does not', () => {
  const live = { id: 777, syncCode: 'LIVE01', course, players, formats: [] };
  W.localStorage.setItem('pp_round', JSON.stringify(live));
  W.localStorage.setItem('pp_scores_777', JSON.stringify({ a: [4, 4], b: [5, null] }));
  const resume = W.RoundHistoryService.unfinishedRound();
  assert.equal(resume.round.syncCode, 'LIVE01');
  assert.equal(resume.holesScored, 2);

  // Once a completed snapshot exists for that code there is nothing to resume.
  W.localStorage.setItem('pp_round_snap_LIVE01', JSON.stringify(snapshot('LIVE01', 30, 4)));
  assert.equal(W.RoundHistoryService.unfinishedRound(), null);
  W.localStorage.removeItem('pp_round_snap_LIVE01');
  W.localStorage.removeItem('pp_round');
});

// ── SharingService ────────────────────────────────────────────────────────────

test('scorecardText ranks players and includes games + money', () => {
  const text = W.SharingService.scorecardText(
    { course, players, date: 'Mar 3' },
    { a: Array(18).fill(4), b: Array(18).fill(5) },
    {
      gameResults: [{ name: 'Stroke Play', status: 'Al wins by 18' }],
      payouts: { a: 10, b: -10 },
    }
  );
  assert.match(text, /Compare Hills/);
  assert.match(text, /1\. Al Smith — 72 \(E\)/);
  assert.match(text, /2\. Bo Jones — 90 \(\+18\)/);
  assert.match(text, /Stroke Play: Al wins by 18/);
  assert.match(text, /Al Smith: \+\$10/);
});

test('scorecardCSV emits a row per hole plus totals and escapes commas', () => {
  const tricky = { ...course, holes: course.holes.slice(0, 2) };
  const csv = W.SharingService.scorecardCSV(
    { course: tricky, players: [{ id: 'a', name: 'Smith, Al' }] },
    { a: [4, 5] },
    { a: [2, 1] }
  );
  const lines = csv.split('\n');
  assert.equal(lines.length, 4); // header + 2 holes + total
  assert.match(lines[0], /"Smith, Al"/);
  assert.match(lines[3], /^TOTAL,8,,,9,3$/);
});

// ── Migrations ────────────────────────────────────────────────────────────────

test('v2 migration normalizes stored players and courses, then is idempotent', () => {
  W.localStorage.setItem('pp_schema_version', '1');
  W.localStorage.setItem('pp_players', JSON.stringify([{ id: 'p1', name: 'Old Guy', handicap: 9 }]));
  W.localStorage.setItem('pp_custom_courses', JSON.stringify([{ id: 'cc1', name: 'Old Course', rating: 70, slope: 120, holes: course.holes }]));

  const r1 = W.runMigrations();
  assert.equal(r1.ran, true);
  assert.equal(r1.to, W.PP_SCHEMA_VERSION);

  const migratedPlayers = JSON.parse(W.localStorage.getItem('pp_players'));
  assert.equal(migratedPlayers[0].name, 'Old Guy');
  assert.equal(migratedPlayers[0].dominantHand, 'R');
  const migratedCourses = JSON.parse(W.localStorage.getItem('pp_custom_courses'));
  assert.equal(migratedCourses[0].tees.length, 1);
  assert.equal(migratedCourses[0].holeCount, 18);

  const r2 = W.runMigrations();
  assert.equal(r2.ran, false, 'second run is a no-op');
});
