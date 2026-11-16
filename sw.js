/* Bead Pattern Maker — service worker: cache the app shell for offline use. */
var CACHE = 'bead-pattern-maker-v16';
var ASSETS = [
  './',
  './index.html',
  './index-zh.html',
  './index-ja.html',
  './index-ko.html',
  './index-fr.html',
  './studio.html',
  './studio-zh.html',
  './studio-ja.html',
  './studio-ko.html',
  './studio-fr.html',
  './guide.html',
  './guide-zh.html',
  './guide-ja.html',
  './guide-ko.html',
  './guide-fr.html',
  './styles.css',
  './palette.js',
  './core.js',
  './app.js',
  './app-zh.js',
  './app-ja.js',
  './app-ko.js',
  './app-fr.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(e.request);
    })
  );
});
