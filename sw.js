/* 咩咩学 Service Worker —— 离线可用
 * ⚠️ 每次更新 css/js/图片后，务必把 CACHE 版本号 +1，
 *    否则已安装到主屏幕的设备会一直读旧缓存，看不到新界面。 */
var CACHE = 'miemie-v3';
var CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/data.js',
  './js/store.js',
  './js/app.js',
  './assets/sheep-wave.png',
  './assets/sheep-jump.png',
  './assets/sheep-read.png',
  './assets/sheep-gift.png',
  './assets/sheep-parent.png',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-152.png',
  './icons/icon-167.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-1024.png',
  './icons/icon-maskable.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(CORE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = e.request.url;

  // Google Fonts：网络优先，失败回退缓存（stale-while-revalidate）
  if (url.indexOf('fonts.googleapis.com') > -1 || url.indexOf('fonts.gstatic.com') > -1) {
    e.respondWith(
      caches.open(CACHE).then(function (c) {
        return c.match(e.request).then(function (hit) {
          var net = fetch(e.request).then(function (res) {
            if (res && res.status === 200) c.put(e.request, res.clone());
            return res;
          }).catch(function () { return hit; });
          return hit || net;
        });
      })
    );
    return;
  }

  // 同源资源：缓存优先，保证离线可用
  if (url.indexOf(self.location.origin) === 0 || url.indexOf('http') !== 0) {
    e.respondWith(
      caches.match(e.request).then(function (hit) {
        return hit || fetch(e.request).then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
          }
          return res;
        });
      })
    );
  }
});
