# Changelog

All notable changes to PlayPal. Format follows [Keep a Changelog](https://keepachangelog.com); versioning follows [SemVer](https://semver.org).

## [1.8.1] — 2026-07-18

### Fixed
- **SportsCenter's NEW TRIP LEADER breaking-news card no longer shows raw
  float points.** When the EGT Cup lead changed hands on a split award (e.g. a
  3-way champion tie worth ⅓ pt each), the alert printed the unformatted value
  (`0.6666666666666666 pts`) — the one points display that bypassed the v1.7.3
  `fmtPoints` sweep, and it fires exactly when everyone is watching the TV.
  Regression test drives a real Cup lead change through `diffAlerts`.
- **Printable packet scorecard headings now use friendly format names** —
  "R5 · Cascades — Bingo-Bango-Bongo + Match Play" instead of the machine key
  `bingoBangoBongo+matchPlay`. All six rounds mapped; test asserts no raw
  camelCase keys print.
- **R4 cart/pairings rationale corrected in the seed** — the Rounds-tab text
  still claimed R4 used "new teams" and completed the cart rotation, which
  stopped being true when John+TJ became the fixed R2/R4 partnership. It now
  says the R2 teams repeat by request and that the rotation completes in R5
  (which matches the actual cart schedule).
- Removed a dead, duplicated allowance table from `egtImporter.js`
  (`GAME_RULES` is the single source of truth).

## [1.8.0] — 2026-07-17

### Changed
- **The EGT Cup season awards grew from 4 to 6 and the per-player ceiling is
  now 35** (24 round points + 11 award points). This entry documents the award
  restructuring that shipped without a release: **Par King** (most pars, 2 pts)
  and **Bogey God** (most bogeys, 1 pt) are real point-bearing season awards
  for the high-handicap crew, and **Birdie King now settles on GROSS birdies
  for 4 pts** — the net version is demoted to an honorary bragging-rights
  race. Skins King (2), Flat Stick (1) and Iron Man (1) are unchanged. The
  engine, the app's "Where the points come from" table, Award Races,
  printable packet and the SportsCenter broadcast all read the same seed
  `pointsConfig`, and the Max column recomputes on every boot, so installs
  that already have a persisted model pick up the new ceiling automatically.

### Added
- **BIRDIE KING RACE page on the SportsCenter rotation ranks gross birdies**
  — the paying award (4 pts) had no full-screen leaders page while the
  honorary net race did. The net page stays, retitled
  `BIRDIE KING RACE (NET · HONORARY)`.
- **Trip packing checklist** (`packlist.html`) — a standalone, offline-first
  checklist page (add items, check them off, saved to the phone). Now also in
  the service-worker precache so it genuinely works offline on first launch.

### Fixed
- Season-award settlement regression test: Par King, Bogey God and Birdie
  King (gross) are asserted to pay 2/1/4 to the right stat leaders at final
  settlement, so the award values can't silently drift from the seed config.

## [1.7.6] — 2026-07-16

### Added
- **Cup-points explanations on the EGT screen** — every round now says exactly
  what it's worth and how. Each round card gets a chip in its header
  (`🏆 4 CUP PTS · TEAM 2v2`, `INDIVIDUAL`, or `💵 CASH ONLY` for R1) and an
  expanded **Cup Points** section with an itemized how-to-earn-them table
  (e.g. R2: front-9 match 1 · back-9 match 1 · 18-hole match 2). The Standings
  tab adds a **"Where the 30 points come from"** table: R2 Ballyowen 4 (team),
  R3 Wild Turkey 4 (individual), R4 Crystal Springs 5 (team), R5 Cascades 4
  (individual), R6 Black Bear 7 (individual) = 24, plus the four season awards
  (Skins King 2 · Birdie King 2 · Flat Stick 1 · Iron Man 1) = 30 max per
  player. All values come from `EgtPoints.roundPointsBreakdown` /
  `seasonAwardsBreakdown`, which read the seed's `pointsConfig` with the same
  fallbacks the scoring engine uses — a test asserts the displayed maxes match
  the engine's `ROUND_MAX_POINTS` and reproduce the 30-point ceiling, so the
  explanation can never drift from what actually gets scored.

### Fixed
- **R5 no longer shows stale "Teams"** — the Rounds-tab card displayed the
  seed's leftover R5 team entries even though R5 is an individual round
  (full-18 BBB + round-robin match play); the Teams row now only renders on
  rounds where teams actually compete for points (R2, R4).

## [1.7.5] — 2026-07-14

### Removed
- **Pairings tab on the EGT Cup screen** — the fairness-analysis breakdown
  (partner/opponent/cart frequency matrices, handicap-balance table, scorecard
  stats) served its purpose as proof the schedule was balanced and is no
  longer needed day-to-day. Cart pairings and the per-round rationale remain
  on each round's card in the Rounds tab; the written analysis lives on in
  `docs/EGT_PAIRINGS.md`.

## [1.7.4] — 2026-07-14

### Fixed
- **SportsCenter per-round payout cards ignored the tournament engine** — the
  money segment builder read `live.money.byRound`, a key the money engine has
  never produced (its per-round map is `live.money.rounds`), so a finalized
  round's "PAYOUTS" card always fell back to the native live-payout
  calculation. For R1 (Minerals, flat/stakes-only) that fallback silently
  dropped The Nines money entirely — the native scorer has no Nines engine —
  and on any round it bypassed CTP/LD prizes and recovered stake overrides, so
  the per-round cards could contradict the running bankroll shown right next
  to them. The card now reads the engine's authoritative per-round totals.
- **Home screen version label** — stuck at v1.7.2 through the 1.7.3 release;
  now tracks the app version again.

### Added
- Regression tests locking in the R1 money rule: R1 is excluded from EGT Cup
  points/standings, but its stakes (BBB, The Nines, skins, side matches) are
  always captured in the overall money tracker — in the engine, the running
  bankroll, and the broadcast's per-round payout card.

## [1.7.3] — 2026-07-14

### Fixed
- **EGT match-play pops were auto-filled from the wrong handicap basis** — the
  Rounds-tab match editor fed the native players' raw handicap **index** into
  its stroke auto-fill, while the tournament rule (and the engine's own
  fallback) is the **course-handicap** difference off the low within each
  match. Because auto-filled pops count as manual overrides everywhere, a
  configured R5 match would settle a stroke short in the app, the native
  tracker, and the SportsCenter alike (e.g. John v TJ at Cascades: 10 pops
  instead of the correct 11 — CH 17 v 28). The editor now receives each
  player's derived course handicap for that round, and a one-time repair
  (`EgtBridge.repairMatchPops`) clears any stored, untouched legacy auto-fill
  so the engine live-derives the correct CH-based pops; manually edited pop
  holes are preserved.
- **SportsCenter never ran the final-night season settlement** — the broadcast
  rebuilt the Cup from synced rounds but called the engine without the
  `season` flag, so once R6 finished the TV standings were missing all four
  season awards (Skins King 2 · Birdie King 2 · Flat Stick 1 · Iron Man 1 —
  up to 6 of a player's 36 points) and the money board omitted the
  Pass-the-Money settlement. The broadcast could crown a different champion
  than the app at the moment it mattered most. It now passes
  `season: finalized.includes('R6')` exactly like the app (both the live pass
  and the climber/dropper comparison pass).
- **Raw float points on screens** — a split champion pool (e.g. a 3-way R5 BBB
  tie at 2 pts) produced `0.6666666666666666 pts` rendered verbatim in the app
  standings table, the printable packet, the Bottom Line ticker, and the
  SportsCenter standings/player cards. All points displays now go through one
  shared `EgtStandings.fmtPoints` (2-decimal, trailing-zero-free: `0.67`).
- **Flat Stick could be "won" with zero tracked putts** — a player who entered
  gross scores but never recorded putts totaled 0 putts and beat everyone who
  actually tracked. `trackedStats`/`seasonStats` now count `puttHoles`, and
  both the season-award engine and the Award Races tab treat a player with no
  recorded putt holes as ineligible (shown as —) rather than the leader.
- **TV pre-round cards for R4/R5/R6 showed mangled formats with no rules** —
  the seed's `fourBallAggregateStableford`, `bingoBangoBongo+matchPlay`, and
  `championshipSingles+stableford` keys had no `FORMAT_RULES` entry, so the
  "TODAY'S GAME" stage fell back to auto-labels like "Bingo Bango
  Bongo+match Play" over an empty rules panel, and the schedule ticker printed
  the raw key. All three now have proper labels + one-line rules, and the
  schedule segment uses the resolved label.

### Changed
- **EGT cart pairings — John & TJ prioritized** — the trip's riding assignments
  now pair John and TJ together as much as possible: **4 of the 6 rounds** (R1,
  R2, R4, R6), including Ballyowen (R2) and Crystal Springs (R4), where they
  also partner as a team. Every pair still shares a cart at least once — the
  R3 (John+Brian / TJ+Mike) and R5 (John+Mike / Brian+TJ) cart splits cover the
  remaining four pairings, which is the maximum John+TJ ridealong achievable
  while keeping cart coverage complete. R2 teams flip to John+TJ vs Brian+Mike
  (still a balanced 36-vs-41 course-handicap split) so carts follow teams.
  Updated in `fixtures/egt-2026-seed.json` (source of truth), the regenerated
  seed, the Rounds/Pairings tabs, the SportsCenter engine, and the pairings
  docs. Fairness tests updated for the new R2 teams.

## [1.7.2] — 2026-07-13

### Fixed
- **EGT screen input focus loss** — the EGT Cup screen defined its tab and card
  renderers as inline component types, so every keystroke re-created them and
  React remounted the whole subtree: score-grid and stake inputs dropped focus
  after each digit, and the Individual Matches editor lost its in-progress
  state on any parent re-render (e.g. a toast). Renderers are now invoked as
  plain functions and the stateful pieces (SI editor, stake input) are hoisted
  to module scope — typing flows normally and match setup survives re-renders.
- **Stake fields snapped back to the default when cleared** — the dollar inputs
  on the Rounds tab committed on every keystroke, so emptying a field instantly
  re-showed the tournament default and you couldn't retype a new rate. The
  input now buffers its text while focused and still commits each keystroke.
- **SportsCenter ran money at default stakes** — the broadcast rebuilds the Cup
  from synced rounds with a fresh state, so stake overrides set on the Rounds
  tab never reached its money engine and the TV bankroll could disagree with
  the app. The provider now recovers each round's rates from the synced format
  objects (skins ante, BBB/Nines, Wolf unit, Nassau per-point) — broadcast and
  app money now settle at the same stakes. Regression tests added.

### Added
- **Award Races on the Standings tab** — live leaders for all four season award
  categories (Skins King, Birdie King net, Flat Stick, Iron Man) with the full
  field's numbers, so every Cup category has a visible leader before final
  settlement — not just points, stats and money.
- **Skins King & Birdie King pages on SportsCenter** — the post-round stat
  rotation now includes both season-award races alongside scoring average,
  fairways, greens, putts, birdies and money, completing the "leaders in every
  category" set on the TV.
- **SportsCenter keyboard remote** — F fullscreen · Space pause/resume ticker ·
  → / N next stage module · +/− ticker speed · A/P/L/S broadcast mode, with an
  on-screen key legend and a pause/resume button in the hover controls. Built
  for the laptop-connected-to-TV setup where the keyboard is the remote.
- **SportsCenter screen wake lock** — the page now requests a screen wake lock
  (re-acquired when the tab regains visibility) so the laptop driving the TV
  doesn't sleep mid-broadcast.
- **Landscape-aware app chrome** — on short viewports (rotated phones) the top
  NavBar and bottom tab nav compact themselves (~40px reclaimed), keeping the
  scorer and EGT screens usable in landscape.

## [1.7.1] — 2026-07-10

### Fixed
- **Stale schedule on the Rounds tab** — the EGT Cup screen loaded a persisted
  tournament model from localStorage and never refreshed schedule metadata, so
  installs that already had saved state kept the old tee times and showed no
  cart pairings. Boot now always re-imports the embedded seed (idempotent —
  entered scores/events/finalized/stakes are preserved, only the derived model
  is swapped), so tee times, cart pairings, teams and formats always reflect the
  seed. Cache version bumped so the fix ships past the service worker.

### Changed
- **Crystal Springs (R4) tee time corrected** to **7:50 AM** (was 7:30 AM).
- **Cart partners shown at a glance** on each round card (collapsed header), so
  riding partners are visible before starting the round.

## [1.7.0] — 2026-07-10

### Added
- **Official pairings, from a single source of truth** — every round in
  `fixtures/egt-2026-seed.json` (regenerated into `egtSeedData.js` via
  `scripts/gen-seed.mjs`) now carries structured `teeTimes`, cart pairings, and
  a tournament-director rationale, so tee times and pairings propagate to the
  Rounds page, EGT SportsCenter, Bottom Line ticker and printable packet with no
  stale references.
- **Pairings tab** on the EGT Cup screen — a fairness analysis proving the
  schedule is balanced: partner, opponent and cart-partner frequency matrices,
  per-round handicap-balance table, and a scorecard (teammate/opponent spread,
  cart coverage, average team Δ). Every player rides with all three others; both
  team rounds are balanced (avg team Δ 5 course-handicap strokes).
- **Individual Nassau matches on every round (R1–R6)** — the pre-round match
  overlay, previously R5-only, is now available on all rounds. Layer optional
  1v1/2v2 Nassau matches on top of any format; they reuse the existing Nassau
  engine and share the same hole-by-hole scores (no duplicate entry).

### Changed
- **Official tee times updated** for all six rounds (Minerals 10:00 AM / 12:36
  PM, Ballyowen 7:30 AM, Wild Turkey 1:45 PM, Crystal Springs 7:30 AM, Cascades
  2:02 PM / 4:08 PM, Black Bear 8:36 AM).
- **R2 teams rebalanced** to John + Mike vs Brian + TJ (from John + Brian vs
  TJ + Mike) to avoid a low-low super-team; with R5 now individual, both team
  rounds (R2, R4) use a balanced split.
- **Rounds page redesign** — consistent card structure, tee-time chips, a
  Pairings & Logistics block (tee time, teams, carts, rationale), and unified
  section headers, typography and spacing across mobile and desktop.

## [1.6.3] — 2026-07-10

### Added
- **EGT SportsCenter** — `/bottomline` is now a full broadcast production, not
  just a ticker. A mode-driven full-screen stage sits above the Bottom Line and
  transitions automatically from the live data:
  - **Pre-Round** — rotating cards for the next round: course, tee time, day,
    format + rules, team matchups / pairings, the full schedule, previous-round
    winner, and a first-tee card.
  - **Live** — leaderboard, running bankroll, per-format standings (Skins,
    Nassau, Wolf, BBB, Stableford, Pass the Money…), who's on the course and on
    which hole, and Cup standings — all updating in realtime.
  - **Post-Round (SportsCenter)** — Cup standings with movement arrows + money,
    a round recap (low round, best net, low front/back), Player of the Round,
    format winners, rotating player cards, and a cycling stats dashboard
    (scoring average, fairways, greens, putts per round, birdies, money).
  - Auto mode selection with manual override controls (AUTO / PRE / LIVE / POST),
    ticker-speed and fullscreen controls, and a live clock.
- **Player identities & logos** — each golfer's logo and alias is integrated
  throughout: Brian = Birdman, John = Gadget, TJ = Straight T, Mike = H7. Logos
  appear on leaderboards, standings, player cards, recaps, winner reveals, and
  pairings.

### Fixed
- **Ticker rendering** — the Bottom Line strip now stays filled two viewports
  past the right edge with consistent gap spacing and font-load–gated
  measurement, so items enter fully laid out from the right with no gaps,
  pop-in, clipped text, or jitter, and the loop is seamless.

## [1.6.2] — 2026-07-09

### Changed
- **R5 match play is now configurable before the round** — no more default
  round-robin. Set the matches on the Rounds tab with the native Nassau match
  config (up to six, any mix of 1v1 and 2v2, any players — e.g. one 2v2, or a
  player in just two 1v1s), each with its own stake. Strokes auto-fill from
  course handicaps (off the low within each match); tapping holes in a match
  overrides them. The scorer, Cup points (best match record), money, and the
  head-to-head tiebreaker all honor exactly the configured matches; with no
  matches set, R5 runs BBB + skins only.

## [1.6.1] — 2026-07-09

### Changed
- **EGT Bottom Line is now EGT-only.** The ticker aggregates data exclusively
  from EGT Cup tournament rounds (R1–R6). Casual rounds and other golf trips
  synced to the same project are ignored entirely — every leaderboard, money
  card, stat, format board, fun fact, record, spotlight, and alert is sourced
  only from scores/stats entered in EGT rounds.
- **Money is single-source-of-truth.** The running bankroll comes straight from
  the EGT tournament engine (cumulative over finalized rounds, including
  Pass-the-Money and stake overrides), topped up with live native money for any
  EGT round still in progress — so per-round cards can never contradict it. The
  redundant "EGT CUP MONEY" card was removed (the bankroll already reflects it),
  and a "Current Last Place" card was added from the Cup standings.
- Dropped the generic trip-leaderboard code path from the provider.

### Fixed
- Publish `bottomline.html` to GitHub Pages (the deploy step's file allowlist
  was missing it, so `/bottomline` 404'd).

## [1.6.0] — 2026-07-09

### Added
- **EGT Bottom Line (`/bottomline`)** — an always-on, ESPN-style broadcast
  ticker built for TV displays (75"–98", landscape). A full-width strip
  scrolls right-to-left forever with no visible seam, telling the story of
  the trip: live round status (course, current hole, who's on the course),
  round and trip leaderboards (gross/net/nines/high-low), live money for
  every format (Skins, Nassau, Wolf, BBB, Stableford, Pass the Money,
  Tee Ball), every stat the stats engine computes (putts, 1-/3-putts,
  FIR/GIR, sand saves, penalties, scrambling, par-3/4/5 scoring, longest
  drive/putt), EGT Cup standings + money + award races, fun stats (streaks,
  blowups, recoveries, worst hole), the record book, player spotlights, and
  the round schedule.
- **Realtime, no refreshes** — the page subscribes to the same Firestore/RTDB
  sync the app writes; scores entered anywhere appear on the ticker within
  seconds, changed cards flash, and breaking-news alert cards (birdies,
  eagles, doubles, meltdowns, lead changes, new records, money swings) are
  injected into the stream and flashed on a banner.
- **`BottomLineProvider`** — a modular, pure data provider that aggregates
  every scoring model into one unified feed through a registry of segment
  builders (new stats added later surface automatically); the ticker renders
  from cached computed facts and only recomputes when data changes.
- Ticker niceties: category rotation (money → leaderboard → stats → format →
  fun → spotlight → records → …), configurable speed, fullscreen toggle,
  pause-on-hover (desktop only), 60 fps transform-only animation.

## [1.5.4] — 2026-07-07

### Changed
- **R5 (Cascades) format replaced:** scramble/alternate shot are gone. R5 now
  plays full-round Bingo-Bango-Bongo (gross, 3 pts/hole) plus round-robin 1v1
  match play — every player plays every other, the higher handicap receives the
  CH difference on the lowest-index holes, and each match settles Nassau-style
  (front/back/overall) via the existing Nassau engine in the scorer.
- R5 Cup points: BBB champion 2 + match-play champion 2 (best overall record,
  ties split) — the round stays worth 4 toward the 30-point ceiling.
- R5 stakes editable on the Rounds tab (BBB per point, match play per point,
  skins); head-to-head tiebreaker now counts R5 match wins.

## [1.5.3] — 2026-07-07

### Added
- **Tourney stats on the standings page** — cumulative putts, fairways hit, and
  greens in regulation across R2–R6 (live from entered scores; R1 excluded),
  shown on the EGT standings tab and in the printable packet.

## [1.5.2] — 2026-07-06

The EGT Cup is worth 30 points, period — Tuesday (R1) is fully out.

### Fixed
- **Max column showed stale seed ceilings (36) on installed devices** — the
  adjustment only ran on fresh imports. It now recomputes from first principles
  on every rehydrate, so all four players show a 30-point max.
- **R1 no longer leaks into the tourney:** its skins are out of the Skins King
  award and the total-skins tiebreaker, and its stats are out of the season
  awards (Birdie King / Flat Stick / Iron Man). R1 stays cash-only.
- Standings tab notes the scoring basis: 30 pts max, R2–R6 count.

## [1.5.1] — 2026-07-05

Scoring density + EGT stakes/standings tweaks.

### Changed
- **Removed Sand-save tracking** from the scorer, round setup, defaults, and the
  stats screen.
- **Denser player tiles** — no per-tile scrolling, a smaller "HOLE #" header, and
  a lower size floor so four players fit on one screen (built for one-handed use).
- **Editable per-format stakes** on the EGT Rounds tab, flowing into the money
  engine and the native scorer's format trackers.
- **R1 (Minerals) is now flat / stakes-only** — it pays out cash but awards no
  EGT Cup points and is excluded from the standings (Max caps at 30).

## [1.5.0] — 2026-07-05

The EGT Cup tournament feature.

### Added
- **EGT 2026 Cup** (new bottom-nav tab): imports the trip definition and runs
  live scoring across six mixed-format rounds (Bingo-Bango-Bongo, The Nines,
  four-ball match + Nassau, Wolf, team & individual Stableford, scramble,
  alternate shot, championship singles, gross/net skins), with an EGT Cup
  points engine, a zero-sum money engine, standings with night-over-night
  deltas, a stroke-index entry flow, and a printable packet.
- **Score EGT rounds in the native scorer** — each round opens PlayPal's real
  hole-by-hole scorer, prefilled from the seed, with its format engines
  triggering (BBB, Nassau, Wolf, Stableford, Skins); results bridge into the
  Cup standings on finalize.
- Rounds tab shows a plain-English format note per round and each game's
  strokes/pops with its basis.

## [1.4.0] — 2026-07-03

App Store submission readiness: a fully self-contained bundle and a
committed native iOS project. No user-facing feature changes.

### Added
- **Native iOS project (`ios/`)** generated with Capacitor 8 (Swift Package
  Manager — no CocoaPods step on the Mac): bundle id `com.playpal.golf`,
  marketing version 1.4.0, brand app icon and launch screen installed,
  `PrivacyInfo.xcprivacy` privacy manifest registered in the build, light
  status bar over the brand header, and `ITSAppUsesNonExemptEncryption=false`
  so uploads skip the export-compliance questionnaire.
- `npm run build:www` assembles the self-contained `www/` bundle that ships
  inside the binary; `npm run ios:sync` builds + syncs it into the iOS
  project. `assets-native/` holds the 1024px icon / 2732px splash sources.

### Changed
- **All runtime dependencies are now vendored** (`vendor/`): React 18.3.1,
  Firebase 11.9.0 compat SDKs, the QR library, and Plus Jakarta Sans
  (latin + latin-ext woff2). The app makes **zero CDN requests** — faster
  first load, no third-party availability risk, full offline capability,
  and no remote-URL shell inside the iOS binary (App Review guideline 4.2
  mitigation). The only external traffic left is Firebase's own data API.
- Service worker precaches the vendored files and drops the now-unused CDN
  cache branch.
- `docs/IOS_APP_STORE_PATH.md` rewritten as a beginner-grade, click-by-click
  submission guide matching the in-repo project;
  `APP_STORE_READINESS.md` re-scored (12 pass / 2 mitigated cautions / 1
  fail — the $99 Apple membership + Mac, which code cannot fix).


One-screen score entry. The in-round screen now always fits the viewport —
no scrolling, ever — and scales itself to the player count and device.

### Added
- **Adaptive one-screen score entry:** the player grid is measured live
  (ResizeObserver) and every control scales to fit — 1-column and generous
  for 2–3 players, a 2×2 grid for 4+, side-by-side columns in landscape.
  The scale respects readability floors and accounts for stat-row wrapping
  and wolf/PTM warning strips, so nothing clips on small phones.
- **Always-visible primary action** in a new bottom action bar: it walks the
  golfer through the round — ENTER SCORES → PICK WOLF / ENTER PUTTS →
  NEXT HOLE → FINISH ROUND — with EXIT, CARD and GAMES utilities beside it.
- **Game trackers bottom sheet:** trackers (and the round tracker) moved
  from an inline drawer into a slide-up sheet, keeping the score surface
  clean. Escape key and backdrop tap close it.
- **Offline banner:** a slim status strip appears under the nav when the
  connection drops, and live scores are re-pushed automatically when it
  returns.
- **Micro-interactions:** score-change pop animation, sheet slide-up and
  fade-in transitions (all respect `prefers-reduced-motion`), and light
  haptic feedback on score/putt taps where the platform supports it.

### Changed
- Hole header is more compact (and denser still in landscape); the
  SCORECARD chip moved into the bottom action bar as CARD.
- Putts / FIR / GIR / penalties / sand / up-&-downs now share one wrapping
  stat row; the pop pill joined the format-pills row.
- The manual POP toggle only renders when a game format that uses pops is
  active — casual stat-only rounds no longer show it.
- Font payload trimmed to Plus Jakarta Sans only (Inter and Playfair
  Display were fallback-only and never rendered); added `preconnect` hints
  for all CDNs used at startup.

### Fixed
- Score entry (and the wolf picker) now respect the bottom safe-area inset,
  so controls no longer sit under the iPhone home indicator.
- Hole-progress dots are real buttons — keyboard-accessible with proper
  labels; stepper, putt and stat buttons gained descriptive `aria-label`s.
- The sync pulse indicator no longer overlaps the Dynamic Island.

## [1.2.0] — 2026-06-12

Customizable stat tracking, a more compact score-entry tile, and proper
iPhone safe-area handling.

### Added
- **Select Stats to Track** (pre-round, in Setup): choose exactly which
  per-hole stats to record. Putts, FIR and GIR are pre-selected; Penalties,
  Sand saves and Up & downs are opt-in. The selection is remembered locally
  and pre-populated for future rounds.
- `StatsService` stat registry (`STAT_TRACK_DEFS`) plus pure
  `normalizeStatsConfig`/`resolveRoundStatsConfig` helpers — new stats can be
  added in one place without touching the selection screen or in-round
  plumbing. Covered by new unit tests.

### Changed
- In-round stat tracking is now driven by the per-round selection: disabled
  stats are hidden entirely. Putts remain available automatically when a
  Pass-the-Money game is in play (its holder is derived from putts).
- **Compact player tile:** PUTTS, FIR and GIR now share a single horizontal
  row (wrapping only on very narrow screens) with tighter controls; opt-in
  short-game stats sit in a compact second row. Header and stepper padding
  trimmed — more players fit on screen, less scrolling hole-to-hole.
- **iPhone safe area:** the top navigation now respects
  `env(safe-area-inset-*)` so the logo, QR button and sync code always clear
  the Dynamic Island / status bar; side insets keep the top and bottom bars
  clear of the notch in landscape. No hardcoded device offsets.

### Removed
- Dead `PlayerCard.jsx` (superseded by `PlayerScoreCard` in `ScoreEntry`;
  it had no references) and its build/script/cache entries.

### Migration / compatibility
- Saved rounds are unaffected: the stat data model (FIR/GIR/extra arrays) is
  unchanged; the new config only governs which inputs render. Rounds saved
  before this release fall back correctly — legacy `trackStats` rounds show
  all stats, trip rounds show Putts/FIR/GIR, others show Putts.

## [1.1.1] — 2026-06-12

Hardening release: closes every remaining OPEN item from `AUDIT.md` that is
fixable in software (H7, H8, M3, M4, M6, M7).

### Fixed
- **Stale live-score listener race (AUDIT H8):** live payloads are tagged
  with the round id; receivers drop payloads for other rounds and late
  callbacks after unsubscribe. v1.1.0 clients (untagged payloads) still sync.
- **Trip dashboard full-collection read (AUDIT H7):** trip rounds are now
  fetched with a `where('round.tripId','==',tripId)` Firestore query
  (automatic single-field index; legacy scan kept only as an error fallback).
- **Unencoded URL parts (AUDIT M3):** Venmo handles and recipient emails are
  `encodeURIComponent`-ed in the Venmo deep/web links and scorecard `mailto:`.

### Added (accessibility, AUDIT M4)
- Programmatic form labels: `Label htmlFor` + input `id`s on the player
  profile, join-code, and course-builder forms; `aria-label` on tee-set,
  hole-grid, trip, search, allowance, override, and compare inputs.
- Dialog semantics: `Modal`/`QRModal` announce as `role="dialog"` with
  `aria-modal`, accessible names, Esc-to-close, and labeled close buttons.
- Player-form hand/color pickers are real `<button>`s with `aria-pressed`.

### Removed
- Vestigial `sync-config.js` (config truth lives in `index.html`) (AUDIT M7).
- Last two stray `console.log`s in the round sync service (AUDIT M6).

## [1.1.0] — 2026-06-12

The match-format release: a modular scoring engine, real handicaps, richer
courses, stats, and sharing — while keeping every existing money game intact.

### Added
- **MatchEngine** (`components/matchEngine.js`): registry-based scoring engine
  with 22 formats — Stroke Play, Individual Gross/Net, Match Play, Four Ball,
  Best/Better Ball, Scramble, 2-Person Scramble, Shamble, Alternate Shot,
  Foursomes, Chapman (Pinehurst), Team Gross/Net, Stableford, Quota, Skins,
  Nassau, Sixes, Wolf, Bingo Bango Bongo. New formats register without
  touching existing logic.
- **Setup → Games catalog**: category picker, handicap-balanced auto teams
  (serpentine), gross/net toggle, per-format allowance defaults
  (USGA-recommended), strokes-off-low-ball, per-game manual handicap overrides.
- **HandicapService**: WHS Course Handicap (HI × Slope ÷ 113 + CR − Par),
  playing-handicap allowances, stroke-index allocation (9/18, wraps, plus
  handicaps), net scoring, and a provider interface for handicap-network sync
  that degrades gracefully when not configured (↻ SYNC in profiles).
- **CourseService**: multi-tee course model with per-tee rating/slope/yardages,
  9- and 18-hole layouts, course favorites (⭐), recently-played cache, and a
  provider interface for external course databases.
- **Course builder**: 9/18-hole toggle and additional tee sets.
- **Live game trackers**: generic standings cards for every engine game
  (match status like “2 UP thru 7 · dormie”, skins carryovers, quota pace).
- **Stat tracking rounds**: penalties, sand saves, up-and-downs per hole
  (FIR/GIR now available outside trips), synced live like scores.
- **Stats screen (📈 tab)**: scoring average/trend, distribution, par-3/4/5
  splits, FIR/GIR/putts, personal bests, lifetime totals, and hole-by-hole
  round comparison — built from locally saved rounds.
- **Profiles**: preferred tees, dominant hand, home course, career view.
- **Round history**: “Round In Progress” resume card on Home; completed
  rounds feed Stats automatically.
- **Sharing**: 📤 share-sheet text scorecard (standings, game results, money)
  and ⬇️ hole-by-hole CSV export on the Summary screen.
- **Summary**: final game results with winners, gross + net totals.
- Versioned localStorage migrations (`pp_schema_version` → 2) that preserve
  all existing data; 60 new unit/integration tests (suite: 85).
- Docs: `docs/FEATURE_GAP_ANALYSIS.md`, `docs/DEVELOPER_GUIDE.md`,
  `docs/USER_GUIDE.md`, `docs/SCHEMA_CHANGES.md`.

### Changed
- Score entry, trackers, and finish flow now size off the course's hole count
  (9-hole rounds fully supported).
- Setup step 3 renamed “Games & Formats”; legacy formats grouped under
  “Money Games”; rounds can start with engine games, money games, or both.
- Service-worker cache bumped to v1.1.0 with the new modules precached.

## [1.0.0] — 2026-06-11

First production release candidate.

### Added
- Build pipeline (`npm run build`): esbuild precompiles all JSX → `dist/`; in-browser Babel removed.
- Error boundary with branded recovery screen.
- PWA support: `manifest.webmanifest`, service worker with offline shell, full iOS home-screen icon set.
- Test suite (`npm test`): 18 tests incl. the 25-assertion engine regression harness, now enforced in CI.
- GitHub Actions: CI (build/test/audit/secret-scan), GitHub Pages deploy, tag-driven releases; Dependabot; issue/PR templates.
- Legal & support pages (`privacy.html`, `terms.html`, `support.html`) linked from the Home screen footer.
- Hardened Firebase security rules (`firebase/`) with deploy instructions.
- App Store submission kit (`appstore/`, `docs/IOS_APP_STORE_PATH.md`).

### Changed
- React 18.3.1 development builds → production builds, SRI hashes verified against npm tarballs.
- Bottom tab bar: accessible buttons (`aria-label`, `aria-current`), higher label contrast, 48px targets.
- Viewport allows pinch zoom; safe-area aware (`viewport-fit=cover`).
- `join.html`: round codes sanitized, console logging removed, restyled to brand palette.
- Course setup copy now reflects manual entry as the add-course path.

### Removed
- Broken "Scan Scorecard" feature (made a credential-less browser call to a paid API; could never work safely client-side).
- `mockup-homepage.html` (dead design mockup).

### Fixed
- Unguarded `JSON.parse` of stored player profiles could crash-loop the app on corrupted storage.
- Global animations now respect `prefers-reduced-motion`.
