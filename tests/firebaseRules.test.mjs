// Guards the security rules against the mistake that silently broke joining a
// round: `match /g_{groupId}_rounds/{syncCode}`.
//
// A Firestore wildcard stands for a WHOLE path segment, so splicing a variable
// into a literal collection name does not compile. `firebase deploy` rejected
// the file, the previously deployed (pre-group) rules stayed live, and every
// read of a group-scoped collection came back PERMISSION_DENIED — which the app
// reported to the joiner as "Connection error. Check your internet."
//
// Nothing here talks to Firebase: it is a syntax check over the checked-in
// rules, so it runs in CI on every push.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const firestoreRules = readFileSync(new URL('../firebase/firestore.rules', import.meta.url), 'utf8');
const databaseRules  = readFileSync(new URL('../firebase/database.rules.json', import.meta.url), 'utf8');

// Strip comments so a `match` written inside one is not mistaken for a rule.
const rulesBody = firestoreRules.replace(/\/\/[^\n]*/g, '');

/** Every path segment of every `match` in the file, e.g. 'rounds', '{docId}'. */
function matchSegments() {
  const out = [];
  for (const m of rulesBody.matchAll(/\bmatch\s+(\/\S+)/g)) {
    for (const seg of m[1].split('/')) {
      if (seg) out.push(seg);
    }
  }
  return out;
}

test('firestore rules: no wildcard is spliced into a literal path segment', () => {
  const segments = matchSegments();
  assert.ok(segments.length > 0, 'found no match statements to check');

  for (const seg of segments) {
    if (!seg.includes('{')) continue;
    assert.match(
      seg,
      /^\{[A-Za-z_][A-Za-z0-9_]*(=\*\*)?\}$/,
      `match segment "${seg}" mixes a wildcard with literal text; a Firestore ` +
      `wildcard must be a whole segment, so this file will not compile. Match ` +
      `the whole segment and check its shape with .matches() instead.`,
    );
  }
});

test('firestore rules: braces balance', () => {
  const opens = (rulesBody.match(/\{/g) || []).length;
  const closes = (rulesBody.match(/\}/g) || []).length;
  assert.equal(opens, closes, 'unbalanced braces in firestore.rules');
});

test('firestore rules: group-scoped rounds and trips are reachable', () => {
  // The collection names the app actually builds in index.html's _col().
  const gid = 'ABCDEFGHJKMNPQRSTVWXYZ0123';
  const rounds = `g_${gid}_rounds`;
  const trips  = `g_${gid}_trips`;

  const patterns = [...rulesBody.matchAll(/matches\('(\^g_[^']+)'\)/g)].map(m => new RegExp(m[1]));
  assert.ok(patterns.length >= 2, 'expected shape checks for the group-scoped collections');
  assert.ok(patterns.some(p => p.test(rounds)), `no rule admits "${rounds}"`);
  assert.ok(patterns.some(p => p.test(trips)),  `no rule admits "${trips}"`);

  // …and nothing that merely looks like them.
  for (const near of [`${rounds}X`, 'g_SHORT_rounds', 'playpal_secrets', `g_${gid.toLowerCase()}_rounds`]) {
    assert.ok(!patterns.some(p => p.test(near)), `rule wrongly admits "${near}"`);
  }
});

test('firestore rules: legacy collections stay readable', () => {
  assert.match(rulesBody, /match \/playpal_rounds\/\{/);
  assert.match(rulesBody, /match \/golf_trips\/\{/);
});

test('database rules: parse, and group ids are whole path segments', () => {
  const parsed = JSON.parse(databaseRules);
  assert.ok(parsed.rules, 'database.rules.json has no "rules" key');

  const group = parsed.rules.groups && parsed.rules.groups.$groupId;
  assert.ok(group, 'no groups/$groupId block — group-scoped RTDB paths would be denied');
  assert.match(group['.read'],  /auth != null/);
  assert.match(group['.write'], /auth != null/);

  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    for (const key of Object.keys(node)) {
      if (key.includes('$')) {
        assert.match(key, /^\$[A-Za-z_][A-Za-z0-9_]*$/,
          `RTDB path "${key}" mixes a variable with literal text; it must be a whole segment`);
      }
      walk(node[key]);
    }
  })(parsed.rules);
});
