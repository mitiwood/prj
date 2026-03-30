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

/* fetch 이벤트 — 네트워크 패스스루 (가로채지 않음) */
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request));
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
