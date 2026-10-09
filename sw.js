const CACHE='catalyst-calculator-v139-refine-status-layout';
const APP='./index.html';
const ASSETS=[APP,'./','./manifest.webmanifest','./icon-192.png','./icon-512.png'];

const HISTORY_BRIDGE = `
<script id="cata-history-search-bridge">
(function(){
  window.validLess=function(x){return !!x && Number.isFinite(Number(x.pt)) && Number.isFinite(Number(x.pd)) && Number.isFinite(Number(x.rh));};
  function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
  async function runHistorySearch(evOrValue){
    try{
      if(evOrValue && typeof evOrValue.preventDefault==='function')evOrValue.preventDefault();
      if(evOrValue && typeof evOrValue.stopPropagation==='function')evOrValue.stopPropagation();
      var input=document.getElementById('search');
      var raw=typeof evOrValue==='string' ? evOrValue : (input ? input.value : '');
      raw=String(raw||'').trim();
      var key=norm(raw);
      if(!key)return false;
      if(typeof window.getEditorSupabase!=='function'){
        if(typeof window.cloudStatus==='function')window.cloudStatus('Search connection not ready');
        return false;
      }
      var client=window.getEditorSupabase();
      if(!client){
        if(typeof window.cloudStatus==='function')window.cloudStatus('Cloud connection unavailable');
        return false;
      }
      var sessionResult=await client.auth.getSession();
      var session=sessionResult && sessionResult.data && sessionResult.data.session;
      if(!session){
        if(typeof window.cloudStatus==='function')window.cloudStatus('Please login from the 3-dot menu');
        return false;
      }
      if(typeof window.cloudStatus==='function')window.cloudStatus('Searching Cloud History...');
      var q=client.from('converter_entries')
        .select('id,workspace_id,company,vehicle,code,notes,weight_g,pt_ppm,pd_ppm,rh_ppm,dpf_weight,dpf_pt_ppm,dpf_pd_ppm,dpf_rh_ppm,final_inr,updated_at,created_at,photo1,photo2,photo3,photo4,photo5,photo6')
        .eq('workspace_id','0287285c-044b-4a08-9ed5-314b40fde0e8')
        .like('code_normalized',key+'%')
        .order('created_at',{ascending:false})
        .limit(20);
      var result=await q;
      if(result.error)throw result.error;
      var rows=Array.isArray(result.data)?result.data:[];
      rows=rows.filter(function(row){return norm(row && row.code).indexOf(key)===0;});
      var mapped=rows.map(function(row){
        return Object.assign({},row,{price:Number(row.final_inr)||0,createdAt:row.created_at||row.updated_at||''});
      });
      try{history=mapped;}catch(_){console.error('History state assignment failed',_);}
      if(typeof window.renderHistory==='function')window.renderHistory();
      if(typeof window.cloudStatus==='function')window.cloudStatus(rows.length ? ('Cloud search: '+rows.length+' result(s)') : 'No matching reference found');
      return true;
    }catch(err){
      console.error('History search bridge failed',err);
      if(typeof window.cloudStatus==='function')window.cloudStatus('History search error: '+(err && err.message ? err.message : 'Unknown error'));
      return false;
    }
  }

  /* Keep the app's current Cloud search implementation authoritative.
     This bridge only handles the mobile search event; it must not replace or
     narrow the existing prefix-search logic. */
  var originalCloudSearch=null;
  try{
    if(window.CatalystCloudMaster && typeof window.CatalystCloudMaster.searchHistory==='function'){
      originalCloudSearch=window.CatalystCloudMaster.searchHistory;
    }
  }catch(_){}
  if(originalCloudSearch){
    runHistorySearch=async function(evOrValue){
      try{
        if(evOrValue && typeof evOrValue.preventDefault==='function')evOrValue.preventDefault();
        if(evOrValue && typeof evOrValue.stopPropagation==='function')evOrValue.stopPropagation();
      }catch(_){}
      var input=document.getElementById('search');
      var raw=typeof evOrValue==='string' ? evOrValue : (input ? input.value : '');
      raw=String(raw||'').trim();
      if(!raw)return false;
      /* The app's direct controller owns exact-prefix search and Cloud photo
         loading. Always prefer it when available; the older controller can
         otherwise truncate 79G-C04 to the 4-character 79gc prefix. */
      if(typeof window.__cataDirectCloudSearchV107==='function'){
        return await window.__cataDirectCloudSearchV107(evOrValue);
      }
      return await originalCloudSearch(raw);
    };
  }
  window.__cataRunHistorySearch=runHistorySearch;
  try{
    if(window.CatalystCloudMaster)window.CatalystCloudMaster.searchHistory=runHistorySearch;
  }catch(_){}

  function bind(){
    var form=document.getElementById('historySearchForm');
    var input=document.getElementById('search');
    var button=document.getElementById('historySearchBtn');
    if(form)form.onsubmit=runHistorySearch;
    if(button)button.onclick=runHistorySearch;
    if(input)input.onkeydown=function(e){
      if(e.key==='Enter'||e.key==='Search'||e.keyCode===13)return runHistorySearch(e);
    };
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});
  else bind();
})();
</script>`;

self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  /* Cloud/API reads must never come from the app cache. The previous
     catch-all GET cache could return deleted History rows after refresh. */
  try{
    const u=new URL(e.request.url);
    if(u.hostname.endsWith('.supabase.co')){
      e.respondWith(fetch(e.request,{cache:'no-store'}));
      return;
    }
  }catch(_){}
  const isPage=e.request.mode==='navigate'||e.request.destination==='document';
  if(isPage){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(async x=>{
      const text=await x.text();
      const patched=text.includes('cata-history-search-bridge')?text:text.replace(/<\/body>/i,HISTORY_BRIDGE+'<\/body>');
      const response=new Response(patched,{status:x.status,statusText:x.statusText,headers:x.headers});
      const y=response.clone();
      caches.open(CACHE).then(c=>c.put('./index.html',y));
      return response;
    }).catch(()=>caches.match('./index.html').then(r=>r||caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(x=>{
    const y=x.clone();caches.open(CACHE).then(c=>c.put(e.request,y));return x;
  })));
});