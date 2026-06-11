# Release Candidate Report — PlayPal v1.0.0

**Date:** June 11, 2026
**Candidate:** branch `claude/fervent-ramanujan-skxdut` (this change set)

## Readiness scores (1–10)

| Dimension | Score | Basis |
|---|---|---|
| Security | **7** | Hardened Firebase rules written and documented (**deploy is the one manual step left** — until then this is a 3); broken keyless API call removed; secret scanning in CI; SRI on CDN scripts. Trust model is intentionally group-shared. |
| Stability | **8** | Error boundary, guarded storage reads, engine regression suite in CI. Known open race: stale live-score listener (AUDIT H8). |
| Performance | **8** | Production React + precompiled JS (no in-browser Babel), whitespace-minified bundles, service-worker caching. Open: full-collection trip query (AUDIT H7), stringify-keyed memos. |
| UX | **8** | 12 concrete improvements shipped (see `UX_IMPROVEMENTS.md`); core flows were already strong. |
| Accessibility | **6** | Nav, zoom, focus, motion, contrast fixed; score-entry and form labeling still div-based (see `ACCESSIBILITY_REPORT.md`). |
| App Store compliance | **6 (software) / blocked (logistics)** | All policy/metadata/legal artifacts ready; no native binary exists and the $99 membership conflicts with the zero-cost constraint. Guideline 4.2 risk inherent to web wrappers. |
| Maintainability | **8** | Build system, tests, CI/CD, templates, Dependabot, docs — up from zero. Globals architecture remains the long-term debt. |

**Overall: ready to ship as a PWA today. Ready to *attempt* App Store review within one day of you supplying a Mac + $99 membership.**

## Remaining risks & unresolved items

1. **Firebase rules not yet deployed** — highest-impact 5-minute task on the list (`firebase/README.md`). Until done, the database remains open to anyone with the project ID.
2. **Apple Developer membership ($99/yr) + Mac required** for the App Store path — unresolvable in software.
3. **Guideline 4.2 rejection risk** for any web-wrapped app — mitigated (bundled assets, offline, app-like UI) but not eliminable.
4. Stale-listener race on rapid round exit/rejoin (AUDIT H8).
5. Trip dashboard full-collection read (AUDIT H7) — cost/latency at scale, not correctness.
6. UI components have no executed test coverage (TESTING_REPORT).
7. Accessibility gaps in score entry & forms (ACCESSIBILITY_REPORT 🔴 rows).
8. GitHub UI settings (Pages, branch protection, Dependabot alerts) need one 5-minute pass per `GITHUB_PRODUCTION_SETUP.md`.

## Final submission checklist

**Today (free, no Mac):**
1. Merge this branch to `main`.
2. GitHub → Settings → Pages → Source: **GitHub Actions** → wait for deploy → app is live at `https://jchristadore-ux.github.io/playpal/`.
3. Deploy Firebase rules: `cd firebase && npx firebase-tools login && npx firebase-tools use playpal-sync && npx firebase-tools deploy --only firestore:rules,database`.
4. On your iPhone: open the Pages URL in Safari → Share → **Add to Home Screen**. Done — installed app, offline-capable.

**App Store route (when you choose to spend the $99):**
5. Enroll: https://developer.apple.com/programs/
6. Follow `docs/IOS_APP_STORE_PATH.md` end-to-end on a Mac (Capacitor wrap → Xcode automatic signing → Archive → Upload). Certificates/profiles: none manual — Xcode's "Automatically manage signing" creates them.
7. App Store Connect: create the app, paste listing from `appstore/APP_STORE_LISTING.md`, privacy answers from `appstore/PRIVACY_NUTRITION_LABELS.md`, URLs `…/support.html` and `…/privacy.html`, screenshots from the Simulator (4× 6.9-inch), Review Notes from `APP_STORE_READINESS.md`.
8. Submit for review.

**Required configuration values (single source of truth):**
| Value | Setting |
|---|---|
| Bundle ID | `com.playpal.golf` |
| Version / build | `1.0.0` / `1` |
| Firebase project | `playpal-sync` (config already in `index.html`; web API keys are public by design) |
| Environment variables | **None** — the app needs no secrets at build or runtime (verified: the only secret-requiring feature was removed) |
| Build command | `npm ci && npm run build` |
| Deploy command (web) | automatic on push to `main`; manual: re-run the "Deploy to GitHub Pages" workflow |
| Test command | `npm test` |
