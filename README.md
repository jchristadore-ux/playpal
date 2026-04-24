# PlayPal — Golf Companion

A static React app (no build step) for tracking golf rounds, side-bets, and
payouts. Designed to be hosted on GitHub Pages.

## Running locally

No build step required. Just serve the folder with any static server, for
example:

```bash
npx serve .
# or
python3 -m http.server 8080
```

…then open `http://localhost:8080`.

## Project structure

| File                         | Purpose                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| `index.html`                 | App shell: loads React, mounts `<App/>`, handles screen routing         |
| `sync-config.js`             | User-editable cloud-sync configuration (see below)                      |
| `components/sync.js`         | Cross-device sync adapter (Firebase RTDB via REST, no SDK)              |
| `components/gameData.js`     | Courses, player defaults, format metadata, helpers                      |
| `components/gameUtils.js`    | Pure scoring / payout logic for Wolf, Nassau, PTM, Stableford, Skins    |
| `components/Shared.jsx`      | Reusable UI primitives (NavBar, Button, Avatar, Modal, Toast…)          |
| `components/Home.jsx`        | Landing screen, player profiles, Join-round modal                       |
| `components/Setup.jsx`       | 3-step new-round wizard (players → course → formats & stakes)           |
| `components/PlayerCard.jsx`  | Per-player score card                                                   |
| `components/Trackers.jsx`    | Live Wolf / Nassau / PTM / Round trackers rendered in ScoreEntry        |
| `components/ScoreEntry.jsx`  | Per-hole scoring UI + putt tracker + sync subscription                  |
| `components/Summary.jsx`     | End-of-round scorecard, payouts, Venmo / GHIN / email actions           |

All state persists to `localStorage` under `pp_*` keys.

---

## Cross-device sync

Out of the box, the app runs in **local-only mode**: sync codes only work on
the device that created the round (the "Join" button looks up the round in
`localStorage`). To let another phone or tablet join with the 6-character
code or QR, point the app at a Firebase Realtime Database. Setup takes
about 3 minutes and is free.

### 1. Create a Firebase project

1. Go to <https://console.firebase.google.com/> and click **Add project**.
2. Give it any name (e.g. `playpal-sync`). Disable Google Analytics — not
   needed.
3. In the left sidebar choose **Build → Realtime Database** → **Create
   Database**.
4. Pick a region, then choose **Start in test mode** when prompted.
   (Test mode allows read/write for 30 days — fine for personal use. See
   "Locking it down" below for a long-term rule.)
5. After the DB is created, copy its URL from the **Data** tab. It looks
   like `https://playpal-sync-default-rtdb.firebaseio.com`.

### 2. Paste it into `sync-config.js`

Open `sync-config.js` in the repo root and change the object to:

```js
window.PLAYPAL_SYNC = {
  provider:    'firebase',
  databaseURL: 'https://YOUR-PROJECT-default-rtdb.firebaseio.com',
  authToken:   null,
};
```

Commit and push — GitHub Pages will pick it up on its next deploy.

### 3. That's it

- **Host device** creates a round → app publishes `rounds/<SYNCCODE>/round`
  and `rounds/<SYNCCODE>/state` to your database.
- **Guest device** opens the app, taps **JOIN**, enters the 6-character
  code (or scans the QR), and the round is pulled from Firebase.
- Both devices poll every 4 seconds and merge remote updates, so edits
  propagate in near real time.

No sign-in, no accounts — the sync code **is** the access key. Anyone who
knows the code can read and write that round.

### Firebase paths used

| Path                              | Purpose                                            |
| --------------------------------- | -------------------------------------------------- |
| `rounds/<SYNCCODE>/round`         | Round config (players, course, formats, stakes)    |
| `rounds/<SYNCCODE>/state`         | Live scoring state (scores, putts, wolf, presses…) |
| `rounds/<SYNCCODE>/updatedAt`     | Last write timestamp — used for change detection   |
| `courses/<courseId>`              | User-imported courses, persisted forever, shared   |

When you click **+ ADD / IMPORT** on the course-selection step, the new
course is written to `courses/<id>` so every device sees it on next load.

### Fixing rules (required after 30 days)

Firebase test-mode rules **expire after 30 days**. After expiry every read/write
returns `HTTP 401 Permission denied` and no round can be started. The fix takes
30 seconds:

1. Open [Firebase Console](https://console.firebase.google.com/) → your project
   → **Realtime Database** → **Rules** tab.
2. Replace the entire contents with the rules below and click **Publish**.

```json
{
  "rules": {
    "rounds": {
      "$code": {
        ".read":  "$code.length >= 4 && $code.length <= 12",
        ".write": "$code.length >= 4 && $code.length <= 12"
      }
    },
    "courses": {
      ".read":  true,
      ".write": true
    },
    "players": {
      ".read":  true,
      ".write": true
    }
  }
}
```

`rounds` access is gated on a valid-length sync code. `courses` and
`players` are open so all devices share the same roster and custom courses.

If you want to require a shared secret instead, set a token in
`sync-config.js`:

```js
authToken: 'your-long-random-token',
```

…and tighten the rules to check `auth.token` or `query.auth`.

---

---

## Venmo integration

Venmo requests are sent via **deep link + web fallback** — no API key or
backend required.

When a player clicks **💸 REQUEST** on the payouts screen:

1. The app opens `venmo://paycharge?txn=pay&recipients=<handle>&amount=<amt>&note=<note>`.
   If the Venmo app is installed, it opens directly to the pre-filled request.
2. After 1.2 s, the app also opens `https://venmo.com/<handle>?txn=pay&…`
   as a browser fallback for devices without the app.

**What you need in each player profile:**

- Fill in the **Venmo Handle** field (without the `@`). Example: `johndoe`

**Limitations:**

- Venmo's deep-link scheme is not an official public API; it may break if
  Venmo changes their URI scheme.
- Only works for payments. Charge requests (where you are asking *others*
  to pay *you*) depend on whether the recipient has their Venmo privacy
  set to accept requests from non-friends.
- No receipt confirmation is returned to the app — once the user taps
  "Request" in Venmo, the PlayPal button shows "✓ SENT" as a reminder.

---

## Email scorecards

### Current behaviour (client-side `mailto:`)

The **✉️ EMAIL SCORECARD** button opens the device's default email client
(Mail, Gmail, Outlook…) pre-filled with:

- **To:** all player email addresses from their profiles
- **Subject:** `PlayPal Scorecard: <course name>`
- **Body:** plain-text scorecard with strokes, totals, and settlement

The user then taps **Send** in their email app. No backend is required.

**What you need in each player profile:**

- Fill in the **Email Address** field.

### Upgrading to automatic server-side email

If you want the app to email scorecards without opening the email client,
you need a backend send step. The simplest approach is a **Firebase Cloud
Function** + **SendGrid** (both free-tier available):

#### 1. Install Firebase CLI and create a function

```bash
npm install -g firebase-tools
firebase init functions    # choose JavaScript, install dependencies
```

#### 2. Add SendGrid

```bash
cd functions
npm install @sendgrid/mail
```

Set your API key as a Firebase secret:

```bash
firebase functions:secrets:set SENDGRID_API_KEY
```

#### 3. Create `functions/index.js`

```js
const functions = require('firebase-functions');
const sgMail    = require('@sendgrid/mail');

exports.emailScorecard = functions.https.onCall(async (data) => {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  const { to, subject, body } = data;
  await sgMail.send({ to, from: 'noreply@yourdomain.com', subject, text: body });
  return { ok: true };
});
```

```bash
firebase deploy --only functions
```

#### 4. Call it from `Summary.jsx`

Replace the `window.open('mailto:…')` call with:

```js
// Requires Firebase JS SDK loaded in index.html
const fn = firebase.functions().httpsCallable('emailScorecard');
await fn({ to: emails, subject, body: lines.join('\n') });
```

---

## PDF scorecard

Click **📄 PDF** in the post-round summary to download a landscape PDF
scorecard (powered by [jsPDF](https://github.com/parallax/jsPDF) + AutoTable,
loaded from unpkg CDN). The PDF includes strokes per hole, Wolf standings,
PTM movement, and net settlement.

---

## Troubleshooting

- **Home page is blank** — make sure the CDN scripts (React, Babel) loaded.
  Open DevTools → Console; any red error usually identifies the file.
- **JOIN says "not found"** but the code is correct — the round hasn't been
  published yet. Either the host device is offline, or `sync-config.js`
  points to the wrong Firebase URL (must be `https://<project>-default-rtdb.firebaseio.com`,
  **not** the Firebase Console URL).
- **"Firebase permission denied (HTTP 401)"** — the most common cause is
  expired test-mode rules (they last only 30 days). Go to Firebase Console →
  Realtime Database → Rules and paste the permanent rules from the
  **Fixing rules** section above, then click Publish. You do not need to
  change any code.
- **"Cannot start round — failed to publish to Firebase"** — the app now
  enforces cloud-first round creation. Verify `databaseURL` in
  `sync-config.js`, check your internet connection, and confirm the
  Firebase Realtime Database rules allow writes (see **Fixing rules** above).
- **Scores on Phone B not updating** — check the browser console for
  `[PlayPalSync] Enabled via firebase`. If you see `Local-only mode`, the
  config didn't load.
- **CORS errors** — the default RTDB URL already allows all origins. If you
  're self-hosting on a custom domain, verify `databaseURL` is the exact
  `*.firebaseio.com` URL (not `firebasedatabase.app`).
