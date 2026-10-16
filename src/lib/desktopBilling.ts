import {supabase} from './supabase';
import {useAuthStore} from '@/stores/authStore';
import {desktopSalesAvailable,desktopSalesCall} from '@/bakery/desktopSales';
export type BillFamily='SALES'|'TO'|'SNB'|'VRSNB'|'CAFE';
export type BillingAction={id:string;staffId:string;deviceId:string;leaseId:string|null;kind:'branch-sale'|'cafe-order'|'cafe-finalize'|'dispatch'|'hosur-dispatch';family:BillFamily;billNo:string;createdAt:string;key:string;rpc:string;args:Record<string,unknown>;receipt:Record<string,any>;sync?:{state:string;error?:string;result?:any};[key:string]:any};
type Capture={kind:BillingAction['kind'];family:BillFamily;key:string;rpc:string;args:Record<string,unknown>;receipt:Record<string,any>;fixedNumber?:string;[key:string]:any};
export type BillingSnapshot={deviceId:string;available:Record<BillFamily,number>;requests:Record<BillFamily,string>;backupFolder:string;actions:BillingAction[]};
export const automaticDesktopBilling=desktopSalesAvailable;
export async function billingSnapshot(){const user=useAuthStore.getState().currentUser;if(!user)throw Error('Sign in to access saved bills.');return desktopSalesCall<BillingSnapshot>('billing-snapshot',{staffId:user.id});}
const familiesFor=(role:string):BillFamily[]=>role==='planner'||role==='branch_hosur'?['SALES','TO']:role==='billing'||role==='order_taker'?['CAFE']:role==='branch_snb'?['SNB']:role==='branch_vrsnb'?['VRSNB']:[];
let preparing:Promise<void>|null=null;
export function maintainBillingNumbers(requested?:BillFamily[]){
 if(preparing)return preparing;
 preparing=(async()=>{const user=useAuthStore.getState().currentUser;if(!user||!automaticDesktopBilling()||!navigator.onLine)return;
  for(const family of requested??familiesFor(user.role)){const state=await billingSnapshot();if(state.available[family]>=100)continue;const{data,error}=await supabase.rpc('reserve_desktop_billing_numbers',{p_request_id:state.requests[family],p_device_id:state.deviceId,p_family:family});if(error)throw error;await desktopSalesCall('billing-pool',data);}
 })().finally(()=>{preparing=null;window.dispatchEvent(new Event('desktop-billing-changed'));});return preparing;
}
function networkFailure(error:any){return !navigator.onLine||['57014','08000','08003','08006'].includes(error?.code)||/failed to fetch|network|timeout|timed out|fetch failed|load failed|connection|AbortError/i.test(error?.message||String(error));}
export function projectBillingAction(action:BillingAction):any{
 const r=action.receipt;const number=Number(action.billNo.match(/\d+$/)?.[0]);
 if(action.kind==='branch-sale')return {billId:action.id,billNo:action.billNo,invoiceNo:number,total:r.total,subtotal:r.subtotal,discount:r.discount,tax:r.tax,pendingSync:true};
 if(action.kind==='dispatch')return {id:action.id,invoice_no:action.billNo,created_at:action.createdAt,paid_at:r.status==='unpaid'?null:action.createdAt,status:r.status||'paid'};
 if(action.kind==='hosur-dispatch')return {billNo:action.billNo,whatsappStatus:'failed',whatsappError:'Saved on this computer; WhatsApp will be sent after synchronization.',pendingSync:true};
 if(action.rpc==='complete_cafe_promotional_checkout_v2')return {...r,orderId:action.id,orderNumber:number,createdAt:action.createdAt,pendingSync:true,promotionDiscount:r.promotionDiscount||0,cashback:0};
 return {...r,id:action.args.p_order?(action.args.p_order as any).id:r.id,order_number:number,created_at:action.kind==='cafe-finalize'?(r.created_at||r.createdAt||action.createdAt):action.createdAt,updated_at:action.createdAt,pendingSync:true};
}
async function acknowledge(action:BillingAction,result:any){
 await desktopSalesCall('billing-status',{id:action.id,result:{state:'synced',result,error:null}});
 const state=await billingSnapshot();
 const relatedPending=state.actions.some(a=>a.id!==action.id&&a.family===action.family&&a.billNo===action.billNo&&a.sync?.state!=='synced');
 if(action.kind==='branch-sale'){
  const {useBranchOpsStore}=await import('@/branch/branchOpsStore');useBranchOpsStore.setState(s=>({bills:s.bills.map(b=>b.billNo===action.billNo?{...b,sourceBillId:result.billId,pendingSync:relatedPending,needsReprint:false}:b)}));
 }else if(action.family==='CAFE'){
  const {useOrderStore,dbRowToOrder}=await import('@/stores/orderStore');const {setCached}=await import('./localCache');
  const id=result.orderId||result.id;
  if(!relatedPending)useOrderStore.setState(s=>({orders:s.orders.map(o=>o.id===id||o.orderNumber===Number(action.billNo)?{...o,id,...(result.order_number?dbRowToOrder(result):{}),pendingSync:false,needsReprint:false}:o)}));
  const parentId=action.args.p_parent_id as string|undefined;
  if(parentId){const child=action.args.p_order as any;useOrderStore.setState(s=>({orders:s.orders.map(o=>o.id===parentId?{...o,balanceDue:0,fullyPaidAt:child.created_at,balanceOrderId:id,balancePaymentType:child.payment_type,balancePaidBy:child.created_by,updatedAt:child.updated_at,pendingSync:false}:o)}));}
  await setCached('orders_v1',useOrderStore.getState().orders);
 }
 window.dispatchEvent(new Event('desktop-billing-changed'));
}
export async function uploadBillingAction(action:BillingAction){
 if(useAuthStore.getState().currentUser?.id!==action.staffId)throw Error('Sign back in as the staff member who recorded this bill to synchronize it.');
 const {sync:_,backupError:_backup,...payload}=action;
 const {data,error}=await supabase.rpc('sync_desktop_billing_action',{p_action:payload});
 if(error){await desktopSalesCall('billing-status',{id:action.id,result:{state:'pending',error:error.message}});throw error;}
 const number=action.family==='CAFE'?String(data?.orderNumber??data?.order_number??''):String(data?.billNo??data?.invoice_no??'');
 const serverId=action.kind==='branch-sale'?data?.billId:data?.orderId??data?.id;
 if(!data||!serverId||number!==action.billNo||Number(data.total)!==Number(action.receipt.total)){
  const message='Server confirmation differs from the printed bill. It remains saved for review.';
  await desktopSalesCall('billing-status',{id:action.id,result:{state:'pending',error:message}});throw Error(message);
 }
 await acknowledge(action,data);return data;
}
export function desktopCheckoutIdentity(scope:string){
 const staff=useAuthStore.getState().currentUser?.id||'';const name='desktop-checkout:'+staff+':'+scope;
 let value=automaticDesktopBilling()?localStorage.getItem(name):null;if(!value){value=crypto.randomUUID();if(automaticDesktopBilling())localStorage.setItem(name,value);}return value;
}
export function finishDesktopCheckout(scope:string){if(automaticDesktopBilling())localStorage.removeItem('desktop-checkout:'+(useAuthStore.getState().currentUser?.id||'')+':'+scope);}
export async function captureDesktopBill(input:Capture):Promise<{action:BillingAction;data:any;pending:boolean}>{
 const user=useAuthStore.getState().currentUser;if(!user)throw Error('Sign in before billing.');
 let state=await billingSnapshot();
 if(!input.fixedNumber&&!state.available[input.family]&&navigator.onLine){await maintainBillingNumbers([input.family]);state=await billingSnapshot();}
 const action=await desktopSalesCall<BillingAction>('billing-capture',{...input,staffId:user.id});
 window.dispatchEvent(new Event('desktop-billing-saved'));
 const previous=(await billingSnapshot()).actions.find(a=>a.id===action.id)?.sync;
 if(previous?.state==='synced')return {action,data:previous.result,pending:false};
 if(navigator.onLine)void syncBillingActions();
 // A dropped network does not change the number or erase the receipt; the exact same immutable payload is retried.
 return {action,data:projectBillingAction(action),pending:true};
}
let syncing:Promise<void>|null=null;
export function syncBillingActions(){
 if(syncing)return syncing;
 syncing=(async()=>{
  if(!automaticDesktopBilling()||!navigator.onLine)return;
  const state=await billingSnapshot();const staffId=useAuthStore.getState().currentUser?.id;const blockedOrders=new Set<string>();
  for(const action of state.actions.filter(a=>a.sync?.state==='pending')){
   if(useAuthStore.getState().currentUser?.id!==staffId)break;
   const orderId=String((action.args.p_order as any)?.id||action.args.p_order_id||action.receipt.id||action.id);
   if(blockedOrders.has(orderId)||blockedOrders.has(String(action.args.p_parent_id||'')))continue;
   try{await uploadBillingAction(action);}catch(error){blockedOrders.add(orderId);if(networkFailure(error)&&((error as any)?.code!=='57014'))break;}
  }
 })().finally(()=>{syncing=null;});return syncing;
}

export async function restoreBillingActions(){
 const state=await billingSnapshot();
 const latest=new Map<string,BillingAction>();for(const a of state.actions)latest.set(a.family+':'+a.billNo,a);
 const branch=[...latest.values()].filter(a=>a.kind==='branch-sale');
 if(branch.length){
  const {useBranchOpsStore}=await import('@/branch/branchOpsStore');if(!useBranchOpsStore.persist.hasHydrated())await useBranchOpsStore.persist.rehydrate();
  for(const a of branch){const existing=useBranchOpsStore.getState().bills.find(b=>b.billNo===a.billNo);if(existing&&!existing.pendingSync&&a.sync?.state==='synced')continue;
   const bill={...existing,...a.receipt,id:existing?.id||a.id,billNo:a.billNo,invoiceNo:Number(a.billNo.match(/\d+$/)?.[0]),createdAt:a.receipt.createdAt||a.createdAt,pendingSync:a.sync?.state!=='synced',sourceBillId:a.sync?.result?.billId||a.receipt.sourceBillId||existing?.sourceBillId,status:'Original Bill',source:'counter',printCount:existing?.printCount||0};
   useBranchOpsStore.setState(s=>({bills:[bill as any,...s.bills.filter(b=>b.billNo!==a.billNo)]}));
  }
 }
 const cafe=[...latest.values()].filter(a=>a.family==='CAFE');
 if(cafe.length){
  const {useOrderStore,dbRowToOrder,hydrateCachedCafeOrders}=await import('@/stores/orderStore');const {setCached}=await import('./localCache');
  await hydrateCachedCafeOrders();
  for(const a of cafe){
   const existing=useOrderStore.getState().orders.find(o=>o.orderNumber===Number(a.billNo));
   if(existing&&!existing.pendingSync&&a.sync?.state==='synced')continue;
   const r=a.receipt;const value=a.sync?.state==='synced'&&a.sync.result?a.sync.result:projectBillingAction(a);
   const order=a.rpc==='server-confirmed'?{...r,id:r.id,orderNumber:Number(a.billNo)}:a.rpc==='complete_cafe_promotional_checkout_v2'?{...r,id:value.orderId||a.id,orderNumber:Number(a.billNo),status:'served',paymentType:r.paymentMode,createdBy:a.args.p_biller,createdAt:a.createdAt,updatedAt:a.createdAt,orderSource:'staff'}:dbRowToOrder(value);
   useOrderStore.setState(s=>({orders:[...s.orders.filter(o=>o.id!==order.id&&o.orderNumber!==order.orderNumber),{...order,pendingSync:a.sync?.state!=='synced'} as any]}));
  }
  // A balance receipt settles its parent locally too, so a refresh cannot offer the same balance for payment again.
  for(const a of state.actions.filter(a=>a.family==='CAFE'&&a.args.p_parent_id)){
   const child=a.args.p_order as any;const parentId=a.args.p_parent_id as string;const id=a.sync?.result?.id||child.id;
   useOrderStore.setState(s=>({orders:s.orders.map(o=>o.id===parentId&&(a.sync?.state!=='synced'||o.pendingSync||!o.balanceOrderId)?{...o,balanceDue:0,fullyPaidAt:child.created_at,balanceOrderId:id,balancePaymentType:child.payment_type,balancePaidBy:child.created_by,updatedAt:child.updated_at,pendingSync:a.sync?.state!=='synced'}:o)}));
  }
  await setCached('orders_v1',useOrderStore.getState().orders);
 }
}

export async function archiveDesktopConfirmedBill(family:BillFamily,billNo:string,receipt:Record<string,any>){
 if(!automaticDesktopBilling())return;
 const staffId=useAuthStore.getState().currentUser?.id;if(!staffId)throw Error('Sign in to save the bill backup.');
 await desktopSalesCall('billing-archive',{staffId,family,billNo,receipt});window.dispatchEvent(new Event('desktop-billing-saved'));
}

export async function overlayPendingDesktopDispatches(orders:import('@/bakery/types').BakeryOrder[]){
 if(!automaticDesktopBilling())return orders;
 const state=await billingSnapshot();const actions=state.actions.filter(a=>a.kind==='dispatch'&&a.sync?.state!=='synced').flatMap(a=>(a.dispatchActions||[]).map((d:any)=>({...d,branch:a.receipt.scope,dispatchedAt:a.createdAt,dispatchedBy:a.receipt.dispatchedBy})));
 const {advanceDispatchComplete}=await import('@/bakery/advanceDispatchProgress');
 return orders.map(order=>{const own=actions.filter((a:any)=>a.orderId===order.id);if(!own.length)return order;const dispatchLog=[...(order.dispatchLog||[])];for(const a of own)if(!dispatchLog.some(d=>d.id===a.dispatchEntryId))dispatchLog.push({...a,id:a.dispatchEntryId});const next={...order,dispatchLog};if(/^[A-Za-z]+-ADV-/.test(order.notes||''))next.status=advanceDispatchComplete(next)?'dispatched':'produced';return next;});
}

export async function reprintDesktopBill(id:string){
 const state=await billingSnapshot();const a=state.actions.find(r=>r.id===id);if(!a)throw Error('Open this Planner sale in the pending sales list to reprint it.');
 if(a.kind==='dispatch'){
  const {printDispatchInvoice}=await import('@/bakery/dispatchInvoice');await printDispatchInvoice({...a.receipt,id:a.sync?.result?.id||a.id,invoiceNo:a.billNo,createdAt:a.createdAt,dispatchEntryIds:a.receipt.dispatchEntryIds||[],returnLog:[],originalItems:null,cancelledAt:null,cancelledBy:null,cancelledReason:null} as any,'thermal');return;
 }
 if(a.kind==='branch-sale'){
  const {printCounterBill}=await import('@/branch/printUtils');await printCounterBill({...a.receipt,id:a.id,billNo:a.billNo,createdAt:a.createdAt,status:'Original Bill',printCount:1,pendingSync:a.sync?.state!=='synced'} as any,true);return;
 }
 const {useOrderStore,dbRowToOrder}=await import('@/stores/orderStore');const r=a.receipt;const order=useOrderStore.getState().orders.find(o=>o.orderNumber===Number(a.billNo))||{...dbRowToOrder(projectBillingAction(a)),orderNumber:Number(a.billNo),createdAt:a.createdAt};
 const {printPaidBill,printCreditBill,printAdvanceSalesSlip}=await import('@/pages/BillingDashboard');
 if(order.paymentType==='advance'){printAdvanceSalesSlip(order,r.customerPhone||'',order.createdAt,order.billedBy||order.createdBy);return;}
 if(order.paymentType==='credit'){await printCreditBill(order,r.customerPhone||'',r.dueDate||'');return;}
 await printPaidBill(order,'duplicate');
}
