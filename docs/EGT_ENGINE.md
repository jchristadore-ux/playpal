# EGT Cup Tournament Engine

Loads the EGT 2026 trip definition, runs live scoring across six mixed-format
rounds, and produces printable standings. Built to match PlayPal's stack: classic
ES scripts that self-register on `window`, compiled file-by-file by esbuild, and
tested under `node --test` via `tests/helpers/load.mjs`.

## Data flow

```
egt-2026-seed.json ──▶ EgtImporter.importSeed ──▶ model (courses, rounds, derived)
                                                     │  derived = course handicaps
                                                     │  + pops, recomputed live
                                                     │  from courseLibrary SI
EgtStore (localStorage, idempotent by trip.id) ◀─────┘
        │  scores + events entered live
        ▼
EgtEngine.liveUpdate ─▶ calculators (EgtScoring) ─▶ EgtPoints / EgtMoney / EgtStandings
        │                                                  │
        │                                                  ▼
        └────────────────────────────────────────▶ night snapshot + EgtPrintable packet
```

## Modules (`components/egt/`)

| Module | Responsibility |
|---|---|
| `egtHandicap.js` | Course/playing handicap; the §2 pop-allocation rule; permutation validation; 9-hole interleave. |
| `egtImporter.js` | Normalize seed → model; derive handicaps + pops from `courseLibrary` SI; SI entry + recompute; tolerant of pending (`si: null`). |
| `egtScoring.js` | BBB, Nines, four-ball match + Nassau, Wolf, team/individual Stableford, scramble, alternate shot, singles, gross/net skins. |
| `egtSideGames.js` | Pass the Money (The Rock) ledger, CTP, Long Drive, tracked stats. |
| `egtPoints.js` | EGT Cup points per round + season awards (verified vs `maxPossible`). |
| `egtMoney.js` | Zero-sum money — each finalized round nets to $0 by construction, plus the off-course `tripExtras` ledger at final settlement. |
| `egtStandings.js` | Leaderboard, tiebreakers, R6 reseed, night snapshots + deltas. |
| `egtStore.js` | localStorage persistence; re-import preserves entered data. |
| `egtPrintable.js` | Print-ready standings + scorecards from stored data. |
| `egtEngine.js` | Orchestrator for the live update. |
| `egtSeedData.js` | The seed embedded as `window.EGT_SEED` (offline import). |

UI: `components/EgtTournament.jsx`, reachable from the **EGT CUP** tab.

## What carries money

Every game is a **flat stake**, not a per-point settlement:

| Round | Cash game | Stake |
|---|---|---|
| R1 | BBB (front 9) · The Nines (back 9) | $5 to each winner from every other player |
| R2 | Four-ball, 18 holes | $5 to each winner from each opponent |
| R3 | Wolf (unit leader) · TJ v John Nassau | $5 from each · $2 front / $2 back / $4 overall |
| R4 | 2v2 aggregate Stableford, all 18 | $5 to each winner from each opponent |
| R5 | BBB (18) · six-match round robin | $5 from each · $1 / $1 / $2 per match |
| R6 | Individual Stableford · two Nassaus | $5 from each · $2 / $2 / $4 each |
| — | `tripExtras` — shared costs + poker | settles once, at final settlement |

Side matches live on `rounds[].sideMatches` in the seed. Matches configured on
the Rounds tab override them; an explicitly empty list means "none played".
**The Rock** settles cash only when `sideGames.passTheMoney.played` is true —
its ledger is derived from the scores either way.

`EgtMoney.compute` returns `golfOnly` (rounds + any PTM) and `extras` beside
`total`, so a view can show the on-course result and the real bottom line apart.

## Core formulas

- **Course handicap** `CH = round(HI·Slope/113 + (CR − Par))`, half-up. Two-loop 9s
  (Minerals, Cascades) use the 18-hole-equivalent CR/Par on the played tee.
- **Pops** for N strokes over holes with SI 1..M: `base = ⌊N/M⌋`,
  `extra = N mod M`; a hole gets `base + (si ≤ extra ? 1 : 0)`. A hole carries a 2nd
  stroke when N > M. This reproduces every `strokeAllocations[*].holes` array in the
  seed (the golden test).
- **Playing handicap** `PH = round(CH · allowance)`; taken off the low player
  (match/skins/wolf) or full (Stableford), per the seed's `basis`.

## Stroke-index gap (§6)

Courses can ship with `strokeIndexVerified: false` and `holes[].si = null`. The
importer still loads counts and marks pops "pending"; entering a valid SI
permutation (9 values for a two-loop 9, 18 otherwise) flips the flag and
auto-recomputes pops for every affected round — no calculator changes, because all
calculators read pops live from `courseLibrary` SI.

## Note on §8 course handicaps

The seed plays **White** tees, so R2 Ballyowen course handicaps are 13/18/23/23.
§8's prose figure (17/23/28/28) is the Ballyowen **Blue** tee. The task states the
seed is the single source of truth, so the engine reproduces the seed's values;
R6 (16/22/27/27) matches §8 as written.

## Tests

`tests/egt.test.mjs` covers §8: course handicaps, the golden reproduction of every
allocation array, R2/R6 callouts, the SI-gap load→enter→recompute cycle, and the
per-round $0 money invariant, plus calculator/standings units.

`tests/egtAudit.test.mjs` replays the 2026 trip from `fixtures/egt-2026-results.json`
— the scores the app actually synced — and pins every round's payout, the
off-course ledger, and the final settlement. It's the regression net for money
the group has already settled on. Run `npm test`.

## The settlement board

`node scripts/gen-settlement.mjs` writes `settlement.html`: a one-screen board of
the final money, generated by running the engine over the seed + results fixtures
so it can't drift from the app. `--share=<path>` also emits a standalone copy
with nothing to fetch.
