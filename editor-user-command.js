/* Owner-controlled Editor User Command. UI enforcement for the nine user-approved protected features. */
(function(){
'use strict';
const WORKSPACE_ID='0287285c-044b-4a08-9ed5-314b40fde0e8';
const OWNER_FEATURES=[
 ['new_entry','+ New'],
 ['share_app_link','App Share'],
 ['section_lock','Section Lock'],
 ['less_history','Less History'],
 ['connection_service','Connection Service Status'],
 ['viewer_app_command','Viewer Command'],
 ['edit_delete','Edit/Delete'],
 ['view_cloud_data','View Cloud Data'],
 ['manual_market_update','Manual Market']
];
let ownerId=null,modal=null;
const $=id=>document.getElementById(id);
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function client(){return typeof window.getEditorSupabase==='function'?window.getEditorSupabase():null}
async function verifiedUser(){
 const c=client();if(!c)return null;
 const ses=await c.auth.getSession();
 const user=ses&&ses.data&&ses.data.session&&ses.data.session.user;
 if(!user)return null;
 const q=await c.from('workspaces').select('owner_id').eq('id',WORKSPACE_ID).maybeSingle();
 if(q.error)throw q.error;
 if(!q.data||!q.data.owner_id)throw new Error('Workspace owner could not be verified');
 ownerId=q.data.owner_id;
 return user;
}
async function isOwner(){
 try{const u=await verifiedUser();return !!u&&u.id===ownerId}
 catch(e){console.warn('Owner verification failed closed',e);return false}
}
function ensureModal(){
 if(modal)return modal;
 modal=document.createElement('div');modal.id='editorUserCommandModal';
 modal.style.cssText='display:none;position:fixed;inset:0;z-index:100010;background:#0009;align-items:center;justify-content:center;padding:12px';
 modal.innerHTML='<section style="width:min(720px,100%);max-height:90dvh;overflow:auto;background:light-dark(#fff,#171c22);color:inherit;border:1px solid #8b98a8;border-radius:16px;padding:16px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><strong style="font-size:18px">Editor User Command</strong><button type="button" id="eucClose" class="btn secondary">Close</button></div><p style="font-size:12px;opacity:.7">Owner-only approval and per-user permissions for the nine protected Editor features.</p><div id="eucStatus" role="status" style="font-size:13px;margin:8px 0"></div><div id="eucUsers"></div></section>';
 document.body.appendChild(modal);$('eucClose').onclick=()=>modal.style.display='none';return modal;
}
function permissionsForDisplay(saved){
 const p=saved&&typeof saved==='object'?saved:{};
 return Object.fromEntries(OWNER_FEATURES.map(([key])=>[key,p[key]===true]));
}
function renderUser(m){
 const p=permissionsForDisplay(m.permissions);
 const features=OWNER_FEATURES.map(([key,label])=>'<label style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid #8883;font-size:13px"><span>'+esc(label)+'</span><input type="checkbox" data-permission="'+key+'" '+(p[key]?'checked':'')+' style="width:20px;height:20px"></label>').join('');
 return '<article data-user="'+esc(m.user_id)+'" style="border:1px solid #8885;border-radius:12px;padding:12px;margin:10px 0"><div style="font-weight:800;overflow-wrap:anywhere">'+esc(m.user_id)+'</div><div style="font-size:12px;opacity:.7;margin:3px 0 8px">Role: '+esc(m.role||'member')+' · '+(m.approved?'Approved':'Not approved')+'</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="btn primary" type="button" data-action="approve">Approve</button><button class="btn danger" type="button" data-action="reject">Reject</button><button class="btn secondary" type="button" data-action="save">Save Permissions</button></div><details><summary style="cursor:pointer;font-weight:700;padding:6px 0">9 protected features</summary>'+features+'</details></article>';
}
async function loadUsers(){
 const c=client(),status=$('eucStatus'),list=$('eucUsers');
 status.textContent='Loading users…';list.innerHTML='';
 try{
  const user=await verifiedUser();
  if(!user||user.id!==ownerId){status.textContent='Owner account required. No changes made.';return}
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
   card.querySelector('[data-action="approve"]').onclick=()=>saveUser(uid,{approved:true});
   card.querySelector('[data-action="reject"]').onclick=()=>saveUser(uid,{approved:false});
   card.querySelector('[data-action="save"]').onclick=()=>{
    const permissions={};card.querySelectorAll('[data-permission]').forEach(x=>permissions[x.dataset.permission]=!!x.checked);
    saveUser(uid,{permissions});
   };
  });
 }catch(e){status.textContent='Could not load users/permissions: '+String(e&&e.message||e)+'. Verify the permissions migration is applied. No existing data was changed.'}
}
async function saveUser(uid,patch){
 const status=$('eucStatus'),c=client();
 try{
  const user=await verifiedUser();
  if(!user||user.id!==ownerId)throw new Error('Owner verification failed');
  const current=await c.from('workspace_member_permissions').select('approved,permissions').eq('workspace_id',WORKSPACE_ID).eq('user_id',uid).maybeSingle();
  if(current.error)throw current.error;
  const old=current.data&&current.data.permissions&&typeof current.data.permissions==='object'?current.data.permissions:{};
  // Preserve legacy/unrelated keys in storage; manage only the nine approved keys.
  const permissions={...old};
  OWNER_FEATURES.forEach(([key])=>{
   if(Object.prototype.hasOwnProperty.call(patch.permissions||{},key))permissions[key]=patch.permissions[key]===true;
   else if(!Object.prototype.hasOwnProperty.call(permissions,key))permissions[key]=false;
  });
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
 ensureModal().style.display='flex';$('eucStatus').textContent='Verifying Owner account…';$('eucUsers').innerHTML='';
 await loadUsers();
};
function addOwnerButton(){
 const menu=$('topNewMenu');if(!menu||menu.querySelector('#editorUserCommandBtn'))return;
 const b=document.createElement('button');b.id='editorUserCommandBtn';b.type='button';b.textContent='🛡 Editor User Command';b.onclick=window.openEditorUserCommand;
 const sep=document.createElement('div');sep.className='menuSep';
 const anchor=menu.querySelector('button[onclick="openViewerCommandFolder(event)"]')||menu.firstElementChild;
 if(anchor){menu.insertBefore(sep,anchor);menu.insertBefore(b,sep)}
}
const firstMenu=window.showProtectedMainMenu;
if(typeof firstMenu==='function'){
 window.showProtectedMainMenu=function(){const r=firstMenu.apply(this,arguments);setTimeout(async()=>{try{if(await isOwner())addOwnerButton()}catch(e){console.warn('Owner command unavailable',e)}},0);return r};
}
async function featureAllowed(feature){
 try{
  const c=client();if(!c)return false;
  const s=await c.auth.getSession();
  const user=s&&s.data&&s.data.session&&s.data.session.user;
  if(!user)return false;
  const w=await c.from('workspaces').select('owner_id').eq('id',WORKSPACE_ID).maybeSingle();
  if(w.error)throw w.error;
  if(!w.data||!w.data.owner_id)throw new Error('Workspace owner missing; fail closed');
  if(w.data.owner_id===user.id)return true;
  const m=await c.from('workspace_members').select('user_id').eq('workspace_id',WORKSPACE_ID).eq('user_id',user.id).maybeSingle();
  if(m.error)throw m.error;
  if(!m.data)return false;
  const p=await c.from('workspace_member_permissions').select('approved,permissions').eq('workspace_id',WORKSPACE_ID).eq('user_id',user.id).maybeSingle();
  if(p.error)throw p.error;
  if(!p.data||p.data.approved!==true)return false;
  return !!(p.data.permissions&&p.data.permissions[feature]===true);
 }catch(err){console.warn('Permission check failed closed:',feature,err);return false}
}
const FEATURE_LABELS=Object.fromEntries(OWNER_FEATURES);
function denyFeature(feature){alert('Owner ne is feature ki permission enable nahi ki hai: '+(FEATURE_LABELS[feature]||feature))}
function gate(feature,action){
 // Check permission before invoking any protected action. For browser share APIs,
 // opening the action only after the async check may lose transient user activation;
 // we fail closed rather than running a share action without verified permission.
 return async function(){
  const self=this,args=arguments;
  if(await featureAllowed(feature))return action.apply(self,args);
  denyFeature(feature);return false;
 };
}
function guardGlobal(name,feature){
 const original=window[name];
 if(typeof original!=='function'||original.__eucGuarded)return;
 const guarded=gate(feature,original);guarded.__eucGuarded=true;guarded.__eucOriginal=original;window[name]=guarded;
}
function guardCalculate(){
 const original=window.calculate;
 if(typeof original!=='function'||original.__eucGuarded)return;
 const guarded=async function(){
  const editMode=(typeof editingIndex!=='undefined'&&editingIndex!==null)||
   (typeof editingCloudId!=='undefined'&&!!editingCloudId);
  const feature=editMode?'edit_delete':'new_entry';
  if(!(await featureAllowed(feature))){denyFeature(feature);return false;}
  return original.apply(this,arguments);
 };
 guarded.__eucGuarded=true;guarded.__eucOriginal=original;window.calculate=guarded;
}
function guardHistoryAction(){
 const original=window.requestHistoryAction;
 if(typeof original!=='function'||original.__eucGuarded)return;
 const guarded=async function(action){
  // History PPM/detail stays unprotected; only Edit/Delete requires permission.
  if(action!=='edit'&&action!=='delete')return original.apply(this,arguments);
  if(!(await featureAllowed('edit_delete'))){denyFeature('edit_delete');return false;}
  return original.apply(this,arguments);
 };
 guarded.__eucGuarded=true;guarded.__eucOriginal=original;window.requestHistoryAction=guarded;
}
function guardShareAction(){
 const original=window.performShareWhatsApp;
 if(typeof original!=='function'||original.__eucGuarded)return;
 const guarded=function(){
  const self=this,args=Array.from(arguments);
  // Reserve a tab synchronously while the click still has browser user activation.
  // Only navigate it to WhatsApp after the live permission check succeeds.
  let pending=null;
  try{pending=window.open('about:blank','_blank');if(pending)pending.opener=null}catch(_){}
  return (async()=>{
   if(!(await featureAllowed('share_app_link'))){
    if(pending&&!pending.closed)pending.close();
    denyFeature('share_app_link');return false;
   }
   return original.apply(self,args.concat(pending));
  })();
 };
 guarded.__eucGuarded=true;guarded.__eucOriginal=original;window.performShareWhatsApp=guarded;
}
function installActionGuards(){
 // Saving a new record and saving an edit are different permissions.
 // The original calculate handler is context-aware in this wrapper.
 guardCalculate();
 guardHistoryAction();
 const map={
  openNewConverter:'new_entry',
  shareWhatsApp:'share_app_link',
  openSectionLock:'section_lock',
  saveSectionLock:'section_lock',
  openEntryPercentLess:'less_history',
  saveEntryPercentLess:'less_history',
  toggleEntryLessApply:'less_history',
  openServiceStatus:'connection_service',
  checkServiceStatus:'connection_service',
  openViewerCommandFolder:'viewer_app_command',
  openViewerPpmSettings:'viewer_app_command',
  saveViewerPpmSettings:'viewer_app_command',
  toggleViewerMarketSource:'viewer_app_command',
  toggleViewerHistoryLess:'viewer_app_command',
  editSelected:'edit_delete',
  deleteSelected:'edit_delete',
  cloudDataButtonClick:'view_cloud_data',
  guardedCloudDataClick:'view_cloud_data',
  openProtectedCloudData:'view_cloud_data',
  showCloudData:'view_cloud_data',
  toggleCloudDataView:'view_cloud_data',
  saveMarket:'manual_market_update'
 };
 Object.entries(map).forEach(([name,feature])=>guardGlobal(name,feature));
 // Deliberately do not wrap showSection or any Notification/Refine/Refine Settings/
 // History/View PPM/Excel Mode handlers: those six features are unprotected by decision.
}
installActionGuards();
// index.html may assign compatibility wrappers after this external script is evaluated.
// Re-install action guards once the current task's inline scripts have completed, and
// after the protected menu is rebuilt. This only wraps the nine feature handlers.
if(document.readyState==='loading'){
 document.addEventListener('DOMContentLoaded',()=>setTimeout(installActionGuards,0),{once:true});
}else{
 setTimeout(installActionGuards,0);
}
const guardedMenuOriginal=window.showProtectedMainMenu;
if(typeof guardedMenuOriginal==='function'&&!guardedMenuOriginal.__eucGuarded){
 const guardedMenu=function(){const r=guardedMenuOriginal.apply(this,arguments);setTimeout(installActionGuards,0);return r};
 guardedMenu.__eucGuarded=true;window.showProtectedMainMenu=guardedMenu;
}
})();
