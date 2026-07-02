# TODO — Production audit & redesign (Fable Mode)

Branch `claude/golf-scorecard-audit-redesign-wl0b1p` (from main @81bf29f).
Milestones: code + rebuild `dist/` + tests green, committed together.

- [x] M1 — Full audit sweep (baseline: 92/92 tests, no console.logs/TODOs,
      clean tree; findings recorded in progress.md)
- [x] M2 — **One-screen adaptive Score Entry** (`components/ScoreEntry.jsx`)
  - ResizeObserver-driven layout: grid cols/rows by player count +
    orientation (≤3P → 1 col; 4P+ → 2 cols portrait / N cols landscape).
  - Scale factor `sz` from measured card box; all card dims scale with
    readability floors. Cards flex to fill; score stepper absorbs slack.
  - Compact hole header (2 rows); dots become real buttons (a11y).
  - Bottom action bar: EXIT · CARD · GAMES icons + always-visible primary
    (ENTER SCORES → PICK WOLF → ENTER PUTTS → NEXT HOLE / FINISH).
  - Trackers drawer → bottom-sheet modal (RoundTracker moves inside).
  - Merge pop pill into meta row; hide manual POP when no game formats.
  - Merge putts/FIR/GIR/PEN/SAND/U&D into one wrapping stat row.
  - Score pop animation, haptics (navigator.vibrate), safe-area bottom pad.
- [x] M3 — App-level resilience & polish
  - Offline banner in App.jsx (online/offline listeners).
  - ScoreEntry re-pushes live scores on 'online' event.
  - SyncPulse below safe-area; WolfPicker safe-area padding.
  - ppHaptic helper in Shared.jsx.
- [x] M4 — Performance & consistency
  - index.html: preconnect hints; trim fonts to Plus Jakarta Sans only;
    global keyframes (ppSheetUp, ppFadeIn, ppScorePop).
- [x] M5 — Release: v1.3.0 bump (package.json+lock, ?v=, CACHE_VERSION,
      Home footer), CHANGELOG, AUDIT.md refresh, build, tests, push, draft PR.

## Constraints
- `dist/` is committed; CI fails if stale → `npm run build` before commit.
- All game logic (sync, wolf/PTM/nassau/BBB/teeball/markey) unchanged.
- Data model unchanged; layout/UX only.
