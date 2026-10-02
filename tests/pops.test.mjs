// Handicap strokes ("pops"): ONE allocator (HandicapService.allocateStrokes)
// drives every format, the scorecard pop dots, net scores and summaries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadPlayPal } from './helpers/load.mjs';

const W = loadPlayPal();
const HS = W.HandicapService;
const jeq = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

// Harkers Hollow men's card: SI 1 is hole 4, SI 2 is hole 10.
const SI = [7, 5, 11, 1, 15, 13, 9, 3, 17, 2, 16, 8, 4, 14, 12, 18, 10, 6];
const holes18 = SI.map((s, i) => ({ num: i + 1, par: 4, hdcp: s }));
const holesWithSi = (pops, holes) => holes.map((h, i) => [h.hdcp, pops[i]]).filter(([, n]) => n).map(([s, n]) => s + (n > 1 ? 'x' + n : ''));
const siGetting = (pops, holes, k) => holes.filter((h, i) => pops[i] === k).map(h => Number(h.hdcp)).sort((a, b) => a - b);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test('5 pops land on SI 1-5, not holes 1-5', () => {
  const p = HS.allocateStrokes(5, holes18);
  jeq(siGetting(p, holes18, 1), [1, 2, 3, 4, 5]);
  assert.equal(p[0], 0, 'hole 1 (SI 7) gets nothing');
  assert.equal(p[3], 1, 'hole 4 (SI 1) pops');
  assert.equal(p.reduce((a, b) => a + b, 0), 5);
});

test('0 pops → nothing anywhere', () => {
  jeq(HS.allocateStrokes(0, holes18), Array(18).fill(0));
});

test('18 pops → exactly one on every hole', () => {
  jeq(HS.allocateStrokes(18, holes18), Array(18).fill(1));
});

test('20 pops → two on SI 1-2, one everywhere else', () => {
  const p = HS.allocateStrokes(20, holes18);
  jeq(siGetting(p, holes18, 2), [1, 2]);
  jeq(siGetting(p, holes18, 1), range(3, 18));
});

test('38 pops → three on SI 1-2, two everywhere else', () => {
  const p = HS.allocateStrokes(38, holes18);
  jeq(siGetting(p, holes18, 3), [1, 2]);
  jeq(siGetting(p, holes18, 2), range(3, 18));
});

test('string SI ("10" vs "9") sorts numerically', () => {
  const str = holes18.map(h => ({ ...h, hdcp: String(h.hdcp) }));
  jeq(HS.allocateStrokes(10, str), HS.allocateStrokes(10, holes18));
  jeq(siGetting(HS.allocateStrokes(10, str), str, 1), range(1, 10));
});

test('fractional pops round like the course handicap (Math.round)', () => {
  jeq(HS.allocateStrokes(4.5, holes18), HS.allocateStrokes(5, holes18));
  jeq(HS.allocateStrokes(4.4, holes18), HS.allocateStrokes(4, holes18));
});

test('missing SI ranks after real SI; ties break by hole order', () => {
  const h = holes18.map((x, i) => (i === 3 ? { num: 4, par: 4 } : x)); // hole 4 lost its SI
  const p = HS.allocateStrokes(1, h);
  assert.equal(p[9], 1, 'SI 2 (hole 10) is now the hardest');
  assert.equal(p[3], 0);
  const tie = holes18.map(x => ({ ...x, hdcp: 1 }));
  jeq(HS.allocateStrokes(2, tie).slice(0, 3), [1, 1, 0]);
});

test('9-hole back nine ranks the played holes by course SI', () => {
  const back = holes18.slice(9); // SI 2,16,8,4,14,12,18,10,6
  const p = HS.allocateStrokes(3, back);
  jeq(siGetting(p, back, 1), [2, 4, 6]);          // the three hardest of the nine
  jeq(HS.allocateStrokes(9, back), Array(9).fill(1));
  const p11 = HS.allocateStrokes(11, back);
  jeq(siGetting(p11, back, 2), [2, 4]);
  // Same through the legacy single-hole helper + ranks.
  const ranks = W.strokeIndexRanks(back);
  jeq(back.map((_, i) => W.getHoleStrokes(3, ranks[i], 9)), p);
});

test('plus handicap gives back from the easiest hole', () => {
  const p = HS.allocateStrokes(-2, holes18);
  jeq(siGetting(p, holes18, -1), [17, 18]);
});

// ── Every format uses the shared function ─────────────────────────────────
const course = { id: 'hh', name: 'Test', rating: 72, slope: 113, holes: holes18 };
const P4 = [0, 5, 10, 20].map((h, i) => ({ id: 'p' + i, name: 'P' + i, handicap: h }));

test('auto pops, Markey pops and the playing-handicap table all equal allocateStrokes', () => {
  const auto = W.autoPopStrokes(P4, course, 'default', { allowancePct: 100, relative: true });
  const markey = W.calcMarkeyMatchPops(P4, course, 'default');
  const ph = HS.playingHandicaps(P4, holes18, { rating: 72, slope: 113 }, { relative: true });
  P4.forEach(p => {
    const want = HS.allocateStrokes(p.handicap, holes18);
    jeq(auto[p.id], want, 'autoPopStrokes ' + p.id);
    jeq(markey[p.id], want, 'calcMarkeyMatchPops ' + p.id);
    jeq(ph[p.id].strokes, want, 'playingHandicaps ' + p.id);
  });
  // 5 pops → SI 1-5 through the round-start path.
  jeq(siGetting(auto.p1, holes18, 1), [1, 2, 3, 4, 5]);
});

test('engine formats (skins, Nassau, match play, net stroke play, Sixes) pop on SI, not hole number', () => {
  // p1 gets 1 pop → SI 1 = hole 4. Everyone makes 4s; p1 makes 5 on hole 4.
  const players = [{ id: 'a', name: 'A', handicap: 0 }, { id: 'b', name: 'B', handicap: 1 }];
  const scores = { a: Array(18).fill(4), b: Array(18).fill(4) };
  scores.b[3] = 5;
  const raw = { course, players, scores, startingTee: 1, gameState: {} };
  const run = (f, pl, r) => W.MatchEngine.compute({ id: 'g', formatId: f, config: { ...W.MatchEngine.defaultConfig(f, pl), scoringBasis: 'net' } }, r);
  const net = run('individualNet', players, raw);
  jeq(net.entries.find(e => e.id === 'b').perHole, Array(18).fill(4), 'net stroke play');
  assert.ok(run('skins', players, raw).entries.every(e => e.total === 0), 'skins: no net skin');
  assert.ok(run('matchPlay', players, raw).entries[0].perHole.every(x => x === 'halved'), 'match play halves every hole');
  assert.match(run('nassau', players, raw).entries[0].detail, /F9 AS · B9 AS · 18 AS/, 'Nassau all square');
  // Sixes needs four.
  const p4 = [...players, { id: 'c', name: 'C', handicap: 0 }, { id: 'd', name: 'D', handicap: 0 }];
  const s4 = { ...scores, c: Array(18).fill(4), d: Array(18).fill(4) };
  const sixes = run('sixes', p4, { ...raw, players: p4, scores: s4 });
  assert.ok(sixes.entries.every(e => e.total === sixes.entries[0].total), 'Sixes: everyone level');
});

test('EGT allocator agrees with the shared one on its verified courses', () => {
  const H = W.EgtHandicap;
  if (!H || !H.allocatePops) return;
  const egtHoles = holes18.map(h => ({ hole: h.num, si: h.hdcp }));
  for (const n of [0, 1, 5, 18, 20, 37]) {
    const got = Array(18).fill(0);
    (H.allocatePops(n, egtHoles) || []).forEach(p => { got[p.hole - 1] = p.strokes; });
    jeq(got, HS.allocateStrokes(n, holes18), 'EGT n=' + n);
  }
});

test('no component computes pops from the raw hole number', () => {
  const dir = new URL('../components/', import.meta.url);
  for (const f of readdirSync(dir).filter(f => /\.(js|jsx)$/.test(f))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!/getHoleStrokes\([^)]*\.hdcp/.test(src), f + ' feeds a raw hdcp to getHoleStrokes');
  }
});

// ── Placeholder-SI repair (the real-world bug) ─────────────────────────────
const placeholderCourse = {
  id: 'custom_1', name: 'Harkers Hollow', rating: 71, slope: 130, custom: true,
  tees: [{ id: 'default', name: 'Standard', rating: 71, slope: 130 }],
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, yds: 0, hdcp: i + 1 })),
};

test('placeholder SI (= hole number) is detected and repaired for a known card', () => {
  assert.equal(HS.isPlaceholderStrokeIndex(placeholderCourse.holes), true);
  assert.equal(HS.isPlaceholderStrokeIndex(holes18), false);
  const fixed = W.CourseService.repairStrokeIndex(placeholderCourse);
  jeq(fixed.holes.map(h => h.hdcp), SI);
  assert.equal(fixed.holes.reduce((a, h) => a + h.par, 0), 70);
  // Unknown course / real SI → returned untouched.
  const other = { ...placeholderCourse, name: 'Somewhere Else' };
  assert.equal(W.CourseService.repairStrokeIndex(other), other);
  const real = { ...course };
  assert.equal(W.CourseService.repairStrokeIndex(real), real);
});

test('in-progress round: pops follow the repaired SI, scores and hand edits untouched', () => {
  const players = [
    { id: 'john', name: 'John', handicap: 22.8 }, { id: 'tj', name: 'TJ', handicap: 19.4 },
    { id: 'brian', name: 'Brian', handicap: 30.2 }, { id: 'mike', name: 'Mike', handicap: 22.2 },
  ];
  const opts = { allowancePct: 100, relative: true };
  const oldAuto = W.autoPopStrokes(players, placeholderCourse, 'default', opts);
  jeq(oldAuto.john.slice(0, 5), [1, 1, 1, 1, 0], 'bug: John pops holes 1-4');
  const round = { id: 42, players, course: placeholderCourse, teeId: 'default', formats: [], autoPops: oldAuto };
  const next = W.repairRoundStrokeIndex(round);
  assert.notEqual(next, round);
  const holes = next.course.holes;
  jeq(siGetting(next.autoPops.john, holes, 1), [1, 2, 3, 4], 'John now pops SI 1-4');
  // Untouched local pops follow; hand-edited ones don't.
  jeq(W.popsFollowingRepair(oldAuto, oldAuto, next.autoPops), next.autoPops);
  const edited = { ...oldAuto, john: oldAuto.john.map((v, i) => (i === 17 ? 1 : v)) };
  assert.equal(W.popsFollowingRepair(edited, oldAuto, next.autoPops), edited);
  // Idempotent.
  assert.equal(W.repairRoundStrokeIndex(next), next);
});

test('Setup pop panels seed from the repaired course; unknown placeholder SI is flagged', () => {
  const setup = readFileSync(new URL('../components/Setup.jsx', import.meta.url), 'utf8');
  const sel = setup.slice(setup.indexOf('const selectCourse'), setup.indexOf('const selectCourse') + 600);
  assert.match(sel, /repairStrokeIndex/, 'selectCourse repairs placeholder SI before any pop panel seeds');
  assert.match(setup, /<SiMissingBanner course=\{course\}/, 'pop panel flags missing SI');
  const shared = readFileSync(new URL('../components/Shared.jsx', import.meta.url), 'utf8');
  assert.match(shared, /Course handicap holes missing, enter from card/);
  // The John v TJ panel on Harkers: 11 pops go to SI 1-11, not holes 1-11.
  const fixed = W.CourseService.repairStrokeIndex(W.CourseService.normalizeCourse(placeholderCourse));
  const pops = W.autoPopStrokes([{ id: 'john', handicap: 19.9 }, { id: 'tj', handicap: 29.4 }], fixed, 'default', { allowancePct: 100, relative: true });
  assert.equal(pops.tj.reduce((a, b) => a + b, 0), 11);
  jeq(siGetting(pops.tj, fixed.holes, 1), range(1, 11));
  jeq(pops.tj.map((n, i) => n ? i + 1 : 0).filter(Boolean), [1, 2, 3, 4, 7, 8, 10, 12, 13, 17, 18]);
  // An unknown course with placeholder SI stays flagged (not repaired).
  const unknown = W.CourseService.repairStrokeIndex(W.CourseService.normalizeCourse({ ...placeholderCourse, name: 'Mystery Muni' }));
  assert.equal(HS.isPlaceholderStrokeIndex(unknown.holes) && !unknown.siRepaired, true);
});
