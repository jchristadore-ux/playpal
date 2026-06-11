# Shipping PlayPal to the Apple App Store (Capacitor wrap)

This is the exact, copy-paste path from this repository to an `.ipa` in App
Store review. **Prerequisites that cannot be avoided:** a Mac with Xcode 15+,
and an Apple Developer Program membership (**$99/year** — there is no free way
to distribute through the App Store; the free alternative is the PWA install,
which already works).

Time estimate: ~45 minutes the first time.

## 1. One-time setup (Mac)

```bash
# Xcode from the Mac App Store (free), then:
xcode-select --install

git clone https://github.com/jchristadore-ux/playpal.git
cd playpal
npm install
npm run build
```

## 2. Add Capacitor (the native shell)

```bash
npm install @capacitor/core @capacitor/ios
npm install --save-dev @capacitor/cli
npx cap init "PlayPal" "com.playpal.golf" --web-dir=www
```

Assemble the bundled web app (everything ships **inside** the binary — no
remote-URL shell; this matters for Guideline 4.2):

```bash
mkdir -p www
cp -r index.html join.html privacy.html terms.html support.html \
      manifest.webmanifest playpal-logo.png dist icons www/
# Don't copy sw.js into the native bundle — Capacitor serves locally; the
# service worker is for the web/PWA deployment.
npx cap add ios
npx cap sync ios
```

## 3. Open and configure in Xcode

```bash
npx cap open ios
```

In Xcode:
1. Select the **App** target → **Signing & Capabilities** → check
   **Automatically manage signing** → pick your team (your Apple ID after
   enrolling). Xcode creates the certificate and provisioning profile for you —
   no manual certificate work needed.
2. **General** → set Version `1.0.0`, Build `1`.
3. App icon: in `Assets.xcassets` → AppIcon, drop in a 1024×1024 PNG
   (generate one: `npx sharp-cli resize 1024 1024 -i playpal-logo.png -o appicon-1024.png`,
   or re-run `npm run icons` after editing `scripts/make-icons.mjs` to add a 1024 size).
4. Run on the iPhone Simulator (⌘R) and click through: home → new round →
   score a few holes → results. Take your App Store screenshots here
   (⌘S saves a correctly-sized screenshot).

## 4. Upload

1. Product → **Archive** (choose "Any iOS Device (arm64)" as destination first).
2. In the Organizer window: **Distribute App → App Store Connect → Upload**.
3. At https://appstoreconnect.apple.com create the app record
   (name PlayPal, bundle ID `com.playpal.golf`, SKU `playpal-001`), fill the
   listing from `appstore/APP_STORE_LISTING.md` and the privacy labels from
   `appstore/PRIVACY_NUTRITION_LABELS.md`, attach the build, add screenshots,
   paste the Review Notes from `APP_STORE_READINESS.md`, and **Submit for Review**.

## 5. Updating the app later

```bash
npm run build && rm -rf www/dist && cp -r dist www/ && cp index.html www/
npx cap sync ios && npx cap open ios   # bump build number, Archive, Upload
```

## Known risk

Apple applies extra scrutiny to web-wrapped apps (Guideline 4.2 "minimum
functionality"). Bundled assets + offline operation + app-like UI (all in
place) are the standard mitigations, but a 4.2 rejection is still possible.
If it happens, the appeal angle is the app's depth (eight scoring engines,
live multi-device sync, trip analytics) — and the fallback is the PWA, which
needs no one's permission.
