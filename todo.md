# TODO — PlayPal

## Done — Zero putts + mid-round dropouts (v1.18.0, branch claude/zero-putts-mid-round-dropout-poo3hu)
- [x] Zero putts: `ZERO_PUTTS = -1` sentinel — a tracked zero (chip-in) is a
      recorded hole worth no strokes; `0` still means "not recorded", so old
      rounds are untouched.
- [x] Shared putt helpers in gameUtils; every raw `(v || 0)` putt sum in the
      app, CSV, email grid and scorecards now goes through them.
- [x] Scorer: `0` button + CHIP-IN flag; PTM reads a chip-in as ≤ 2 putts.
- [x] FLATSTICK third mode — CHIP-INS (most zero-putt holes wins the pot).
- [x] Stats: round `putts.zeroPutts`, CHIP-INS column, career total + best.
- [x] Dropouts: `{ pid: { thru } }` in play order, set from the score keypad,
      undone with BACK IN, persisted + synced + saved with the round.
- [x] Engine: `void` entries, `expected`-based completion, `ballsNeeded` for
      team units, concession for match play + Nassau, contested-hole
      completion for skins/Wolf/BBB/Sixes; PTM pot moves off a walk-off.
- [x] The round now settles when somebody leaves — it previously paid nothing.
- [x] 308 tests green (27 new); browser smoke scorer + summary clean;
      v1.18.0 + CHANGELOG + guides + SCHEMA_CHANGES.

### Optional follow-ups
- [ ] Reason picker on the walk-off (injury / work / dark) — the field is
      already carried on the record, nothing writes it yet.
- [ ] Settle skins hole by hole so a player who leaves stops paying for skins
      won after they go (today the whole field settles the pot).
- [ ] Trip/season rollup of chip-ins next to the other award races.
- [ ] EGT Cup rounds don't carry dropouts yet — the bridge hands the tournament
      engine scores/putts/events only, so a Cup round with a walk-off still
      settles on holes played. Chip-ins do flow through (they ride the putts
      array).

## Done — Round awards / mini cup (v1.17.0, branch claude/golf-awards-setup-fy1s6d)
- [x] Five awards registered as MatchEngine formats in a new `awards` category:
      FLATSTICK, FIR KING, BOGEY BRO, PAR PRINCE, BIRDIE BRO.
- [x] Each carries its own stake and settles as its own pot; a round with all
      five plus other formats still nets to $0.
- [x] BIRDIE BRO defaults to net (a group of high handicaps makes almost no
      gross birdies); PAR PRINCE / BOGEY BRO default to gross; FLATSTICK and
      BOGEY BRO / PAR PRINCE carry a mode toggle.
- [x] Empty award (nobody made one) → no winner, no money.
- [x] Untracked stat → player ineligible, not a zero-winner; FLATSTICK needs
      putts on every played hole.
- [x] `raw.stats` plumbed through tracker, summary, email and payouts.
- [x] Adding an award turns on the per-hole tracking it needs.
- [x] Mini Cup card adds all five at one stake.
- [x] 276 tests green (17 new); browser smoke clean; v1.17.0 + CHANGELOG.

### Optional follow-ups for the awards
- [ ] Carry an unclaimed award's pot into another award (today it simply
      doesn't pay).
- [ ] Show award standings in the emailed round report as a dedicated block
      (they currently appear in the per-game list).
- [ ] Season/trip rollup of round awards on the Trip dashboard.

## Done — App Store submission audit (v1.16.0, branch claude/app-store-submission-audit-pqkj74)
- [x] Full audit written to `APP_STORE_AUDIT.md`; `APP_STORE_READINESS.md` now
      points at it and records why its old "all code-side work is done" verdict
      was wrong.
- [x] Money: all 20 MatchEngine formats now settle (they paid $0 before).
      Per-format settlement modes + stake UI + `calcRoundPayouts`. Zero-sum.
- [x] Money: 9-hole layouts (Nassau paid 3× for one match), cents vs Venmo
      amounts, plus handicaps, Wolf with 2 players.
- [x] Auto-pops from course handicap, off the low ball, seeded at setup; pop
      flags carry stroke counts; 2v2 Nassau pops.
- [x] Solo rounds + "Just the scorecard"; verified 1–4 players × 4 viewports.
- [x] One round report drives screen/email/share; mail body fits a mailto: URL.
- [x] Scorecard photo import (local only) + paste-the-numbers parser.
- [x] Removed the fake GHIN post; group-scoped Firebase + rewritten rules;
      emptied DEFAULT_PLAYERS; gated the EGT Cup; `--public` build excludes the
      private tournament data; arm64; camera/photo permission strings.
- [x] 259 tests green (37 new in tests/moneyAudit.test.mjs).

## Next actions (all outside this repo — see APP_STORE_AUDIT.md §7)
- [ ] Deploy the Firebase rules — `cd firebase && npx firebase-tools deploy
      --only firestore:rules,database`. Do this first.
- [ ] Decide PWA vs App Store; if App Store, enrol ($99/yr) and build on a Mac
      with `npm run ios:sync:public`.
- [ ] Enable GitHub Pages for the privacy/support URLs.
- [ ] Move the group off the LEGACY namespace (audit §2.3 steps 3–5).
- [ ] Rewrite `appstore/APP_STORE_LISTING.md` — it still says "eight games".

## Constraints
- dist/ committed; run `npm run build` before every commit.
- Web/PWA + Capacitor bundle must keep working (build-www copies dist/egt/).
- Submit the `--public` bundle, not the default one.

# TODO — EGT 2026 Cup tournament engine

Branch `claude/playpal-egt-tournament-25w5g0`.

## Done — the recap book as PDFs (v1.15.0, branch claude/tournament-results-pages-kp4bse)
- [x] `scripts/gen-recap-pdf.mjs` + `npm run recap:pdf` → `recap/pdf/`, one PDF
      per page (25 files, 146 sheets), folder layout mirrored, whole book in
      `recap/pdf/print.pdf`.
- [x] Fixed: wide scorecards were clipped by their scroll boxes when printed —
      print CSS now unclips and shrinks them onto one Letter sheet.
- [x] Fixed: money figures could wrap after the sign (`−$31.25` → `$31.25` alone
      on the next line, reading as the wrong direction). Now nowrap everywhere,
      including inside the money engine's prose.
- [x] Fixed: cover tiles printed escaped markup in their subtitles.
- [x] Verified 25/25 PDFs contain every token their page shows (pdfplumber),
      plus rasterized checks of the widest cards. 4 new tests guard the rules.

## Done — the 2026 recap book (v1.14.0, branch claude/tournament-results-pages-kp4bse)
- [x] `scripts/gen-recap.mjs` → `recap/`, 25 standalone pages, `npm run recap`.
- [x] A page per round (card + every game hole by hole + pops + points + money),
      per match (10), per player (4), plus standings, awards, money, print sheet.
- [x] Generator self-checks: per-round + award points must sum to the engine's
      totals, money must net to $0 — otherwise it refuses to write the book.
- [x] Self-contained pages (inlined styles, no scripts, no remote assets),
      print-friendly, verified at desktop and narrow widths, zero broken links.
- [x] `tests/recap.test.mjs` (9 tests) pins page inventory + headline figures.
- [x] Fixed: the Pages deploy omitted `settlement.html` / `packlist.html`, which
      are precached — `addAll()` 404 meant the service worker never installed.

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
