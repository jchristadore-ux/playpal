/* PlayPal service worker
 *
 * Strategy:
 *  - App shell (HTML) and compiled JS: network-first, cache fallback — so new
 *    deploys propagate immediately while the app still opens offline.
 *  - CDN assets (React, Firebase, fonts, QR lib) and images: cache-first —
 *    they are version-pinned URLs and safe to cache long-term.
 *  - Firebase data traffic (firestore/rtdb) is never intercepted.
 */
const CACHE_VERSION = 'playpal-v1.1.1';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './playpal-logo.png',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
  './dist/gameData.js?v=1.1.1',
  './dist/gameUtils.js?v=1.1.1',
  './dist/tripUtils.js?v=1.1.1',
  './dist/handicapService.js?v=1.1.1',
  './dist/courseService.js?v=1.1.1',
  './dist/matchEngine.js?v=1.1.1',
  './dist/statsService.js?v=1.1.1',
  './dist/profileService.js?v=1.1.1',
  './dist/roundHistoryService.js?v=1.1.1',
  './dist/sharingService.js?v=1.1.1',
  './dist/migrations.js?v=1.1.1',
  './dist/Shared.js?v=1.1.1',
  './dist/Home.js?v=1.1.1',
  './dist/Setup.js?v=1.1.1',
  './dist/PlayerCard.js?v=1.1.1',
  './dist/Trackers.js?v=1.1.1',
  './dist/GameTrackers.js?v=1.1.1',
  './dist/LiveScorecard.js?v=1.1.1',
  './dist/ScoreEntry.js?v=1.1.1',
  './dist/Summary.js?v=1.1.1',
  './dist/RoundViewer.js?v=1.1.1',
  './dist/TripDashboard.js?v=1.1.1',
  './dist/StatsScreen.js?v=1.1.1',
  './dist/App.js?v=1.1.1',
];

const CDN_HOSTS = [
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'www.gstatic.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
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

  if (CDN_HOSTS.includes(url.hostname)) {
    // Cache-first for version-pinned CDN assets
    event.respondWith(
      caches.match(event.request).then((hit) => hit || fetch(event.request).then((resp) => {
        if (resp.ok || resp.type === 'opaque') {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy));
        }
        return resp;
      }))
    );
    return;
  }

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
