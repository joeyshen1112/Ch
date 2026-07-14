/* sw.js — app shell cache-first；GAS／跨域請求一律不攔截（離線寫入由 app/sync.js 佇列處理）
 * 改動 SHELL 內任何檔案時，必須 bump CACHE 版本（tt-vN）。 */
const CACHE = 'tt-v1';
const SHELL = [
  './app.html',
  './manifest.json',
  './app/app.css?v=3',
  './app/sync.js',
  './app/itinerary.js',
  './app/expenses.js',
  './app/phrases.js',
  './app/spots-data.js',
  './app/vendor/Sortable.min.js',
  './app/icons/icon-192.png',
  './app/icons/icon-512.png',
  './app/icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // GAS、Google Fonts 等交給網路
  // 只接管 App 本體；內容頁（index/busan/gyeongju.html）永遠走網路，避免被凍結在舊版
  const p = url.pathname;
  const isApp = p.endsWith('/app.html') || p.endsWith('/manifest.json') || p.includes('/app/');
  if (!isApp) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
