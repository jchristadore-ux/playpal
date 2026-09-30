// Account default group: a signed-in device always switches to
// users/{uid}.groupId, merging its local-only data over first (add-only),
// keeping a round in progress resumable, and never writing the old group.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayPal } from './helpers/load.mjs';

const ACCT = 'CB4BYS07373NJPF63PBJ7F803M';
const clone = (v) => JSON.parse(JSON.stringify(v));

// In-memory RTDB + Firestore behind the io interface; records every write.
function fakeCloud(rt, docs) {
  const writes = [];
  const get = (path) => path.split('/').reduce((o, k) => (o == null ? undefined : o[k]), rt);
  const set = (path, val) => {
    const ks = path.split('/'); let o = rt;
    ks.slice(0, -1).forEach(k => { o[k] = o[k] || {}; o = o[k]; });
    o[ks[ks.length - 1]] = clone(val);
  };
  return {
    rt, docs, writes,
    io: {
      readRt: async (p) => clone(get(p) ?? null),
      updateRt: async (patch) => { Object.entries(patch).forEach(([p, v]) => { writes.push(p); set(p, v); }); },
      readDoc: async (c, id) => clone((docs[c] || {})[id] || null),
      createDoc: async (c, id, d) => { writes.push(c + '/' + id); docs[c] = docs[c] || {}; docs[c][id] = clone(d); },
    },
  };
}

const legacyRt = () => ({
  players: {
    p2: { id: 'p2', name: 'Brian Plick', handicap: 30.2 },
    pj: { id: 'pj', name: 'John Christadore', handicap: 22.8 },
    pk: { id: 'pk', name: 'James Markey', handicap: 6 },
  },
  courses: { c1: { id: 'c1', name: 'Beaver Brook' } },
  saved_rounds: { OLD001: { syncCode: 'OLD001', courseName: 'Beaver Brook', savedAt: 10 } },
  groups: { [ACCT]: {
    players: {
      a1: { id: 'a1', name: 'John', handicap: 22.8, importedFrom: { group: 'LEGACY', id: 'pj', name: 'John Christadore' } },
      a2: { id: 'a2', name: 'brian plick', handicap: 30.2 },
      pk: { id: 'pk', name: 'James Markey', handicap: 6 },
    },
    courses: { c9: { id: 'c9', name: 'beaver brook' } },
    saved_rounds: { NEW001: { syncCode: 'NEW001', courseName: 'X', savedAt: 20 } },
  } },
});

function seedLegacyDevice(W, extra = {}) {
  const ls = W.localStorage;
  ls.setItem('pp_players', JSON.stringify(Object.values(legacyRt().players).concat(extra.players || [])));
  ls.setItem('pp_custom_courses', JSON.stringify([{ id: 'c2', name: 'Local Only GC' }]));
  ls.setItem('pp_recent', JSON.stringify([{ syncCode: 'OLD001', savedAt: 10 }, { syncCode: 'LOC001', savedAt: 30 }]));
  ls.setItem('pp_round_snap_LOC001', JSON.stringify({ round: { players: [{ id: 'pj' }] }, scores: { pj: [5, 4] } }));
  ls.setItem('pp_players_seeded', '1');
  W.GroupService.current(); // pp_players present → LEGACY
}

test('LEGACY device with a roster switches to the account group; dedupes by id, imported id and name', async () => {
  const W = loadPlayPal();
  seedLegacyDevice(W, { players: [{ id: 'px', name: 'Local Only' }] });
  assert.equal(W.GroupService.current(), 'LEGACY');
  const before = clone(legacyRt());
  const c = fakeCloud(legacyRt(), { playpal_rounds: { OLD001: { syncCode: 'OLD001', round: { players: [{ id: 'pj' }] }, liveScores: { scores: { pj: [5] } } } } });
  const res = await W.GroupService.switchToAccountGroup(ACCT, c.io);
  assert.equal(res.switched, true);
  assert.equal(W.GroupService.current(), ACCT);
  assert.equal(W.GroupService.isAccountGroupActive(), true);
  // Only Local Only is new: pj→a1 via importedFrom, p2→a2 via name, pk by id.
  assert.deepEqual(Object.keys(c.rt.groups[ACCT].players).sort(), ['a1', 'a2', 'pk', 'px']);
  assert.deepEqual(clone(res.plan.idMap), { pj: 'a1', p2: 'a2' });
  // Courses dedupe by case-insensitive name; the local-only course is added.
  assert.deepEqual(Object.keys(c.rt.groups[ACCT].courses).sort(), ['c2', 'c9']);
  // Saved rounds carried over; existing account record untouched.
  assert.deepEqual(Object.keys(c.rt.groups[ACCT].saved_rounds).sort(), ['LOC001', 'NEW001', 'OLD001']);
  assert.equal(c.rt.groups[ACCT].players.a1.handicap, 22.8);
  assert.equal(c.rt.groups[ACCT].players.a2.name, 'brian plick', 'account record never overwritten');
  // Round doc copied into the account collection with ids remapped.
  assert.deepEqual(clone(c.docs['g_' + ACCT + '_rounds'].OLD001.liveScores.scores), { a1: [5] });
  // Local snapshot remapped to the account id so Stats keeps it.
  assert.deepEqual(JSON.parse(W.localStorage.getItem('pp_round_snap_LOC001')).scores, { a1: [5, 4] });
  // LEGACY (root paths + playpal_rounds) never written.
  assert.deepEqual(c.rt.players, before.players);
  assert.deepEqual(c.rt.courses, before.courses);
  assert.deepEqual(c.rt.saved_rounds, before.saved_rounds);
  assert.ok(c.writes.every(p => p.startsWith('groups/' + ACCT + '/') || p.startsWith('g_' + ACCT + '_')), c.writes.join(','));
  // Local roster is the account roster + additions — no duplicates.
  const roster = JSON.parse(W.localStorage.getItem('pp_players'));
  assert.equal(roster.length, 4);
});

test('re-running the merge adds nothing (idempotent)', async () => {
  const W = loadPlayPal();
  seedLegacyDevice(W);
  const c = fakeCloud(legacyRt(), {});
  await W.GroupService.switchToAccountGroup(ACCT, c.io);
  const n = c.writes.length;
  W.localStorage.setItem('pp_group_id', 'LEGACY');
  const again = await W.GroupService.switchToAccountGroup(ACCT, c.io);
  assert.equal(again.plan.addPlayers.length, 0);
  assert.equal(again.plan.addCourses.length, 0);
  assert.equal(again.plan.addSaved.length, 0);
  assert.equal(c.writes.length, n);
});

test('a round in progress survives the switch and stays resumable', async () => {
  const W = loadPlayPal();
  seedLegacyDevice(W);
  const ls = W.localStorage;
  const round = { id: 'r77', syncCode: 'LIVE01', course: { name: 'X', holes: [{ par: 4 }, { par: 4 }] }, players: [{ id: 'pj', name: 'John Christadore' }, { id: 'pk', name: 'James Markey' }] };
  ls.setItem('pp_round', JSON.stringify(round));
  ls.setItem('pp_active_round', '1');
  ls.setItem('pp_scores_r77', JSON.stringify({ pj: [5, 6], pk: [4, 0] }));
  ls.setItem('pp_putts_r77', JSON.stringify({ pj: [2, 2] }));
  const c = fakeCloud(legacyRt(), { playpal_rounds: { LIVE01: { syncCode: 'LIVE01', round, liveScores: { scores: { pj: [5, 6] } } } } });
  const res = await W.GroupService.switchToAccountGroup(ACCT, c.io);
  assert.equal(res.switched, true);
  assert.equal(ls.getItem('pp_active_round'), '1');
  const r = JSON.parse(ls.getItem('pp_round'));
  assert.deepEqual(r.players.map(p => p.id), ['a1', 'pk']);
  assert.deepEqual(JSON.parse(ls.getItem('pp_scores_r77')), { a1: [5, 6], pk: [4, 0] });
  assert.deepEqual(JSON.parse(ls.getItem('pp_putts_r77')), { a1: [2, 2] });
  const un = W.RoundHistoryService.unfinishedRound();
  assert.ok(un && un.holesScored === 2, 'still resumable');
  // Live round doc carried into the account group; pre-switch copy kept.
  assert.ok(c.docs['g_' + ACCT + '_rounds'].LIVE01);
  const backup = JSON.parse(ls.getItem('pp_group_switch_backup'));
  assert.equal(backup.from, 'LEGACY');
  assert.deepEqual(JSON.parse(backup.active.pp_scores_r77), { pj: [5, 6], pk: [4, 0] });
});

test('ensureUserDoc: no groupId → account gets the device group; with groupId → always switches', async () => {
  const W = loadPlayPal();
  const docs = {};
  const fs = { collection: () => ({ doc: (id) => ({
    get: async () => ({ exists: !!docs[id], data: () => clone(docs[id]) }),
    set: async (v) => { docs[id] = { ...(docs[id] || {}), ...clone(v) }; },
  }) }) };
  const dev = W.GroupService.current();
  docs.u1 = { email: 'a@b.c' };
  let reloads = 0;
  await W.AuthService.ensureUserDoc({ uid: 'u1', email: 'a@b.c' }, { fs, reload: () => reloads++ });
  assert.equal(docs.u1.groupId, dev, 'groupId set to the device group');
  assert.equal(reloads, 0);
  assert.equal(W.GroupService.isAccountGroupActive(), true);

  // Device with a roster on LEGACY, account already has a group → switches.
  const W2 = loadPlayPal();
  seedLegacyDevice(W2);
  const c = fakeCloud(legacyRt(), {});
  const docs2 = { u2: { groupId: ACCT } };
  const fs2 = { collection: () => ({ doc: (id) => ({
    get: async () => ({ exists: true, data: () => clone(docs2[id]) }),
    set: async (v) => { docs2[id] = { ...docs2[id], ...clone(v) }; },
  }) }) };
  await W2.AuthService.ensureUserDoc({ uid: 'u2', email: 'x@y.z' }, { fs: fs2, io: c.io, reload: () => reloads++ });
  assert.equal(W2.GroupService.current(), ACCT);
  assert.equal(docs2.u2.groupId, ACCT, 'account group unchanged');
  assert.equal(reloads, 1);
  // Anonymous users are never switched.
  const W3 = loadPlayPal(); seedLegacyDevice(W3);
  await W3.AuthService.ensureUserDoc({ uid: 'u3', isAnonymous: true }, { fs: fs2, io: c.io });
  assert.equal(W3.GroupService.current(), 'LEGACY');
});

test('a failed merge leaves the device on its group (retry next launch)', async () => {
  const W = loadPlayPal();
  seedLegacyDevice(W);
  const io = { readRt: async () => { throw new Error('offline'); } };
  const ok = await W.AuthService.useAccountGroup(ACCT, { io, reload: () => { throw new Error('no reload'); } });
  assert.equal(ok, false);
  assert.equal(W.GroupService.current(), 'LEGACY');
  assert.ok(JSON.parse(W.localStorage.getItem('pp_players')).length === 3);
});
