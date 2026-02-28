const CACHE_NAME = 'kakeibo-app-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './firebase-config.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Firebaseや外部APIのリクエストはキャッシュを無視してネットワークを通す
    if (event.request.url.includes('firebase') || event.request.url.includes('googleapis') || event.request.url.includes('firestore')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // ネットワーク優先の戦略（更新を反映しやすくするため）
            return fetch(event.request).then((networkResponse) => {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            }).catch(() => {
                // オフライン時はキャッシュを返す
                if (cachedResponse) {
                    return cachedResponse;
                }
            });
        })
    );
});
