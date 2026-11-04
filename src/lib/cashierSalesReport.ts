import type {BranchBillRecord, ReturnRecord} from '@/branch/branchOpsStore';
export interface CashierPayment {
 id: string; bill_id?: string | null; bill_no?: string | null; created_at: string;
 payment_mode: string; payment_purpose: string; amount: number | string;
 cashier_username?: string | null; collected_by?: string | null; counter_session_id?: string | null;
}
export function buildCashierSalesRows(bills: BranchBillRecord[], returns: ReturnRecord[], payments: CashierPayment[], sessions: {id:string;cashier_username:string|null}[]) {
 const map=new Map<string,{name:string;grossSales:number;discount:number;returns:number;netSales:number;bills:number;cash:number;upi:number;card:number;credit:number;creditCollected:number;advance:number;advanceBalance:number;sessions:number;totalAmount:number}>();
 const sessionIds=new Map<string,Set<string>>();
 const rowFor=(name?:string|null)=>{
  const label=name?.trim()||'Legacy / Unattributed';
  if(!map.has(label))map.set(label,{name:label,grossSales:0,discount:0,returns:0,netSales:0,bills:0,cash:0,upi:0,card:0,credit:0,creditCollected:0,advance:0,advanceBalance:0,sessions:0,totalAmount:0});
  return map.get(label)!;
 };
 const session=(name:string,id?:string|null)=>{if(!id)return;const ids=sessionIds.get(name)||new Set<string>();ids.add(id);sessionIds.set(name,ids);};
 sessions.forEach(s=>{const row=rowFor(s.cashier_username);session(row.name,s.id);});
 const upfront=new Map<string,number>();
 for(const p of payments)if(p.bill_id&&p.payment_purpose==='credit_upfront')upfront.set(p.bill_id,(upfront.get(p.bill_id)||0)+Number(p.amount));
 for(const b of bills){const row=rowFor(b.biller);row.grossSales+=b.total;row.discount+=b.discount;row.bills++;if(b.paymentMode==='credit')row.credit+=Math.max(0,b.total-(upfront.get(b.id)||0));session(row.name,b.counterSessionId);}
 for(const r of returns){const row=rowFor(r.returnedBy);row.returns+=r.total;session(row.name,r.counterSessionId);if(!/credit|adjustment/i.test(r.returnPayMode||r.originalPaymentMode||''))row.totalAmount-=r.refundAmount??r.total;}
 const seen=new Set<string>();
 for(const p of payments){
  if(seen.has(p.id))throw new Error('Cashier payment appeared more than once. Reload before exporting.');seen.add(p.id);
  const row=rowFor(p.cashier_username||p.collected_by);const amount=Number(p.amount)||0;session(row.name,p.counter_session_id);
  if(['bill_collection','credit_upfront','advance_balance'].includes(p.payment_purpose)){
   if(p.payment_mode==='cash')row.cash+=amount;if(p.payment_mode==='upi')row.upi+=amount;if(p.payment_mode==='card')row.card+=amount;
   if(p.payment_purpose==='advance_balance')row.advanceBalance+=amount;
   row.totalAmount+=amount;
  } else if(p.payment_purpose==='credit_settlement'){row.creditCollected+=amount;row.totalAmount+=amount;}
  else if(p.payment_purpose==='advance_paid'){row.advance+=amount;row.totalAmount+=amount;}
 }
 return [...map.values()].map(row=>({...row,netSales:row.grossSales-row.returns,sessions:sessionIds.get(row.name)?.size||0})).sort((a,b)=>b.netSales-a.netSales);
}
