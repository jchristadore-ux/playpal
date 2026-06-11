# App Privacy ("nutrition label") answers for App Store Connect

App Store Connect → App Privacy → Get Started. Answer exactly as below.

## "Do you or your third-party partners collect data from this app?"
**Yes** (data is stored in Firebase to enable sync).

## Data types collected

| App Store Connect category | Collected? | Linked to identity? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Contact Info → Name | **Yes** | No (no account; anonymous auth) | No | App Functionality |
| Contact Info → Email Address | **Yes** (optional field on player profiles) | No | No | App Functionality |
| User Content → Other User Content (golf scores, courses, handicaps, Venmo handle text) | **Yes** | No | No | App Functionality |
| Identifiers → Device ID | **Yes** (random app-generated id, not IDFA/IDFV) | No | No | App Functionality |
| Location | No | — | — | — |
| Financial Info | No (Venmo handle is plain text, no payment data) | — | — | — |
| Health & Fitness, Browsing, Search History, Diagnostics, Purchases, Contacts, Photos | No | — | — | — |

## Tracking
- "Do you use data for tracking?" → **No.**
- App Tracking Transparency prompt: **not required** (no tracking).

## Third parties
- Google Firebase (Firestore, Realtime Database, Anonymous Auth) — infrastructure
  processor only. No advertising SDKs, no analytics SDKs.

## Privacy policy URL
`https://<your-pages-domain>/privacy.html`
