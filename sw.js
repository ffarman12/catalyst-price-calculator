const CACHE='catalyst-calculator-v1';
const APP='./Catalyst%20Price%20Calculator%20Prototype%20-%20Less%20Refine%20Refresh%20Fixed.html';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll([APP,'./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png']))));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{ if(e.request.method!=='GET') return; e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(x=>{const y=x.clone();caches.open(CACHE).then(c=>c.put(e.request,y));return x}).catch(()=>caches.match(APP)))); });
