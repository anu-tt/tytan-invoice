const CACHE_NAME='tytan-invoice-shell-v10';
const SHELL_FILES=['./','./index.html','./styles.css','./app.js','./cloud-sync.js','./manifest.json','./icons/tytan.svg','./icons/tytan-192.png','./icons/tytan-512.png','./icons/tytan-logo.png','./icons/tytan-logo-invoice.png','./icons/durian-logo.png','./icons/greenply-logo.png','./icons/greenply-logo-invoice.png','./icons/centuryply-logo.png','./icons/centuryply-logo-invoice.png'];
const OPTIONAL_SCRIPTS=[
 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js'
];

self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(async cache=>{
  await cache.addAll(SHELL_FILES);
  await Promise.all(OPTIONAL_SCRIPTS.map(async url=>{
   try{
    const response=await fetch(url,{mode:'no-cors'});
    if(response.ok||response.type==='opaque')await cache.put(url,response);
   }catch(error){console.warn('Optional offline library was not cached:',url,error)}
  }));
 }));
 self.skipWaiting();
});

self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('tytan-invoice-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))));
 self.clients.claim();
});

self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const responsePromise=fetch(event.request);
 event.waitUntil(responsePromise.then(response=>{
  const url=new URL(event.request.url);
  const staticScript=url.hostname==='cdn.jsdelivr.net'&&event.request.destination==='script';
  if((url.origin===self.location.origin||staticScript)&&(response.ok||response.type==='opaque')){
   return caches.open(CACHE_NAME).then(cache=>cache.put(event.request,response.clone()));
  }
 }).catch(()=>{}));
 event.respondWith(responsePromise.catch(async()=>{
  const cached=await caches.match(event.request);
  if(cached)return cached;
  if(event.request.mode==='navigate'){
   const shell=await caches.match('./index.html');
   if(shell)return shell;
  }
  return Response.error();
 }));
});
