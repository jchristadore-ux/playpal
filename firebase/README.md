# Firebase security setup (one-time, ~5 minutes)

PlayPal syncs through the free **Spark** tier of Firebase (project `playpal-sync`).
Until these rules are deployed, the database is likely running on expired or open
"test mode" rules — anyone on the internet who finds the project ID (it is public
in the app source, which is normal for Firebase) can read or overwrite your data.

**Deploying these rules closes that hole.** After deployment, only clients signed
in through the app's anonymous auth can touch the data, and only the exact paths
the app uses.

## Steps (copy/paste)

1. Make sure Anonymous sign-in is enabled (it already is if sync works today):
   Firebase Console → playpal-sync → **Authentication → Sign-in method → Anonymous → Enable**.

2. From the repository root, run:

   ```bash
   cd firebase
   npx firebase-tools login
   npx firebase-tools use playpal-sync
   npx firebase-tools deploy --only firestore:rules,database
   ```

3. Verify in the Console that **Firestore → Rules** and
   **Realtime Database → Rules** show the contents of `firestore.rules` and
   `database.rules.json`.

## What the rules allow

| Path | Who | Notes |
|---|---|---|
| Firestore `playpal_rounds/{CODE}` | any signed-in app client | code must be 4–12 chars A–Z/0–9 |
| Firestore `golf_trips/{trip_*}` | any signed-in app client | |
| RTDB `players`, `courses`, `saved_rounds` | any signed-in app client | |
| Anything else | **nobody** | |

## Honest limitation

PlayPal is a shared-scoreboard app for one friend group: every player in the
group reads and writes the same data, and there are no per-user accounts. These
rules therefore stop *outsiders* (no auth token), but anyone who runs the app
is inside the trust boundary. That matches how the app is designed to be used.
If you ever open the app to strangers, per-user auth and ownership rules would
be the next step.
