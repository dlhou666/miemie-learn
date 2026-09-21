/* 咩咩学 Service Worker —— 离线可用
 * ⚠️ 每次更新 css/js/图片后，务必把 CACHE 版本号 +1，
 *    否则已安装到主屏幕的设备会一直读旧缓存，看不到新界面。 */
var CACHE = 'miemie-v4';
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

/* 预缓存逐个写入：addAll 是原子的，任一文件 404 会让整个 SW 装不上，
 * 结果就是「离线功能完全没生效」——逐个容错，缺一张图不至于全盘失效。 */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(CORE.map(function (u) {
        return c.add(u).catch(function (err) { console.warn('预缓存失败 ' + u, err); });
      }));
    }).then(function () { return self.skipWaiting(); })
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

/* 页面主动升级：新版 SW 安装后发 {type:'SKIP_WAITING'} 立刻接管 */
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isSameOrigin(url) {
  return url.indexOf(self.location.origin) === 0 || url.indexOf('http') !== 0;
}

/* 离线兜底页：导航请求连缓存都没有时返回，避免看到浏览器默认报错页 */
var OFFLINE_HTML = '<!doctype html><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>咩咩学 · 离线</title>' +
  '<div style="font-family:-apple-system,PingFang SC,sans-serif;display:flex;min-height:100vh;' +
  'align-items:center;justify-content:center;text-align:center;padding:24px;color:#2C3A47">' +
  '<div><div style="font-size:64px">🐑</div>' +
  '<div style="font-size:20px;font-weight:700;margin-top:8px">现在没有网络</div>' +
  '<div style="margin-top:6px;color:#7A8896">已保存的数据都还在，联网后打开即可继续使用。</div></div></div>';

function offlineResponse() {
  return new Response(OFFLINE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var req = e.request;
  var url = req.url;
  if (!isSameOrigin(url)) return;                 // 跨域资源不拦截

  /* 导航请求（打开/刷新页面）：网络优先。
   * 用缓存优先的话，改了代码也 bump 了版本号，已安装的 iPad 仍会读旧 HTML，
   * 用户看到的就是「更新没生效」；网络优先则每次联网都拿到最新页面。 */
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') > -1) {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        }
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (hit) { return hit || offlineResponse(); });
      })
    );
    return;
  }

  /* 静态资源：stale-while-revalidate。先给缓存保证秒开与离线可用，
   * 同时后台拉新版本写进缓存，下一次打开就是新的。 */
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
