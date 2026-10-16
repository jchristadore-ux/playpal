// 1.22.10: group-level Pro. Anyone whose current group is on the crew list
// passes the Pro gates; everyone else still sees the paywall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadPlayPal } from './helpers/load.mjs';
import { KNOWN_GROUPS } from '../lib/brovisionalPlayers.mjs';

// The crew's groups as the server already knows them (Brovisional sync);
// taken from there so this file doesn't add another copy of the id.
const CREW = KNOWN_GROUPS.find((g) => g !== 'LEGACY');
const sha = (s) => createHash('sha256').update(s).digest('hex');

function app(groupId) {
  const w = loadPlayPal();
  w.PLAYPAL_CONFIG = { enforceProGates: true };
  if (groupId) w.localStorage.setItem('pp_group_id', groupId);
  return w;
}

test('sha256Hex matches node:crypto (ASCII, empty, multi-block, UTF-8)', () => {
  const H = loadPlayPal().EntitlementHelpers;
  for (const s of ['', 'abc', CREW, 'LEGACY', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'q'.repeat(200), 'golf ⛳ é']) {
    assert.equal(H.sha256Hex(s), sha(s), JSON.stringify(s.slice(0, 20)));
  }
});

test('Pro groups are exactly the crew groups the server knows (KNOWN_GROUPS)', () => {
  const H = loadPlayPal().EntitlementHelpers;
  assert.ok(CREW && CREW.length === 26);
  assert.deepEqual([...H.PRO_GROUP_HASHES].sort(), KNOWN_GROUPS.map(sha).sort());
});

test('the list holds digests only: the crew group id never appears in shipped source', () => {
  const H = loadPlayPal().EntitlementHelpers;
  assert.deepEqual([...H.PRO_GROUP_HASHES].sort(), [sha(CREW), sha('LEGACY')].sort());
  for (const f of ['components/entitlementHelpers.js', 'components/proService.js', 'dist/entitlementHelpers.js', 'dist/proService.js', 'app.html']) {
    assert.ok(!readFileSync(new URL('../' + f, import.meta.url), 'utf8').includes(CREW), f + ' leaks the group id');
  }
});

test('groupGrantsPro: crew + LEGACY yes (case/space-insensitive); others and blanks no', () => {
  const H = loadPlayPal().EntitlementHelpers;
  assert.equal(H.groupGrantsPro(CREW), true);
  assert.equal(H.groupGrantsPro(' ' + CREW.toLowerCase() + ' '), true);
  assert.equal(H.groupGrantsPro('LEGACY'), true);
  for (const g of ['', null, undefined, 'CB4BYS07373NJPF63PBJ7F803', 'ZZZZZZZZZZZZZZZZZZZZZZZZZZ', sha(CREW)]) assert.equal(H.groupGrantsPro(g), false, String(g));
});

test('crew group: guest passes every Pro gate and reads as Pro', () => {
  const w = app(CREW); const P = w.ProService;
  for (const f of ['trips', 'statsHistory', 'export', 'season']) assert.equal(P.canUse(f), true, f);
  assert.equal(P.isPro(), true);
  assert.equal(P.groupPro(), true);
  const st = P.state(); assert.equal(st.pro, true); assert.equal(st.source, 'group');
});

test('LEGACY group: guest passes the gates', () => {
  const P = app('LEGACY').ProService;
  assert.equal(P.canUse('trips'), true);
  assert.equal(P.canUse('statsHistory'), true);
});

test('any other group (or a fresh device) still hits the paywall', () => {
  const P = app('ABCDEFGH23456789JKMNPQRSTV').ProService;
  for (const f of ['trips', 'statsHistory', 'export']) assert.equal(P.canUse(f), false, f);
  assert.equal(P.isPro(), false);
  assert.equal(P.state().pro, false);
  const fresh = app(null).ProService;            // first run creates a random group
  assert.equal(fresh.canUse('trips'), false);
});

test('joining / leaving the crew group flips the gate immediately', () => {
  const w = app('ABCDEFGH23456789JKMNPQRSTV'); const P = w.ProService;
  assert.equal(P.canUse('trips'), false);
  assert.equal(w.GroupService.join('CB4B-YS07-373N-JPF6-3PBJ-7F80-3M'), CREW);
  assert.equal(P.canUse('trips'), true);
  w.GroupService.reset();
  assert.equal(P.canUse('trips'), false);
});

test('gates off: everyone passes (unchanged)', () => {
  const w = loadPlayPal(); w.PLAYPAL_CONFIG = { enforceProGates: false };
  w.localStorage.setItem('pp_group_id', 'ABCDEFGH23456789JKMNPQRSTV');
  assert.equal(w.ProService.canUse('trips'), true);
});
