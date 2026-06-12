# TODO — UX/feature pass: customizable stats, compact tiles, iOS safe area

Branch `claude/fervent-planck-alq54v` (fast-forwarded to merged main @6a1ad13).
Milestones: code + rebuild `dist/` + tests green + docs, committed together.

- [x] M1 — Analyze; write plan (this file + progress.md)
- [ ] M2 — Stat registry + config model (`components/statsService.js`)
  - Add `STAT_TRACK_DEFS` (putts/fir/gir default-on; pen/sand/ud default-off),
    `DEFAULT_STATS_CONFIG`, pure `normalizeStatsConfig`,
    `resolveRoundStatsConfig` (legacy `trackStats`/`tripId` fallback).
    Export on `StatsService` + `window`. Pure (Node-testable).
  - Add `tests/statsConfig.test.mjs` for normalize/resolve.
- [ ] M3 — "Select Stats to Track" UI (`components/Setup.jsx`)
  - Replace single `trackStats` checkbox (~L996) with a 6-chip selector card;
    state `statsConfig` seeded from `localStorage pp_stats_config` (remembered),
    persisted on toggle. `onStart` passes `statsConfig` + derived `trackStats`.
    Update round-summary line (~L1144).
- [ ] M4 — Drive in-round UI from config + compact tile
  (`components/ScoreEntry.jsx`)
  - Resolve `statsCfg` via `resolveRoundStatsConfig(round)`; putts effective =
    `cfg.putts || hasPTM`. Pass `stats` object to `PlayerScoreCard` (replaces
    `isTripMode`/`trackStats`). Hide disabled stats entirely.
  - Redesign tile: PUTTS + FIR + GIR on ONE horizontal wrapping row; PEN/SAND/
    U&D compact row below (each gated). Trim header/stepper vertical padding.
- [ ] M5 — iOS safe area (`components/Shared.jsx` NavBar, `components/App.jsx`)
  - NavBar bar: `minHeight: calc(56px + env(safe-area-inset-top))` +
    `paddingTop: env(safe-area-inset-top)` + L/R insets (landscape). Drop fixed
    `height:56`/`padding:'0 16px'`. Add L/R insets to bottom nav.
- [x] M2 — Stat registry + config model (statsService + tests)
- [x] M3 — "Select Stats to Track" selector (Setup)
- [x] M4 — Config-driven in-round UI + compact tile (ScoreEntry)
- [x] M5 — iOS safe area (Shared NavBar + App bottom nav)
- [x] M6 — v1.2.0 bump, changelog, removed dead PlayerCard.jsx, build, test

## Notes / constraints
- `dist/` is committed; CI fails if stale → `npm run build` before every commit.
- Data model unchanged for saved rounds: firData/girData/extraStats arrays stay;
  config only drives which inputs render. RoundViewer/Summary unaffected.
- PlayerCard.jsx is unused (no `<PlayerCard` JSX); remove in M6 + its index.html
  + sw.js script tags.
