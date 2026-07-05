# Project Progress

All tasks COMPLETE and MERGED. v1.3.0 (one-screen score entry) merged as
PR #58; v1.4.0 (App Store readiness: vendored self-contained bundle +
committed iOS Capacitor project) merged as PR #59 on 2026-07-03.
Do NOT redo or re-push this work.

## Shipped in v1.4.0 (this pass)
- vendor/: React 18.3.1 + Firebase 11.9.0 compat + QR lib + Plus Jakarta
  Sans (latin/latin-ext woff2 + fonts.css) — app makes ZERO CDN requests
  (verified in Chromium with all external routes blocked; only
  identitytoolkit.googleapis.com — Firebase Auth data API — is attempted).
- index.html loads vendor/ files; sw.js v1.4.0 precaches them, CDN branch
  removed.
- ios/: Capacitor 8 Xcode project (SPM), appId com.playpal.golf,
  MARKETING_VERSION 1.4.0, brand icon (full-bleed logo 1024) + splash
  (2732 brand green) in Assets.xcassets, PrivacyInfo.xcprivacy created AND
  registered in project.pbxproj (BuildFile/FileRef/group/Resources),
  Info.plist: ITSAppUsesNonExemptEncryption=false, light status bar.
- scripts/build-www.mjs + npm run build:www / ios:sync; www/ gitignored;
  assets-native/ = icon/splash sources (committed).
- Docs: IOS_APP_STORE_PATH.md rewritten (beginner click-by-click; Mac
  steps now ~30 min since project is in-repo); APP_STORE_READINESS.md
  re-scored; CHANGELOG [1.4.0].
- @capacitor/assets tool fails in this sandbox (can't fetch its own sharp
  binary) — catalog images were written directly with local sharp instead.

## Remaining (cannot be done from this repo — user actions)
- $99/yr Apple Developer enrollment; Mac with Xcode to sign/archive/upload;
  App Store Connect listing (all copy pre-written in appstore/).
- firebase deploy of hardened rules (firebase/README.md).
- Strategic: per-user auth & data partitioning (see AUDIT.md).

## Hotfix (branch claude/app-loading-issue-o6rib2)
- Bug: deployed GitHub Pages app rendered blank ("app isn't loading").
  Root cause: .github/workflows/deploy-pages.yml "Assemble site" step
  predates the v1.4.0 vendoring and never copied vendor/ into _site, so
  all 9 vendored deps (react, react-dom, firebase*, qrcode, fonts.css)
  404'd on Pages -> "React is not defined" -> blank #root. (Local dev via
  `npm run dev` was unaffected since it serves the repo root incl. vendor/.)
- Fix: add `vendor` to the cp list in the Assemble site step (one word).
  Verified by assembling _site exactly as the workflow does: without
  vendor -> blank + 9x 404; with vendor -> React loads, #root renders,
  zero 404s (headless Chromium).

## Next Action (exact)
None — hotfix pushed. Any further follow-up work starts a fresh branch
from latest main. The remaining items are user actions listed above.
