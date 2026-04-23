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

### Locking it down (optional)

The default "test mode" rules expire after 30 days. A permanent
minimal-risk rule set that still requires no auth is:

```json
{
  "rules": {
    "rounds": {
      "$code": {
        ".read":  "$code.length >= 4 && $code.length <= 12",
        ".write": "$code.length >= 4 && $code.length <= 12"
      }
    }
  }
}
```

This restricts access to well-formed sync codes. Paste it into
**Realtime Database → Rules → Publish**.

If you want to require a shared secret instead, set a token in
`sync-config.js`:

```js
authToken: 'your-long-random-token',
```

…and tighten the rules to check `auth.token` or `query.auth`.

---

## Troubleshooting

- **Home page is blank** — make sure the CDN scripts (React, Babel) loaded.
  Open DevTools → Console; any red error usually identifies the file.
- **JOIN says "not found"** but the code is correct — the round hasn't been
  published yet. Either the host device is offline, or `sync-config.js`
  still says `provider: 'none'` on one of the devices.
- **Scores on Phone B not updating** — check the browser console for
  `[PlayPalSync] Enabled via firebase`. If you see `Local-only mode`, the
  config didn't load.
- **CORS errors** — the default RTDB URL already allows all origins. If you
  're self-hosting on a custom domain, verify `databaseURL` is the exact
  `*.firebaseio.com` URL (not `firebasedatabase.app`).
