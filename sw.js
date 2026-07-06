/* PlayPal service worker
 *
 * Strategy:
 *  - App shell (HTML), compiled JS, and vendored libraries: network-first,
 *    cache fallback — so new deploys propagate immediately while the app
 *    still opens offline. All dependencies are vendored (vendor/), so the
 *    app makes no CDN requests at all.
 *  - Firebase data traffic (firestore/rtdb/auth) is never intercepted.
 */
const CACHE_VERSION = 'playpal-v1.5.1';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './playpal-logo.png',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js',
  './vendor/qrcode.min.js',
  './vendor/firebase-app-compat.js',
  './vendor/firebase-auth-compat.js',
  './vendor/firebase-database-compat.js',
  './vendor/firebase-firestore-compat.js',
  './vendor/fonts.css',
  './vendor/fonts/plus-jakarta-sans-latin-400-normal.woff2',
  './vendor/fonts/plus-jakarta-sans-latin-500-normal.woff2',
  './vendor/fonts/plus-jakarta-sans-latin-600-normal.woff2',
  './vendor/fonts/plus-jakarta-sans-latin-700-normal.woff2',
  './vendor/fonts/plus-jakarta-sans-latin-800-normal.woff2',
  './vendor/fonts/plus-jakarta-sans-latin-ext-400-normal.woff2',
  './vendor/fonts/plus-jakarta-sans-latin-ext-500-normal.woff2',
  './vendor/fonts/plus-jakarta-sans-latin-ext-600-normal.woff2',
  './vendor/fonts/plus-jakarta-sans-latin-ext-700-normal.woff2',
  './vendor/fonts/plus-jakarta-sans-latin-ext-800-normal.woff2',
  './dist/gameData.js?v=1.5.1',
  './dist/gameUtils.js?v=1.5.1',
  './dist/tripUtils.js?v=1.5.1',
  './dist/handicapService.js?v=1.5.1',
  './dist/courseService.js?v=1.5.1',
  './dist/matchEngine.js?v=1.5.1',
  './dist/statsService.js?v=1.5.1',
  './dist/profileService.js?v=1.5.1',
  './dist/roundHistoryService.js?v=1.5.1',
  './dist/sharingService.js?v=1.5.1',
  './dist/migrations.js?v=1.5.1',
  './dist/egt/egtSeedData.js?v=1.5.1',
  './dist/egt/egtHandicap.js?v=1.5.1',
  './dist/egt/egtImporter.js?v=1.5.1',
  './dist/egt/egtScoring.js?v=1.5.1',
  './dist/egt/egtSideGames.js?v=1.5.1',
  './dist/egt/egtPoints.js?v=1.5.1',
  './dist/egt/egtMoney.js?v=1.5.1',
  './dist/egt/egtStandings.js?v=1.5.1',
  './dist/egt/egtStore.js?v=1.5.1',
  './dist/egt/egtPrintable.js?v=1.5.1',
  './dist/egt/egtEngine.js?v=1.5.1',
  './dist/egt/egtBridge.js?v=1.5.1',
  './dist/Shared.js?v=1.5.1',
  './dist/Home.js?v=1.5.1',
  './dist/Setup.js?v=1.5.1',
  './dist/Trackers.js?v=1.5.1',
  './dist/GameTrackers.js?v=1.5.1',
  './dist/LiveScorecard.js?v=1.5.1',
  './dist/ScoreEntry.js?v=1.5.1',
  './dist/Summary.js?v=1.5.1',
  './dist/RoundViewer.js?v=1.5.1',
  './dist/TripDashboard.js?v=1.5.1',
  './dist/StatsScreen.js?v=1.5.1',
  './dist/EgtTournament.js?v=1.5.1',
  './dist/App.js?v=1.5.1',
];

// Live data endpoints — never cache.
const DATA_HOSTS = [
  'firestore.googleapis.com',
  'firebaseio.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (DATA_HOSTS.some((h) => url.hostname.endsWith(h))) return;

  if (url.origin === self.location.origin) {
    // Network-first for our own files so updates land immediately
    event.respondWith(
      fetch(event.request).then((resp) => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy));
        }
        return resp;
      }).catch(() => caches.match(event.request).then((hit) => hit || caches.match('./index.html')))
    );
  }
});
