// HistoryImport — the stored EGT 2026 scorecards load into roster profiles,
// stats and history, and live EGT rounds post to the PlayPal Index.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlayPal } from './helpers/load.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = JSON.parse(readFileSync(join(root, 'fixtures/egt-2026-seed.json'), 'utf8'));
const RESULTS = JSON.parse(readFileSync(join(root, 'fixtures/egt-2026-results.json'), 'utf8'));

const roster = (W, extra = []) => [
  ['a1', 'John Smith', 15], ['b2', 'Brian', 20], ['c3', 'T.J.', 25], ['d4', 'Mike', 26], ...extra,
].map(([id, name, handicap]) => W.ProfileService.normalizePlayer({ id, name, handicap }));

test('embedded rounds match the stored fixtures exactly', () => {
  const W = loadPlayPal();
  const { ROUNDS } = W.HistoryImport;
  assert.equal(ROUNDS.length, 6);
  ROUNDS.forEach(r => {
    assert.deepEqual(JSON.parse(JSON.stringify(r.scores)), RESULTS.rounds[r.id].scores, r.id + ' scores');
    const seedRound = SEED.rounds.find(x => x.id === r.id);
    const c = SEED.courseLibrary[seedRound.courseId];
    const tee = c.tees.find(t => t.name === seedRound.playedTee);
    assert.equal(r.course.rating, tee.cr);
    assert.equal(r.course.slope, tee.slope);
    assert.deepEqual(Array.from(r.course.par), c.holes.slice(0, 18).map(h => h.par));
    assert.deepEqual(Array.from(r.course.si), c.holes.slice(0, 18).map(h => h.si));
  });
});

test('round ids and sync codes match what EgtBridge gives the live rounds', () => {
  const W = loadPlayPal();
  const m = W.EgtImporter.importSeed(JSON.parse(JSON.stringify(SEED)));
  W.HistoryImport.ROUNDS.forEach(r => {
    const nr = W.EgtBridge.toNativeRound(m, r.id);
    assert.equal(nr.syncCode, r.syncCode, r.id);
    assert.equal(nr.id, 'egt-egt-2026-' + r.id);
  });
});

test('matchRoster: real names, tournament names, egtId links; ambiguity never guesses', () => {
  const W = loadPlayPal();
  const HI = W.HistoryImport;
  assert.deepEqual({ ...HI.matchRoster(roster(W)) }, { john: 'a1', brian: 'b2', tj: 'c3', mike: 'd4' });
  const alt = [{ id: 'x', name: 'Jake' }, { id: 'y', name: 'Blake R' }, { id: 'z', name: 'Troy' }, { id: 'w', name: 'Miles' }];
  assert.deepEqual({ ...HI.matchRoster(alt) }, { john: 'x', brian: 'y', tj: 'z', mike: 'w' });
  const twoMikes = [{ id: 'm1', name: 'Mike A' }, { id: 'm2', name: 'Mike B' }];
  assert.equal(HI.matchRoster(twoMikes).mike, undefined);
  const linked = [...twoMikes.map(p => p.id === 'm2' ? { ...p, egtId: 'mike' } : p)];
  assert.equal(HI.matchRoster(linked).mike, 'm2');
});

test('apply posts every round to each profile and drives the handicap', () => {
  const W = loadPlayPal();
  const res = W.HistoryImport.apply(roster(W, [['e5', 'Dave', 10]]), W.localStorage);
  assert.equal(res.complete, true);
  assert.deepEqual({ ...res.posted }, { a1: 6, b2: 5, c3: 6, d4: 6 });
  const by = Object.fromEntries(res.players.map(p => [p.id, p]));
  // WHS differentials, identical to docs/scorecards/PLAYPAL_INDEX.md.
  assert.deepEqual(Array.from(by.a1.ppDifferentials, d => d.differential), [27.9, 23.7, 32.1, 29.8, 23.9, 31.7]);
  assert.deepEqual(Array.from(by.b2.ppDifferentials, d => d.differential), [33.4, 30.1, 39.4, 39.4, 39.7]);
  assert.equal(by.a1.ppIndex, 22.8);
  assert.equal(by.b2.ppIndex, 30.1);
  assert.equal(by.c3.ppIndex, 30.3);
  // Mike's index is soft-capped against his low after R3 (27.8): 32.2 → 31.5.
  assert.equal(by.d4.ppIndex, 31.5);
  ['a1', 'b2', 'c3', 'd4'].forEach(id => {
    assert.equal(by[id].handicap, by[id].ppIndex, 'auto mode → handicap follows index');
    assert.equal(by[id].handicapSource, 'playpal');
  });
  assert.equal(by.e5.ppIndex, null);
  assert.equal(by.e5.handicap, 10, 'unmatched players untouched');
  assert.equal(by.a1.egtId, 'john');
});

test('apply is idempotent and writes history + recent rounds once', () => {
  const W = loadPlayPal();
  const first = W.HistoryImport.apply(roster(W), W.localStorage);
  const again = W.HistoryImport.apply(first.players, W.localStorage);
  assert.equal(again.changed, false);
  assert.deepEqual(Array.from(again.players, p => p.ppDifferentials.length), [6, 5, 6, 6]);
  const history = W.RoundHistoryService.listRoundData();
  assert.equal(history.length, 6);
  const r1 = history.find(d => d.syncCode === 'W4K336');
  assert.deepEqual(Object.keys(r1.scores).sort(), ['a1', 'c3', 'd4'], 'history is keyed by roster ids');
  assert.equal(W.StatsService.computePlayerRound(r1, 'a1').gross, 90);
  const recent = JSON.parse(W.localStorage.getItem('pp_recent'));
  assert.equal(recent.filter(r => r.tripId === 'egt-2026').length, 6);
});

test('manual-mode players record differentials but keep their handicap', () => {
  const W = loadPlayPal();
  const ps = roster(W).map(p => p.id === 'a1' ? { ...p, ppIndexMode: 'manual' } : p);
  const res = W.HistoryImport.apply(ps, null);
  const john = res.players.find(p => p.id === 'a1');
  assert.equal(john.ppIndex, 22.8);
  assert.equal(john.handicap, 15);
});

test('a finished live EGT round posts to the matched profiles once', () => {
  const W = loadPlayPal();
  const m = W.EgtImporter.importSeed(JSON.parse(JSON.stringify(SEED)));
  const nr = W.EgtBridge.toNativeRound(m, 'R6');
  nr.syncCode = 'NEW123'; nr.id = 'egt-egt-2027-R6';
  const scores = RESULTS.rounds.R6.scores;
  const res = W.HistoryImport.postEgtRound(roster(W), nr, { scores }, Date.parse('2027-07-24T12:00:00Z'));
  assert.equal(res.changed, true);
  const john = res.players.find(p => p.id === 'a1');
  assert.equal(john.ppDifferentials.length, 1);
  assert.equal(john.ppDifferentials[0].differential, 27.9);
  assert.equal(res.updates.a1.posted, true);
  assert.deepEqual(Object.keys(res.snapshot.scores).sort(), ['a1', 'b2', 'c3', 'd4']);
  assert.equal(res.snapshot.round.formats.length, 0);
  const again = W.HistoryImport.postEgtRound(res.players, nr, { scores }, Date.now());
  assert.equal(again.changed, false, 'deduped by round id');
});

test('re-finalizing an imported EGT 2026 round never double-counts it', () => {
  const W = loadPlayPal();
  const loaded = W.HistoryImport.apply(roster(W), null).players;
  const m = W.EgtImporter.importSeed(JSON.parse(JSON.stringify(SEED)));
  const nr = W.EgtBridge.toNativeRound(m, 'R6');
  const res = W.HistoryImport.postEgtRound(loaded, nr, { scores: RESULTS.rounds.R6.scores }, Date.now());
  assert.equal(res.changed, false);
  assert.equal(res.updates.a1.duplicate, true);
});
