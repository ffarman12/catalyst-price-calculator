const CACHE='catalyst-calculator-v79-clean-document-tail';
const APP='./index.html';
const ASSETS=[APP,'./','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const isPage=e.request.mode==='navigate'||e.request.destination==='document';
  if(isPage){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(x=>{
      const y=x.clone();caches.open(CACHE).then(c=>c.put('./index.html',y));return x;
    }).catch(()=>caches.match('./index.html').then(r=>r||caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(x=>{
    const y=x.clone();caches.open(CACHE).then(c=>c.put(e.request,y));return x;
  })));
});