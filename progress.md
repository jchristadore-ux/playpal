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

- **M3:** AUDIT H7 fixed in `index.html`: `fetchTripRounds` now queries
  `where('round.tripId','==',tripId)` (automatic single-field index;
  client-side `savedAt` sort), with the legacy full scan retained only as
  an error fallback. AUDIT.md H7 row flipped. 85/85 tests pass.

- **M4:** AUDIT M3 fixed (`Summary.jsx`: venmo handle + mailto recipient
  emails now `encodeURIComponent`-ed), M7 fixed (`sync-config.js` deleted),
  M6 finished (last two `console.log`s removed from index.html
  RoundSyncService). AUDIT rows flipped. dist rebuilt; 85/85 tests pass.

- **M5:** AUDIT M4 fixed. `Shared.jsx`: `Label` renders `<label htmlFor>`
  when targeted; `Modal`/`QRModal` got `role="dialog"`, `aria-modal`,
  accessible names, Esc-to-close, labeled ✕ buttons. `Home.jsx`: join-code
  + all player-profile inputs labeled; hand/color pickers are now real
  `<button>`s with `aria-pressed`. `Setup.jsx`: course form `htmlFor`/`id`,
  `aria-label` on tee/hole/trip/search/allowance/override inputs.
  `StatsScreen.jsx`: compare selects labeled. ACCESSIBILITY_REPORT.md
  restructured (new "Fixed in v1.1.1" table; remaining gaps re-ranked).
  dist rebuilt; 85/85 tests pass.

- **M6:** v1.1.1 release pass — version bumped in `package.json` (+ lock),
  all 24 `?v=` cache-busting strings in `index.html` and `sw.js`,
  `CACHE_VERSION` → `playpal-v1.1.1`, Home footer version; CHANGELOG
  `[1.1.1]` entry added. Full `npm test` green (85/85, dist parity).

## In Progress

- Nothing — all milestones complete.

## Remaining

- Nothing in this pass. Future work intentionally left documented:
  ACCESSIBILITY_REPORT.md remaining-gaps table (clickable divs in content
  screens, Dynamic Type, focus trap, contrast spots), AUDIT M2/M8
  (accepted), AUDIT technical-debt section (ES modules, per-group
  namespaces, ScoreEntry/Setup splits), and the manual ops steps in
  RELEASE_CANDIDATE_REPORT.md (deploy Firebase rules, GitHub settings,
  App Store logistics).

## Next Action (exact)

None — pass complete. Branch `claude/fervent-planck-alq54v` pushed and
draft PR open (see PR for review). To resume future work, pick the top
item from the "Remaining" list above and start a new milestone plan in
`todo.md`.
