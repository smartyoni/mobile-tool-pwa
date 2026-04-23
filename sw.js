const CACHE_NAME = 'toolbox-v1';
const ASSETS = [
  './',
  './index.html',
  './sidepanel.css',
  './app.js',
  './lib/marked.min.js',
  './lib/purify.min.js',
  './건물정보_20260410.csv',
  './manifest.webmanifest',
  './icons/icon128.png',
  './icons/icon512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
