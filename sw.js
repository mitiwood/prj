/* ── KMS Service Worker v2 — Offline Cache + Push Handler ── */

const STATIC_CACHE = 'kms-static-v2';
const RUNTIME_CACHE = 'kms-runtime-v2';
const VALID_CACHES = [STATIC_CACHE, RUNTIME_CACHE];

const STATIC_ASSETS = [
  '/',
  '/api/config',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

/* 오프라인 폴백 HTML */
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>오프라인 - Kenny's Music Studio</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a1a;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
.c{max-width:360px;padding:32px}
h1{font-size:48px;margin-bottom:16px}
h2{font-size:20px;font-weight:700;margin-bottom:8px;color:#a78bfa}
p{font-size:14px;color:#9ca3af;margin-bottom:24px;line-height:1.6}
button{padding:12px 32px;border:none;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit}
</style></head><body>
<div class="c">
<h1>📡</h1>
<h2>오프라인 상태입니다</h2>
<p>인터넷 연결이 끊어졌어요.<br>연결이 복구되면 자동으로 돌아옵니다.</p>
<button onclick="location.reload()">다시 시도</button>
</div>
<script>window.addEventListener('online',()=>location.reload())</script>
</body></html>`;

/* ── Install: 정적 자산 프리캐싱 ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        /* 오프라인 폴백 페이지 저장 */
        cache.put(new Request('/_offline'), new Response(OFFLINE_HTML, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        }));
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: 이전 버전 캐시 정리 ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => !VALID_CACHES.includes(key))
          .map(key => caches.delete(key))
      )
    ).then(() => clients.claim())
  );
});

/* ── Fetch: 런타임 캐싱 전략 ── */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* 오디오 파일은 캐시하지 않음 (용량 큼) */
  if (url.pathname.match(/\.(mp3|wav|ogg|flac|aac|m4a|webm)$/i)) {
    return;
  }

  /* POST 요청은 캐시하지 않음 */
  if (e.request.method !== 'GET') return;

  /* API 요청: 네트워크 우선 + 캐시 폴백 */
  if (url.pathname.startsWith('/api/')) {
    /* 트랙/공지 등 공개 데이터만 캐시 */
    const cacheable = url.pathname === '/api/tracks' || url.pathname === '/api/config' || url.pathname === '/api/toss-config' || url.pathname === '/api/announcement';
    if (cacheable) {
      e.respondWith(
        caches.open(RUNTIME_CACHE).then(cache =>
          fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => cache.match(e.request))
        )
      );
    }
    return;
  }

  /* 이미지 (kie.ai CDN): 캐시 우선 */
  if (url.hostname === 'musicfile.kie.ai' || url.hostname === 'tempfile.aiquickdraw.com') {
    e.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => new Response('', { status: 404 }));
        })
      )
    );
    return;
  }

  /* 정적 자산 (JS/CSS/HTML): 네트워크 우선 + 캐시 폴백 + 오프라인 폴백 */
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() =>
        caches.match(e.request).then(cached => {
          if (cached) return cached;
          /* HTML 요청이면 오프라인 페이지 반환 */
          if (e.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/_offline');
          }
          return new Response('', { status: 503 });
        })
      )
    );
    return;
  }
});

/* ── 런타임 캐시 크기 제한 (최대 100개) ── */
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await Promise.all(keys.slice(0, keys.length - maxItems).map(k => cache.delete(k)));
  }
}

/* ── Push Notification ── */
self.addEventListener('push', e => {
  let data = { title: "Kenny's Music Studio", body: '새소식이 있어요', url: '/', icon: '/icon-192.png' };
  if (e.data) { try { data = { ...data, ...JSON.parse(e.data.text()) }; } catch {} }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge || '/icon-192.png',
      data: { url: data.url },
      vibrate: [200, 100, 200],
      actions: [{ action: 'open', title: '열기' }],
      tag: data.tag || 'kms-notification',
      renotify: true,
    }).then(() => trimCache(RUNTIME_CACHE, 100))
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const m = list.find(c => c.url.includes(self.location.origin));
      if (m) { m.focus(); return m.navigate(url); }
      return clients.openWindow(url);
    })
  );
});
