# Accessibility Report

Status after this hardening pass, measured against WCAG 2.1 AA and Apple's
accessibility expectations (VoiceOver, Dynamic Type, contrast, motion).

## Fixed in this pass ✅

| Requirement | What changed |
|---|---|
| Pinch zoom (WCAG 1.4.4) | Removed `user-scalable=no` / `maximum-scale=1` from the viewport |
| Keyboard / switch access to primary nav | Bottom tab bar converted from `div onClick` to `<button>` with `aria-label` and `aria-current="page"`; emoji icons `aria-hidden` |
| Visible focus (2.4.7) | Global gold `:focus-visible` outline |
| Reduced motion (2.3.3) | `prefers-reduced-motion: reduce` disables all animations/transitions |
| Crash announcement | Error screen uses `role="alert"` |
| Tab-bar contrast | Inactive label alpha 0.45 → 0.65 on #0E2B20 (≈4.6:1) |
| Appearance panel switch | "Show Sync Code" toggle now `role="switch"` + `aria-checked` + keyboard handling |
| Touch targets | Tab buttons enforce 48px min height |
| Language & semantics | `lang="en"` present; main nav now a `<nav>` landmark |

## Fixed in v1.1.1 ✅

| Requirement | What changed |
|---|---|
| Programmatic form labels (1.3.1 / 4.1.2) | `Label` renders a real `<label htmlFor>` when given a target; wired across the player-profile form, join-code field (`Home.jsx`) and course builder (`Setup.jsx`). Inputs whose visible label is a placeholder or table header (tee sets, hole grid, trip forms, search, compare selects, handicap overrides) carry `aria-label` |
| Dialog semantics + Esc | `Modal` and `QRModal`: `role="dialog"`, `aria-modal="true"`, accessible name from the title, Escape closes; ✕ buttons have `aria-label="Close"` |
| Player-form toggles | Righty/lefty and color-swatch pickers converted from `div onClick` to `<button>` with `aria-pressed` (swatches also get `aria-label`) |

## Remaining gaps (inventory, ranked)

| Priority | Gap | Where | Suggested fix |
|---|---|---|---|
| 🔴 | Clickable `div`s without button semantics in content screens: player cards (`Home.jsx`), recent-round cards, score cells (`ScoreEntry.jsx`), collapsible trackers (`Trackers.jsx`), course rows (`Setup.jsx`) | throughout | Convert to `<button>` or add `role="button"` + `tabIndex={0}` + Enter/Space handlers; pattern established in the tab bar and player form |
| 🟠 | No Dynamic Type: every font size is a fixed px inline style | all components | Move type scale to rem-based CSS variables; respect iOS text-size in the Capacitor shell via `-apple-system-body` |
| 🟠 | Color-contrast spot failures: gold `#C8A15A` small text on cream `#F6F4EE` (~2.4:1), `rgba(246,244,238,0.6)` labels in NavBar | Shared.jsx, headers, section labels | Darken gold to ≥`#9d7c39` for small text or reserve gold for large/bold text only |
| 🟠 | Color used as the only signal for player identity (avatar colors) and some score states | PlayerCard, scorecards | Initials already supplement avatars (good); add shape/text cues for score states |
| 🟡 | Modals don't trap focus or restore it on close | Shared.jsx `Modal` | Dialog semantics + Esc landed in v1.1.1; add a focus trap and focus restore |
| 🟡 | Live score updates not announced | ScoreEntry | `aria-live="polite"` region for sync updates |

## VoiceOver expectations today
Navigation, primary buttons (real `<button>`s exist for CTAs), the join flow,
and the new footer/legal pages are usable. Score *entry* and tracker
expand/collapse are the weakest flows for VoiceOver users (div-based) — they
read as plain text. Fixing the 🔴 rows above closes that.

## How this was assessed
Static review of every component plus the rendered HTML shell. No automated
axe/Lighthouse run was possible in this environment — run
`npx -y @axe-core/cli http://localhost:8080` after `npm run dev` to get a
machine audit, and test once with VoiceOver (Settings → Accessibility →
VoiceOver) on a real device before any App Store submission.
