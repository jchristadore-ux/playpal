# Project Progress

Branch: `claude/fervent-planck-alq54v` (== merged main @6a1ad13). Plan in `todo.md`.

## Context (read first when resuming)

New task: three UX/feature objectives —
1. **Customizable stat tracking.** Default-track Putts/FIR/GIR only; make
   PEN/SAND/U&D opt-in via a pre-round "Select Stats to Track" selector;
   remember last selection; disabled stats fully hidden in-round.
2. **Compact player tiles.** PUTTS/FIR/GIR on one horizontal row; trim padding.
3. **iOS safe area.** Top header (`NavBar`) must sit below the Dynamic Island/
   status bar via `env(safe-area-inset-*)` (no hardcoded offsets).

Verified architecture facts (do NOT re-derive):
- In-round tile = `PlayerScoreCard` in `components/ScoreEntry.jsx` (NOT the
  unused `components/PlayerCard.jsx`, which has no `<PlayerCard` usages).
- Stat UI today gated by one boolean `round.trackStats` (set by a checkbox in
  `Setup.jsx` ~L996, passed via `onStart` ~L866). Putt tracker currently
  renders unconditionally (~ScoreEntry L248); FIR/GIR/extra gated by
  `isTripMode || trackStats` (~L278); PEN/SAND/U&D by `trackStats` (~L330).
- `App.jsx handleStartRound` (L241) spreads `...config` into the round object,
  so adding `statsConfig` to `onStart(...)` flows to `round.statsConfig` with
  no App.jsx change.
- `NavBar` (`components/Shared.jsx`, `navStyles.bar`) is rendered once at the
  top of `App.jsx` (L468) for ALL screens; it has fixed `height:56`,
  `padding:'0 16px'`, and NO top inset → it's the status-bar overlap. Bottom
  nav already uses `env(safe-area-inset-bottom)` (App.jsx L601).
- `index.html` uses `viewport-fit=cover` + `apple-mobile-web-app-status-bar-
  style=black-translucent`, so `env(safe-area-inset-*)` is available.
- Global `* { box-sizing:border-box }` → use `minHeight: calc(56px + inset)`
  WITH `paddingTop: inset` so the 56px content area stays intact.
- PTM (pass-the-money) needs putts to compute the holder → putts must stay on
  when a PTM format is active regardless of config.
- statsService.js is loaded (index.html head) before Setup/ScoreEntry (body),
  so `window.StatsService.*` helpers are available to both.
- Baseline before this task: `npm test` → 85/85 pass, dist parity clean.

## Completed
- **M1:** Analysis + plan.
- **M2:** Stat registry (`STAT_TRACK_DEFS`) + pure `normalizeStatsConfig`/
  `resolveRoundStatsConfig` in statsService.js; `tests/statsConfig.test.mjs`.
- **M3:** Pre-round "Select Stats to Track" chip selector in Setup; remembered
  in `localStorage pp_stats_config`; `onStart` passes `statsConfig` (+ derived
  `trackStats`); summary line lists selected stats.
- **M4:** ScoreEntry resolves `statsCfg`, passes a `stats` object to
  `PlayerScoreCard` (replaced `isTripMode`/`trackStats`), hides disabled stats;
  putts forced on under PTM. Tile compacted: PUTTS/FIR/GIR one row, opt-in
  short-game second row, trimmed header/stepper padding. Removed dead
  `isTripMode`.
- **M5:** NavBar + bottom nav respect `env(safe-area-inset-*)` (top inset with
  matching minHeight; L/R insets for landscape).
- **M6:** Bumped to v1.2.0 (package.json+lock, index.html/sw.js `?v=`,
  CACHE_VERSION, Home footer), CHANGELOG [1.2.0], removed `PlayerCard.jsx`
  (+ build/script/cache entries). 91/91 tests pass; dist parity clean.

## In Progress
- Nothing mid-flight; all milestones done. Pending: push + draft PR.

## Remaining
- Push branch + open draft PR (base main). Then await review/CI.

## Next Action (exact)
`git push -u origin claude/fervent-planck-alq54v` (retry w/ backoff), then
create a **draft** PR (base: main) via GitHub MCP tools summarizing the three
objectives. Subscription/PR-watch per session rules.
