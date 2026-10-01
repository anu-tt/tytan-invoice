const $=id=>document.getElementById(id);
const KEY='tytan_invoice_v1';
const SYNC_QUEUE_KEY='tytan_invoice_sync_queue_v1';
const DEFAULT_SETTINGS={company:'Anil Enterprises',location:'Okdenganj, Sadev Katra (Ballia)',phone:'8318886379',email:'tytandoor@gmail.com',website:'www.tytandoor.com',proprietor:'Khushir Gupta',prefix:'INV-',nextNo:1};
let activeStateKey=KEY,activeQueueKey=SYNC_QUEUE_KEY,activeAccountId=null;
let state=JSON.parse(localStorage.getItem(KEY)||'null')||{settings:DEFAULT_SETTINGS,invoices:[]};
state.settings={...DEFAULT_SETTINGS,...state.settings};
const LEGACY_COMPANY_TEXT={company:{'अनिल इंटरप्राइजेज':'Anil Enterprises'},location:{'ओक्डेनागंज, सदेव कटरा (बलिया)':'Okdenganj, Sadev Katra (Ballia)'},proprietor:{'खुशीर गुप्ता':'Khushir Gupta'}};
function normalizeCompanySettings(settings){
 const normalized={...settings};
 Object.entries(LEGACY_COMPANY_TEXT).forEach(([key,translations])=>{
  if(Object.hasOwn(translations,normalized[key]))normalized[key]=translations[normalized[key]];
 });
 return normalized;
}
const normalizedSettings=normalizeCompanySettings(state.settings);
const settingsChanged=Object.keys(LEGACY_COMPANY_TEXT).some(key=>state.settings[key]!==normalizedSettings[key]);
state.settings=normalizedSettings;
if(settingsChanged)saveState();
if('sbUrl' in state.settings||'sbKey' in state.settings){
 delete state.settings.sbUrl;delete state.settings.sbKey;saveState();
}
let editing=null;
let showDeletedInvoices=false;

function saveState(){localStorage.setItem(activeStateKey,JSON.stringify(state));}
window.setInvoiceAccount=userId=>{
 if(userId===activeAccountId)return;
 activeAccountId=userId||null;
 activeStateKey=userId?`${KEY}:${userId}`:KEY;
 activeQueueKey=userId?`${SYNC_QUEUE_KEY}:${userId}`:SYNC_QUEUE_KEY;
 window.tytanQueueStorageKey=activeQueueKey;
 state=userId?(JSON.parse(localStorage.getItem(activeStateKey)||'null')||{settings:DEFAULT_SETTINGS,invoices:[]}):{settings:DEFAULT_SETTINGS,invoices:[]};
 state.settings={...DEFAULT_SETTINGS,...state.settings};
 refreshDashboard();
 window.dispatchEvent(new Event('tytan-account-changed'));
};
function queueInvoiceChange(action,value){
 if(!activeAccountId)return;
 const queue=JSON.parse(localStorage.getItem(activeQueueKey)||'[]');
 const id=value.id;
 const operation={action,id,invoice:value,updatedAt:new Date().toISOString()};
 const index=queue.findIndex(item=>item.id===id);
 if(index<0)queue.push(operation);else queue[index]=operation;
 localStorage.setItem(activeQueueKey,JSON.stringify(queue));
 window.dispatchEvent(new Event('tytan-sync-queue-changed'));
}
function queueCompanyChange(settings){
 if(!activeAccountId)return;
 const queue=JSON.parse(localStorage.getItem(activeQueueKey)||'[]');
 const operation={action:'company',id:'company',settings:{...settings},updatedAt:new Date().toISOString()};
 const index=queue.findIndex(item=>item.id==='company');
 if(index<0)queue.push(operation);else queue[index]=operation;
 localStorage.setItem(activeQueueKey,JSON.stringify(queue));
 window.dispatchEvent(new Event('tytan-sync-queue-changed'));
}
function money(n){return '₹'+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function toast(t){$('toast').textContent=t;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),1800);}
function nextInvoiceNo(){let n=Number(state.settings.nextNo)||1;return state.settings.prefix+String(n).padStart(3,'0');}
function blankItem(){return {desc:'',size:'',pcs:1,rate:0};}
function show(page){['dashboard','editor','settings'].forEach(x=>$(x).classList.toggle('hidden',x!==page));}
function calc(items){return items.reduce((s,x)=>s+(Number(x.pcs)||0)*(Number(x.rate)||0),0);}

function openNew(){
 editing={id:null,invoiceNo:nextInvoiceNo(),date:today(),name:'',phone:'',address:'',items:[blankItem()]};
 fillEditor(); show('editor');
}
function fillEditor(){
 $('editorTitle').textContent=editing.id?'Edit Invoice':'New Invoice';
 $('customerName').value=editing.name||'';$('customerPhone').value=editing.phone||'';$('customerAddress').value=editing.address||'';
 $('invoiceDate').value=editing.date||today();$('invoiceNo').value=editing.invoiceNo;
 $('invoicePreviewWrap').classList.add('hidden');$('previewBtn').textContent='Preview Invoice';
 renderItems(); renderPreview();
}
function renderItems(){
 $('itemsBody').innerHTML='';
 editing.items.forEach((it,i)=>{
   const tr=document.createElement('tr');
   tr.innerHTML=`<td><input data-i="${i}" data-k="desc" value="${esc(it.desc)}"></td>
   <td><input data-i="${i}" data-k="size" value="${esc(it.size)}"></td>
   <td><input data-i="${i}" data-k="pcs" type="number" min="0" data-i="${i}" data-k="pcs" value="${it.pcs}"></td>
   <td><input data-i="${i}" data-k="rate" type="number" min="0" step="0.01" value="${it.rate}"></td>
   <td>${money((Number(it.pcs)||0)*(Number(it.rate)||0))}</td>
   <td><button class="action-btn" data-remove="${i}">×</button></td>`;
   $('itemsBody').appendChild(tr);
 });
 $('itemsBody').querySelectorAll('input').forEach(inp=>inp.addEventListener('input',e=>{
   const i=+e.target.dataset.i,k=e.target.dataset.k; editing.items[i][k]=(k==='pcs'||k==='rate')?Number(e.target.value):e.target.value;
   const row=e.target.closest('tr');
   row.cells[4].textContent=money((Number(editing.items[i].pcs)||0)*(Number(editing.items[i].rate)||0));
   $('grandTotal').textContent=money(calc(editing.items));renderPreview();
 }));
 $('itemsBody').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{if(editing.items.length>1)editing.items.splice(+b.dataset.remove,1);renderItems();renderPreview();});
 $('addItemBtn').disabled=editing.items.length>=10;
 $('grandTotal').textContent=money(calc(editing.items));
}
function esc(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}

function renderPreview(){
 const rows=Array.from({length:10},(_,i)=>{
  const item=editing.items[i];
  return `<div class="template-item-row"><span>${item?esc(item.desc):''}</span><span>${item?esc(item.size):''}</span><span>${item?esc(item.pcs):''}</span><span>${item?money(item.rate):''}</span><span>${item?money((Number(item.pcs)||0)*(Number(item.rate)||0)):''}</span></div>`;
 }).join('');
 const number=String(editing.invoiceNo||'').replace(new RegExp(`^${String(state.settings.prefix||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`),'').replace(/^[^0-9]*/,'');
 const s=state.settings;
 $('invoicePreview').innerHTML=`<div class="template-brand-row">
  <img class="template-brand-img template-brand-tytan" src="./icons/tytan-logo-invoice.png" alt="TYTAN DOOR">
  <img class="template-brand-img template-brand-durian" src="./icons/durian-logo.png" alt="Durian">
  <img class="template-brand-img template-brand-greenply" src="./icons/greenply-logo-invoice.png" alt="Greenply">
  <img class="template-brand-img template-brand-century" src="./icons/centuryply-logo-invoice.png" alt="CenturyPly">
 </div>
 <div class="template-banner">
  <svg class="banner-flourish flourish-left" viewBox="0 0 120 130" aria-hidden="true"><path d="M8 121C57 108 88 76 59 48 42 32 21 43 25 60c3 13 22 11 21 0-1-7-10-8-12-3M13 101c28-1 44-13 42-29-2-14-19-16-22-5-2 8 8 13 13 7M18 77c-2-23-15-33-12-51 2-11 12-14 20-8M48 122c-7-17-3-31 8-36 11-5 21 5 16 13-4 7-14 4-14-2M60 115c12-18 26-21 36-14 10 8 5 21-5 19-8-2-9-11-2-14M83 87c15-4 24-15 21-26-3-10-14-10-16-3-2 6 4 10 9 7M29 38c-10-16-8-27 1-30 9-2 14 8 7 13M78 108c14 4 24 1 27-7 3-9-6-15-12-10"/></svg>
  <svg class="banner-flourish flourish-right" viewBox="0 0 120 130" aria-hidden="true"><path d="M8 121C57 108 88 76 59 48 42 32 21 43 25 60c3 13 22 11 21 0-1-7-10-8-12-3M13 101c28-1 44-13 42-29-2-14-19-16-22-5-2 8 8 13 13 7M18 77c-2-23-15-33-12-51 2-11 12-14 20-8M48 122c-7-17-3-31 8-36 11-5 21 5 16 13-4 7-14 4-14-2M60 115c12-18 26-21 36-14 10 8 5 21-5 19-8-2-9-11-2-14M83 87c15-4 24-15 21-26-3-10-14-10-16-3-2 6 4 10 9 7M29 38c-10-16-8-27 1-30 9-2 14 8 7 13M78 108c14 4 24 1 27-7 3-9-6-15-12-10"/></svg>
  <div class="template-document-label">INVOICE</div>
  <div class="template-company">${esc(s.company)}</div>
  <div class="template-location">${esc(s.location)}</div>
 </div>
 <div class="template-customer-row">
  <div><b>Name :</b><span>${esc(editing.name)}</span></div>
  <div><b>Phone No. :</b><span>${esc(editing.phone)}</span></div>
  <div><b>Date:</b><span>${esc(editing.date)}</span></div>
  <div><b>Address :</b><span>${esc(editing.address)}</span></div>
  <div class="template-invoice-number"><b>Invoice#</b><span>${esc(number)}</span></div>
 </div>
 <div class="template-table-heading"><span>Description</span><span>Size</span><span>Pieces</span><span>Rate</span><span>Amount (₹)</span></div>
 <div class="template-table-body"><img class="template-watermark" src="./icons/tytan-logo-invoice.png" alt=""><div class="template-item-list">${rows}</div></div>
 <div class="template-total-row"><strong>Total</strong><span>${money(calc(editing.items))}</span></div>
 <div class="template-footer">
  <div class="template-work"><div class="template-work-title">Work Details</div><ul><li>Aluminum Doors & Windows</li><li>Glass Glazing Works</li><li>Designer & WPC Doors</li><li>Aluminum Partition Work</li><li>Aluminum Ledders</li><li>Hardware</li><li>Steel & Iron Railing</li></ul></div>
  <div class="template-proprietor"><strong>Proprietor: <span>${esc(s.proprietor)}</span></strong><div class="template-signature">Signature</div></div>
  <div class="template-terms"><div><b>Terms & damage:</b> Please inspect at delivery/installation; note visible damage on the receipt and notify us promptly with photos for inspection.</div><div><b>Warranty:</b> Manufacturer warranty, if provided, follows its warranty card. Retain this invoice for claims.</div><div><b>Legal:</b> Consumer rights and dispute forums remain subject to applicable law.</div></div>
  <div class="template-contact"><span>✉ <b>${esc(s.email)}</b></span><span>◉ <b>${esc(s.phone)}</b></span><span>◎ <b>${esc(s.website)}</b></span></div>
 </div>`;
}

function saveInvoice(){
 editing.name=$('customerName').value.trim();editing.phone=$('customerPhone').value.trim();editing.address=$('customerAddress').value.trim();editing.date=$('invoiceDate').value;
 if(!editing.name){toast('Customer name is required');return;}
 const existing=state.invoices.findIndex(x=>x.id===editing.id);
 const copy=JSON.parse(JSON.stringify(editing));copy.id=existing>=0?editing.id:crypto.randomUUID();copy.total=calc(copy.items);copy.updatedAt=new Date().toISOString();
 if(existing>=0)state.invoices[existing]=copy;else{state.invoices.unshift(copy);state.settings.nextNo=Number(state.settings.nextNo)+1;}
 editing.id=copy.id;editing.invoiceNo=copy.invoiceNo;editing.updatedAt=copy.updatedAt;editing.total=copy.total;
 saveState();queueInvoiceChange('upsert',copy);toast('Invoice saved on this device. Cloud sync will run when available.');refreshDashboard();
}
function editInvoice(id){const x=state.invoices.find(i=>i.id===id);if(!x)return;editing=JSON.parse(JSON.stringify(x));fillEditor();show('editor');}
function deleteInvoice(id){
 const invoice=state.invoices.find(item=>item.id===id&&!item.deletedAt);if(!invoice)return;
 if(!confirm('Mark this invoice as void? It stays on the server for your records and can be restored from Voided invoices.'))return;
 invoice.deletedAt=new Date().toISOString();invoice.updatedAt=invoice.deletedAt;
 saveState();queueInvoiceChange('delete',invoice);refreshDashboard();toast('Invoice marked void; its record is retained.');
}
function restoreInvoice(id){
 const invoice=state.invoices.find(item=>item.id===id&&item.deletedAt);if(!invoice)return;
 invoice.deletedAt=null;invoice.updatedAt=new Date().toISOString();
 saveState();queueInvoiceChange('upsert',invoice);refreshDashboard();toast('Invoice restored.');
}
function duplicateInvoice(id){const x=state.invoices.find(i=>i.id===id);if(!x)return;editing=JSON.parse(JSON.stringify(x));editing.id=null;editing.invoiceNo=nextInvoiceNo();editing.date=today();fillEditor();show('editor');}

function refreshDashboard(){
 const q=$('searchBox').value.toLowerCase(),from=$('fromDate').value,to=$('toDate').value;
 const list=state.invoices.filter(x=>Boolean(x.deletedAt)===showDeletedInvoices&&(!q||[x.invoiceNo,x.name,x.phone].join(' ').toLowerCase().includes(q))&&(!from||x.date>=from)&&(!to||x.date<=to));
 $('toggleDeletedBtn').textContent=showDeletedInvoices?'Back to invoices':'Show voided';
 $('invoiceTable').innerHTML=list.map(x=>`<tr><td>${esc(x.invoiceNo)}</td><td>${esc(x.date)}</td><td>${esc(x.name)}</td><td>${esc(x.phone)}</td><td>${money(x.total)}</td><td>${showDeletedInvoices?`<button class="action-btn" data-restore="${x.id}">Restore</button>`:`<button class="action-btn" data-edit="${x.id}">Edit</button><button class="action-btn" data-dup="${x.id}">Copy</button><button class="action-btn" data-share="${x.id}">Share</button><button class="action-btn" data-del="${x.id}">Void</button>`}</td></tr>`).join('')||'<tr><td colspan="6">No invoices found.</td></tr>';
 $('invoiceTable').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editInvoice(b.dataset.edit));
 $('invoiceTable').querySelectorAll('[data-dup]').forEach(b=>b.onclick=()=>duplicateInvoice(b.dataset.dup));
 $('invoiceTable').querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>shareExisting(b.dataset.share));
 $('invoiceTable').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteInvoice(b.dataset.del));
 $('invoiceTable').querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>restoreInvoice(b.dataset.restore));
 const now=today(),month=now.slice(0,7);
 const activeInvoices=state.invoices.filter(x=>!x.deletedAt);
 $('statInvoices').textContent=activeInvoices.length;
 $('statMonth').textContent=money(activeInvoices.filter(x=>x.date.startsWith(month)).reduce((a,x)=>a+x.total,0));
 $('statToday').textContent=money(activeInvoices.filter(x=>x.date===now).reduce((a,x)=>a+x.total,0));
}
async function shareExisting(id){const x=state.invoices.find(i=>i.id===id);if(!x)return;editing=JSON.parse(JSON.stringify(x));renderPreview();await exportMenu();}
function exportMenu(){$('invoicePreviewWrap').classList.remove('hidden');$('previewBtn').textContent='Hide Preview';$('exportDialog').showModal();}
async function canvas(){
 return html2canvas($('invoicePreview'),{
  scale:2,width:768,height:1086,windowWidth:768,windowHeight:1086,useCORS:true,backgroundColor:'#fff',
  onclone:documentClone=>{
   const invoice=documentClone.getElementById('invoicePreview');
   invoice.style.width='768px';invoice.style.height='1086px';invoice.style.maxWidth='none';invoice.style.aspectRatio='auto';
  }
 });
}
async function shareJPG(){
 const can=await canvas();
 const blob=await new Promise((resolve,reject)=>can.toBlob(file=>file?resolve(file):reject(new Error('Could not create invoice image.')),'image/jpeg',.95));
 const file=new File([blob],`${editing.invoiceNo}.jpg`,{type:'image/jpeg'});
 if(navigator.share&&navigator.canShare?.({files:[file]})){
  await navigator.share({title:editing.invoiceNo,text:'TYTAN DOOR Invoice',files:[file]});
 }else{
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.download=`${editing.invoiceNo}.jpg`;a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('JPG downloaded. You can share it from your files.');
 }
}
async function exportPDF(){const can=await canvas();const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});pdf.addImage(can.toDataURL('image/jpeg',.95),'JPEG',0,0,210,297);pdf.save(`${editing.invoiceNo}.pdf`);}
function exportExcel(){const rows=[['Invoice No.',editing.invoiceNo],['Date',editing.date],['Customer',editing.name],['Phone',editing.phone],['Address',editing.address],[],['Description','Size','Pieces','Rate','Amount (₹)']];editing.items.forEach(x=>rows.push([x.desc,x.size,x.pcs,x.rate,(Number(x.pcs)||0)*(Number(x.rate)||0)]));rows.push([],['TOTAL','','','',calc(editing.items)]);const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,'Invoice');XLSX.writeFile(wb,`${editing.invoiceNo}.xlsx`);}
async function selectExport(format){
 $('exportDialog').close();
 try{
  if(format==='jpg')await shareJPG();
  else if(format==='pdf')await exportPDF();
  else if(format==='xlsx')exportExcel();
 }catch(error){
  if(error.name!=='AbortError')toast(`Export failed: ${error.message}`);
 }
}
$('closeExportDialog').onclick=()=>$('exportDialog').close();
$('exportDialog').querySelectorAll('[data-export]').forEach(button=>button.onclick=()=>selectExport(button.dataset.export));
$('exportDialog').addEventListener('click',event=>{if(event.target===$('exportDialog'))$('exportDialog').close()});

function loadSettingsUI(){const s=state.settings;['company','location','phone','email','website','proprietor','prefix','nextNo'].forEach(k=>{const el=$('s'+k.charAt(0).toUpperCase()+k.slice(1));if(el)el.value=s[k]??''});}
$('newInvoiceBtn').onclick=openNew;$('backBtn').onclick=()=>{show('dashboard');refreshDashboard()};$('settingsBtn').onclick=()=>{loadSettingsUI();show('settings')};$('settingsBackBtn').onclick=()=>{show('dashboard');refreshDashboard()};
$('customerName').addEventListener('input',e=>{if(!editing)return;editing.name=e.target.value;renderPreview()});
$('customerPhone').addEventListener('input',e=>{if(!editing)return;editing.phone=e.target.value;renderPreview()});
$('customerAddress').addEventListener('input',e=>{if(!editing)return;editing.address=e.target.value;renderPreview()});
$('invoiceDate').addEventListener('input',e=>{if(!editing)return;editing.date=e.target.value;renderPreview()});
$('addItemBtn').onclick=()=>{if(editing.items.length>=10){toast('The invoice template supports up to 10 item rows');return}editing.items.push(blankItem());renderItems();renderPreview()};$('saveBtn').onclick=saveInvoice;$('shareBtn').onclick=exportMenu;
$('previewBtn').onclick=()=>{const wrap=$('invoicePreviewWrap'),opening=wrap.classList.contains('hidden');wrap.classList.toggle('hidden');$('previewBtn').textContent=opening?'Hide Preview':'Preview Invoice';if(opening)wrap.scrollIntoView({behavior:'smooth',block:'start'})};
['searchBox','fromDate','toDate'].forEach(id=>$(id).addEventListener('input',refreshDashboard));
$('clearFilters').onclick=()=>{$('searchBox').value='';$('fromDate').value='';$('toDate').value='';refreshDashboard()};
$('toggleDeletedBtn').onclick=()=>{showDeletedInvoices=!showDeletedInvoices;refreshDashboard()};
$('saveSettingsBtn').onclick=()=>{const s=state.settings;s.company=$('sCompany').value;s.location=$('sLocation').value;s.phone=$('sPhone').value;s.email=$('sEmail').value;s.website=$('sWebsite').value;s.proprietor=$('sProprietor').value;s.prefix=$('sPrefix').value;s.nextNo=Number($('sNextNo').value)||1;saveState();queueCompanyChange(s);renderPreviewIfEditing();toast('Settings saved on this device')};
function renderPreviewIfEditing(){if(editing)renderPreview()}

function setSyncStatus(text,kind='pending'){
 const el=$('syncStatus');if(!el)return;
 el.textContent=text;el.dataset.state=kind;
}
async function refreshStorageStatus(){
 const status=$('storageStatus');if(!status)return;
 if(!navigator.storage){status.textContent='Persistent storage controls are not supported by this browser.';return}
 try{
  const [persisted,estimate]=await Promise.all([navigator.storage.persisted(),navigator.storage.estimate()]);
  const used=Number(estimate.usage||0),quota=Number(estimate.quota||0);
  const format=n=>`${(n/1024/1024).toFixed(1)} MB`;
  status.textContent=`${persisted?'Persistent storage granted':'Storage may be cleared by the browser'} · ${format(used)} used${quota?` of ${format(quota)}`:''}`;
 }catch(error){status.textContent=`Could not check browser storage: ${error.message}`}
}
$('requestStorageBtn').onclick=async()=>{
 if(!navigator.storage?.persist){toast('Persistent storage is not supported by this browser');return}
 try{
  const granted=await navigator.storage.persist();
  await refreshStorageStatus();
  toast(granted?'Persistent storage enabled':'Browser did not grant persistent storage');
 }catch(error){toast(`Storage request failed: ${error.message}`)}
};
$('syncNowBtn').onclick=()=>window.syncInvoiceNow?.();
function updateConnectionStatus(){
 $('connectionStatus').textContent=navigator.onLine?'Online':'Offline · changes saved on this device';
 $('connectionStatus').dataset.state=navigator.onLine?'online':'offline';
}
window.addEventListener('online',()=>{updateConnectionStatus();window.syncInvoiceNow?.()});
window.addEventListener('offline',updateConnectionStatus);
updateConnectionStatus();refreshStorageStatus();

let installPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault();installPrompt=event;
});
$('authInstallBtn').onclick=async()=>{
 if(!installPrompt){toast('Open your browser menu and choose Install app or Add to Home Screen.');return}
 await installPrompt.prompt();
 const choice=await installPrompt.userChoice;
 if(choice.outcome==='accepted')toast('App installation started');
 installPrompt=null;
};
window.addEventListener('appinstalled',()=>toast('App installed'));
if('serviceWorker' in navigator&&location.protocol!=='file:'){
 navigator.serviceWorker.register('./service-worker.js').catch(error=>setSyncStatus(`Offline support unavailable: ${error.message}`,'error'));
}
refreshDashboard();
