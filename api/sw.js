/* ── KMS Service Worker — Push Handler ── */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

self.addEventListener('push', e => {
  let data = { title:"띵곡", body:'새소식이 있어요 🎵', url:'/', icon:'/icon-192.png' };
  if(e.data){ try{ data={...data,...JSON.parse(e.data.text())}; }catch{} }
  e.waitUntil(
    self.registration.showNotification(data.title,{
      body:data.body, icon:data.icon, badge:data.badge||'/icon-72.png',
      data:{url:data.url}, vibrate:[200,100,200],
      actions:[{action:'open',title:'열기 🎵'}]
    })
  );
});

/* ── fetch 이벤트 — 스마트 캐싱 전략 ── */
var KMS_CACHE = 'kms-audio-v1';
var CACHEABLE = ['.mp3', '.wav', '.ogg', '.m4a', '/icon-', '/img/'];

self.addEventListener('fetch', e => {
  var url = e.request.url;
  /* 오디오 파일: 캐시 우선 → 네트워크 폴백 */
  var isAudio = CACHEABLE.some(ext => url.includes(ext));
  if (isAudio && e.request.method === 'GET') {
    e.respondWith(
      caches.open(KMS_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(resp => {
            if (resp.ok && resp.status === 200) {
              cache.put(e.request, resp.clone());
            }
            return resp;
          });
        })
      ).catch(() => fetch(e.request))
    );
    return;
  }
  /* API/기타: 네트워크 패스스루 */
  e.respondWith(fetch(e.request));
});

/* 캐시 정리 (50MB 초과 시 오래된 항목 삭제) */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.open(KMS_CACHE).then(cache =>
      cache.keys().then(keys => {
        if (keys.length > 100) {
          var toDelete = keys.slice(0, keys.length - 50);
          return Promise.all(toDelete.map(k => cache.delete(k)));
        }
      })
    ).then(() => clients.claim())
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
