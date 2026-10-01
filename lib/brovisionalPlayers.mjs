/**
 * Stable PlayPal -> The Brovisional player ids (server-side only).
 *
 * The Brovisional already holds this crew's PlayPal history, imported from
 * playpal-full-history.json with source refs `playpal:<roundId>:<playerId>`
 * using the canonical ids below. A live post must send the SAME id for the
 * same golfer or a re-post of an imported round would create a second score.
 *
 * Source: /workspace/playpal-export/playpal-full-history.json `players[]`
 * (ids john/mike/tj/brian match the EGT fixture ids; james/rob are slugs).
 * `sourcePlayerIds` are the roster ids those golfers have had in PlayPal
 * (LEGACY ids + the remapped ids in group CB4B…).
 *
 * Resolution (resolvePlayerId):
 *   1. Only rounds from a KNOWN group (JD's crew: LEGACY + CB4BYS07373NJPF63PBJ7F803M,
 *      plus any extra ids in env PLAYPAL_BROV_GROUPS) can resolve to a canonical id.
 *      Roster ids like `p1`/`p2` are generic, so a stranger's group must never
 *      map onto John/Brian.
 *   2. In a known group: roster id in `sourcePlayerIds` -> canonical id,
 *      else exact (case/space-insensitive) full name -> canonical id.
 *      The card then carries sourcePlayerIds = all known roster ids for that
 *      golfer (The Brovisional matches a link on `id` OR any sourcePlayerId).
 *   3. Otherwise a stable opaque id: `pp-<sha256(groupId)[0..8]>-<rosterId>`
 *      and sourcePlayerIds = [] (a raw 'p1' must never match a crew link).
 *      Stable across rounds (roster ids never change), unique across groups,
 *      and does not reveal the group code. The Brovisional returns these as
 *      skipped 'unlinked' until an admin links them; a later re-post of the
 *      same round then posts them.
 */
import { createHash } from 'node:crypto';

export const KNOWN_GROUPS = ['LEGACY', 'CB4BYS07373NJPF63PBJ7F803M'];

export const BROVISIONAL_PLAYERS = [
  { id: 'john',  name: 'John Christadore', sourcePlayerIds: ['john', 'p1', 'p1781226599386', 'p1790599477726'] },
  { id: 'tj',    name: 'TJ Quimby',        sourcePlayerIds: ['p1777172757933', 'p1790599525424', 'tj'] },
  { id: 'mike',  name: 'Mike Clark',       sourcePlayerIds: ['mike', 'p1776970421535', 'p1790599587462'] },
  { id: 'brian', name: 'Brian Plick',      sourcePlayerIds: ['brian', 'p1790599546071', 'p2'] },
  { id: 'james', name: 'James Markey',     sourcePlayerIds: ['p1780574112997'] },
  { id: 'rob',   name: 'Rob Kraly',        sourcePlayerIds: ['p1780574134170'] },
];

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

export function knownGroups(env = process.env) {
  const extra = String(env.PLAYPAL_BROV_GROUPS || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  return new Set([...KNOWN_GROUPS, ...extra]);
}

export function opaquePlayerId(groupId, rosterId) {
  const h = createHash('sha256').update(String(groupId)).digest('hex').slice(0, 8);
  return `pp-${h}-${String(rosterId)}`;
}

/** -> { id, linked, aliases } (linked = resolved to a canonical crew id; aliases = its known roster ids) */
export function resolvePlayerId(groupId, rosterId, name, env = process.env) {
  if (knownGroups(env).has(String(groupId))) {
    const hit = BROVISIONAL_PLAYERS.find((p) => p.sourcePlayerIds.includes(String(rosterId)))
      || BROVISIONAL_PLAYERS.find((p) => norm(p.name) === norm(name));
    if (hit) return { id: hit.id, linked: true, aliases: hit.sourcePlayerIds.slice() };
  }
  return { id: opaquePlayerId(groupId, rosterId), linked: false, aliases: [] };
}
