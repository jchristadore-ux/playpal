# Project Progress

## R1 stakes in the overall money tracker (branch claude/r1-stakes-money-tracker-d6otdm) — v1.7.4

Status: **complete — 162 tests green.**

Task: guarantee R1 (Minerals, flat/stakes-only) money is captured in the
overall money tracker even though its formats/points don't count toward the
EGT Cup. Audit result: the tournament engine already settles R1 money (BBB +
Nines + skins + overlay matches + CTP/LD in `egtMoney.moneyForRound`), and the
app's Standings money table, printable packet, and broadcast bankroll all read
the engine total — but one real defect was found and fixed:

- **SportsCenter per-round payout cards ignored the engine**
  (`components/bottomLineProvider.js` money builder read `live.money.byRound`,
  a key the engine never produces — its map is `live.money.rounds`). Finalized
  rounds always fell back to native live payouts, which for R1 silently drop
  The Nines money (no native Nines engine) and skip CTP/LD + recovered stake
  overrides everywhere. One-line fix + regression tests.
- New tests: engine level (R1 money in `money.rounds.R1` and the overall
  total, zero-sum, while Cup points stay 0 for everyone) and broadcast level
  (Nines money present, bankroll = engine totals, finalized card labeled
  PAYOUTS with engine amounts).
- Version 1.7.4 everywhere (package.json, index.html, bottomline.html, sw.js
  cache + query strings, Home.jsx — which had been stuck at v1.7.2),
  CHANGELOG entry added.

## Full audit + GUI optimization (branch claude/playpal-audit-gui-optimization-pwq1ef) — v1.7.2

Status: **complete — 151 tests green, browser smoke verified (focus retention
while typing scores/stakes, landscape chrome compaction, SportsCenter keyboard
mode switch, Award Races render).**

Audited PlayPal scoring/tracking/handicap, the EGT Cup engines, the SportsCenter
integration, and the GUI in both orientations. Engine math (handicaps, pops,
points, zero-sum money, standings, tiebreakers, R6 reseed) verified sound; the
live defects were in the view layer and the app→broadcast stake sync.

- **EgtTournament.jsx refactor** — inline component types made React remount the
  subtree per keystroke (focus loss in score/stake inputs; Individual Matches
  editor state reset). Tab/card renderers are now invoked as plain functions;
  `EgtSiEditor` + `EgtStakeInput` hoisted to module scope (see the layout note
  at the top of the file — keep it that way).
- **Stake input buffering** — clearing a stake no longer snaps back to the
  default mid-edit (draft state while focused, commits every keystroke).
- **SportsCenter stakes** — `computeEgtFacts` recovers per-round stake overrides
  from the synced native format objects (skins/bbb/wolf/nassau), so broadcast
  money settles at the app's rates. Known limit: R4/R6 `nassauPerPoint` is only
  recoverable when the round carries a Nassau format (i.e. matches configured).
- **Leaders in all categories** — Award Races table (Skins King / Birdie King
  net / Flat Stick / Iron Man) on the app's Standings tab; `stat-skins` +
  `stat-netbirdies` stat-leaderboard modules in the SportsCenter post rotation.
- **GUI** — landscape chrome compaction (NavBar `compact` prop + short-viewport
  bottom nav in App.jsx, `(max-height: 480px)`); SportsCenter wake lock +
  keyboard controls (F/Space/→/±/A-P-L-S) + pause button + key legend.
- Tests: +2 (stake recovery drives engine money; award-race broadcast modules).
  Version 1.7.2 everywhere (package.json, index.html, bottomline.html, sw.js
  cache + query strings, Home.jsx), CHANGELOG entry added.


## EGT 2026 pairings + tee times + Nassau overlay (branch claude/egt-2027-pairings-gbh70n) — v1.7.0

Status: **complete — 143 tests green, browser-smoke verified (Rounds redesign,
Pairings tab matrices, Individual Matches on every round, new tee times).**

Single source of truth is `fixtures/egt-2026-seed.json`; `scripts/gen-seed.mjs`
regenerates `components/egt/egtSeedData.js` (do not hand-edit the embed).

- **Task 2 — tee times.** Each round now has structured `teeTimes` + an updated
  `teeTimeTarget` string (Minerals 10:00/12:36, Ballyowen 7:30, Wild Turkey 1:45,
  Crystal Springs 7:30, Cascades 2:02/4:08, Black Bear 8:36). Propagates to the
  Rounds page, Bottom Line schedule and SportsCenter automatically (all read the
  seed). No stale tee-time strings remain in the repo.
- **Task 1 — pairings.** Each round carries `pairings.carts` + a director
  rationale. R2 teams rebalanced to John+Mike vs Brian+TJ (avoids the low-low
  super-team; with R5 individual, R2 & R4 are the only team rounds and both are
  balanced, avg team Δ 5). New **Pairings** tab renders partner/opponent/cart
  frequency matrices + handicap-balance table + a fairness scorecard. Written
  deliverable in `docs/EGT_PAIRINGS.md`.
- **Task 3 — Rounds page.** RoundCard redesigned: consistent structure, tee-time
  chips, "Pairings & Logistics" block, unified section headers/typography.
- **Task 4 — individual Nassau overlay for R1–R6.** Generalized the old R5-only
  `r5Matches` to `events.roundMatches[rid]` (legacy R5 migrated on read).
  `egtBridge.formatsFor` now merges configured 1v1/2v2 matches into one Nassau
  tracker on any round (R2's team match + overlay; R5's overlay = the match
  play; standalone elsewhere), reusing the existing Nassau engine + the
  `NassauMultiMatchConfig` UI. No duplicate score entry.
- Version bumped 1.6.3 → 1.7.0 (package.json, index.html, bottomline.html,
  sw.js cache + query strings, Home.jsx), CHANGELOG entry added.



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

## Full audit pass #3 — EGT Cup + SportsCenter focus (branch claude/full-audit-egt-focus-g1rrvm) — v1.7.3

Status: **complete — 159 tests green (8 new regressions), dist rebuilt, version 1.7.3.**

Hyper-focused audit of components/egt/*, EgtTournament.jsx, BottomLine.jsx,
bottomLineProvider.js. Five real defects found, all fixed + regression-tested:

1. 🔴 Match-play pops auto-filled from handicap INDEX, not COURSE handicap.
   The Rounds-tab match editor got native players (handicap = HI); its
   auto-fill (calcAutoPopHoles) baked HI-difference pops which count as manual
   overrides in engine + tracker + broadcast. R5 John v TJ: 10 pops instead of
   11 (CH 17 v 28). Fixed: EgtTournament passes CH-based players to
   NassauMultiMatchConfig; new EgtBridge.repairMatchPops clears stored,
   untouched legacy auto-fills on boot (manual edits preserved).
2. 🔴 SportsCenter never passed season flag → after R6 the TV was missing all
   4 season awards (6 pts) + Pass-the-Money settlement; could show wrong
   champion. computeEgtFacts now passes season: finalized.includes('R6')
   (live pass + climber/dropper pass).
3. 🟡 Raw float points (0.6666666666666666) displayed in app standings,
   printable, ticker, broadcast modules. New shared EgtStandings.fmtPoints
   used everywhere points render.
4. 🟡 Flat Stick winnable with 0 tracked putts. trackedStats/seasonStats now
   carry puttHoles; engine + Award Races require puttHoles > 0.
5. 🟡 TV pre-round cards for R4/R5/R6: primaryGame keys missing from
   FORMAT_RULES → mangled labels, empty rules panel. Added all three; the
   schedule ticker now uses the resolved label.

Files: components/egt/{egtBridge,egtPoints,egtSideGames,egtStandings,egtPrintable}.js,
components/{EgtTournament.jsx,bottomLineProvider.js}, tests/{egt,bottomLineProvider}.test.mjs,
version bump 1.7.3 (package.json, index.html, bottomline.html, sw.js), CHANGELOG.
