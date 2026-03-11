/* ── KMS Service Worker — Push Handler ── */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

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
