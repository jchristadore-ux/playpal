# Project Progress

Working branch: `claude/fervent-planck-alq54v` · plan lives in `todo.md`.

## Context (read this first when resuming)

PlayPal is a golf-scoring PWA (React via esbuild → committed `dist/`,
Firebase RTDB + Firestore sync services defined inline in `index.html`).
v1.1.0 (PR #52) shipped the MatchEngine release. This pass closes the items
still marked **OPEN** in `AUDIT.md`: H7, H8, M3, M7, plus the form-label and
modal rows of `ACCESSIBILITY_REPORT.md`, then releases v1.1.1.

Key facts already verified (do not re-derive):
- Baseline at start of pass: `npm ci && npm run build` → dist/ parity clean;
  `node --test "tests/**/*.test.mjs"` → **85/85 pass**.
- CI (`.github/workflows/ci.yml`) fails if `dist/` is stale → always
  `npm run build` and commit `dist/` with any `components/` change.
- Firestore rules (`firebase/firestore.rules`) allow authed reads on
  `playpal_rounds` with no resource conditions → collection `where()`
  queries are permitted.
- Live-score payload is written in `ScoreEntry.jsx` `scheduleCloudWrite`
  (already carries `_writtenBy`/`_ts`); received in the `subscribeRound`
  effect at ~line 686. All devices share the same `round.id` (the joiner
  fetches the round object from Firestore).
- App version string appears in `Home.jsx:323` footer; cache-busting `?v=`
  strings live in `index.html` script tags and `sw.js` PRECACHE.
- `sync-config.js` is referenced by nothing (only AUDIT.md mentions it).

## Completed

- **M1:** Full repo analysis; concrete milestone plan written to `todo.md`.
- **M2:** AUDIT H8 fixed in `components/ScoreEntry.jsx`: live payload now
  carries `roundId` (`scheduleCloudWrite`), receiver rejects
  present-and-mismatched round ids (backward compatible with v1.1.0
  payloads) and drops post-cleanup callbacks via a `cancelled` effect flag.
  AUDIT.md H8 row flipped. dist rebuilt; 85/85 tests pass.

## In Progress

- Nothing mid-flight; M2 is complete and committed.

## Remaining

- M3 (H7 trip query) → M4 (M3/M7/console cleanup) → M5 (a11y labels +
  modal) → M6 (v1.1.1 release pass, push, draft PR). Exact file/line
  targets for each are in `todo.md`.

## Next Action (exact)

Start **M3**: edit `index.html` `GolfTripSyncService.fetchTripRounds`
(~line 424) — query
`_fbFs.collection(ROUNDS_COL).where('round.tripId','==',tripId).get()`,
keep the client-side `savedAt` sort, and on query failure fall back to the
legacy full-collection scan. index.html is not compiled (no dist rebuild
needed), but still run the test suite; flip AUDIT.md H7 row, tick M3 in
todo.md, update this file, commit.
