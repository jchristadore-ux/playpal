/**
 * Firestore security rules — emulator unit tests (WS1).
 *
 * Requires the Firestore emulator (FIRESTORE_EMULATOR_HOST). When unset, every
 * test here is skipped so plain `npm test` stays green without Java/emulator.
 *
 * Run for real:
 *   npm run test:rules
 * which starts the emulator via firebase-tools `emulators:exec`.
 *
 * Coverage (current live rules):
 *  (1) user A cannot read user B's users/{uid}
 *  (2) signed-in user cannot create/update with pro:true (self-grant blocked)
 *  (3) group collections are isolated by group id path; unauthenticated denied;
 *      a signed-in client does not get group-B data by reading group-A paths
 *  (4) knowing group id + signed-in allows access to that group's collections
 *
 * Honesty: rules do NOT bind Auth UID to a single group. The group id embedded
 * in the collection name is the capability token (see firebase/README.md).
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const run = EMULATOR ? describe : describe.skip;

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(__dirname, '../firebase/firestore.rules'), 'utf8');

const PROJECT_ID = 'demo-playpal-rules';
const GROUP_A = 'ABCDEFGH';
const GROUP_B = 'JKLMNPQR';
const roundsA = `g_${GROUP_A}_rounds`;
const tripsA  = `g_${GROUP_A}_trips`;
const roundsB = `g_${GROUP_B}_rounds`;
const tripsB  = `g_${GROUP_B}_trips`;

run('firestore rules (emulator)', async () => {
  /** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
  let testEnv;
  let assertFails;
  let assertSucceeds;
  let doc;
  let getDoc;
  let setDoc;
  let updateDoc;

  before(async () => {
    const rulesTesting = await import('@firebase/rules-unit-testing');
    const firestoreMod = await import('firebase/firestore');
    assertFails = rulesTesting.assertFails;
    assertSucceeds = rulesTesting.assertSucceeds;
    doc = firestoreMod.doc;
    getDoc = firestoreMod.getDoc;
    setDoc = firestoreMod.setDoc;
    updateDoc = firestoreMod.updateDoc;

    testEnv = await rulesTesting.initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: RULES },
    });
  });

  after(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  // ── (1) users/{uid} isolation ─────────────────────────────────────────────

  it('(1) user A cannot read user B users/{uid}', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'userB'), {
        email: 'b@example.com',
        pro: false,
      });
    });

    const alice = testEnv.authenticatedContext('userA');
    await assertFails(getDoc(doc(alice.firestore(), 'users', 'userB')));

    // Sanity: A can read own doc once it exists.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'userA'), {
        email: 'a@example.com',
        pro: false,
      });
    });
    await assertSucceeds(getDoc(doc(alice.firestore(), 'users', 'userA')));
  });

  // ── (2) pro self-grant blocked ────────────────────────────────────────────

  it('(2) signed-in user cannot create with pro:true', async () => {
    const alice = testEnv.authenticatedContext('userA');
    await assertFails(
      setDoc(doc(alice.firestore(), 'users', 'userA'), {
        email: 'a@example.com',
        pro: true,
      }),
    );
    // Create with pro:false is allowed.
    await assertSucceeds(
      setDoc(doc(alice.firestore(), 'users', 'userA'), {
        email: 'a@example.com',
        pro: false,
      }),
    );
  });

  it('(2) signed-in user cannot update to flip pro to true', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'userA'), {
        email: 'a@example.com',
        pro: false,
      });
    });

    const alice = testEnv.authenticatedContext('userA');
    await assertFails(
      updateDoc(doc(alice.firestore(), 'users', 'userA'), { pro: true }),
    );
    // Non-entitlement field update is fine.
    await assertSucceeds(
      updateDoc(doc(alice.firestore(), 'users', 'userA'), { displayName: 'Alice' }),
    );
  });

  it('(2) create with stripe entitlement fields is blocked', async () => {
    const alice = testEnv.authenticatedContext('userA');
    await assertFails(
      setDoc(doc(alice.firestore(), 'users', 'userA'), {
        email: 'a@example.com',
        pro: false,
        stripeCheckoutSessionId: 'cs_test_fake',
      }),
    );
  });

  // ── (3) group path isolation + unauthenticated deny ───────────────────────

  it('(3) unauthenticated cannot read/write group A or group B collections', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), roundsA, 'ABCD'), { n: 1 });
      await setDoc(doc(ctx.firestore(), roundsB, 'EFGH'), { n: 2 });
      await setDoc(doc(ctx.firestore(), tripsA, 'trip_1'), { name: 'A' });
      await setDoc(doc(ctx.firestore(), tripsB, 'trip_2'), { name: 'B' });
    });

    const anon = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(anon.firestore(), roundsA, 'ABCD')));
    await assertFails(getDoc(doc(anon.firestore(), roundsB, 'EFGH')));
    await assertFails(getDoc(doc(anon.firestore(), tripsA, 'trip_1')));
    await assertFails(getDoc(doc(anon.firestore(), tripsB, 'trip_2')));
    await assertFails(
      setDoc(doc(anon.firestore(), roundsA, 'ZZZZ'), { n: 9 }),
    );
  });

  it('(3) group A path does not expose group B docs (path isolation)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), roundsA, 'ABCD'), { secret: 'group-a' });
      await setDoc(doc(ctx.firestore(), roundsB, 'ABCD'), { secret: 'group-b' });
    });

    const alice = testEnv.authenticatedContext('userA');
    const aSnap = await assertSucceeds(
      getDoc(doc(alice.firestore(), roundsA, 'ABCD')),
    );
    const bSnap = await assertSucceeds(
      getDoc(doc(alice.firestore(), roundsB, 'ABCD')),
    );
    assert.equal(aSnap.data().secret, 'group-a');
    assert.equal(bSnap.data().secret, 'group-b');
    assert.notEqual(aSnap.data().secret, bSnap.data().secret);
  });

  it('(3) malformed group collection names are denied even when signed in', async () => {
    const alice = testEnv.authenticatedContext('userA');
    // Too-short group id, lowercase, or non-group path.
    await assertFails(getDoc(doc(alice.firestore(), 'g_SHORT_rounds', 'ABCD')));
    await assertFails(
      getDoc(doc(alice.firestore(), `g_${GROUP_A.toLowerCase()}_rounds`, 'ABCD')),
    );
    await assertFails(getDoc(doc(alice.firestore(), 'playpal_secrets', 'x')));
  });

  // ── (4) knowing group id + signed-in → access ─────────────────────────────

  it('(4) signed-in + known group id can read/write that group rounds & trips', async () => {
    const alice = testEnv.authenticatedContext('userA');
    await assertSucceeds(
      setDoc(doc(alice.firestore(), roundsA, 'WXYZ'), { holes: 18 }),
    );
    await assertSucceeds(
      setDoc(doc(alice.firestore(), tripsA, 'trip_42'), { name: 'Weekend' }),
    );
    const roundSnap = await assertSucceeds(
      getDoc(doc(alice.firestore(), roundsA, 'WXYZ')),
    );
    const tripSnap = await assertSucceeds(
      getDoc(doc(alice.firestore(), tripsA, 'trip_42')),
    );
    assert.equal(roundSnap.data().holes, 18);
    assert.equal(tripSnap.data().name, 'Weekend');
  });

  it('(4) signed-in + known group B id can access group B (capability = group id)', async () => {
    // Current rules: any signed-in client that presents a well-formed group
    // collection path is allowed. Auth UID is not bound to one group.
    const alice = testEnv.authenticatedContext('userA');
    await assertSucceeds(
      setDoc(doc(alice.firestore(), roundsB, 'QRST'), { holes: 9 }),
    );
    await assertSucceeds(getDoc(doc(alice.firestore(), roundsB, 'QRST')));
    await assertSucceeds(
      setDoc(doc(alice.firestore(), tripsB, 'trip_7'), { name: 'Away' }),
    );
  });
});

// Always-visible note when skipped so CI logs are honest.
if (!EMULATOR) {
  describe('firestore rules (emulator) — skip notice', () => {
    it('skips emulator tests because FIRESTORE_EMULATOR_HOST is unset (run npm run test:rules)', () => {
      assert.ok(true, 'skipped — use npm run test:rules for real coverage');
    });
  });
}
