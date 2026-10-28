const CACHE_NAME = 'kakeibo-app-v2';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './firebase-config.js'
];

// インストール時に最新ファイルをキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// 新バージョン有効化時に古いキャッシュ（v1など）を自動一括削除
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

// 通信処理（ネットワーク優先：オンライン時は常に最新を取得）
self.addEventListener('fetch', (event) => {
    // GETリクエスト以外や、Firebase/Google関連の通信はService Workerを通さない
    if (event.request.method !== 'GET') return;
    if (event.request.url.includes('firebase') || event.request.url.includes('googleapis') || event.request.url.includes('firestore')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // 正常に最新データが取得できたらキャッシュを上書き更新
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // 電波がない・オフライン時のみ端末内キャッシュから返す
                return caches.match(event.request);
            })
    );
});
