import {supabase} from '@/lib/supabase';
import {useAuthStore} from '@/stores/authStore';
import {useBakeryStore} from './bakeryStore';
import {closingStockItemSlug} from './itemMatcher';
import type {DispatchInvoiceRecord,DispatchInvoiceItem} from './dispatchInvoice';

const stable=(value:unknown)=>JSON.stringify(value,(_key,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const running=new Map<string,{intent:string;promise:Promise<Record<string,unknown>>}>();
export function hasPendingDispatchInvoiceRevision(invoiceId:string):boolean{
 const staff=useAuthStore.getState().currentUser?.id;return !!staff&&!!localStorage.getItem(`dispatch-invoice-revision:${staff}:${invoiceId}`);
}
export function reviseDispatchInvoice(record:DispatchInvoiceRecord,action:'edit'|'return'|'cancel',change:{items?:DispatchInvoiceItem[];discountPct?:number;isGstInvoice?:boolean;gstSupplyType?:'intra'|'inter';returns?:{itemName:string;unit:string;qty:number}[]},reason='Invoice correction'):Promise<Record<string,unknown>>{
 const staff=useAuthStore.getState().currentUser?.id;if(!staff)return Promise.reject(Error('Sign in before correcting an invoice.'));
 const key=`dispatch-invoice-revision:${staff}:${record.id}`,intent=stable({action,change,reason});
 const inFlight=running.get(key);if(inFlight)return inFlight.intent===intent?inFlight.promise:Promise.reject(Error('This invoice is already being corrected.'));
 const promise=(async()=>{
  if(localStorage.getItem(`branch-transfer-cancel:${staff}:${record.id}`))throw Error('A cancellation needs confirmation first. Retry that cancellation before editing this invoice.');
  const raw=localStorage.getItem(key),saved=raw?JSON.parse(raw):null;
  if(saved&&saved.intent!==intent)throw Error('A previous correction needs confirmation. Retry its original details before changing this invoice again.');
  let request=saved?.request;
  if(!request){
   const slugs:Record<string,string>={};
   for(const item of record.items)slugs[`item:${item.itemName.trim().toLowerCase()}|${item.unit}`]=closingStockItemSlug(item.itemName);
   if(action!=='return'&&['SNB','VRSNB'].includes(record.scope)&&record.dispatchEntryIds.length){
    await useBakeryStore.getState().fetchOrders(true,true);
    for(const ref of record.dispatchEntryIds){const entry=useBakeryStore.getState().orders.find(o=>o.id===ref.orderId)?.dispatchLog?.find(e=>e.id===ref.dispatchEntryId);if(entry)slugs[ref.dispatchEntryId]=closingStockItemSlug(entry.itemName);}
   }
   request={p_request:crypto.randomUUID(),p_invoice:record.id,p_expected:{items:record.items,total:record.total,discountPct:record.discountPct,status:record.status,dispatchEntryIds:record.dispatchEntryIds,isGstInvoice:record.isGstInvoice,gstSupplyType:record.gstSupplyType,returnLog:record.returnLog},p_action:action,p_change:change,p_slugs:slugs,p_reason:reason};
   localStorage.setItem(key,JSON.stringify({intent,request}));
  }
  const {data,error}=await supabase.rpc('revise_dispatch_invoice_once_v1',request);
  if(error){
   if(error.code==='PGRST202')throw Error('The invoice correction update is not installed on the server. Nothing was changed. The correction is saved for retry after installation.');
   if(error.code&&/^(P000[123]|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501)$/.test(error.code))localStorage.removeItem(key);
   throw Error(error.code?error.message:'Correction confirmation was lost. Retry the same details; the original request is saved.');
  }
  if(data?.id!==record.id||!['paid','unpaid','cancelled'].includes(data.status))throw Error('The correction confirmation is incomplete. Retry the saved correction.');
  localStorage.removeItem(key);
  if(typeof window!=='undefined')window.dispatchEvent(new Event('dispatch-invoices-changed'));
  void useBakeryStore.getState().fetchOrders(true,true).catch(cause=>console.warn('Corrected invoice refresh failed',cause));
  return data;
 })().finally(()=>running.delete(key));running.set(key,{intent,promise});return promise;
}
