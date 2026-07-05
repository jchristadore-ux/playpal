# Project Progress

## Current work — EGT 2026 Cup tournament engine (branch claude/playpal-egt-tournament-25w5g0)

Status: **engine + UI complete, all tests green (111 pass), browser-smoke verified.**

Built the tournament feature that loads the EGT 2026 trip definition, runs live
scoring across six mixed-format rounds, and produces printable standings.

### What shipped this pass
- `fixtures/egt-2026-seed.json` — the canonical trip definition (schemaVersion 2.2),
  committed as the reference fixture. `components/egt/egtSeedData.js` embeds it as
  `window.EGT_SEED` so the offline PWA imports with zero network.
- Engine (classic scripts, `window.Egt*`, built file-by-file by esbuild, loaded
  into the test VM by `tests/helpers/load.mjs`):
  - `egtHandicap.js` — course handicap, playing handicap, the §2 pop-allocation
    rule (base+extra by SI, 2nd stroke past 18), permutation validation, 9-hole
    interleave. This is the piece proved against every golden array.
  - `egtImporter.js` — normalize seed → model; derive all course handicaps + pops
    live from `courseLibrary` SI; idempotent by trip.id; SI-entry + auto-recompute;
    tolerant of `holes: null` (pending SI).
  - `egtScoring.js` — BBB, Nines, four-ball match + Nassau, Wolf, team Stableford,
    individual Stableford, scramble, alternate shot, singles, gross/net skins.
  - `egtSideGames.js` — Pass the Money (The Rock) ledger, CTP/LD, tracked stats.
  - `egtPoints.js` — EGT Cup points + season awards (verified vs maxPossible 36/30).
  - `egtMoney.js` — zero-sum money engine (every round nets $0 by construction).
  - `egtStandings.js` — leaderboard, tiebreakers, R6 reseed, night snapshots/deltas.
  - `egtStore.js` — localStorage persistence, idempotent re-import preserving scores.
  - `egtPrintable.js` — print-ready standings + scorecards from stored data.
  - `egtEngine.js` — orchestrator: run rounds → points/money/standings → snapshot.
- UI: `components/EgtTournament.jsx` (new `EGT CUP` tab in `App.jsx`) — standings
  with deltas + money, per-round score entry + finalize, SI-entry modal with
  permutation validation, printable packet. Wired into `index.html` + `sw.js`
  precache; `build.mjs` SOURCES; `build-www` copies `dist/egt/` automatically.
- Tests: `tests/egt.test.mjs` — the §8 acceptance suite (course handicaps, the
  golden reproduction of EVERY strokeAllocations[*].holes array, R2/R6 callouts,
  SI-gap load→enter→recompute, money nets to $0) + calculator/standings units.

### Key decision (flagged to user)
The seed plays **White tees**, so R2 Ballyowen course handicaps are 13/18/23/23
(seed) — NOT §8's prose 17/23/28/28, which are Ballyowen **Blue** tees. Per the
task's explicit "courseLibrary is the single source of truth / seed value wins",
the engine reproduces the seed's White-tee values exactly. R6 (16/22/27/27) matches
§8 as written.

### Next actions (if resumed)
- Optional: richer score-entry (putts/FIR/GIR/sand toggles) and CTP/LD/Wolf event
  entry in the UI (engine already supports them).
- Optional: per-hole net-birdie basis toggle for The Rock (currently skinsNet).

## Previously shipped (merged) — v1.4.0 App Store readiness
Self-contained vendored bundle + in-repo Capacitor iOS project. Merged as PR #59.
Do NOT redo. (Prior detail preserved in git history / CHANGELOG.)
