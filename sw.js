const VERSION = '73';
const CACHE = `quickrecipe-v${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './style.css',
  `./style.css?v=${VERSION}`,
  './i18n.js',
  `./i18n.js?v=${VERSION}`,
  './shopping.js',
  `./shopping.js?v=${VERSION}`,
  './ingredient-allergens.js',
  `./ingredient-allergens.js?v=${VERSION}`,
  './recipe-calculations.js',
  `./recipe-calculations.js?v=${VERSION}`,
  './canteen-model.js',
  `./canteen-model.js?v=${VERSION}`,
  './canteen.js',
  `./canteen.js?v=${VERSION}`,
  './app.js',
  `./app.js?v=${VERSION}`,
  './translations/pl.json',
  `./translations/pl.json?v=${VERSION}`,
  './translations/is.json',
  `./translations/is.json?v=${VERSION}`,
  './manifest.webmanifest',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const indexUrl = `./recipes/index.json?v=${VERSION}`;
    const response = await fetch(indexUrl);
    if (!response.ok) throw new Error('Could not cache the recipe index');
    const index = await response.clone().json();
    if (!Array.isArray(index.files) || !index.files.length ||
        index.files.some(file => typeof file !== 'string' || !/^[a-z0-9-]+\.json$/.test(file))) {
      throw new Error('Invalid recipe index');
    }
    const cache = await caches.open(CACHE);
    await cache.addAll([...ASSETS, ...index.files.flatMap(file =>
      [`./recipes/${file}`, `./recipes/${file}?v=${VERSION}`]
    )]);
    await cache.put('./recipes/index.json', response.clone());
    await cache.put(indexUrl, response);
    await self.skipWaiting();
  })());
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
