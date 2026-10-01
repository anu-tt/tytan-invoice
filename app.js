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
let toastTimer;
function toast(t,duration=2200){$('toast').textContent=t;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),duration);}
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
 appConfirm({title:'Void this invoice?',message:`${invoice.invoiceNo} will leave the active list but remain in your records. You can restore it from Voided invoices.`,confirmText:'Void invoice',onConfirm:()=>{invoice.deletedAt=new Date().toISOString();invoice.updatedAt=invoice.deletedAt;saveState();queueInvoiceChange('delete',invoice);refreshDashboard();toast('Invoice marked void; its record is retained.')}});
}
let appConfirmAction=null;
function appConfirm({title,message,confirmText='Continue',onConfirm}){$('appConfirmTitle').textContent=title;$('appConfirmMessage').textContent=message;$('acceptAppConfirm').textContent=confirmText;appConfirmAction=onConfirm;$('appConfirmDialog').showModal()}
function closeAppConfirm(accept){const dialog=$('appConfirmDialog');dialog.close();const action=appConfirmAction;appConfirmAction=null;if(accept)action?.()}
let pendingPermanentDeleteId=null;
function permanentlyDeleteInvoice(id){
 const invoice=state.invoices.find(item=>item.id===id&&item.deletedAt);if(!invoice)return;
 pendingPermanentDeleteId=id;$('deleteInvoiceNumber').textContent=invoice.invoiceNo;$('deleteInvoiceConfirm').value='';$('confirmPermanentDelete').disabled=true;$('deleteInvoiceDialog').showModal();$('deleteInvoiceConfirm').focus();
}
function confirmPermanentDelete(){
 const id=pendingPermanentDeleteId,invoice=state.invoices.find(item=>item.id===id&&item.deletedAt);
 if(!invoice||$('deleteInvoiceConfirm').value.trim()!=='DELETE')return;
 state.invoices=state.invoices.filter(item=>item.id!==id);
 saveState();queueInvoiceChange('permanent-delete',invoice);refreshDashboard();toast('Invoice removed here; permanent cloud deletion will sync when online.');
 pendingPermanentDeleteId=null;$('deleteInvoiceDialog').close();
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
 $('invoiceTable').innerHTML=list.map(x=>`<tr><td>${esc(x.invoiceNo)}</td><td>${esc(x.date)}</td><td>${esc(x.name)}</td><td>${esc(x.phone)}</td><td>${money(x.total)}</td><td>${showDeletedInvoices?`<button class="action-btn" data-restore="${x.id}">Restore</button><button class="action-btn danger" data-permanent-delete="${x.id}">Delete permanently</button>`:`<button class="action-btn" data-edit="${x.id}">Edit</button><button class="action-btn" data-dup="${x.id}">Copy</button><button class="action-btn" data-share="${x.id}">Share</button><button class="action-btn" data-del="${x.id}">Void</button>`}</td></tr>`).join('')||'<tr><td colspan="6">No invoices found.</td></tr>';
 $('invoiceTable').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editInvoice(b.dataset.edit));
 $('invoiceTable').querySelectorAll('[data-dup]').forEach(b=>b.onclick=()=>duplicateInvoice(b.dataset.dup));
 $('invoiceTable').querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>shareExisting(b.dataset.share));
 $('invoiceTable').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteInvoice(b.dataset.del));
 $('invoiceTable').querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>restoreInvoice(b.dataset.restore));
$('invoiceTable').querySelectorAll('[data-permanent-delete]').forEach(b=>b.onclick=()=>permanentlyDeleteInvoice(b.dataset.permanentDelete));
 const now=today(),month=now.slice(0,7);
 const activeInvoices=state.invoices.filter(x=>!x.deletedAt);
 $('statInvoices').textContent=activeInvoices.length;
 $('statMonth').textContent=money(activeInvoices.filter(x=>x.date.startsWith(month)).reduce((a,x)=>a+x.total,0));
 $('statToday').textContent=money(activeInvoices.filter(x=>x.date===now).reduce((a,x)=>a+x.total,0));
}
async function shareExisting(id){const x=state.invoices.find(i=>i.id===id);if(!x)return;editing=JSON.parse(JSON.stringify(x));renderPreview();await exportMenu();}
function exportMenu(){$('invoicePreviewWrap').classList.remove('hidden');$('previewBtn').textContent='Hide Preview';$('exportDialog').showModal();}
async function canvas(){
 if(typeof html2canvas!=='function')throw new Error('Invoice image renderer did not load. Check your connection and try again.');
 await document.fonts?.ready;
 const images=[...$('invoicePreview').querySelectorAll('img')];
 await Promise.all(images.map(image=>image.decode?.().catch(()=>{})||Promise.resolve()));
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
async function exportPDF(){
 if(!window.jspdf?.jsPDF)throw new Error('PDF export library did not load. Check your connection and try again.');
 const can=await canvas(),pdf=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
 const pageWidth=210,pageHeight=297,ratio=can.height/can.width,imageHeight=pageWidth*ratio,top=(pageHeight-imageHeight)/2;
 pdf.addImage(can.toDataURL('image/jpeg',.98),'JPEG',0,top,pageWidth,imageHeight,undefined,'FAST');pdf.save(`${editing.invoiceNo}.pdf`);toast('Preview saved as PDF.');
}
function exportExcel(){
 if(!window.XLSX?.utils)throw new Error('Spreadsheet export library did not load. Check your connection and try again.');
 const X=window.XLSX,rows=[
  ['TYTAN DOOR','DURIAN','GREENPLY','CENTURYPLY',''],
  [state.settings.company,'','','',''],[state.settings.location,'','','',''],
  ['Name:',editing.name,'Phone No.:',editing.phone,'Date: '+editing.date],
  ['Address:',editing.address,'','','Invoice#: '+String(editing.invoiceNo||'').replace(state.settings.prefix||'','')],
  ['','','','',''],
  ['Description','Size','Pieces','Rate (₹)','Amount (₹)']
 ];
 for(let i=0;i<10;i++){const item=editing.items[i],pcs=Number(item?.pcs)||0,rate=Number(item?.rate)||0;rows.push(item?[item.desc,item.size,pcs,rate,{t:'n',v:pcs*rate,f:`C${8+i}*D${8+i}`}]:['','','','',''])}
 rows.push(['','','','Total',{t:'n',v:calc(editing.items),f:'SUM(E8:E17)'}]);
 rows.push(['','','','','']);
 rows.push(['Work Details','','','','Proprietor: '+state.settings.proprietor]);
 rows.push(['Aluminum Doors & Windows','','','','Signature']);
 rows.push(['Glass Glazing Works','','','','']);
 rows.push(['Designer & WPC Doors','','','','']);
 rows.push(['Aluminum Partition Work','','','','']);
 rows.push(['Aluminum Ledders','','','','']);
 rows.push(['Hardware','','','','']);
 rows.push(['Steel & Iron Railing','','','','']);
 rows.push(['','','','','']);
 rows.push(['Terms & damage: Please inspect at delivery/installation; note visible damage and notify us promptly.','','','','']);
 rows.push(['Warranty: Manufacturer warranty, if provided, follows its warranty card.','','','','']);
 rows.push(['Legal: Consumer rights and dispute forums remain subject to applicable law.','','','','']);
 rows.push([`${state.settings.email}  ·  ${state.settings.phone}  ·  ${state.settings.website}`,'','','','']);
 const ws=X.utils.aoa_to_sheet(rows),navy='22354C',red='B62935',pale='F4F6FA',line='D9DFE7',white='FFFFFF',dark='263448';
 ws['!cols']=[{wch:34},{wch:14},{wch:12},{wch:16},{wch:24}];
 ws['!rows']=[{hpt:28},{hpt:32},{hpt:21},{hpt:24},{hpt:24},{hpt:10},{hpt:26},...Array.from({length:10},()=>({hpt:24})),{hpt:28},{hpt:10},{hpt:23},...Array.from({length:7},()=>({hpt:21})),{hpt:10},{hpt:30},{hpt:24},{hpt:24},{hpt:25}];
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:0}},{s:{r:0,c:1},e:{r:0,c:1}},{s:{r:0,c:2},e:{r:0,c:2}},{s:{r:0,c:3},e:{r:0,c:4}},{s:{r:1,c:0},e:{r:1,c:4}},{s:{r:2,c:0},e:{r:2,c:4}},{s:{r:4,c:1},e:{r:4,c:3}},{s:{r:19,c:0},e:{r:19,c:1}},{s:{r:19,c:3},e:{r:19,c:4}},{s:{r:20,c:0},e:{r:20,c:1}},{s:{r:21,c:0},e:{r:21,c:1}},{s:{r:22,c:0},e:{r:22,c:1}},{s:{r:23,c:0},e:{r:23,c:1}},{s:{r:24,c:0},e:{r:24,c:1}},{s:{r:25,c:0},e:{r:25,c:1}},{s:{r:26,c:0},e:{r:26,c:1}},{s:{r:28,c:0},e:{r:28,c:4}},{s:{r:29,c:0},e:{r:29,c:4}},{s:{r:30,c:0},e:{r:30,c:4}},{s:{r:31,c:0},e:{r:31,c:4}}];
  const border={style:'thin',color:{rgb:line}},setStyle=(range,style)=>{for(let r=range.s.r;r<=range.e.r;r++)for(let c=range.s.c;c<=range.e.c;c++){const address=X.utils.encode_cell({r,c});if(ws[address])ws[address].s={...(ws[address].s||{}),...style}}};
  setStyle({s:{r:0,c:0},e:{r:0,c:4}},{font:{bold:true,color:{rgb:red},sz:13},alignment:{horizontal:'center',vertical:'center'}});
  setStyle({s:{r:1,c:0},e:{r:1,c:4}},{font:{bold:true,color:{rgb:navy},sz:20},alignment:{horizontal:'center',vertical:'center'}});
  setStyle({s:{r:2,c:0},e:{r:2,c:4}},{font:{color:{rgb:'647184'},sz:11},alignment:{horizontal:'center'}});
  setStyle({s:{r:3,c:0},e:{r:4,c:4}},{font:{color:{rgb:dark},sz:11},alignment:{vertical:'center',wrapText:true},border:{bottom:border}});
  setStyle({s:{r:6,c:0},e:{r:6,c:4}},{font:{bold:true,color:{rgb:white},sz:12},fill:{fgColor:{rgb:navy}},alignment:{horizontal:'center',vertical:'center'},border:{top:border,bottom:border}});
  setStyle({s:{r:7,c:0},e:{r:16,c:4}},{font:{color:{rgb:dark},sz:10},alignment:{vertical:'center',wrapText:true},border:{bottom:border}});
  setStyle({s:{r:17,c:0},e:{r:17,c:4}},{font:{bold:true,color:{rgb:navy},sz:12},fill:{fgColor:{rgb:pale}},border:{top:border,bottom:border},alignment:{vertical:'center'}});
  setStyle({s:{r:19,c:0},e:{r:19,c:4}},{font:{bold:true,color:{rgb:white},sz:11},fill:{fgColor:{rgb:navy}},alignment:{vertical:'center'}});
  setStyle({s:{r:20,c:0},e:{r:26,c:4}},{font:{color:{rgb:dark},sz:10},alignment:{vertical:'center'}});
  setStyle({s:{r:28,c:0},e:{r:30,c:4}},{font:{color:{rgb:'697588'},sz:8},alignment:{wrapText:true,vertical:'center'}});
  setStyle({s:{r:31,c:0},e:{r:31,c:4}},{font:{bold:true,color:{rgb:red},sz:10},alignment:{horizontal:'center',vertical:'center'}});
  for(let r=7;r<=17;r++){for(let c=2;c<=4;c++){const cell=ws[X.utils.encode_cell({r,c})];if(cell)cell.z=c===2?'0':'₹#,##0.00'}if(r<17&&r%2===0)setStyle({s:{r,c:0},e:{r,c:4}},{fill:{fgColor:{rgb:'F7F9FC'}}})}
  ws['!pageSetup']={orientation:'portrait',paperSize:9,fitToWidth:1,fitToHeight:1};ws['!margins']={left:.2,right:.2,top:.25,bottom:.25,header:0,footer:0};
  const wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,'Invoice');X.writeFile(wb,`${editing.invoiceNo}.xlsx`);toast('Invoice spreadsheet saved.');
}
async function selectExport(format){
 $('exportDialog').close();
 $('exportLoadingText').textContent=format==='pdf'?'Creating your invoice PDF…':format==='xlsx'?'Building your invoice spreadsheet…':'Preparing your invoice image…';$('exportLoading').classList.remove('hidden');
 const exportButton=document.querySelector(`[data-export="${format}"]`);if(exportButton){exportButton.disabled=true;exportButton.setAttribute('aria-busy','true')}
 try{
  if(format==='jpg')await shareJPG();
  else if(format==='pdf')await exportPDF();
  else if(format==='xlsx')exportExcel();
 }catch(error){
  if(error.name!=='AbortError')toast(`Export failed: ${error.message}`);
 }finally{if(exportButton){exportButton.disabled=false;exportButton.removeAttribute('aria-busy')}$('exportLoading').classList.add('hidden')}
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
$('deleteInvoiceConfirm').addEventListener('input',event=>{$('confirmPermanentDelete').disabled=event.target.value.trim()!=='DELETE'});
$('cancelPermanentDelete').onclick=()=>{$('deleteInvoiceDialog').close();pendingPermanentDeleteId=null};
$('confirmPermanentDelete').onclick=confirmPermanentDelete;
$('saveSettingsBtn').onclick=()=>{const s=state.settings;s.company=$('sCompany').value;s.location=$('sLocation').value;s.phone=$('sPhone').value;s.email=$('sEmail').value;s.website=$('sWebsite').value;s.proprietor=$('sProprietor').value;s.prefix=$('sPrefix').value;s.nextNo=Number($('sNextNo').value)||1;saveState();queueCompanyChange(s);renderPreviewIfEditing();toast('Settings saved on this device')};
$('restartInvoiceNumberBtn').onclick=()=>appConfirm({title:'Restart invoice numbering?',message:'The next number will start at 1. Existing invoice numbers stay unchanged, and already-used numbers will be skipped.',confirmText:'Restart numbering',onConfirm:()=>{const s=state.settings;s.nextNo=1;$('sNextNo').value='1';saveState();queueCompanyChange(s);toast('Next invoice number reset to 1. Cloud sync will update when available.')}});
$('cancelAppConfirm').onclick=()=>closeAppConfirm(false);
$('acceptAppConfirm').onclick=()=>closeAppConfirm(true);
$('appConfirmDialog').addEventListener('click',event=>{if(event.target===$('appConfirmDialog'))closeAppConfirm(false)});
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
let pwaShellReady=Promise.resolve(false);
window.addEventListener('beforeinstallprompt',event=>{
 event.preventDefault();installPrompt=event;
});
$('authInstallBtn').onclick=async()=>{
 const button=$('authInstallBtn');
 button.disabled=true;button.classList.add('is-loading');button.textContent='Preparing download…';
 try{
  if(installPrompt){
   const promptEvent=installPrompt;installPrompt=null;
   const promptResult=promptEvent.prompt();
   const choice=await promptEvent.userChoice;
   await promptResult;
   toast(choice.outcome==='accepted'?'TYTAN BILLBOOK installation started':'Installation cancelled');
   return;
  }
  if(!window.isSecureContext)throw new Error('App installation requires the secure HTTPS Vercel address.');
  if(!('serviceWorker' in navigator))throw new Error('This browser does not support app installation.');
  if(!await pwaShellReady)throw new Error('The app could not prepare its offline files. Reload the page and try again.');
  const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  if(standalone){toast('TYTAN BILLBOOK is already installed.');return}
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const message=ios?'In Safari, tap Share, then Add to Home Screen.':/Android/i.test(navigator.userAgent)?'In Chrome, open ⋮ and choose Install app or Add to Home screen.':'In Chrome or Edge, open the ⋮ menu and choose Install TYTAN BILLBOOK.';
  toast(message,7000);
 }catch(error){toast(`Install could not start: ${error.message}`)}
 finally{button.disabled=false;button.classList.remove('is-loading');button.textContent='Download App'}
};
window.addEventListener('appinstalled',()=>toast('App installed'));
if('serviceWorker' in navigator&&location.protocol!=='file:'){
 pwaShellReady=navigator.serviceWorker.register('./service-worker.js').then(()=>navigator.serviceWorker.ready).then(()=>true).catch(error=>{setSyncStatus(`Offline support unavailable: ${error.message}`,'error');return false});
}
refreshDashboard();
