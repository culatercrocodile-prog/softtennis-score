// アセット内容を変更した場合は必ずこの値を更新すること。
// cache-first戦略のため、名前を変えないとインストール済みのユーザーに更新が届かない。
const CACHE_NAME = 'softtennis-score-v6';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/rules.js',
  './js/storage.js',
  './js/match.js',
  './js/sheet.js',
  './js/ui.js',
  './js/vendor/jspdf.umd.min.js',
  './js/vendor/html2canvas.min.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  // cache.addAll()はデフォルトのfetchキャッシュモードを使うため、ブラウザのHTTPキャッシュに
  // 古いレスポンスが残っているとそれをそのままCache Storageに取り込んでしまうことがある。
  // 各アセットを cache: 'reload' で明示的に取得し、必ずネットワークから最新を取る。
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(
        ASSETS.map((url) => fetch(url, { cache: 'reload' }).then((res) => cache.put(url, res)))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => cached);
    })
  );
});
