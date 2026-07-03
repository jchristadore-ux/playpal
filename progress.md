# Project Progress

Task COMPLETE and SHIPPED. PR #58 (v1.3.0 one-screen adaptive score entry,
offline resilience, polish) was merged into main by jchristadore-ux on
2026-07-03 (merge of branch `claude/golf-scorecard-audit-redesign-wl0b1p`
@1cff59f). CI green, 92/92 tests.

Do NOT redo or re-push this work. If follow-up work is requested, restart
the branch from latest main first.

## What shipped (see CHANGELOG [1.3.0] + AUDIT.md addendum for detail)
- One-screen adaptive Score Entry (ResizeObserver grid, wrap-aware scale,
  1-col ≤3P / 2×2 ≥4P / N-col landscape, action bar, trackers bottom sheet).
- Offline banner + reconnect live-score re-push, haptics, animations,
  safe-area fixes, a11y labels/keyboard operability, preconnects, single
  font family. Version/cache bumps to 1.3.0 everywhere.

## Remaining recommendations (future work, not started)
- Per-user auth & data partitioning (Firebase email/Apple/Google auth,
  per-uid subtrees for players/saved_rounds, owner-write rules). Multi-day.
- Consistent SVG icon set to replace emoji icons.
- Consider self-hosting CDN dependencies (React/Firebase/QR/fonts).
- Manual step still pending from prior audit: `firebase deploy` of rules.
