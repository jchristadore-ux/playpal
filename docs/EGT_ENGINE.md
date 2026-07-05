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
| `egtMoney.js` | Zero-sum money — each finalized round nets to $0 by construction. |
| `egtStandings.js` | Leaderboard, tiebreakers, R6 reseed, night snapshots + deltas. |
| `egtStore.js` | localStorage persistence; re-import preserves entered data. |
| `egtPrintable.js` | Print-ready standings + scorecards from stored data. |
| `egtEngine.js` | Orchestrator for the live update. |
| `egtSeedData.js` | The seed embedded as `window.EGT_SEED` (offline import). |

UI: `components/EgtTournament.jsx`, reachable from the **EGT CUP** tab.

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
per-round $0 money invariant, plus calculator/standings units. Run `npm test`.
