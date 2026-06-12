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
- **M1:** Analysis complete; plan written to `todo.md`.

## In Progress
- Nothing mid-flight; M1 done.

## Remaining
- M2 (stat registry+model) → M3 (Setup selector) → M4 (ScoreEntry config+compact
  tile) → M5 (safe area) → M6 (build/test/changelog/remove PlayerCard/push/PR).

## Next Action (exact)
Start **M2**: in `components/statsService.js`, before `Object.assign(window,
{StatsService})` (L276), add `STAT_TRACK_DEFS`, `DEFAULT_STATS_CONFIG`,
`normalizeStatsConfig`, `resolveRoundStatsConfig`; attach to the `StatsService`
object AND `window`. Add `tests/statsConfig.test.mjs`. Build + test.
