const CACHE = 'quickrecipe-v9';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './style.css?v=9',
  './app.js',
  './app.js?v=9',
  './recipes.json',
  './recipes.json?v=9',
  './manifest.webmanifest',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ),
  ]));
});

self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});