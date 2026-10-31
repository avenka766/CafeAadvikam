import {expect,it} from 'vitest';
import {AUDIT_SOURCES,type AuditSnapshot,type AuditRaw} from './sources';
import {auditWorkbook} from './export';
import {buildAuditLosses} from './losses';
import {auditReference} from './references';
const snapshot=(parts:Record<string,AuditRaw[]>):AuditSnapshot=>Object.fromEntries(AUDIT_SOURCES.map(s=>[s.id,{rows:parts[s.id]||[],status:'ready',error:''}]));
const date='2026-10-22T05:00:00Z';
it('includes every source, clickable contents targets, branch sales, spending and detailed loss sheets',()=>{
 const data=snapshot({branch_bills:[{id:'b',branch:'SNB',bill_no:'SNB-1',total:100,created_at:date,status:'original',bill_type:'credit'}],branch_items:[{id:'i',bill_id:'b',item_name:'Sweet',quantity:2,unit:'pcs',unit_price:50,line_total:100}],operations:[{id:'e',branch:'SNB',record_type:'expense',created_at:date,payload:{amount:20,description:'Transport'}}],waste_logs:[{id:'w',branch:'VRSNB',log_type:'Damage',item_name:'Bread',quantity:2,unit:'pcs',created_at:date}]});
 const sheets=auditWorkbook(data,'2026-10-22','2026-10-22','All');
 expect(sheets[0].name).toBe('Contents');expect(new Set(sheets.map(s=>s.name)).size).toBe(sheets.length);
 expect(sheets[0].rows.map(r=>r.sheet)).toEqual(sheets.slice(1).map(s=>s.name));
 for(const source of AUDIT_SOURCES)expect(sheets.some(s=>s.name===source.id.slice(0,31))).toBe(true);
 expect(sheets.find(s=>s.name==='Sales SNB')?.rows[0]).toMatchObject({reference:'SNB-1',revenue:100});
 expect(sheets.find(s=>s.name==='Sales VRSNB')?.rows).toHaveLength(0);
 expect(sheets.find(s=>s.name==='Sales item details')?.rows[0]).toMatchObject({reference:'SNB-1',item:'Sweet',quantity:2,lineAmount:100});
 expect(sheets.find(s=>s.name==='Expenses')?.rows[0]).toMatchObject({expense:20,party:'Transport'});
 expect(sheets.find(s=>s.name==='VRSNB Dump and damage')?.rows[0]).toMatchObject({item:'Bread',quantity:2});
 expect(sheets.every(s=>s.name.length<=31)).toBe(true);
});
it('retains cancelled waste for inspection, excludes it from losses and counts mirrors once with separate units',()=>{
 const data=snapshot({waste_logs:[{id:'w',branch:'SNB',log_type:'Dump',quantity:2,unit:'pcs'},{id:'c',branch:'SNB',log_type:'Damage',quantity:8,unit:'pcs',cancelled_at:date}],stock_variances:[{id:'v',branch:'VRSNB',report_no:'COUNT-1',item_name:'Sweet',unit:'kg',difference:-.5}],stock_counts:[{id:'cnt',branch:'SNB',report_no:'COUNT-2',status:'pending',lines:[{itemName:'Bread',unit:'pcs',systemQty:5,physicalQty:3,difference:-2}]}],operations:[{id:'mirror',branch:'SNB',record_type:'waste_log',record_id:'w',payload:{id:'w',logType:'Dump',quantity:2,unit:'pcs'}}]});
 const result=buildAuditLosses(data);expect(result.rows).toHaveLength(4);expect(result.summary).toHaveLength(2);expect(result.summary).toEqual(expect.arrayContaining([expect.objectContaining({branch:'SNB',type:'Dump',unit:'pcs',quantity:2}),expect.objectContaining({branch:'VRSNB',type:'Variation',unit:'kg',quantity:-.5})]));
 expect(result.rows.find(r=>r.type==='Stock count')).toMatchObject({status:'pending',difference:-2});
});
it('uses enriched parent invoice numbers outside the period and never labels internal keys as documents',()=>{
 const id='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
 expect(auditReference('snb_purchase_items',{id,audit_document_number:'SUP-240'},{})).toBe('SUP-240');
 expect(auditReference('operations',{id:'expense-1',record_id:'expense-1',record_no:'expense-1',record_type:'expense',created_at:date,payload:{id:'expense-1'}},{})).toBe('expense · 2026-10-22');
 expect(auditReference('branch_items',{id,bill_id:id,audit_document_number:'SNB-411'},{})).toBe('SNB-411');
});
it('keeps final Planner advance sales and older-order receipts in sales sheets so summary totals reconcile',()=>{
 const s=snapshot({planner_advances:[{id:'paid',fy_seq:'ADV/1',total:1000,advance_amount:300,status:'paid',created_at:'2026-10-01T05:00:00Z',paid_at:date},{id:'advance',fy_seq:'ADV/2',total:500,advance_amount:100,status:'advance',created_at:date}]});
 const book=auditWorkbook(s,'2026-10-22','2026-10-22','All');const all=book.find(s=>s.name==='Sales All')!.rows;
 expect(all.reduce((sum,r)=>sum+Number(r.revenue),0)).toBe(1000);expect(all.reduce((sum,r)=>sum+Number(r.cashIn),0)).toBe(800);expect(book.find(s=>s.name==='Sales Planner')!.rows).toHaveLength(2);
});
it('labels current selling-price loss estimates, converts grams and never guesses across branches, units or ambiguous matches',()=>{
 const s=snapshot({loss_catalog:[{id:'p',branch:'SNB',name:'Sweet',uom:'Kgs',price:400},{id:'b',branch:'SNB',name:'Bread',uom:'Nos',price:40},{id:'x1',branch:'SNB',name:'Ambiguous',uom:'Nos',price:10},{id:'x2',branch:'SNB',name:'Ambiguous',uom:'Nos',price:20}],waste_logs:[{id:'g',branch:'SNB',item_name:'Sweet',unit:'g',quantity:500,log_type:'Damage'},{id:'bad-unit',branch:'SNB',item_name:'Sweet',unit:'pcs',quantity:2,log_type:'Dump'},{id:'branch',branch:'VRSNB',item_name:'Bread',unit:'pcs',quantity:2,log_type:'Dump'},{id:'amb',branch:'SNB',item_name:'Ambiguous',unit:'pcs',quantity:2,log_type:'Damage'},{id:'cancelled',branch:'SNB',item_name:'Bread',unit:'pcs',quantity:3,log_type:'Dump',cancelled_at:date},{id:'transfer',branch:'SNB',item_name:'Bread',unit:'pcs',quantity:3,log_type:'Trans Out'}],stock_variances:[{id:'gain',branch:'SNB',item_name:'Bread',unit:'pcs',difference:2},{id:'loss',branch:'SNB',item_name:'Bread',unit:'pcs',difference:-3}]});
 const r=buildAuditLosses(s);expect(r.rows.find(x=>x.id==='waste_logs:g')).toMatchObject({unitPrice:.4,lossValue:200,priceBasis:'Current selling price estimate'});
 for(const id of ['bad-unit','branch','amb'])expect(r.rows.find(x=>x.id==='waste_logs:'+id)?.lossValue).toBeNull();
 expect(r.rows.find(x=>x.id==='waste_logs:cancelled')?.lossValue).toBe(0);expect(r.rows.find(x=>x.id==='waste_logs:transfer')?.lossValue).toBeNull();expect(r.rows.find(x=>x.id==='stock_variances:gain')).toMatchObject({lossValue:0,signedValue:80});expect(r.rows.find(x=>x.id==='stock_variances:loss')).toMatchObject({lossValue:120,signedValue:-120});
});
