# Project Progress

## EGT Cup cross-device submitted-status sync (branch claude/egt-cup-mobile-sync-twd320) — v1.8.2

Reported bug: a round scored and finalized ("submitted") in the EGT Cup →
Rounds tab on the phone did not show as submitted — and its scores were absent
— when the Cup was opened on the web, throwing off standings and money.

Root cause: cross-device sync in PlayPal is per-round through Firestore
`playpal_rounds/<syncCode>`. The **native scorer** streams every EGT round's
raw hole scores there, and the **SportsCenter** reads the whole collection. But
the **EGT tournament store** — entered scores, side-game events, and the
`finalized` list that the engine uses to include a round in standings/money —
had only ever lived in each device's `localStorage`. Nothing pulled the synced
scores into the Cup screen, and the finalize gesture never left the device.

Fix (all read the same Firestore data the SportsCenter uses):
- **`components/egt/egtSync.js`** (new, self-contained: EgtBridge +
  RoundSyncService only). `hydrate(state, docs)` merges the synced round docs
  into the local store — non-destructive score merge, BBB/Wolf events, overlay
  match play, and per-round stake overrides (the last two only from a real
  saved round, not a synthesized live-only doc) — and reconciles `finalized`
  (explicit `egtFinalized` flag wins; else falls back to score completeness).
  `pull` (boot) + `subscribe` (live) target only this trip's rounds by their
  deterministic sync codes. `pushFinalized` broadcasts the submit/reopen.
- **EgtTournament.jsx**: boot pull + live subscription (via a `stateRef` so
  snapshots merge into the latest store, never a stale boot-time copy);
  `toggleFinalize` pushes the flag. **App.jsx** `_finishEgtRound` pushes on
  native-scorer finish.
- **EgtBridge**: `bridge` split into `mergeNativeScores` (non-destructive, for
  the pull) + `bridgeEvents`; `bridge` itself unchanged for the finalize path.
- **index.html `RoundSyncService`**: `writeMeta`, `fetchDocs`, `subscribeDocs`.
- **bottomLineProvider.js**: `normalizeRound` carries `egtFinalized`;
  `computeEgtFacts` honors it (explicit wins, else completeness) so the
  broadcast agrees with the app.

Files modified: components/egt/egtBridge.js, components/egt/egtSync.js (new),
components/bottomLineProvider.js, components/EgtTournament.jsx, components/App.jsx,
index.html, scripts/build.mjs, tests/helpers/load.mjs, tests/egt.test.mjs, sw.js,
bottomline.html, package.json, package-lock.json + rebuilt dist/.

Status: **complete — 178 tests green (10 new EgtSync tests), build clean,
browser smoke (app boot + EGT Cup + Rounds tab) zero console errors.** Released
1.8.2 everywhere (package(-lock).json, index.html/bottomline.html `?v=`, sw.js
CACHE_VERSION + precache incl. dist/egt/egtSync.js) + CHANGELOG.

Caveat: scores typed directly into the Cup's Rounds-tab grid (not via the
native scorer) still don't sync — the native scorer remains the cross-device
score path; the finalize flag itself always propagates.

## Full audit pass #5 — all things PlayPal, EGT Cup + SportsCenter focus (branch claude/playpal-egt-audit-t6p8ce) — v1.8.1

Status: **complete — 166 tests green (2 new regressions), browser smoke
verified (EGT standings "35 pts max" + breakdown + award races, corrected R4
rationale on the Rounds tab, friendly printable heading, SportsCenter
pre-round content + formatted lead-change alert; zero page errors).**

Read every EGT engine module, EgtTournament.jsx, bottomLineProvider.js,
BottomLine.jsx, the seed fixture, store/bridge/importer/printable, and the
app-shell wiring end to end. Baseline was healthy (164 tests, seed embed in
sync, dist fresh, 1.8.0 stamped everywhere). Defects found + fixed:

- 🟡 **SportsCenter NEW TRIP LEADER alert showed raw float points**
  (`bottomLineProvider.js` diffAlerts) — the one points display that bypassed
  the v1.7.3 fmtPoints sweep. A Cup lead change on a split award (3-way tie =
  ⅓ pt) would scroll `0.6666666666666666 pts` across the TV at the exact
  moment everyone watches. Fixed with fmtPts + a diffAlerts regression test
  that drives a real lead change (John 2 pts → Brian ⅔ pt leader).
- 🟡 **R4 seed pairings rationale was stale prose** — claimed "new teams"
  (they're the same John+TJ vs Brian+Mike as R2, kept by request) and "every
  pair has now shared a cart exactly once" after R4 (false: John+Mike and
  Brian+TJ first ride together in R5). Rewrote the fixture text to match the
  actual schedule; gen-seed re-run so the embed matches.
- ⚪ Printable packet scorecard headings printed machine keys
  (`bingoBangoBongo+matchPlay`) — mapped all six rounds to friendly labels
  (+ test asserting no camelCase key ever prints).
- ⚪ Removed the dead `GAME_ALLOWANCE` map from egtImporter.js (duplicated
  GAME_RULES and was referenced nowhere).

Verified sound with no changes needed: points/money/standings/scoring/side
games engines (R1 exclusion, zero-sum money, 35-pt ceiling recompute,
Flat Stick putt-tracking gate, gross Birdie King), importer R5 migration
(scramble→BBB+matchPlay applied in every recomputeAll), bridge (R2 team
Nassau kept out of the overlay so money can't double-count), SportsCenter
stake/overlay recovery, every broadcast module type has a renderer, sw.js
precache + ?v= strings, packlist offline. Released as **1.8.1** everywhere
(package.json + lock, sw.js CACHE_VERSION + ?v=, index.html, bottomline.html,
Home.jsx) with a CHANGELOG entry.

## Full audit pass #4 — pre-trip go/no-go (branch claude/session-t9l8vn) — v1.8.0

Status: **complete — 164 tests green, browser smoke verified (EGT standings
"35 pts max" + breakdown table + all 7 award races on phone viewport, Rounds
pills, SportsCenter pre-round card + Bottom Line ticker, packlist add-item;
zero console/page errors).**

Audited everything PlayPal / EGT Cup / EGT SportsCenter after the award
restructuring merged in PRs #93–#95 (Par King 2 pts, Bogey God 1 pt, Birdie
King now GROSS for 4 pts with net honorary, ceiling 30 → 35, packlist page).
Engine, seed, importer boot-refresh, standings, printable and app Award Races
were all found consistent. Defects found + fixed:

- **SportsCenter had no race page for the paying Birdie King** — the honorary
  net race had a full-screen leaders page but the 4-pt gross award had none.
  Added `stat-grossbirdies` ("BIRDIE KING RACE", gross values) ahead of the
  net page, which is retitled "BIRDIE KING RACE (NET · HONORARY)". The ticker
  segment already ranked gross — only the page rotation was missing it.
- **PRs #93–95 shipped with no version bump or CHANGELOG entry** (user-visible
  scoring change under an unchanged 1.7.6). Released as **1.8.0** everywhere
  (package.json + lock, sw.js CACHE_VERSION + all ?v= strings, index.html,
  bottomline.html, Home.jsx) with a CHANGELOG entry documenting the award
  restructuring + this audit.
- **packlist.html wasn't in the sw.js precache** despite advertising offline
  use — added (bottomline.html precedent).
- Stale comments still describing the 30-point/4-award structure fixed in
  egtPoints.js (×2) and bottomLineProvider.js (×2).
- New regression tests: season settlement pays Par King 2 / Bogey God 1 /
  Birdie King (gross) 4 to the right stat leaders reading the seed config;
  broadcast test asserts the gross race page (Mike 18 birdies) + honorary
  net labeling. 163 → 164 tests.

Verified sound with no changes needed: R1 stays out of stats/awards/points
(engine + tests), seed embed in sync with fixture (gen-seed diff clean),
maxPossible recomputes on every boot so stale persisted models pick up 35,
printable reads the refreshed model, dist matched a fresh build pre-audit.

## Cup-points explanations per round (branch claude/r1-stakes-money-tracker-d6otdm, restarted post-merge) — v1.7.6

Status: **complete — 163 tests green, browser smoke verified (phone viewport:
standings breakdown table, round pills, R2 team section, R5 individual with no
stale Teams row, R1 cash-only note; no page errors).**

The user wanted the app to explain how many Cup points each round is worth,
what earns them, and whether the round is a team or individual event.

- `EgtPoints.roundPointsBreakdown(model, rid)` + `seasonAwardsBreakdown(model)`
  (engine, testable): mode 'team'/'individual'/'none', per-player max,
  itemized `{label, pts}` rows, compact `summary`, plain-English `note`. Reads
  `pointsConfig` with the SAME fallbacks `pointsForRound` uses (R5's stale
  scramble keys in the seed are ignored by both), so display can't drift from
  scoring — a test asserts maxes match `ROUND_MAX_POINTS` and rebuild the
  30-point ceiling (24 round pts + 6 awards) = `adjustedMaxPossible`.
- Rounds tab: header pill per card (`🏆 4 CUP PTS · TEAM 2v2` / `INDIVIDUAL` /
  `💵 CASH ONLY · NO CUP PTS`), expanded **Cup Points** section with the
  how-to-earn-them table + note. Stale R5 "Teams" row fixed: Teams renders
  only when mode === 'team' (R2/R4).
- Standings tab: **"Where the 30 points come from"** table (R2 4 team, R3 4
  ind, R4 5 team, R5 4 ind, R6 7 ind, awards 6 → 30 max/player) + header line
  now derives the total from the breakdown.
- Version 1.7.6 everywhere; package-lock stamp synced. CHANGELOG entry added.

## Remove EGT Pairings tab (branch claude/r1-stakes-money-tracker-d6otdm, restarted post-merge) — v1.7.5

Status: **complete — 162 tests green.**

Removed the Pairings tab (fairness matrices + handicap-balance table +
scorecard stats) from the EGT Cup screen at the user's request — the analysis
proved the schedule was balanced and isn't needed day-to-day. Cart pairings
and rationale still show on each round card in the Rounds tab; the written
analysis remains in `docs/EGT_PAIRINGS.md`. Version 1.7.5 everywhere.

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

---

## 2026-07-14 — Crystal Springs Golf Trip Playlist Generator (side project)

Self-contained in `crystal-springs-trip/` (no app code touched).

- 9 curated playlists, 553 unique songs, 36h 01m total; all within ±5 min
  of the brief's runtime targets.
- `playlist_data.py` (source of truth) + `generate_playlists.py`
  (validates zero duplicate songs across all playlists and ≤3 songs per
  artist per playlist; exits non-zero on violation).
- Deliverables in `crystal-springs-trip/output/`: master xlsx + csv,
  per-playlist CSVs, Soundiiz-ready import CSVs, JSON backup, PLAYLISTS.md,
  VALIDATION.md.
- `automation/amazon_music_uploader.py`: Playwright uploader for Amazon
  Music (manual login, resumable, per-track report + replacement
  suggestions). Not yet run — waiting on user to run locally and log in.

Next action if resuming: nothing pending in-repo; automation runs locally.
