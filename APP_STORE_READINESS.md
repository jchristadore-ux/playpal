# App Store Readiness Report

**Verdict: ❌ NOT SUBMITTABLE TOMORROW — and no amount of code can change that.**
**The honest blocker list is short, but two items are outside this repository: Apple charges $99/year for the Developer Program, and building the iOS binary requires a Mac with Xcode.**

Everything software-side has been prepared. There is also a **free path that works today**: PlayPal is now an installable PWA — open it in Safari on iPhone → Share → **Add to Home Screen** and it behaves like an app (own icon, full screen, offline shell). For a personal-use app with a zero-budget requirement, that is the recommended ship vehicle. The App Store path is fully documented in `docs/IOS_APP_STORE_PATH.md` for when/if the $99 is worth it.

---

## Scorecard against App Review Guidelines

| Area | Guideline | Status | Notes |
|---|---|---|---|
| Privacy policy | 5.1.1 | ✅ PASS | `privacy.html`, linked in-app (Home footer) |
| Terms of service | 3.1 / 5 | ✅ PASS | `terms.html`, linked in-app |
| Support URL | App Store Connect | ✅ PASS | `support.html` with FAQ + contact |
| Data deletion | 5.1.1(v) | ✅ PASS | In-app profile deletion + documented full-deletion request path (no accounts exist, so "account deletion" = data deletion) |
| Sign-in requirements | 4.8 | ✅ PASS | No third-party login; anonymous auth only — Sign in with Apple not required |
| Tracking transparency (ATT) | 5.1.2 | ✅ PASS | No tracking, no ads, no third-party analytics → no ATT prompt needed; declare "no tracking" in labels |
| Permissions strings | 5.1.1 | ✅ PASS | App uses no camera/location/contacts → no `NSxxxUsageDescription` needed (scanner feature that wanted camera-adjacent use was removed) |
| Broken features | 2.1 | ✅ PASS | Scorecard scanner removed; crash boundary added |
| Performance | 2.1 / 4.2 | ✅ PASS | Production React, precompiled JS (no in-browser Babel), offline cache |
| Subscriptions / IAP | 3.1 | ✅ N/A | Free app, no purchases |
| Gambling | 5.3 | ⚠️ CAUTION | App computes friendly wagers but never holds money. Terms state this. In Review Notes, describe as "scorekeeping calculator"; set age rating questionnaire "Simulated Gambling: Infrequent/Mild" |
| Minimum functionality | 4.2 | ⚠️ RISK | Web-wrapper apps get extra scrutiny. Mitigate by bundling all assets in the Capacitor shell (offline-capable, no remote-URL shell). Residual risk is real and cannot be engineered to zero |
| Native binary exists | — | ❌ FAIL | No Xcode/Capacitor project yet — creation steps are copy-paste ready in `docs/IOS_APP_STORE_PATH.md`, but require a Mac |
| Apple Developer account | — | ❌ FAIL | $99/year. **Conflicts with the zero-paid-tools requirement** — your call |

**Score: 11 pass / 2 caution / 2 fail.** The two fails are money + hardware, not code.

---

## Remaining blockers (in order)

1. **Decide: PWA (free, ready now) vs App Store ($99/yr + Mac).**
2. If App Store: enroll at https://developer.apple.com/programs/ ($99).
3. On a Mac, run the Capacitor wrap in `docs/IOS_APP_STORE_PATH.md` (~30 min of copy-paste).
4. Deploy the Firebase security rules (5 min, see `firebase/README.md`) — do this **regardless of path**; it is the one remaining security hole and the command is ready.
5. Enable GitHub Pages (Settings → Pages → Source: GitHub Actions) so `https://<user>.github.io/playpal/` serves the PWA over HTTPS — required for the service worker and for the privacy/support URLs you'll paste into App Store Connect.

---

## Submission checklist (when you go the App Store route)

**App Store Connect fields — copy from `appstore/APP_STORE_LISTING.md`:**
- [ ] App name, subtitle, keywords, description, promotional text, release notes
- [ ] Support URL: `https://<your-pages-domain>/support.html`
- [ ] Privacy Policy URL: `https://<your-pages-domain>/privacy.html`
- [ ] Privacy nutrition labels: answers in `appstore/PRIVACY_NUTRITION_LABELS.md`
- [ ] Age rating questionnaire: all "No" except Simulated Gambling → "Infrequent/Mild" → rating lands at 12+/17+ depending on region; accept Apple's computed rating
- [ ] Category: Sports (primary), Utilities (secondary)
- [ ] Price: Free; availability: your countries

**Binaries & signing (Mac required):**
- [ ] Xcode installed; signed in with the developer Apple ID (Xcode → Settings → Accounts)
- [ ] Capacitor project created per `docs/IOS_APP_STORE_PATH.md`
- [ ] Bundle ID `com.playpal.golf` (or your reverse-domain choice) registered automatically by Xcode "Automatically manage signing" — no manual certificates/profiles needed with automatic signing
- [ ] App icon (1024×1024 source = `icons/icon-512.png` upscaled or regenerate via `npm run icons` from the 1254×1254 master)
- [ ] Archive → Distribute → App Store Connect → Upload

**Screenshots (taken in Simulator, free):**
- [ ] 6.9" iPhone (1320×2868): Home, Round setup, Live scoring, Results/payouts — 4 shots minimum
- [ ] 13" iPad (2064×2752) only if you enable iPad support; otherwise mark iPhone-only

**Review Notes to paste:**
> PlayPal is a golf scorekeeping calculator for a private group of friends. It tracks strokes and computes the arithmetic of traditional golf side games (Wolf, Nassau, Skins). The app never holds, transfers, or processes money and contains no purchases. Sync uses Firebase with anonymous authentication; no account is created and no data is sold or used for tracking.
