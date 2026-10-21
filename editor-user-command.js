/* Owner-controlled Editor User Command UI. Requires the additive permissions migration. */
(function(){
'use strict';
const WORKSPACE_ID='0287285c-044b-4a08-9ed5-314b40fde0e8';
const OWNER_FEATURES=[
 ['new_entry','+ New'],['excel_mode','Excel Mode'],['view_ppm','View PPM'],['history_search','History Search'],
 ['refine_full_page','Refine Page — Full Page'],['refine_settings','Settings inside Refine Page'],['notification_full_page','Notification — Full Page'],
 ['viewer_app_command','Viewer App Command'],['view_cloud_data','View Cloud Data'],['change_app_pin','App PIN / Password Change'],
 ['edit_delete','Edit / Delete'],['share_app_link','Share App Link'],['section_lock','Section Lock'],
 ['connection_service','Connection Service'],['less_history','Less History'],['manual_market_update','Manual Market Update']
];
let ownerId=null,ownerReady=false,modal=null;
const $=id=>document.getElementById(id);
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function client(){return typeof window.getEditorSupabase==='function'?window.getEditorSupabase():null}
async function verifyOwner(){
 const c=client(); if(!c)return false;
 const ses=await c.auth.getSession(), user=ses&&ses.data&&ses.data.session&&ses.data.session.user;
 if(!user)return false;
 const q=await c.from('workspaces').select('owner_id').eq('id',EUC_WORKSPACE_ID).maybeSingle();
 if(q.error)throw q.error;
 ownerId=q.data&&q.data.owner_id||null; ownerReady=!!ownerId&&ownerId===user.id;
 return ownerReady;
}
function ensureModal(){
 if(modal)return modal;
 modal=document.createElement('div');modal.id='editorUserCommandModal';
 modal.style.cssText='display:none;position:fixed;inset:0;z-index:100010;background:#0009;align-items:center;justify-content:center;padding:12px';
 modal.innerHTML='<section style="width:min(720px,100%);max-height:90dvh;overflow:auto;background:light-dark(#fff,#171c22);color:inherit;border:1px solid #8b98a8;border-radius:16px;padding:16px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><strong style="font-size:18px">Editor User Command</strong><button type="button" id="eucClose" class="btn secondary">Close</button></div><p style="font-size:12px;opacity:.7">Owner-only approval and per-user permissions. Each user has an independent permission set.</p><div id="eucStatus" role="status" style="font-size:13px;margin:8px 0"></div><div id="eucUsers"></div></section>';
 document.body.appendChild(modal);$('eucClose').onclick=()=>modal.style.display='none';return modal;
}
function renderUser(m){
 const defaults=Object.fromEntries(OWNER_FEATURES.map(([key],i)=>[key,i>0&&i<7]));
 const p={...defaults,...(m.permissions&&typeof m.permissions==='object'?m.permissions:{})};
 const features=OWNER_FEATURES.map(([key,label])=>'<label style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #8883;font-size:13px"><span>'+esc(label)+'</span><input type="checkbox" data-permission="'+key+'" '+(p[key]===true?'checked':'')+' style="width:20px;height:20px"></label>').join('');
 return '<article data-user="'+esc(m.user_id)+'" style="border:1px solid #8885;border-radius:12px;padding:12px;margin:10px 0"><div style="font-weight:800;overflow-wrap:anywhere">'+esc(m.user_id)+'</div><div style="font-size:12px;opacity:.7;margin:3px 0 8px">Role: '+esc(m.role||'member')+' · '+(m.approved?'Approved':'Pending / Rejected')+'</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="btn primary" type="button" data-action="approve">Approve</button><button class="btn danger" type="button" data-action="reject">Reject</button><button class="btn secondary" type="button" data-action="save">Save Permissions</button></div><details><summary style="cursor:pointer;font-weight:700;padding:6px 0">16 permissions</summary>'+features+'</details></article>';
}
async function loadUsers(){
 const c=client(),status=$('eucStatus'),list=$('eucUsers');
 status.textContent='Loading users…';list.innerHTML='';
 try{
  if(!await verifyOwner()){status.textContent='Owner account required. No changes made.';return}
  const members=await c.from('workspace_members').select('user_id,role').eq('workspace_id',WORKSPACE_ID);
  if(members.error)throw members.error;
  const perms=await c.from('workspace_member_permissions').select('user_id,approved,permissions,approved_at').eq('workspace_id',WORKSPACE_ID);
  if(perms.error)throw perms.error;
  const byId=new Map((perms.data||[]).map(x=>[x.user_id,x]));
  const users=(members.data||[]).filter(x=>x.user_id!==ownerId).map(m=>({...m,...(byId.get(m.user_id)||{approved:false,permissions:{}})}));
  list.innerHTML=users.length?users.map(renderUser).join(''):'<p>No other workspace members found.</p>';
  status.textContent='Owner verified · '+users.length+' member(s).';
  list.querySelectorAll('article[data-user]').forEach(card=>{
   const uid=card.dataset.user;
   card.querySelector('[data-action="approve"]').onclick=()=>saveUser(uid,{approved:true},card);
   card.querySelector('[data-action="reject"]').onclick=()=>saveUser(uid,{approved:false},card);
   card.querySelector('[data-action="save"]').onclick=()=>{const permissions={};card.querySelectorAll('[data-permission]').forEach(x=>permissions[x.dataset.permission]=!!x.checked);saveUser(uid,{permissions},card)};
  });
 }catch(e){status.textContent='Could not load users/permissions: '+String(e&&e.message||e)+'. Check that the permissions migration is applied. No existing data was changed.'}
}
async function saveUser(uid,patch,card){
 const status=$('eucStatus'),c=client();
 try{
  if(!await verifyOwner())throw new Error('Owner verification failed');
  const current=await c.from('workspace_member_permissions').select('approved,permissions').eq('workspace_id',WORKSPACE_ID).eq('user_id',uid).maybeSingle();
  if(current.error)throw current.error;
  const defaults=Object.fromEntries(OWNER_FEATURES.map(([k],i)=>[k,i>0&&i<7]));
  const permissions={...defaults,...(current.data&&current.data.permissions||{}),...(patch.permissions||{})};
  const approved=typeof patch.approved==='boolean'?patch.approved:!!(current.data&&current.data.approved);
  const payload={workspace_id:WORKSPACE_ID,user_id:uid,approved,permissions,approved_by:ownerId,approved_at:approved?new Date().toISOString():null,updated_at:new Date().toISOString()};
  const saved=await c.from('workspace_member_permissions').upsert(payload,{onConflict:'workspace_id,user_id'});
  if(saved.error)throw saved.error;
  status.textContent=approved?'User approved and saved.':'User marked not approved. Existing History/data was not deleted.';
  await loadUsers();
 }catch(e){status.textContent='Save failed: '+String(e&&e.message||e)+'. No success assumed.'}
}
window.openEditorUserCommand=async function(e){
 if(e){e.preventDefault();e.stopPropagation()}
 const m=ensureModal();m.style.display='flex';$('eucStatus').textContent='Verifying Owner account…';$('eucUsers').innerHTML='';
 await loadUsers();
};
function addOwnerButton(){
 const menu=$('topNewMenu');if(!menu||!menu.querySelector('button[onclick="openViewerCommandFolder(event)"]'))return;
 if(menu.querySelector('#editorUserCommandBtn'))return;
 const b=document.createElement('button');b.id='editorUserCommandBtn';b.type='button';b.textContent='🛡 Editor User Command';b.onclick=window.openEditorUserCommand;
 const sep=document.createElement('div');sep.className='menuSep';
 const viewer=menu.querySelector('button[onclick="openViewerCommandFolder(event)"]');
 if(viewer)menu.insertBefore(sep,viewer.nextSibling),menu.insertBefore(b,sep);
}
const original=window.showProtectedMainMenu;
if(typeof original==='function'){
 window.showProtectedMainMenu=function(){const r=original.apply(this,arguments);setTimeout(async()=>{try{if(await verifyOwner())addOwnerButton()}catch(e){console.warn('Owner command unavailable',e)}},0);return r};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{});
})();

// Enforce permissions at the Editor UI action boundary as well as in the database.
const FEATURE_ACTIONS = {
  openNewConverter: 'new_entry',
  showPPM: 'view_ppm',
  editSelected: 'edit_delete',
  deleteSelected: 'edit_delete',
  openSectionLock: 'section_lock',
  shareWhatsApp: 'share_app_link',
  openViewerCommandFolder: 'viewer_app_command',
  toggleViewerMarketSource: 'viewer_app_command',
  openLessSettings: 'excel_mode',
  openEntryPercentLess: 'less_history',
  openPasswordSettings: 'change_app_pin',
  openRefineCalculatorSettings: 'refine_settings',
  cloudDataButtonClick: 'view_cloud_data',
  openServiceStatus: 'connection_service',
  saveMarket: 'manual_market_update'
};
const permissionCache = new Map();
// The action guards are outside the UI IIFE; expose only the non-secret helpers they need.
function eucClient(){return typeof window.getEditorSupabase==='function'?window.getEditorSupabase():null;}
const EUC_WORKSPACE_ID='0287285c-044b-4a08-9ed5-314b40fde0e8';
const EUC_OWNER_FEATURES=[
 ['new_entry','+ New'],['excel_mode','Excel Mode'],['view_ppm','View PPM'],['history_search','History Search'],
 ['refine_full_page','Refine Page — Full Page'],['refine_settings','Settings inside Refine Page'],['notification_full_page','Notification — Full Page'],
 ['viewer_app_command','Viewer App Command'],['view_cloud_data','View Cloud Data'],['change_app_pin','App PIN / Password Change'],
 ['edit_delete','Edit / Delete'],['share_app_link','Share App Link'],['section_lock','Section Lock'],
 ['connection_service','Connection Service'],['less_history','Less History'],['manual_market_update','Manual Market Update']
];
async function featureAllowed(feature) {
  try {
    const c=eucClient();
    if(!c) return false;
    const sessionResult=await c.auth.getSession();
    const user=sessionResult&&sessionResult.data&&sessionResult.data.session&&sessionResult.data.session.user;
    if(!user) return false;
    const ownerResult=await c.from('workspaces').select('owner_id').eq('id',EUC_WORKSPACE_ID).maybeSingle();
    if(ownerResult.error) throw ownerResult.error;
    if(ownerResult.data&&ownerResult.data.owner_id===user.id) return true;
    const cacheKey=user.id+':'+feature;
    if(permissionCache.has(cacheKey)) return permissionCache.get(cacheKey);
    const result=await c.rpc('workspace_feature_enabled',{p_workspace_id:EUC_WORKSPACE_ID,p_feature:feature});
    if(result.error) throw result.error;
    const allowed=result.data===true;
    permissionCache.set(cacheKey,allowed);
    return allowed;
  } catch(err) {
    console.warn('Permission check failed closed:',feature,err);
    return false;
  }
}
function denyFeature(feature) {
  const labels=Object.fromEntries(EUC_OWNER_FEATURES);
  alert('Owner ne is feature ki permission enable nahi ki hai: '+(labels[feature]||feature));
}
function installActionGuards() {
  Object.entries(FEATURE_ACTIONS).forEach(([name,feature])=>{
    const originalAction=window[name];
    if(typeof originalAction!=='function'||originalAction.__eucGuarded) return;
    const guarded=function() {
      const self=this,args=arguments,event=args[0];
      // Stop the original click synchronously while permission is checked.
      if(event&&typeof event.preventDefault==='function')event.preventDefault();
      if(event&&typeof event.stopPropagation==='function')event.stopPropagation();
      featureAllowed(feature).then(allowed=>{
        if(!allowed){denyFeature(feature);return;}
        originalAction.apply(self,args);
      });
    };
    guarded.__eucGuarded=true;
    window[name]=guarded;
  });
  if(typeof window.showSection==='function'&&!window.showSection.__eucGuarded){
    const originalShowSection=window.showSection;
    const guardedShowSection=function(view){
      const feature=view==='refine'?'refine_full_page':view==='refineSettings'?'refine_settings':view==='notification'?'notification_full_page':view==='history'?'history_search':null;
      if(!feature){return originalShowSection.apply(this,arguments);}
      const args=arguments,self=this,event=args[1];
      if(event&&typeof event.preventDefault==='function')event.preventDefault();
      if(event&&typeof event.stopPropagation==='function')event.stopPropagation();
      featureAllowed(feature).then(allowed=>{
        if(!allowed){denyFeature(feature);return;}
        originalShowSection.apply(self,args);
      });
    };
    guardedShowSection.__eucGuarded=true;
    window.showSection=guardedShowSection;
  }
}
// Install permission checks as soon as the script loads.
installActionGuards();
const originalShowProtectedForGuards=window.showProtectedMainMenu;
if(typeof originalShowProtectedForGuards==='function'&&!originalShowProtectedForGuards.__eucGuarded){
  const guardedMenu=function(){
    const result=originalShowProtectedForGuards.apply(this,arguments);
    permissionCache.clear();
    setTimeout(()=>{installActionGuards();},0);
    return result;
  };
  guardedMenu.__eucGuarded=true;
  window.showProtectedMainMenu=guardedMenu;
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')permissionCache.clear();});
