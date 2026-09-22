#!/usr/bin/env node
/**
 * migrate-legacy-group.mjs — WS3 legacy → group-scoped Firestore migration
 *
 * Copies (or cleans) pre-group unscoped collections into group-scoped ones,
 * matching how the live app’s `_col()` / GroupService work today
 * (see index.html `_col`, components/groupService.js, firebase/firestore.rules):
 *
 *   Legacy (LEGACY group):
 *     playpal_rounds/{syncCode}
 *     golf_trips/{tripId}
 *
 *   Group-scoped:
 *     g_{GROUPID}_rounds/{syncCode}
 *     g_{GROUPID}_trips/{tripId}
 *
 * Document bodies are copied as-is (no field invention). Doc ids are preserved.
 *
 * Safety
 * ------
 * - Dry-run by default: prints what would be copied/deleted; writes nothing.
 * - Pass `--confirm` to mutate: copy first, then delete the legacy doc only
 *   after the destination doc exists (newly written or already present).
 * - Idempotent: existing destination docs are skipped (no overwrite).
 * - `--keep-legacy` keeps source docs even with `--confirm` (copy-only).
 *
 * Auth (never hardcode credentials)
 * ---------------------------------
 *   FIREBASE_SERVICE_ACCOUNT_JSON   stringified service-account JSON
 *   FIREBASE_SERVICE_ACCOUNT_PATH   path to a service-account JSON file
 *   GOOGLE_APPLICATION_CREDENTIALS  standard Google ADC file path
 *   --credentials <path>            CLI override for a JSON key file
 *
 * Usage
 * -----
 *   node scripts/migrate-legacy-group.mjs --group-id ABCD1234EFGH5678JKMN
 *   node scripts/migrate-legacy-group.mjs --group-id ABCD… --confirm
 *   node scripts/migrate-legacy-group.mjs --group-id ABCD… --confirm --keep-legacy
 *   node scripts/migrate-legacy-group.mjs --help
 *
 * See OPERATOR_ACTIONS.md → “Migration — legacy Firestore → group-scoped”.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const LEGACY_ROUNDS = 'playpal_rounds';
const LEGACY_TRIPS = 'golf_trips';
const LEAF_ROUNDS = 'rounds';
const LEAF_TRIPS = 'trips';

/** Crockford-ish normalize — mirrors GroupService.normalizeCode. */
export function normalizeGroupId(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/[ILO]/g, (c) => ({ I: '1', L: '1', O: '0' }[c]))
    .replace(/U/g, 'V');
}

/** Mirrors GroupService.isValidCode + firestore.rules group id shape. */
export function isValidGroupId(input) {
  const c = normalizeGroupId(input);
  return c.length >= 8 && c.length <= 40 && !/[ILOU]/.test(c) && c !== 'LEGACY';
}

/** Mirrors index.html `_col(leaf)` for a non-LEGACY group. */
export function groupCollectionName(groupId, leaf) {
  const id = normalizeGroupId(groupId);
  if (!isValidGroupId(id)) {
    throw new Error(`Invalid group id for collection name: ${groupId}`);
  }
  if (leaf !== LEAF_ROUNDS && leaf !== LEAF_TRIPS) {
    throw new Error(`Unknown leaf: ${leaf}`);
  }
  return `g_${id}_${leaf}`;
}

export function printHelp(log = console.log) {
  log(`migrate-legacy-group.mjs — copy legacy Firestore data into a group

Usage:
  node scripts/migrate-legacy-group.mjs --group-id <ID> [options]

Required:
  --group-id <ID>     Destination group id (8–40 Crockford-ish chars; not LEGACY)

Options:
  --confirm           Actually write (copy then delete legacy). Default: dry-run.
  --keep-legacy       With --confirm, copy only; do not delete legacy docs.
  --rounds-only       Migrate playpal_rounds → g_{ID}_rounds only
  --trips-only        Migrate golf_trips → g_{ID}_trips only
  --limit <N>         Cap docs processed per collection (smoke / staged runs)
  --doc-id <ID>       Only migrate this document id (repeatable)
  --credentials <path>
                      Service-account JSON file (else env — see header)
  --help, -h          Show this help

Auth env (first match wins with --credentials):
  FIREBASE_SERVICE_ACCOUNT_JSON | FIREBASE_SERVICE_ACCOUNT_PATH |
  GOOGLE_APPLICATION_CREDENTIALS

Dry-run example:
  node scripts/migrate-legacy-group.mjs --group-id ABCD1234EFGH5678JKMN

Confirm (mutate):
  FIREBASE_SERVICE_ACCOUNT_PATH=./sa.json \\
    node scripts/migrate-legacy-group.mjs --group-id ABCD… --confirm
`);
}

/**
 * @param {string[]} argv  process.argv.slice(2)
 * @returns {object}
 */
export function parseArgs(argv) {
  const out = {
    help: false,
    confirm: false,
    keepLegacy: false,
    roundsOnly: false,
    tripsOnly: false,
    limit: null,
    docIds: [],
    groupId: null,
    credentials: null,
    errors: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v == null || v.startsWith('--')) {
        out.errors.push(`Missing value for ${a}`);
        return null;
      }
      return v;
    };

    if (a === '--help' || a === '-h') {
      out.help = true;
    } else if (a === '--confirm') {
      out.confirm = true;
    } else if (a === '--keep-legacy') {
      out.keepLegacy = true;
    } else if (a === '--rounds-only') {
      out.roundsOnly = true;
    } else if (a === '--trips-only') {
      out.tripsOnly = true;
    } else if (a === '--group-id') {
      out.groupId = next();
    } else if (a === '--limit') {
      const raw = next();
      if (raw != null) {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1) out.errors.push(`--limit must be a positive integer (got ${raw})`);
        else out.limit = n;
      }
    } else if (a === '--doc-id') {
      const v = next();
      if (v != null) out.docIds.push(v);
    } else if (a === '--credentials') {
      out.credentials = next();
    } else if (a.startsWith('--group-id=')) {
      out.groupId = a.slice('--group-id='.length);
    } else if (a.startsWith('--limit=')) {
      const raw = a.slice('--limit='.length);
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1) out.errors.push(`--limit must be a positive integer (got ${raw})`);
      else out.limit = n;
    } else if (a.startsWith('--credentials=')) {
      out.credentials = a.slice('--credentials='.length);
    } else {
      out.errors.push(`Unknown argument: ${a}`);
    }
  }

  if (out.roundsOnly && out.tripsOnly) {
    out.errors.push('Use only one of --rounds-only / --trips-only');
  }

  if (!out.help) {
    if (!out.groupId) {
      out.errors.push('Missing required --group-id');
    } else {
      const normalized = normalizeGroupId(out.groupId);
      if (!isValidGroupId(normalized)) {
        out.errors.push(
          `Invalid --group-id "${out.groupId}" (need 8–40 chars [0-9A-Z] without I/L/O/U; not LEGACY)`,
        );
      } else {
        out.groupId = normalized;
      }
    }
  }

  return out;
}

/**
 * Migrate one collection pair.
 * @param {object} opts
 * @param {{ listDocs: Function, getDoc: Function, setDoc: Function, deleteDoc: Function }} opts.db
 * @param {string} opts.source
 * @param {string} opts.dest
 * @param {boolean} opts.dryRun
 * @param {boolean} opts.keepLegacy
 * @param {number|null} opts.limit
 * @param {string[]|null} opts.docIds  if non-empty, only these ids
 * @param {function} [opts.log]
 * @returns {Promise<object>} counts
 */
export async function migrateCollection({
  db,
  source,
  dest,
  dryRun,
  keepLegacy,
  limit = null,
  docIds = null,
  log = console.log,
}) {
  const counts = {
    source: source,
    dest: dest,
    listed: 0,
    wouldCopy: 0,
    wouldDelete: 0,
    copied: 0,
    skippedExisting: 0,
    deleted: 0,
    errors: 0,
  };

  let docs = await db.listDocs(source);
  counts.listed = docs.length;

  if (docIds && docIds.length) {
    const want = new Set(docIds.map((id) => String(id)));
    docs = docs.filter((d) => want.has(d.id));
  }
  if (limit != null) {
    docs = docs.slice(0, limit);
  }

  log(`[${source} → ${dest}] candidates: ${docs.length} (listed ${counts.listed})`);

  for (const { id, data } of docs) {
    try {
      const existing = await db.getDoc(dest, id);
      if (existing != null) {
        counts.skippedExisting += 1;
        log(`  skip  ${id}  (already in ${dest})`);
        if (!dryRun && !keepLegacy) {
          await db.deleteDoc(source, id);
          counts.deleted += 1;
          log(`  delete legacy ${source}/${id}`);
        } else if (dryRun && !keepLegacy) {
          counts.wouldDelete += 1;
          log(`  would-delete legacy ${source}/${id}  (dest already present)`);
        }
        continue;
      }

      if (dryRun) {
        counts.wouldCopy += 1;
        log(`  would-copy  ${source}/${id}  →  ${dest}/${id}`);
        if (!keepLegacy) {
          counts.wouldDelete += 1;
          log(`  would-delete legacy ${source}/${id}`);
        }
        continue;
      }

      await db.setDoc(dest, id, data);
      counts.copied += 1;
      log(`  copied  ${source}/${id}  →  ${dest}/${id}`);

      // Re-read dest before deleting source (safe sequence).
      const verify = await db.getDoc(dest, id);
      if (verify == null) {
        counts.errors += 1;
        log(`  ERROR  dest missing after write; NOT deleting ${source}/${id}`);
        continue;
      }

      if (!keepLegacy) {
        await db.deleteDoc(source, id);
        counts.deleted += 1;
        log(`  delete legacy ${source}/${id}`);
      }
    } catch (e) {
      counts.errors += 1;
      log(`  ERROR  ${id}: ${e && e.message ? e.message : e}`);
    }
  }

  return counts;
}

export function collectionsForArgs(args) {
  const pairs = [];
  if (!args.tripsOnly) {
    pairs.push({
      leaf: LEAF_ROUNDS,
      source: LEGACY_ROUNDS,
      dest: groupCollectionName(args.groupId, LEAF_ROUNDS),
    });
  }
  if (!args.roundsOnly) {
    pairs.push({
      leaf: LEAF_TRIPS,
      source: LEGACY_TRIPS,
      dest: groupCollectionName(args.groupId, LEAF_TRIPS),
    });
  }
  return pairs;
}

/**
 * In-memory db for unit tests (and dry-run logic without Firebase).
 */
export function createMemoryDb(seed = {}) {
  const store = structuredClone(seed);
  return {
    _store: store,
    async listDocs(col) {
      const c = store[col] || {};
      return Object.entries(c).map(([id, data]) => ({ id, data: structuredClone(data) }));
    },
    async getDoc(col, id) {
      if (!store[col] || !(id in store[col])) return null;
      return structuredClone(store[col][id]);
    },
    async setDoc(col, id, data) {
      if (!store[col]) store[col] = {};
      store[col][id] = structuredClone(data);
    },
    async deleteDoc(col, id) {
      if (store[col]) delete store[col][id];
    },
  };
}

/** Wrap Admin Firestore into the small db interface. */
export function createFirestoreDb(fs) {
  return {
    async listDocs(col) {
      const snap = await fs.collection(col).get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    },
    async getDoc(col, id) {
      const snap = await fs.collection(col).doc(id).get();
      return snap.exists ? snap.data() : null;
    },
    async setDoc(col, id, data) {
      await fs.collection(col).doc(id).set(data, { merge: false });
    },
    async deleteDoc(col, id) {
      await fs.collection(col).doc(id).delete();
    },
  };
}

export async function runMigration({ args, db, log = console.log }) {
  const dryRun = !args.confirm;
  const mode = dryRun ? 'DRY-RUN' : args.keepLegacy ? 'CONFIRM (copy-only)' : 'CONFIRM (copy+delete)';
  log(`=== migrate-legacy-group  mode=${mode}  group=${args.groupId} ===`);

  const pairs = collectionsForArgs(args);
  const summary = [];

  for (const pair of pairs) {
    const counts = await migrateCollection({
      db,
      source: pair.source,
      dest: pair.dest,
      dryRun,
      keepLegacy: args.keepLegacy,
      limit: args.limit,
      docIds: args.docIds.length ? args.docIds : null,
      log,
    });
    summary.push(counts);
    log(
      `[${pair.source}] listed=${counts.listed} wouldCopy=${counts.wouldCopy} ` +
        `copied=${counts.copied} skippedExisting=${counts.skippedExisting} ` +
        `wouldDelete=${counts.wouldDelete} deleted=${counts.deleted} errors=${counts.errors}`,
    );
  }

  const totals = summary.reduce(
    (acc, c) => {
      for (const k of Object.keys(acc)) acc[k] += c[k] || 0;
      return acc;
    },
    { listed: 0, wouldCopy: 0, wouldDelete: 0, copied: 0, skippedExisting: 0, deleted: 0, errors: 0 },
  );
  log('--- totals ---');
  log(JSON.stringify(totals));
  if (dryRun) {
    log('(dry-run) Re-run with --confirm to apply. Add --keep-legacy to copy without deletes.');
  }
  return { summary, totals, dryRun };
}

function loadServiceAccountJson(credentialsPath) {
  const path =
    credentialsPath ||
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    null;

  if (path) {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw);
  }

  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (envJson) {
    return typeof envJson === 'string' ? JSON.parse(envJson) : envJson;
  }

  return null;
}

async function initFirestore(credentialsPath) {
  const require = createRequire(import.meta.url);
  const admin = require('firebase-admin');
  const sa = loadServiceAccountJson(credentialsPath);
  if (!sa) {
    throw new Error(
      'No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON, ' +
        'FIREBASE_SERVICE_ACCOUNT_PATH, GOOGLE_APPLICATION_CREDENTIALS, or --credentials <path>.',
    );
  }
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  return admin.firestore();
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp(deps.log || console.log);
    return { exitCode: 0, args };
  }
  if (args.errors.length) {
    for (const e of args.errors) console.error(`Error: ${e}`);
    console.error('Pass --help for usage.');
    return { exitCode: 1, args };
  }

  const log = deps.log || console.log;
  let db = deps.db;
  if (!db) {
    const fs = await initFirestore(args.credentials);
    db = createFirestoreDb(fs);
  }

  const result = await runMigration({ args, db, log });
  const exitCode = result.totals.errors > 0 ? 2 : 0;
  return { exitCode, args, result };
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().then((r) => {
    process.exit(r.exitCode);
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
