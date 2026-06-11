# PlayPal ⛳

Golf scoring & side-game companion for your foursome. Live shared scorecards,
eight game formats (Wolf, Nassau, Skins, Stableford, Pass the Money, Bingo
Bango Bongo, Tee Ball, Markey Match), automatic payout math, and golf-trip
leaderboards — synced across every phone in the group.

**No ads · no tracking · no accounts · free infrastructure (Firebase Spark + GitHub Pages).**

## Using it

- **Web/PWA (recommended):** open the deployed site, then on iPhone use
  Safari → Share → **Add to Home Screen**. Works offline on the course.
- **App Store:** see `docs/IOS_APP_STORE_PATH.md` (requires a Mac + Apple
  Developer membership).

## Development

```bash
npm install
npm run build    # compiles components/*.jsx → dist/ (the browser loads dist/)
npm test         # build + unit/integration tests
npm run dev      # build + local server at http://localhost:8080
```

**Important:** the browser loads the compiled files in `dist/`, which are
committed. If you edit anything in `components/`, run `npm run build` and
commit the updated `dist/` (CI fails otherwise).

## Repository map

| Path | What |
|---|---|
| `index.html` | App shell: Firebase config, sync services, script loading |
| `components/` | Source of truth — React components (JSX) + game engines |
| `dist/` | Compiled output served to browsers (committed) |
| `tests/` | node:test suite for the scoring engines |
| `firebase/` | Security rules + deploy instructions (**deploy these!**) |
| `appstore/` | App Store listing copy & privacy-label answers |
| `privacy.html` / `terms.html` / `support.html` | Legal & support pages |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA/offline/install support |
| `.github/` | CI, Pages deploy, releases, Dependabot, templates |

## Key documents

- `AUDIT.md` — full production audit & what was fixed
- `APP_STORE_READINESS.md` — submission status, blockers, checklist
- `RELEASE_CANDIDATE_REPORT.md` — readiness scores & final ship steps
- `TESTING_REPORT.md`, `ACCESSIBILITY_REPORT.md`, `UX_IMPROVEMENTS.md`
- `FREE_STACK_MIGRATION.md` — cost audit (everything is $0 except Apple's $99/yr)
- `GITHUB_PRODUCTION_SETUP.md` — repo settings to flip once

## Releases

Tag `main` with `vX.Y.Z` and push the tag — CI publishes a GitHub Release
with generated notes and a deployable site tarball. Pushes to `main`
auto-deploy to GitHub Pages.
