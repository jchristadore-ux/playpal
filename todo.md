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

## Optional follow-ups (not required by spec)
- [ ] UI entry for putts/FIR/GIR/sand, CTP/LD winners, Wolf selections (engine ready).
- [ ] Configurable net-birdie basis for The Rock.

## Constraints
- dist/ committed; run `npm run build` before every commit.
- Web/PWA + Capacitor bundle must keep working (build-www copies dist/egt/).
- Seed is the single source of truth; engine derives pops from courseLibrary SI.
