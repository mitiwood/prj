/* ── KMS Service Worker — Offline Cache + Push Handler ── */

const STATIC_CACHE = 'kms-static-v1';
const RUNTIME_CACHE = 'kms-runtime-v1';
const VALID_CACHES = [STATIC_CACHE, RUNTIME_CACHE];

const STATIC_ASSETS = [
  '/',
  '/api/config'
];

/* ── Install: 정적 자산 프리캐싱 ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
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

  // 오디오 파일은 캐시하지 않음 (용량 큼)
  if (url.pathname.match(/\.(mp3|wav|ogg|flac|aac|m4a|webm)$/i)) {
    return;
  }

  // 트랙 API: 네트워크 우선 (stale-while-revalidate)
  if (url.pathname === '/api/tracks' && url.searchParams.get('public') === 'true') {
    e.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        fetch(e.request).then(res => {
          cache.put(e.request, res.clone());
          return res;
        }).catch(() => cache.match(e.request))
      )
    );
    return;
  }

  // 이미지 (musicfile.kie.ai, tempfile.aiquickdraw.com): 캐시 우선
  if (url.hostname === 'musicfile.kie.ai' || url.hostname === 'tempfile.aiquickdraw.com') {
    e.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(res => {
            cache.put(e.request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }
});

/* ── Push Notification ── */
self.addEventListener('push', e => {
  let data = { title:"Kenny's Music Studio", body:'새소식이 있어요 🎵', url:'/', icon:'/icon-192.png' };
  if(e.data){ try{ data={...data,...JSON.parse(e.data.text())}; }catch{} }
  e.waitUntil(
    self.registration.showNotification(data.title,{
      body:data.body, icon:data.icon, badge:data.badge||'/icon-72.png',
      data:{url:data.url}, vibrate:[200,100,200],
      actions:[{action:'open',title:'열기 🎵'}]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
      const m = list.find(c=>c.url.includes(self.location.origin));
      if(m){ m.focus(); return m.navigate(url); }
      return clients.openWindow(url);
    })
  );
});
