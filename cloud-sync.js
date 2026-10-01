(()=>{
 const QUEUE_KEY='tytan_invoice_sync_queue_v1';
 const INITIALIZED_KEY='tytan_cloud_initialized_v1';
 let sb=null,busy=false,channel=null;

 function queue(){const key=window.tytanQueueStorageKey||QUEUE_KEY;return JSON.parse(localStorage.getItem(key)||'[]')}
 function storeQueue(value){const key=window.tytanQueueStorageKey||QUEUE_KEY;localStorage.setItem(key,JSON.stringify(value))}
 function status(text,kind='pending'){setSyncStatus(text,kind)}
 function toInvoice(row){return{id:row.id,invoiceNo:row.invoice_no,date:row.invoice_date,name:row.customer_name,phone:row.customer_phone,address:row.customer_address,items:row.items,total:Number(row.total),updatedAt:row.updated_at,deletedAt:row.deleted_at||null}}
 function companySettings(row){return{company:row.name,location:row.location,phone:row.phone,email:row.email,website:row.website,proprietor:row.proprietor,prefix:row.invoice_prefix,nextNo:Number(row.next_invoice_no)||1}}
 function queueCompany(settings){
  const pending=queue(),operation={action:'company',id:'company',settings:{...settings},updatedAt:new Date().toISOString()};
  const index=pending.findIndex(item=>item.id==='company');
  if(index<0)pending.push(operation);else pending[index]=operation;
  storeQueue(pending);
 }
 function mapLocalInvoice(invoice){
  return{id:invoice.id,invoiceNo:invoice.invoiceNo,date:invoice.date,name:invoice.name,phone:invoice.phone,address:invoice.address,items:invoice.items,total:invoice.total,updatedAt:invoice.updatedAt||new Date().toISOString(),deletedAt:invoice.deletedAt||null};
 }
 function queueInvoice(action,value){
  const pending=queue(),id=value.id;
  const operation={action,id,invoice:mapLocalInvoice(value),updatedAt:new Date().toISOString()};
  const index=pending.findIndex(item=>item.id===id);
  if(index<0)pending.push(operation);else pending[index]=operation;
  storeQueue(pending);
 }
 function hydrate(localInvoices,operations){
  const pendingById=new Map(operations.filter(item=>item.id!=='company').map(item=>[item.id,item]));
  const merged=new Map(localInvoices.map(invoice=>[invoice.id,invoice]));
  for(const [id,operation] of pendingById){
   if(operation.action==='upsert')merged.set(id,operation.invoice);
   else if(operation.action==='delete'&&operation.invoice)merged.set(id,{...operation.invoice,deletedAt:operation.updatedAt});
   else if(operation.action==='permanent-delete')merged.delete(id);
  }
  state.invoices=[...merged.values()].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  saveState();refreshDashboard();
 }
 async function getCompanyId(){
  const {data,error}=await sb.rpc('claim_company');
  if(error)throw error;
  return data;
 }
 async function pull(cid,operations){
  const [invoiceResult,companyResult]=await Promise.all([
   sb.from('invoices').select('*').eq('company_id',cid).order('invoice_date',{ascending:false}).order('created_at',{ascending:false}),
   sb.from('companies').select('*').eq('id',cid).single()
  ]);
  if(invoiceResult.error)throw invoiceResult.error;
  if(companyResult.error)throw companyResult.error;
  hydrate(invoiceResult.data.map(toInvoice),operations);
  if(!operations.some(item=>item.id==='company')){
   const cloudSettings=companySettings(companyResult.data);
   const normalizedSettings=normalizeCompanySettings(cloudSettings);
   const hasLegacyText=Object.keys(cloudSettings).some(key=>cloudSettings[key]!==normalizedSettings[key]);
   state.settings={...state.settings,...normalizedSettings};
   saveState();renderPreviewIfEditing();
   if(hasLegacyText)queueCompanyChange(state.settings);
  }
 }
 async function flush(cid,userId){
  let pending=queue();
  for(const operation of pending){
   let error=null;
   if(operation.action==='company'){
    const patch={name:operation.settings.company,location:operation.settings.location,phone:operation.settings.phone,email:operation.settings.email,website:operation.settings.website,proprietor:operation.settings.proprietor,invoice_prefix:operation.settings.prefix,next_invoice_no:operation.settings.nextNo};
    const result=await sb.from('companies').update(patch).eq('id',cid);
    error=result.error;
   }else if(operation.action==='permanent-delete'){
    const result=await sb.from('invoices').delete().eq('id',operation.id).eq('company_id',cid).not('deleted_at','is',null);
    error=result.error;
   }else{
    const invoice=operation.invoice;
    const payload={id:invoice.id,company_id:cid,invoice_no:invoice.invoiceNo,invoice_date:invoice.date,customer_name:invoice.name,customer_phone:invoice.phone,customer_address:invoice.address,items:invoice.items,total:invoice.total,created_by:userId,updated_at:operation.action==='delete'?operation.updatedAt:(invoice.updatedAt||operation.updatedAt),deleted_at:operation.action==='delete'?operation.updatedAt:(invoice.deletedAt||null)};
    const result=await sb.from('invoices').upsert(payload,{onConflict:'id'});
    error=result.error;
   }
   if(error){const deleteHint=operation.action==='permanent-delete'&&error.code==='42501'?' Apply supabase-void-delete.sql in the Supabase SQL Editor, then choose Sync now.':'';status(`Sync paused: ${error.message}.${deleteHint} Local changes are saved on this device.`,'error');return false}
   const current=queue().filter(item=>!(item.id===operation.id&&item.updatedAt===operation.updatedAt));
   storeQueue(current);
  }
  return true;
 }
 async function syncNow(){
  if(busy||!sb||!navigator.onLine)return;
  busy=true;
  let shouldRetry=false;
  try{
   status('Syncing with cloud…','syncing');
   const cid=await getCompanyId();
   const {data:userResult,error:userError}=await sb.auth.getUser();
   if(userError)throw userError;
   const userId=userResult.user?.id;
   if(!userId)throw new Error('Sign in again to sync your invoices.');

   const initializedKey=`${INITIALIZED_KEY}:${userId}`;
   if(localStorage.getItem(initializedKey)!=='1'){
    const {data:cloudInvoices,error:invoiceError}=await sb.from('invoices').select('id,updated_at').eq('company_id',cid);
    if(invoiceError)throw invoiceError;
    const cloudById=new Map(cloudInvoices.map(invoice=>[invoice.id,invoice]));
    for(const invoice of state.invoices){
     const remote=cloudById.get(invoice.id);
     if(!remote||(Date.parse(invoice.updatedAt||'')>Date.parse(remote.updated_at||'')))queueInvoice('upsert',invoice);
    }
    const companyKeys=['company','location','phone','email','website','proprietor','prefix'];
    if(companyKeys.some(key=>state.settings[key]!==DEFAULT_SETTINGS[key]))queueCompany(state.settings);
   }
   const flushed=await flush(cid,userId);
   if(!flushed)return;
   const operations=queue();
   await pull(cid,operations);
   if(operations.length===0)localStorage.setItem(initializedKey,'1');
   shouldRetry=operations.length>0;
   status(operations.length?`${operations.length} change(s) waiting to sync`:'Synced · all devices up to date',operations.length?'pending':'synced');
  }catch(error){
   const setupHint=error.code==='PGRST202'&&error.message.includes('claim_company')?' Run supabase-production.sql in the Supabase SQL Editor, then retry sync.':'';
   const columnHint=error.code==='PGRST204'&&error.message.includes('deleted_at')?' Run the updated supabase-production.sql in the Supabase SQL Editor, then retry sync.':'';
   const fetchHint=error instanceof TypeError&&/fetch/i.test(error.message)?' Check your internet connection and confirm the Supabase URL in .env.local is the project URL (https://….supabase.co); browser blockers or an incorrect URL can also block access.':'';
   status(`${navigator.onLine?'Sync error':'Offline'}: ${error.message}.${setupHint}${columnHint}${fetchHint} Local changes are saved on this device.`,'error');
  }finally{
   busy=false;
   if(shouldRetry)setTimeout(()=>void syncNow(),0);
  }
 }
 window.syncInvoiceNow=()=>void syncNow();
 window.addEventListener('tytan-sync-queue-changed',()=>{const count=queue().length;status(`${count} change(s) waiting to sync`,count?'pending':'synced');void syncNow()});
 window.addEventListener('tytan-account-changed',()=>void syncNow());
 window.addEventListener('online',()=>void syncNow());

 async function setup(){
  if(!window.TYTAN_SUPABASE||sb)return;
  sb=window.TYTAN_SUPABASE;
  try{
   await syncNow();
   channel=sb.channel('tytan-invoices-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'invoices'},()=>void syncNow())
    .on('postgres_changes',{event:'*',schema:'public',table:'companies'},()=>void syncNow())
    .subscribe();
  }catch(error){status(`Realtime sync unavailable: ${error.message}`,'error')}
 }
 window.addEventListener('tytan-cloud-ready',setup);
 if(window.TYTAN_SUPABASE)void setup();
})();
