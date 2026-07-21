# TODO — EGT 2026 Cup tournament engine

Branch `claude/playpal-egt-tournament-25w5g0`.

## Done
- [x] Import `egt-2026-seed.json` → persisted model (idempotent by trip.id).
- [x] §2 course-handicap + pop-allocation core (two-loop 9s, 2nd stroke past 18).
- [x] Reproduce EVERY seed strokeAllocations[*].holes array from scratch (107 checks).
- [x] Scoring calculators: BBB, Nines, four-ball match+Nassau, Wolf, team & individual
      Stableford, scramble, alternate shot, singles, gross/net skins.
- [x] Points engine (per-round + season awards; verified vs maxPossible).
- [x] Money engine (zero-sum; every finalized round nets to $0).
- [x] Standings engine (tiebreakers, R6 reseed, night snapshots + deltas).
- [x] Side games: Pass the Money ledger, CTP/LD, tracked stats.
- [x] SI-entry flow: pending-tolerant load, permutation validation, auto-recompute.
- [x] Printable standings/scorecards from stored data.
- [x] UI: EGT CUP screen (standings/money, rounds+score entry+finalize, SI editor,
      printable), wired into App/index.html/sw.js/build.
- [x] Test suite covering §8 (19 tests) — full `npm test` green (111 pass).
- [x] Browser smoke: EGT screen renders, finalize recomputes standings, SI badges.

## Done — native scorer integration (post-merge follow-up)
- [x] EgtBridge: seed round → native `round`; native scores/events → EGT store.
- [x] "Score this round" launches the full ScoreEntry prefilled from the seed.
- [x] Finishing a round bridges scores in, finalizes, recomputes standings.
- [x] R5 scramble/alt-shot derive the team ball from per-player grosses.
- [x] Bridge tests + browser smoke (launch + finalize updates standings).

## Done — round list clarity (post-merge follow-up)
- [x] Brief plain-English format explanation on each round in the list.
- [x] Pops panel now shows course handicap once + EVERY game's strokes/pops with
      its basis (fixes the "why only 4 pops?" confusion: Skins gives the full
      off-low strokes, e.g. TJ/Mike 9; The Nines is a 9-hole off-low game = 4).

## Done — native format engines fire for EGT rounds (post-merge follow-up)
- [x] toNativeRound emits real format OBJECTS ({type,...}) not strings, so
      ScoreEntry's trackers trigger: R1 BBB, R2 Nassau (2v2 teams), R3 Wolf
      (seed rotation order), R4/R6 Stableford, Skins every round.
- [x] R1 BBB events clamped to loop 1 (holes 1-9); loop 2 is The Nines.
- [x] Tests + browser smoke: BBB dropdown on R1, Wolf on R3, Nassau on R2.

## Done — scorer density + EGT stakes/standings (post-merge follow-up)
- [x] Removed Sand tracking everywhere (scorer stat row, Setup option, defaults,
      Stats screen card, EGT round config).
- [x] Player tiles: no per-tile scroll (overflow hidden + centered), smaller
      "HOLE #" header + tighter padding, lower size floor so 4 players fit with
      zero scrolling.
- [x] Editable per-format stakes on the EGT Rounds tab → flow into the money
      engine and the native scorer's format trackers.
- [x] R1 (Minerals) excluded from EGT Cup standings (flat/stakes-only): awards
      no points; adjusted "Max" caps all four at 30.

## Done — Cup-points explanations per round (v1.7.6)
- [x] `EgtPoints.roundPointsBreakdown` / `seasonAwardsBreakdown` — display data
      derived from the same config + fallbacks the engine scores with.
- [x] Rounds tab: per-card points pill (team/individual/cash-only) + expanded
      Cup Points table; stale R5 Teams row no longer shown.
- [x] Standings tab: "Where the 30 points come from" table (24 + 6 = 30).
- [x] Test: breakdown maxes = ROUND_MAX_POINTS, ceiling = 30 = adjustedMax.

## Done — remove EGT Pairings tab (v1.7.5)
- [x] Dropped the Pairings tab + fairness analysis from the EGT Cup screen;
      cart callouts stay on the Rounds tab, doc stays in docs/EGT_PAIRINGS.md.

## Done — R1 stakes in the overall money tracker (v1.7.4)
- [x] Verified the engine settles R1 money (BBB + Nines + skins + overlay +
      CTP/LD) into the overall total while awarding zero Cup points.
- [x] Fixed SportsCenter per-round payout cards reading `money.byRound`
      (nonexistent) instead of `money.rounds` — finalized R1's card dropped
      The Nines money via the native fallback.
- [x] Regression tests: engine + broadcast lock in "R1 pays money, never
      points".

## Done — full audit + GUI optimization (v1.7.2)
- [x] EGT screen: fixed input focus loss (inline component types → plain
      function renderers; SI editor + stake input hoisted to module scope).
- [x] Stake inputs: draft-buffered so a cleared field can be retyped.
- [x] SportsCenter: per-round stake overrides recovered from synced formats so
      broadcast money matches the app.
- [x] Leaders in all categories: Award Races on the Standings tab; Skins King +
      Birdie King stat pages in the SportsCenter rotation.
- [x] Landscape: compact NavBar + bottom tab nav on short viewports.
- [x] SportsCenter TV: screen wake lock, keyboard remote (F/Space/→/±/A-P-L-S),
      pause button + key legend.

## Optional follow-ups (not required by spec)
- [ ] Recover R4/R6 nassauPerPoint on the broadcast when no Nassau format is on
      the synced round (needs the stake carried on another format object).
- [ ] Show EGT per-game pops in the native scorer's on-screen dots.
- [ ] UI entry for CTP/LD winners (engine ready).
- [ ] Configurable net-birdie basis for The Rock.

## Constraints
- dist/ committed; run `npm run build` before every commit.
- Web/PWA + Capacitor bundle must keep working (build-www copies dist/egt/).
- Seed is the single source of truth; engine derives pops from courseLibrary SI.

## Done — EGT Cup cross-device submitted-status sync (v1.8.2, branch claude/egt-cup-mobile-sync-twd320)
- [x] Bug: a round scored + finalized on the phone did not show as submitted
      (and its scores were missing) when the Cup was opened on the web — the
      EGT store (scores, events, `finalized`) was localStorage-only.
- [x] New `components/egt/egtSync.js`: pulls the Firestore round docs the native
      scorer already streams into the local store — non-destructive score merge
      + BBB/Wolf events + overlay matches + stake overrides — and reconciles the
      `finalized` list (explicit flag wins; falls back to score completeness).
      Boot pull + live subscription wired into EgtTournament; targets only this
      trip's rounds by deterministic sync code (no full-collection scan).
- [x] Finalize/reopen (EgtTournament + App `_finishEgtRound`) broadcasts an
      explicit `egtFinalized` flag so "submitted" propagates before all 18 holes
      are in, and a reopen propagates too.
- [x] SportsCenter (`computeEgtFacts`) honors the same explicit flag — TV, app,
      and every device agree on submitted rounds / standings / money / champion.
- [x] `EgtBridge` split into `mergeNativeScores` (non-destructive) + `bridgeEvents`;
      `RoundSyncService` gained `writeMeta` / `fetchDocs` / `subscribeDocs`.
- [x] 178 tests green (10 new EgtSync tests); browser smoke zero page errors;
      released 1.8.2 everywhere + CHANGELOG.

## Done — full audit pass #5 (v1.8.1, EGT Cup + SportsCenter focus)
- [x] Read every engine module + UI + provider end to end; baseline healthy.
- [x] Fixed NEW TRIP LEADER alert raw-float points (fmtPts + diffAlerts test).
- [x] Corrected the stale R4 pairings rationale in the seed (teams repeat by
      request; cart rotation completes in R5) + regenerated the embed.
- [x] Printable scorecard headings mapped to friendly format names (+ test).
- [x] Dropped dead GAME_ALLOWANCE map in egtImporter.js.
- [x] 166 tests green; browser smoke (app + SportsCenter) zero page errors;
      released 1.8.1 everywhere + CHANGELOG.

## Done — full audit pass #4 (v1.8.0, pre-trip go/no-go)
- [x] Award restructuring (PRs #93–95) audited end-to-end: engine, seed,
      boot refresh, app tables, printable, broadcast all agree on 35-pt
      ceiling + 6 awards.
- [x] SportsCenter: added the missing BIRDIE KING RACE (gross, the 4-pt payer)
      page; net race retitled honorary.
- [x] Released 1.8.0 (version + CHANGELOG had been skipped by #93–95).
- [x] packlist.html added to the sw precache so it truly works offline.
- [x] Stale 30-point comments fixed; +1 settlement regression test (164 green).
- [x] Browser smoke: EGT standings/rounds, SportsCenter, packlist — no errors.

## Done — full audit pass #3 (v1.7.3, EGT Cup + SportsCenter focus)
- [x] Match editor auto-pops now off COURSE handicap; repairMatchPops migration.
- [x] SportsCenter season settlement (awards + PTM) once R6 is final.
- [x] Shared fmtPoints for every points display (no raw thirds).
- [x] Flat Stick requires tracked putts (puttHoles) — engine + Award Races.
- [x] FORMAT_RULES entries for R4/R5/R6 primaryGame keys; schedule label fixed.
- [x] 8 new regression tests; 159 green; dist rebuilt; v1.7.3 everywhere.
