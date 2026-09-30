// Signed-in / second-device history: round snapshots rebuild from the group's
// cloud round docs, and a fresh device adopts the signed-in account's group.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const course = {
  id: 'c1', name: 'Test GC', rating: 70, slope: 120,
  tees: [{ id: 'White', name: 'White', rating: 70, slope: 120, rated: true }],
  holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hdcp: i + 1 })),
};
const players = [{ id: 'pa', name: 'Al', handicap: 10 }, { id: 'pb', name: 'Bo', handicap: 20 }];
const strokes = (n) => Array.from({ length: 18 }, () => n);

function cloudDoc(code, withLive = true) {
  const holeScores = {};
  players.forEach((p, k) => { holeScores[p.id] = strokes(5 + k).map(s => ({ strokes: s, putts: 2, gettingPop: false })); });
  return {
    syncCode: code, savedAt: 1780000000000,
    round: { id: 'r_' + code, syncCode: code, course, teeId: 'White', players, formats: [], games: [], holeScores, date: 'Monday, June 1, 2026' },
    ...(withLive ? { liveScores: { scores: { pa: strokes(5), pb: strokes(6) }, putts: { pa: strokes(2) } } } : {}),
  };
}

test('snapshotFromCloudDoc builds a stats-ready snapshot (live scores or holeScores)', () => {
  const W = loadPlayPal();
  const RH = W.RoundHistoryService;
  const s1 = RH.snapshotFromCloudDoc(cloudDoc('AAAA11'), { savedAt: 123 });
  assert.equal(s1.savedAt, 123);
  assert.deepEqual(Array.from(s1.scores.pb), strokes(6));
  const s2 = RH.snapshotFromCloudDoc(cloudDoc('AAAA12', false));
  assert.deepEqual(Array.from(s2.scores.pa), strokes(5));
  assert.ok(W.StatsService.roundDataFromSnapshot(s2));
  // EGT tournament docs carry only liveScores — nothing to rebuild.
  assert.equal(RH.snapshotFromCloudDoc({ syncCode: 'W4K336', liveScores: { scores: {} } }), null);
});

test('hydrateFromCloud fills only missing snapshots and never overwrites', () => {
  const W = loadPlayPal();
  const RH = W.RoundHistoryService;
  W.localStorage.setItem('pp_round_snap_HAVE01', JSON.stringify({ keep: true }));
  const metas = [{ syncCode: 'HAVE01' }, { syncCode: 'NEW001', savedAt: 5 }, { syncCode: 'bad code' }, {}];
  let asked = null, wrote = null;
  RH.hydrateFromCloud(metas, (codes, cb) => { asked = codes; cb([cloudDoc('NEW001'), cloudDoc('HAVE01')]); }, n => { wrote = n; });
  assert.deepEqual(Array.from(asked), ['NEW001']);
  assert.equal(wrote, 1);
  assert.deepEqual(JSON.parse(W.localStorage.getItem('pp_round_snap_HAVE01')), { keep: true });
  assert.equal(RH.listRoundData().filter(d => d.syncCode === 'NEW001').length, 1);
  let called = false;
  RH.hydrateFromCloud([{ syncCode: 'HAVE01' }], () => { called = true; }, n => assert.equal(n, 0));
  assert.equal(called, false);
});

test('a fresh device adopts the account group; a device with a roster keeps its own', () => {
  const W = loadPlayPal();
  const A = W.AuthService, GS = W.GroupService;
  const acct = 'CB4BYS07373NJPF63PBJ7F803M';
  const dev = GS.current();
  let reloads = 0;
  const reload = () => { reloads++; };
  assert.equal(A.adoptAccountGroup(acct, dev, { reload }), true);
  assert.equal(GS.current(), acct);
  assert.equal(reloads, 1);
  assert.equal(A.adoptAccountGroup(acct, GS.current(), { reload }), false, 'already there');

  const W2 = loadPlayPal();
  W2.localStorage.setItem('pp_group_id', 'ZZZZZZZZZZZZ');
  W2.localStorage.setItem('pp_players', JSON.stringify([{ id: 'x', name: 'X' }]));
  assert.equal(W2.AuthService.adoptAccountGroup(acct, 'ZZZZZZZZZZZZ', { reload }), false);
  assert.equal(W2.GroupService.current(), 'ZZZZZZZZZZZZ');
  assert.equal(W2.AuthService.adoptAccountGroup(acct, 'LEGACY', { reload }), false, 'LEGACY never switched');
  assert.equal(reloads, 1);
});
