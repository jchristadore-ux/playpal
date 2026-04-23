// sync-config.js
// ──────────────────────────────────────────────────────────────────────────
// Cross-device sync configuration for PlayPal.
//
// LEAVE THIS FILE AS-IS to run PlayPal in local-only mode (sync code join
// only works on the same browser / device).
//
// To enable true cross-device sync across phones, tablets, and laptops,
// follow the steps in README.md and paste your Firebase Realtime Database
// URL below. No other code changes are required.
//
// Example:
//   window.PLAYPAL_SYNC = {
//     provider: 'firebase',
//     databaseURL: 'https://your-project-default-rtdb.firebaseio.com',
//     // Optional — only needed if you tightened the RTDB rules. Leave
//     // null for open "test mode" rules.
//     authToken: null,
//   };
// ──────────────────────────────────────────────────────────────────────────

window.PLAYPAL_SYNC = {
  provider:    'firebase',
  databaseURL: 'https://console.firebase.google.com/project/playpal-sync/database/playpal-sync-default-rtdb/data/~2F',
  authToken:   null,
};
