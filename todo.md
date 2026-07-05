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

## Optional follow-ups (not required by spec)
- [ ] Show EGT per-game pops in the native scorer's on-screen dots.
- [ ] UI entry for CTP/LD winners (engine ready).
- [ ] Configurable net-birdie basis for The Rock.

## Constraints
- dist/ committed; run `npm run build` before every commit.
- Web/PWA + Capacitor bundle must keep working (build-www copies dist/egt/).
- Seed is the single source of truth; engine derives pops from courseLibrary SI.
