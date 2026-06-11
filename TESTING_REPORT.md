# Testing Report

## Before this pass
- **Zero executed tests.** A 25-assertion regression harness (`runPlayPalTests`)
  existed inside `gameUtils.js` but was never run by any tooling — it only ran
  if someone typed it into a browser console.
- No CI, no build validation, no dependency auditing.

## Now

| Layer | What runs | Where |
|---|---|---|
| Engine regression | The built-in 25-assertion suite (Nassau 1v1/2v2, presses, zero-sum checks, Markey Match, tie handling) now executes under `node --test` and **fails CI if any assertion fails** | `tests/gameUtils.test.mjs` test #1 |
| Unit tests (new) | 17 additional tests: score naming, Stableford scale, handicap stroke allocation, pop adjustments, sync-code format, Skins outright/carryover/zero-sum, Wolf rotation + lone-wolf win/loss, BBB tallies, Tee Ball tallies, totals, format-catalog integrity | `tests/gameUtils.test.mjs` |
| Integration (trip aggregation) | Leaderboard ranking, earnings aggregation, stroke totals, empty-trip handling, trip awards | `tests/tripUtils.test.mjs` |
| Build validation | Every CI run compiles all 14 source files with esbuild (a de-facto syntax/JSX check for the whole codebase) and fails if committed `dist/` is stale | `.github/workflows/ci.yml` |
| Security | `npm audit --audit-level=high` + secret-pattern scan | CI |

**Result: 18 test files-level tests, 0 failures** (`npm test`). The harness
loads the *same browser scripts that ship* into a Node `vm` context, so the
tested code is the shipped code, not a copy.

## Honest coverage assessment

The 90%+ target was **not reached**, and a truthful number matters more than a
flattering one:

- **Scoring/payout engine (`gameUtils.js`, 811 lines):** ~70% of functions
  exercised — every game format's standings math has at least one assertion;
  Nassau (the most intricate) has the deepest coverage via the built-in suite.
- **Trip aggregation (`tripUtils.js`, 223 lines):** all three public functions
  exercised on happy path + empty input.
- **UI components (~6,400 lines of JSX):** **0% executed coverage.** They are
  compile-checked on every CI run, but not behavior-tested. Testing them
  properly needs jsdom/Playwright; with the globals-based architecture that is
  a multi-day project and the highest-value next investment.
- **Sync services (`index.html` inline):** not unit-tested (thin wrappers over
  the Firebase SDK; testable only with the Firebase emulator — free, see below).

## Remaining gaps, ranked by payoff
1. **Critical-flow E2E** (Playwright, free): start round → score 18 → verify
   payouts on Results. One test would cover the chain users actually depend on.
2. **Firebase emulator tests** for the five sync services (`firebase emulators:start`).
3. **Component tests** for `ScoreEntry` state machine (most complex UI logic).
4. Edge cases: 5+ players in Wolf, mixed-handicap pops in Nassau 2v2, hole 10
   starts interacting with front/back Nassau segments.
