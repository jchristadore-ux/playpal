import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGroupId,
  isValidGroupId,
  groupCollectionName,
  parseArgs,
  collectionsForArgs,
  createMemoryDb,
  migrateCollection,
  runMigration,
  main,
} from '../scripts/migrate-legacy-group.mjs';

test('normalizeGroupId mirrors GroupService (case, separators, I/L/O/U)', () => {
  assert.equal(normalizeGroupId('ab-cd ef'), 'ABCDEF');
  assert.equal(normalizeGroupId('ilio'), '1110');
  assert.equal(normalizeGroupId('ilio'), '1110');
  assert.equal(normalizeGroupId('uUu'), 'VVV');
});

test('isValidGroupId rejects short, LEGACY, and invalid alphabet leftovers', () => {
  assert.equal(isValidGroupId('ABCD1234'), true);
  assert.equal(isValidGroupId('abcd1234efgh5678'), true);
  assert.equal(isValidGroupId('SHORT'), false);
  assert.equal(isValidGroupId('LEGACY'), false);
  assert.equal(isValidGroupId(''), false);
});

test('groupCollectionName matches index.html _col for non-LEGACY groups', () => {
  const id = 'ABCD1234EFGH5678';
  assert.equal(groupCollectionName(id, 'rounds'), `g_${id}_rounds`);
  assert.equal(groupCollectionName(id, 'trips'), `g_${id}_trips`);
  assert.throws(() => groupCollectionName('LEGACY', 'rounds'));
  assert.throws(() => groupCollectionName(id, 'players'));
});

test('parseArgs: dry-run default, requires group-id, accepts flags', () => {
  const bad = parseArgs([]);
  assert.ok(bad.errors.some((e) => /group-id/i.test(e)));
  assert.equal(bad.confirm, false);

  const ok = parseArgs(['--group-id', 'abcd1234efgh5678', '--limit', '3']);
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.groupId, 'ABCD1234EFGH5678');
  assert.equal(ok.confirm, false);
  assert.equal(ok.limit, 3);

  const conf = parseArgs([
    '--group-id=ABCD1234EFGH5678',
    '--confirm',
    '--keep-legacy',
    '--rounds-only',
    '--doc-id', 'WXYZ',
    '--credentials', '/tmp/sa.json',
  ]);
  assert.equal(conf.errors.length, 0);
  assert.equal(conf.confirm, true);
  assert.equal(conf.keepLegacy, true);
  assert.equal(conf.roundsOnly, true);
  assert.deepEqual(conf.docIds, ['WXYZ']);
  assert.equal(conf.credentials, '/tmp/sa.json');
});

test('parseArgs rejects --rounds-only with --trips-only and bad limit', () => {
  const both = parseArgs(['--group-id', 'ABCD1234EFGH5678', '--rounds-only', '--trips-only']);
  assert.ok(both.errors.some((e) => /only one/i.test(e)));

  const lim = parseArgs(['--group-id', 'ABCD1234EFGH5678', '--limit', '0']);
  assert.ok(lim.errors.some((e) => /limit/i.test(e)));
});

test('collectionsForArgs builds legacy → g_{id}_* pairs', () => {
  const args = parseArgs(['--group-id', 'ABCD1234EFGH5678']);
  const pairs = collectionsForArgs(args);
  assert.deepEqual(pairs.map((p) => [p.source, p.dest]), [
    ['playpal_rounds', 'g_ABCD1234EFGH5678_rounds'],
    ['golf_trips', 'g_ABCD1234EFGH5678_trips'],
  ]);

  const rounds = collectionsForArgs(parseArgs(['--group-id', 'ABCD1234EFGH5678', '--rounds-only']));
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].source, 'playpal_rounds');
});

test('dry-run migrateCollection copies nothing and reports wouldCopy/wouldDelete', async () => {
  const db = createMemoryDb({
    playpal_rounds: {
      AB12: { syncCode: 'AB12', round: { id: 1 }, savedAt: 1 },
      CD34: { syncCode: 'CD34', round: { id: 2 }, savedAt: 2 },
    },
  });
  const lines = [];
  const counts = await migrateCollection({
    db,
    source: 'playpal_rounds',
    dest: 'g_ABCD1234EFGH5678_rounds',
    dryRun: true,
    keepLegacy: false,
    log: (m) => lines.push(m),
  });
  assert.equal(counts.listed, 2);
  assert.equal(counts.wouldCopy, 2);
  assert.equal(counts.wouldDelete, 2);
  assert.equal(counts.copied, 0);
  assert.equal(counts.deleted, 0);
  assert.equal(db._store.playpal_rounds.AB12.syncCode, 'AB12');
  assert.equal(db._store.g_ABCD1234EFGH5678_rounds, undefined);
  assert.ok(lines.some((l) => /would-copy/.test(l)));
});

test('confirm migrateCollection copies then deletes legacy (safe sequence)', async () => {
  const db = createMemoryDb({
    playpal_rounds: {
      AB12: { syncCode: 'AB12', round: { course: 'X' }, savedAt: 9 },
    },
    golf_trips: {
      trip_1: { id: 'trip_1', name: 'Spring' },
    },
  });
  const gid = 'ABCD1234EFGH5678';
  const args = parseArgs(['--group-id', gid, '--confirm']);
  const { totals, dryRun } = await runMigration({
    args,
    db,
    log: () => {},
  });
  assert.equal(dryRun, false);
  assert.equal(totals.copied, 2);
  assert.equal(totals.deleted, 2);
  assert.equal(totals.errors, 0);
  assert.deepEqual(db._store[`g_${gid}_rounds`].AB12, {
    syncCode: 'AB12',
    round: { course: 'X' },
    savedAt: 9,
  });
  assert.deepEqual(db._store[`g_${gid}_trips`].trip_1, { id: 'trip_1', name: 'Spring' });
  assert.equal(db._store.playpal_rounds.AB12, undefined);
  assert.equal(db._store.golf_trips.trip_1, undefined);
});

test('idempotent: existing dest skips copy; confirm still deletes legacy', async () => {
  const gid = 'ABCD1234EFGH5678';
  const destCol = `g_${gid}_rounds`;
  const db = createMemoryDb({
    playpal_rounds: {
      AB12: { syncCode: 'AB12', v: 'legacy' },
    },
    [destCol]: {
      AB12: { syncCode: 'AB12', v: 'already' },
    },
  });
  const counts = await migrateCollection({
    db,
    source: 'playpal_rounds',
    dest: destCol,
    dryRun: false,
    keepLegacy: false,
    log: () => {},
  });
  assert.equal(counts.skippedExisting, 1);
  assert.equal(counts.copied, 0);
  assert.equal(counts.deleted, 1);
  assert.equal(db._store[destCol].AB12.v, 'already');
  assert.equal(db._store.playpal_rounds.AB12, undefined);
});

test('keep-legacy with confirm copies but does not delete', async () => {
  const db = createMemoryDb({
    playpal_rounds: { AB12: { syncCode: 'AB12' } },
  });
  const gid = 'ABCD1234EFGH5678';
  const args = parseArgs(['--group-id', gid, '--confirm', '--keep-legacy', '--rounds-only']);
  const { totals } = await runMigration({ args, db, log: () => {} });
  assert.equal(totals.copied, 1);
  assert.equal(totals.deleted, 0);
  assert.ok(db._store.playpal_rounds.AB12);
  assert.ok(db._store[`g_${gid}_rounds`].AB12);
});

test('main --help exits 0 without db; bad args exit 1', async () => {
  const help = await main(['--help'], { log: () => {} });
  assert.equal(help.exitCode, 0);

  const bad = await main([], { log: () => {}, db: createMemoryDb() });
  assert.equal(bad.exitCode, 1);
});

test('main dry-run with injected db does not require credentials', async () => {
  const db = createMemoryDb({
    playpal_rounds: { ZZ99: { syncCode: 'ZZ99' } },
  });
  const lines = [];
  const r = await main(
    ['--group-id', 'ABCD1234EFGH5678', '--rounds-only'],
    { db, log: (m) => lines.push(String(m)) },
  );
  assert.equal(r.exitCode, 0);
  assert.equal(r.result.dryRun, true);
  assert.equal(r.result.totals.wouldCopy, 1);
  assert.ok(lines.some((l) => /DRY-RUN/.test(l)));
  assert.ok(db._store.playpal_rounds.ZZ99);
});
