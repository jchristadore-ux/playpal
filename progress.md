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

### Follow-up shipped — native scorer integration (post-merge)
Each EGT round now opens in the app's real hole-by-hole scorer (ScoreEntry),
not the compact grid. New `components/egt/egtBridge.js`:
- `toNativeRound(model, roundId)` builds a native `round` (course {num,par,hdcp}
  from the played tee, players with index/initials/color, matching format
  trackers, putts/FIR/GIR/sand on, deterministic id + sync code).
- `bridge()` translates native score arrays + BBB/Wolf events back into the EGT
  store; `readNativePayload()` reads them from localStorage on finalize.
App wiring: EGT card "Score this round" → native ScoreEntry; finishing bridges
scores in, finalizes the round, recomputes standings, returns to the Cup screen.
Standings recompute on finalize (per user's choice). R5 scramble/alt-shot derive
the team ball from the four per-player grosses (per user's choice).
Verified: 114 tests pass; browser smoke — launch prefilled scorer + bridge/
finalize updates standings (John 8.5 pts from bridged R6 scores).

### Next actions (if resumed)
- Optional: reflect EGT per-game pops (off-low/allowance) in the native scorer's
  on-screen dots (today it shows full-handicap pops; EGT engine stays authoritative).
- Optional: per-hole net-birdie basis toggle for The Rock (currently skinsNet).

## Previously shipped (merged) — v1.4.0 App Store readiness
Self-contained vendored bundle + in-repo Capacitor iOS project. Merged as PR #59.
Do NOT redo. (Prior detail preserved in git history / CHANGELOG.)

## EGT Bottom Line ticker (branch claude/egt-bottom-line-ticker-347cku) — v1.6.0

Status: **complete — 136 tests green, browser-smoke verified (empty state,
live data via stubbed Firebase, alert banner + alert card injection).**

Built `/bottomline` (bottomline.html on GitHub Pages): an always-on ESPN-style
broadcast ticker for TVs.

- `components/bottomLineProvider.js` — pure, modular data provider
  (`window.BottomLineProvider`). Registry of segment builders (live now,
  round/trip leaderboards, money, formats, stats, EGT Cup, fun stats,
  spotlight, records, schedule) round-robined by category so the feed rotates
  topics. `computeFacts(world)` = cached computed statistics;
  `buildFeed(facts)` = ticker segments; `diffAlerts(prev, next)` = breaking
  cards (birdie/eagle/ace/double/meltdown, hot streak, lead changes across
  round/format/trip/money, new trip record). Reuses the app's engines:
  calcAllPayouts/calcSkins/calcWolfStandings/nassauSegmentStatus/
  computePTMState/StatsService/buildTripLeaderboard/EgtEngine.liveUpdate.
- EGT Cup on the TV: reconstructs tournament state from `EGT_SEED` +
  synced Firestore liveScores via EgtBridge (handles liveScores-only docs by
  synthesizing the native round from the seed; deterministic sync codes);
  state.tripId gets a `:bottomline` suffix so nothing clobbers the app store.
- `components/BottomLine.jsx` — page + imperative rAF ticker engine
  (transform-only, fill/recycle/rebase with no visual jump, alerts jump the
  off-screen buffer, changed cards flash, pause-on-hover, speed control,
  fullscreen, auto-hiding controls, breaking banner, live clock header).
- Realtime: onSnapshot on the whole `playpal_rounds` + `golf_trips`
  collections, RTDB `players`; recompute debounced 400ms; first emit is
  immediate so the seed schedule scrolls with no network.
- Wired: build.mjs SOURCES, sw.js precache (+bottomline.html), version bump
  1.6.0 everywhere, CHANGELOG, tests/helpers/load.mjs, 12-test suite in
  tests/bottomLineProvider.test.mjs.
