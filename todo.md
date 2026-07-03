# TODO — App Store submission readiness (Fable Mode, v1.4.0)

Branch `claude/golf-scorecard-audit-redesign-wl0b1p` (restarted from main
@cf77d26; open draft PR #59 will carry this work — retitle at the end).

Reality (from AUDIT/APP_STORE_READINESS): PlayPal is a PWA; prior passes
already shipped privacy/terms/support pages, listing copy, privacy labels,
hardened Firebase rules, and a Capacitor how-to. The two automatable FAILs:
CDN-dependent shell (guideline 4.2 web-wrapper risk) and no native project.

- [x] M1 — Self-contained bundle (kills CDN dependence)
  - Vendor react/react-dom UMD (npm tarballs), firebase *-compat.js (from
    firebase@11.9.0 tarball), QR lib (qrcodejs2@0.0.2), Plus Jakarta Sans
    woff2 + local CSS (@fontsource/plus-jakarta-sans) into `vendor/`.
  - index.html: local <script>/<link> paths (drop SRI/preconnects for CDNs).
  - sw.js: precache vendor files; drop CDN cache-first branch.
  - Verify in Chromium: cold load fully offline-capable after install;
    app boots with zero external requests.
- [x] M2 — Native iOS project in-repo (Capacitor)
  - npm i @capacitor/core @capacitor/ios + -D @capacitor/cli.
  - scripts/build-www.mjs assembles www/ (html pages, dist, icons, vendor,
    manifest, logo — NO sw.js). Gitignore www/.
  - capacitor.config.json (appId com.playpal.golf, appName PlayPal,
    webDir www, backgroundColor #0E2B20).
  - npx cap add ios; npx cap sync ios; commit ios/.
  - iOS icons + splash via @capacitor/assets (from icon-512 + brand green).
  - App/PrivacyInfo.xcprivacy (UserDefaults CA92.1; no tracking, no
    collected data types beyond what labels declare).
  - Info.plist: display name PlayPal, UIStatusBarStyle, viewport safe.
- [x] M3 — Release/docs
  - v1.4.0 bump (package.json+lock, ?v=, CACHE_VERSION, Home footer),
    CHANGELOG.
  - Rewrite docs/IOS_APP_STORE_PATH.md for the new in-repo project (Mac
    steps shrink to: clone → npm install/build → pod install → sign →
    archive). Update APP_STORE_READINESS.md scorecard.
- [x] M4 — Verify + ship
  - npm test green; Chromium smoke (home/score offline).
  - Push; retitle/re-body PR #59; final report (readiness score 0-100,
    changes, beginner manual checklist).

## Constraints
- dist/ committed; `npm run build` before every commit.
- Web/PWA deployment must keep working identically (GH Pages workflow).
- No game logic changes.
