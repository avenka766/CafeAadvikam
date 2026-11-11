import {supabase} from '@/lib/supabase';
import {useAuthStore} from '@/stores/authStore';
import {closingStockItemSlug} from './itemMatcher';
import type {DispatchInvoiceRecord,DispatchInvoiceItem} from './dispatchInvoice';
const stable=(v:unknown)=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const running=new Map<string,{intent:string;promise:Promise<any>}>();
export const sampleRefundMethods = {
 cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer', other: 'Other',
} as const;
export type SampleRefund = {
 amount: number;
 method: keyof typeof sampleRefundMethods;
 reference: string;
 confirmed: true;
 restock: boolean;
};
export function changeSampleInvoice(record:DispatchInvoiceRecord,action:'pay'|'edit'|'cancel',change:{items?:DispatchInvoiceItem[];discountPct?:number;refund?:SampleRefund}={},reason=''):Promise<any>{
 const staff=useAuthStore.getState().currentUser?.id;if(!staff)return Promise.reject(Error('Sign in before changing this invoice.'));
 const key=`sample-invoice:${staff}:${record.id}`,intent=stable({action,change,reason});
 const inFlight=running.get(key);if(inFlight)return inFlight.intent===intent?inFlight.promise:Promise.reject(Error('This invoice is already being saved.'));
 const promise=(async()=>{
  const raw=localStorage.getItem(key),saved=raw?JSON.parse(raw):null;
  if(saved&&saved.intent!==intent)throw Error('A previous invoice change needs confirmation. Retry its original details first.');
  const request=saved?.request||{p_request:crypto.randomUUID(),p_invoice:record.id,p_expected:{items:record.items,total:record.total,discountPct:record.discountPct,status:record.status},p_action:action,p_change:change,p_old_slugs:record.items.map(i=>closingStockItemSlug(i.itemName)),p_new_slugs:(change.items||[]).map(i=>closingStockItemSlug(i.itemName)),p_reason:reason};
  if(!saved)localStorage.setItem(key,JSON.stringify({intent,request}));
  const {data,error}=await supabase.rpc('change_sample_invoice_atomic_v1',request);
  if(error){if(error.code&&/^(P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501)$/.test(error.code))localStorage.removeItem(key);throw Error(error.code?error.message:'Invoice confirmation was lost. Retry the same action; its details are saved.');}
  if(data?.id!==record.id||!['unpaid','paid','cancelled'].includes(data.status))throw Error('Invoice confirmation is incomplete. Retry the saved action before making another change.');
  localStorage.removeItem(key);return data;
 })().finally(()=>running.delete(key));running.set(key,{intent,promise});return promise;
}
