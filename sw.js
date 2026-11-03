// Service worker: la pagina si apre subito dalla cache e si aggiorna in background.
// Non fa chiamate esterne e lascia passare /api/ senza cache.
const C = 'squadre-v2';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(['/', '/icon-192.png'])));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  const net = fetch(e.request).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); }
    return r;
  });
  e.respondWith(caches.match(e.request).then(m => {
    if (m) { e.waitUntil(net.catch(() => {})); return m; }
    return net.catch(() => caches.match('/'));
  }));
});
