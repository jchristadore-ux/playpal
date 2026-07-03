# Shipping PlayPal to the Apple App Store

**The native iOS project now lives in this repository (`ios/`).** It was
generated with Capacitor 8 (Swift Package Manager — no CocoaPods), the web
bundle is fully self-contained (all JS/fonts vendored in `vendor/`, no CDN
requests), the app icon and launch screen are installed, the privacy manifest
(`ios/App/App/PrivacyInfo.xcprivacy`) is registered, version is set to 1.4.0,
and `ITSAppUsesNonExemptEncryption=false` is declared so you won't be asked
export-compliance questions on every build.

**What still requires you (cannot be automated from this repo):**

| Requirement | Why | Cost |
|---|---|---|
| A Mac with Xcode 15+ | Apple only allows iOS binaries to be built and signed with Xcode on macOS | free (the Mac isn't) |
| Apple Developer Program | Distribution through the App Store requires a paid membership | $99/year |

Time estimate on the Mac: **~30 minutes** to a build in App Store Connect,
plus the listing forms (~30 minutes, all copy is pre-written).

---

## Step 1 — Enroll in the Apple Developer Program

*Why: only enrolled accounts can sign and submit apps.*

1. Go to https://developer.apple.com/programs/enroll/
2. Sign in with your Apple ID (create one at appleid.apple.com if needed —
   use an email you'll keep; it becomes your developer identity).
3. Choose **Individual** (unless you have an LLC you want on the store
   listing — then Organization, which needs a D-U-N-S number and takes days).
4. Pay the $99. Approval is usually same-day for individuals.

## Step 2 — Build the project on a Mac

*Why: produces the signed binary Apple accepts.*

```bash
# One-time: install Xcode from the Mac App Store (free, large), open it once
# to accept the license, then:
xcode-select --install

git clone https://github.com/jchristadore-ux/playpal.git
cd playpal
npm install
npm run ios:sync        # builds dist/, assembles www/, syncs into ios/
npx cap open ios        # opens the project in Xcode
```

In Xcode (one-time setup):

1. In the left sidebar click the blue **App** project icon → select the
   **App** target → **Signing & Capabilities** tab.
2. Check **Automatically manage signing** and pick your **Team** (your name —
   appears after Step 1). Xcode silently creates the signing certificate and
   provisioning profile — you never touch certificates manually.
3. If Xcode complains the bundle ID `com.playpal.golf` is taken, change it in
   **General → Identity** to something you own (e.g.
   `com.<yourname>.playpal`) — remember it for Step 4.
4. Press **⌘R** with an iPhone simulator selected. The app should boot to the
   PlayPal home screen. Click through: new round → score holes → results.
   This is also where you take screenshots (**⌘S** in the simulator saves
   App Store-sized PNGs). Take 5–6: home, setup, score entry (the money
   shot), live scorecard, results, trips.

## Step 3 — Archive and upload

*Why: App Store builds are uploaded from Xcode's Organizer.*

1. In the device dropdown (top center), choose **Any iOS Device (arm64)**.
2. Menu **Product → Archive** (a few minutes).
3. The **Organizer** window opens → select the archive → **Distribute App**
   → **App Store Connect** → **Upload** → accept all defaults → Upload.
4. Wait ~15 minutes for Apple's automated processing (you'll get an email).

## Step 4 — Create the App Store listing

*Why: the store page and privacy declarations live in App Store Connect.*

1. Go to https://appstoreconnect.apple.com → **My Apps** → **+** →
   **New App**.
2. Fill the form:
   - Platform: **iOS**
   - Name: **PlayPal: Golf Side Games** (from `appstore/APP_STORE_LISTING.md`)
   - Primary language: English (U.S.)
   - Bundle ID: pick **com.playpal.golf** (or what you set in Step 2.3)
   - SKU: `playpal-001` (internal only, anything unique)
3. In the app record, paste from `appstore/APP_STORE_LISTING.md`:
   subtitle, promotional text, keywords, description, support URL,
   marketing URL, and the privacy policy URL (your deployed
   `privacy.html`, e.g. `https://<user>.github.io/playpal/privacy.html` —
   enable GitHub Pages first: repo Settings → Pages → Source: GitHub
   Actions).
4. **App Privacy** section → answer using
   `appstore/PRIVACY_NUTRITION_LABELS.md` (short version: Data collected —
   Name and Other User Content, for App Functionality, not linked to
   identity, no tracking).
5. **Age rating** questionnaire: everything "None" except
   **Simulated Gambling → Infrequent/Mild** (the app computes friendly
   wagers; it never holds money).
6. Upload your screenshots (6.7″ iPhone set is required; the simulator
   shots from Step 2.4 are already the right size).
7. **Build** section → select the build you uploaded in Step 3.
8. **App Review Information** → paste the Review Notes from
   `APP_STORE_READINESS.md` (describes the app as a scorekeeping
   calculator; no login needed — no demo account required).
9. Press **Add for Review → Submit**.

## Step 5 — While you wait (typically 1–3 days)

- Optional: **TestFlight** tab → add yourself as an internal tester to try
  the store-signed build on your real phone before/while review runs.
- If rejected under Guideline 4.2 (see risk below), reply in Resolution
  Center emphasizing depth: eight scoring engines, live multi-device sync,
  offline operation, trip analytics — not a repackaged website.

## Updating the app later

```bash
npm run ios:sync && npx cap open ios
# In Xcode: General → bump Build (e.g. 1 → 2); bump Version for feature
# releases. Product → Archive → Distribute → Upload, then select the new
# build in App Store Connect and submit.
```

## Known risk

Apple applies extra scrutiny to web-wrapped apps (Guideline 4.2 "minimum
functionality"). The standard mitigations are all in place — fully bundled
assets (no remote shell), offline operation, app-like one-screen UI, haptics,
safe-area-native layout — but a 4.2 rejection can never be engineered to
zero. The fallback that needs no one's permission is the PWA: Safari →
Share → **Add to Home Screen**.
