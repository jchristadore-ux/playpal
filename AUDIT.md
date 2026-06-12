# PlayPal — Full Repository Audit

**Date:** June 11, 2026 · **Auditor:** automated engineering audit (code, architecture, security, UX, accessibility, performance)
**Scope:** entire repository at commit `7754827` (pre-hardening). Items marked ✅ **FIXED** were resolved in the production-hardening pass that accompanies this audit; everything else lists the recommended path.

**Scoring keys:** Severity / User Impact / App Store Impact: 🔴 high · 🟠 medium · 🟡 low. Effort: S (<1 h) · M (1 day) · L (multi-day).

---

## Headline finding

**PlayPal is a web application, not an iOS app.** There is no Xcode project, no native code, and no build system — the repo was a single `index.html` that loaded React *development* builds and compiled JSX in the browser with Babel on every page load. Submitting to the Apple App Store requires wrapping it in a native shell (Capacitor) **plus** a paid Apple Developer membership ($99/yr) and a Mac with Xcode — see `APP_STORE_READINESS.md` and `docs/IOS_APP_STORE_PATH.md`. Everything that *can* be made production-grade without those paid/manual prerequisites has been done in this pass.

---

## Critical Issues

| # | Issue | Severity | User impact | App Store impact | Effort | Status |
|---|---|---|---|---|---|---|
| C1 | **Firebase database effectively open to the internet.** App uses anonymous auth but no security rules were versioned/deployed; default "test mode" rules allow anyone with the (public) project ID to read/overwrite all scores, profiles, GHIN numbers, emails, Venmo handles. | 🔴 | 🔴 | 🔴 (5.1.1 data security) | S | ✅ FIXED — hardened rules in `firebase/` (one `firebase deploy` command remains manual, see `firebase/README.md`) |
| C2 | **Broken "Scan Scorecard" feature shipped to users.** `Setup.jsx` called `api.anthropic.com/v1/messages` directly from the browser with **no API key** — the feature always failed; "fixing" it client-side would require publishing a secret key in the page source. | 🔴 | 🔴 | 🔴 (2.1 app completeness — broken features are a top rejection cause) | S | ✅ FIXED — feature removed; manual course entry retained |
| C3 | **No crash protection.** Any render error anywhere blanked the whole app with no recovery path. | 🔴 | 🔴 | 🔴 (2.1) | S | ✅ FIXED — `ErrorBoundary` with recovery screen in `components/App.jsx` |
| C4 | **React development builds + in-browser Babel in production.** ~1.5 MB of dev JS, plus ~7,000 lines of JSX re-transpiled on every launch — multi-second startup on phones, dev warnings in console. | 🔴 | 🟠 | 🟠 (4.2 minimum functionality/perf) | M | ✅ FIXED — esbuild precompile to `dist/`, React production builds with SRI hashes verified against npm tarballs |

## High Priority Issues

| # | Issue | Severity | User impact | App Store impact | Effort | Status |
|---|---|---|---|---|---|---|
| H1 | No privacy policy, terms of service, or support page — all required for App Store submission and good practice for any app storing names/handicaps/emails. | 🟠 | 🟡 | 🔴 (5.1.1, App Store Connect required URLs) | S | ✅ FIXED — `privacy.html`, `terms.html`, `support.html`, linked from Home footer |
| H2 | No tests, no CI, no build validation. The scoring engine (real money math for the group) had a built-in test harness (`runPlayPalTests`) that was never executed anywhere. | 🟠 | 🟠 | 🟡 | M | ✅ FIXED — `tests/` (node:test) runs the built-in suite + 18 new tests; GitHub Actions CI on every push/PR |
| H3 | No offline support / installability. A golf app is used where signal is worst; the app shell 404s offline. | 🟠 | 🔴 | 🟠 | M | ✅ FIXED — service worker (`sw.js`), `manifest.webmanifest`, iOS home-screen metadata, icons |
| H4 | `viewport` had `user-scalable=no, maximum-scale=1` — blocks pinch zoom (WCAG 1.4.4 failure; flagged in App Review a11y checks). | 🟠 | 🟠 | 🟠 | S | ✅ FIXED |
| H5 | Bottom tab bar and many tap targets were `<div onClick>` — invisible to VoiceOver and keyboards. | 🟠 | 🟠 | 🟠 (a11y) | M | ✅ PARTIALLY FIXED — tab bar is now real `<button>`s with `aria-label`/`aria-current`; remaining clickable divs inventoried in `ACCESSIBILITY_REPORT.md` |
| H6 | `join.html` reflected the unsanitized `code` query param into a redirect and logged it. | 🟠 | 🟡 | 🟡 | S | ✅ FIXED — code sanitized to `[A-Z0-9]{≤12}`, logging removed |
| H7 | `TripDashboard`/`GolfTripSyncService.fetchTripRounds` downloads **every round in the database** and filters client-side. Fine at friend-group scale; O(all rounds) cost as data grows. | 🟠 | 🟡 | — | M | ✅ FIXED (v1.1.1) — `where('round.tripId','==',tripId)` query (automatic single-field index; client-side `savedAt` sort keeps composite indexes unnecessary), legacy full scan kept as error fallback |
| H8 | Stale Firestore listener race: `ScoreEntry` live-score subscription doesn't verify the incoming snapshot belongs to the current round; a listener surviving a rapid exit/rejoin could apply another round's scores. | 🟠 | 🟠 | — | M | ✅ FIXED (v1.1.1) — live payload carries `roundId`, receiver drops mismatched payloads and late post-cleanup callbacks (v1.1.0 payloads without the tag still accepted) |

## Medium Priority Issues

| # | Issue | Sev | Effort | Status |
|---|---|---|---|---|
| M1 | `JSON.parse(localStorage…)` without try/catch in several init paths (`pp_players` was unguarded; corrupted storage = crash loop). | 🟠 | S | ✅ FIXED for `pp_players` in App.jsx; remaining reads are wrapped already |
| M2 | Hot-path `useMemo` keys built with `JSON.stringify(scores)` etc. in `ScoreEntry`/`LiveScorecard` — recomputed every render at 18 holes × 4 players scale. Works, but wasteful. | 🟡 | M | OPEN — acceptable at current scale |
| M3 | Venmo handles and player names interpolated into `venmo://` / `mailto:` URLs without encoding (`Summary.jsx`). Malformed handle breaks the link; no XSS (attribute context). | 🟡 | S | OPEN — `encodeURIComponent` at the build sites |
| M4 | `Modal`/form inputs lack `label htmlFor` associations; labels are visual only. | 🟡 | M | OPEN — inventoried in `ACCESSIBILITY_REPORT.md` |
| M5 | `mockup-homepage.html` — dead 690-line design mockup served alongside the app. | 🟡 | S | ✅ FIXED — deleted |
| M6 | Console noise: stray `console.log/info` in production paths. | 🟡 | S | ✅ MOSTLY FIXED — remaining `console.warn/error` are intentional failure diagnostics |
| M7 | `sync-config.js` is vestigial (the real config is inline in `index.html`); two sources of truth for the database URL. | 🟡 | S | OPEN — harmless; remove on next pass |
| M8 | The "edit mode" `postMessage` appearance panel (builder-tool integration) ships in production. Inert outside the builder iframe, but it is debug UI. | 🟡 | S | OPEN — kept deliberately; remove before a public launch |

## Low Priority Issues

- `playpal-logo.png` is actually JPEG data with a `.png` extension (browsers tolerate it; proper PNG icons are now generated into `icons/`).
- Emoji used as icons throughout (🐺 💰 ⛳). Charming and acceptable; now `aria-hidden` in the tab bar, with text labels carrying meaning.
- Fixed pixel font sizes everywhere — no Dynamic Type / rem scaling (see `ACCESSIBILITY_REPORT.md`).
- `NavBar` receives a `currentScreen` prop it never uses.
- Some low-contrast text (`rgba(246,244,238,0.45)` on dark green — raised to 0.65 in the tab bar; other instances listed in the a11y report).

## Technical Debt

1. **Globals-based architecture.** Components communicate via `window.*` and top-level bindings rather than modules. The new build pipeline works *with* this (transform-only, no identifier renaming), but a future move to ES modules + Vite would enable tree-shaking, real imports, and safer refactors. Effort: L.
2. **Single shared dataset.** All users share `players`, `courses`, `saved_rounds` — by design for one friend group, but it's the main blocker to ever opening the app up. Effort to add per-group namespaces: L.
3. **`ScoreEntry.jsx` (1,062 lines) and `Setup.jsx` (931 lines)** mix UI, state machines, and sync logic; hardest files to change safely. Effort: L.
4. **No state versioning/migration** for localStorage shapes — old snapshots could break future readers. Effort: M.

## App Store Rejection Risks (ranked)

1. **Guideline 4.2 — Minimum functionality.** A WKWebView wrapper around a website is the single most likely rejection. Mitigations: bundle assets locally in the Capacitor shell (not a remote URL), offline support (now done), native feel (standalone display, safe-area insets — done). Risk remains **moderate** even after mitigation.
2. **Guideline 2.1 — Completeness/bugs.** Was high (broken scanner, blank-screen crashes); now low after fixes.
3. **Guideline 5.1.1 — Privacy.** Was certain rejection (no privacy policy); now addressed — policy + account-data deletion path documented and linked in-app.
4. **Guideline 5.3 — Gambling.** The app computes wagers between friends but holds no money. The Terms now state this explicitly; describe it the same way in Review Notes. Risk: low-moderate; do **not** market it with gambling language ("betting app").
5. **Required metadata** — screenshots, age rating (17+ recommended due to simulated-gambling-adjacent content, or 4+ with "Infrequent/Mild Simulated Gambling" flag), support URL, privacy nutrition labels — prepared in `appstore/`.
