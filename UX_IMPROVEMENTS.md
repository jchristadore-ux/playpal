# UX Improvements — before / after

Apple-quality pass over navigation, states, and interaction details. Each item
lists what shipped in this change set and the files touched.

| # | Area | Before | After | Files |
|---|---|---|---|---|
| 1 | **Startup speed** | React dev builds + Babel transpiling ~7,000 lines of JSX in the browser on *every* launch; multi-second white screen on phones | Precompiled, whitespace-minified JS + React production builds; JS payload cut roughly in half and zero transpile time | `index.html`, `scripts/build.mjs`, `dist/*` |
| 2 | **Crash state** | Any component error → permanent blank white screen, no way out | Branded "Something went wrong" recovery screen with a reload button; round data preserved | `components/App.jsx` (ErrorBoundary) |
| 3 | **Offline** | Opening without signal → browser error page | App shell, scripts, fonts and CDN libs cached by a service worker; app opens and scores locally, syncs when back online | `sw.js`, `index.html` |
| 4 | **Install experience** | Browser tab only; no icon, Safari chrome always visible | Installable PWA: home-screen icon set, standalone full-screen display, dark-green status bar, splash colors | `manifest.webmanifest`, `icons/*`, `index.html` meta |
| 5 | **Broken feature** | "📸 SCAN SCORECARD" button that always failed (API call had no credentials) — a dead end on the most important setup flow | Feature removed; course step now reads "Search the course list or enter one manually" with a single clear manual-entry action | `components/Setup.jsx` |
| 6 | **Bottom navigation** | `<div onClick>` tabs — no keyboard access, no screen-reader semantics, 0.45-alpha labels (low contrast) | Real `<button>` elements, `aria-label` + `aria-current="page"`, inactive contrast raised to 0.65, 48px min touch height | `components/App.jsx` |
| 7 | **Zoom** | Pinch-zoom disabled (`user-scalable=no`) | Zoom enabled; `viewport-fit=cover` for proper safe-area rendering on notched iPhones | `index.html` |
| 8 | **Focus visibility** | No focus indicator anywhere | Gold `:focus-visible` outline app-wide (keyboard users can see where they are; invisible to touch users) | `index.html` CSS |
| 9 | **Reduced motion** | Spinners/transitions always animate | `prefers-reduced-motion` collapses all animations/transitions | `index.html` CSS |
| 10 | **Trust & help** | No way to get help or read policies from inside the app | Home footer: Support · Privacy Policy · Terms of Use + version number | `components/Home.jsx`, `support.html`, `privacy.html`, `terms.html` |
| 11 | **Join flow safety** | Malformed/garbage join codes passed through to redirect and logged to console | Codes sanitized to A–Z/0–9 (≤12 chars); silent, clean redirect; join page restyled to brand colors (was a leftover navy palette from an old design) | `join.html` |
| 12 | **Empty state (courses)** | "No courses match" offered a scan action that didn't work | Single working action: "enter it manually →", keyboard-accessible | `components/Setup.jsx` |

## Deliberately unchanged
- Visual design language (cream/green/gold, Plus Jakarta Sans) — already strong and consistent; no redesign churn.
- Emoji as format icons — characterful, paired with text labels; marked decorative for screen readers where adjacent text exists.
- The in-round scoring layout — the core interaction is good; remaining polish items are in `ACCESSIBILITY_REPORT.md`.
