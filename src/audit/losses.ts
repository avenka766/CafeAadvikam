import type {AuditRaw,AuditSnapshot,AuditSourceId} from './sources';
import {auditDay} from './finance';
const unit=(value:unknown)=>{const v=String(value||'').trim().toLowerCase();return ['kg','kgs','kilogram','kilograms'].includes(v)?{kind:'weight',factor:1}:['g','gm','gms','gram','grams'].includes(v)?{kind:'weight',factor:.001}:['pcs','pc','nos','no','piece','pieces'].includes(v)?{kind:'pieces',factor:1}:null;};
const nameKey=(value:unknown)=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
export function buildAuditLosses(snapshot:AuditSnapshot){
 const data=(id:AuditSourceId)=>snapshot[id]?.rows||[];const rows:AuditRaw[]=[];
 const existing=new Set<string>();
 const add=(r:AuditRaw,source:string,kind:string,patch:AuditRaw={})=>{const id=String(r.id??r.record_id);const key=`${r.branch}:${kind}:${id}`;if(existing.has(key))return;existing.add(key);rows.push({id:`${source}:${id}`,source,branch:r.branch,barcode:r.item_barcode??r.itemBarcode,date:auditDay(r.created_at||r.createdAt||r.adjusted_at),type:kind,reference:r.report_no||r.reportNo||r.reference_no||`${kind} · ${r.item_name||r.itemName||'Stock'}`,item:r.item_name||r.itemName||'',quantity:r.quantity??r.delta??null,unit:r.unit||'',system:r.system_qty??r.systemQty??r.old_quantity??null,physical:r.physical_qty??r.physicalQty??r.new_quantity??null,difference:r.difference??r.delta??null,reason:r.reason||r.notes||'',status:r.cancelled_at?'Cancelled':r.status||'Recorded',verifiedBy:r.verified_by||r.verifiedBy||r.confirmed_by||r.confirmedBy||'',recordedBy:r.created_by_username||r.createdBy||r.reported_by||r.reportedBy||r.adjusted_by||'',destination:r.destination||'',plannerReceived:r.planner_received_at?'Received':r.destination?'Awaiting receipt':'',...patch});};
 data('waste_logs').forEach(r=>add(r,'waste_logs',r.log_type||'Waste'));
 data('stock_variances').forEach(r=>add(r,'stock_variances','Variation',{status:'Confirmed'}));
 data('stock_counts').forEach(r=>(Array.isArray(r.lines)?r.lines:[]).forEach((line:AuditRaw,index:number)=>add({...r,...line,id:`${r.id}:${index}`,reportNo:r.report_no},'stock_counts','Stock count')));
 data('stock_adjustments').forEach(r=>add(r,'stock_adjustments','Adjustment'));
 for(const r of data('operations')){
  const p=r.payload||{};const canonicalType=r.record_type==='waste_log'?'waste_logs':r.record_type==='stock_count_report'?'stock_counts':r.record_type==='stock_variance'?'stock_variances':null;if(!canonicalType)continue;
  if(data(canonicalType).some(c=>String(c.id)===String(r.record_id)||String(c.id)===String(p.id)))continue;
  const merged={...p,id:p.id||r.record_id||r.id,branch:r.branch,created_at:p.createdAt||r.created_at};
  if(canonicalType==='stock_counts') (Array.isArray(p.lines)?p.lines:[]).forEach((line:AuditRaw,index:number)=>add({...merged,...line,id:`${merged.id}:${index}`},'operations','Stock count'));
  else if(canonicalType==='stock_variances'){
   if(rows.some(c=>c.type==='Variation'&&c.branch===r.branch&&c.reference===p.reportNo&&c.item===p.itemName&&c.unit===(p.unit||'')))continue;
   add(merged,'operations','Variation',{status:'Confirmed'});
  }else add(merged,'operations',p.logType||'Waste');
 }
 // Index prices once: large physical-count reports contain thousands of item lines.
 const byName=new Map<string,AuditRaw[]>();const byBarcode=new Map<string,AuditRaw[]>();
 for(const c of data('loss_catalog')){const kind=unit(c.uom)?.kind;if(!kind)continue;const nk=`${c.branch}|${nameKey(c.name)}|${kind}`;const bk=`${c.branch}|${c.barcode}|${kind}`;byName.set(nk,[...(byName.get(nk)||[]),c]);byBarcode.set(bk,[...(byBarcode.get(bk)||[]),c]);}
 // One unambiguous exact barcode or name + compatible unit. Never guess across different products or units.
 for(const r of rows){const u=unit(r.unit);const matches=u?(r.barcode!=null?byBarcode.get(`${r.branch}|${r.barcode}|${u.kind}`):byName.get(`${r.branch}|${nameKey(r.item)}|${u.kind}`))||[]:[];const catalog=matches.length===1?matches[0]:null;const cu=unit(catalog?.uom);const price=catalog?.price!=null&&Number.isFinite(Number(catalog.price))&&Number(catalog.price)>=0&&u&&cu?Number(catalog.price)*u.factor/cu.factor:null;r.unitPrice=price;r.priceBasis=price==null?'No unambiguous matching price':'Current selling price estimate';r.priceUpdated=catalog?.updated_at||'';const active=!/cancel|void|reject/i.test(r.status);const lost=['Dump','Damage'].includes(r.type)?Math.max(0,Number(r.quantity)||0):r.type==='Variation'?Math.max(0,-Number(r.difference)||0):null;r.lossValue=price!=null&&lost!=null?(active?Math.round(lost*price*100)/100:0):null;r.signedValue=r.type==='Variation'&&price!=null?Math.round(Number(r.difference)*price*100)/100:null;}
 const grouped=new Map<string,AuditRaw>();for(const r of rows){if(/cancel|void|reject/i.test(r.status)||!['Dump','Damage','Trans Out','Variation'].includes(r.type))continue;const key=`${r.branch}|${r.type}|${r.unit}`;const own=grouped.get(key)||{id:key,branch:r.branch,type:r.type,unit:r.unit,records:0,quantity:0,lossValue:0,unpriced:0};own.records++;own.quantity+=Number(r.type==='Variation'?r.difference:r.quantity)||0;own.lossValue+=Number(r.lossValue)||0;if(r.unitPrice==null)own.unpriced++;grouped.set(key,own);}
 return {rows,summary:[...grouped.values()]};
}
