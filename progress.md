# Project Progress

Branch: `claude/golf-scorecard-audit-redesign-wl0b1p` (from main @81bf29f).
Task: production audit + redesign; centerpiece = one-screen Score Entry.

## Completed (all milestones — v1.3.0)
- M1: full audit (baseline 92/92 tests, clean tree; findings in AUDIT.md
  addendum + CHANGELOG [1.3.0]).
- M2: one-screen adaptive Score Entry — ResizeObserver-measured grid,
  iterative wrap-aware scale factor with readability floors, 1-col ≤3P /
  2×2 ≥4P / N-col landscape, compact header for short viewports,
  always-visible primary action bar (ENTER SCORES → PICK WOLF → ENTER
  PUTTS → NEXT HOLE → FINISH), trackers → bottom sheet (RoundTracker
  inside), merged stat row, pop pill into meta row (hidden for casual
  rounds), score pop animation, safe-area padding.
- M3: offline banner (App.jsx), reconnect live-score re-push, ppHaptic in
  Shared.jsx, SyncPulse/WolfPicker safe-area fixes, a11y labels + real
  buttons for hole dots / steppers / score box (keyboard operable).
- M4: preconnects, font payload trimmed to Plus Jakarta Sans, global
  keyframes (ppFadeIn/ppSheetUp/ppScorePop) honoring reduced motion.
- M5: v1.3.0 bump everywhere (package.json+lock, ?v=, CACHE_VERSION, Home
  footer), CHANGELOG, AUDIT.md addendum. 92/92 tests, dist rebuilt.
- Verified in headless Chromium (390×844, 375×667, 844×390) for 2/3/4
  players, wolf, skins, no-stats: zero page scroll, zero clipping,
  interactions (stepper, keypad, next hole, games sheet, persistence) OK.

## Remaining
- Push + draft PR (next action). Then watch CI.
- Strategic (documented, out of scope): per-user auth & data partitioning.

## Next Action (exact)
`git add -A && git commit` then `git push -u origin
claude/golf-scorecard-audit-redesign-wl0b1p` and open a draft PR (base
main) via GitHub MCP using .github/PULL_REQUEST_TEMPLATE.md.
