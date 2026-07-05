# Project Progress

## Current work — Remove secondary stat trackers (branch claude/remove-sand-tracker-al009r)

Status: **complete, 115 tests green, browser-smoke verified.**

Trimmed per-hole stat tracking down to just **Putts, FIR, GIR** — removed the
Sand saves, Penalties, and Up & downs trackers (per user's confirmed scope).
- `statsService.js` — `STAT_TRACK_DEFS` now only putts/fir/gir; dropped
  penalties/sandSaves/upDowns from `computePlayerRound` + `aggregatePlayer`;
  `resolveRoundStatsConfig` returns only the three keys. Longest drive/putt
  (drv/lp) plumbing left intact.
- `ScoreEntry.jsx` — removed the PEN/SAND/U&D stat-row UI, the `triBtn` helper,
  and the `setExtraStat` writer; `cardStats`/`statGroupWidths` trimmed. The
  `extraStats` state/persist/sync/save path is kept (still carries drv/lp and
  round-trips saved data).
- `StatsScreen.jsx` — dropped the SAND SAVES / UP & DOWNS / PENALTIES cards.
- `Setup.jsx` — the "Select Stats to Track" chips render from
  `STAT_TRACK_DEFS`, so they auto-trim; `trackStats` derivation updated.
- EGT — `egtBridge` no longer sets/maps `sand`; `egtSideGames` drops the unused
  `sandSaves` season stat; seed `trackedStats` list (both embedded + fixture)
  cleaned. No award consumed sandSaves (only FIR+GIR Iron Man).
- Tests updated (statsConfig/statsService/egt); browser smoke confirmed the real
  ScoreEntry renders only PUTTS/FIR/GIR with no JS errors.

## Previously shipped — EGT 2026 Cup tournament engine (branch claude/playpal-egt-tournament-25w5g0)

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
