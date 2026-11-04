import {supabase} from '@/lib/supabase';
import type {CakeAdvanceOrder} from './branchOpsStore';
export type AdvanceCreationInput={p_order:Record<string,any>;p_receiver:boolean};
const stable=(value:unknown)=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const keyFor=(staff:string,branch:string)=>`advance-creation:${staff}:${branch}`;
const running=new Map<string,Promise<CakeAdvanceOrder>>();
export function pendingAdvanceCreation(staff:string,branch:string):AdvanceCreationInput|null{
 try{const raw=localStorage.getItem(keyFor(staff,branch));if(!raw)return null;const {p_request,...input}=JSON.parse(raw);return p_request&&input.p_order?.branch===branch?input:null;}catch{return null;}
}
export function finishAdvanceCreation(staff:string,branch:string){localStorage.removeItem(keyFor(staff,branch));}
export function saveAdvanceCreation(staff:string,input:AdvanceCreationInput):Promise<CakeAdvanceOrder>{
 if(!staff)return Promise.reject(Error('Sign in before collecting an advance.'));
 const branch=input.p_order.branch,key=keyFor(staff,branch);
 const work=(async()=>{
  const raw=localStorage.getItem(key),request=raw?JSON.parse(raw):{...input,p_request:crypto.randomUUID()};
  const {p_request,...saved}=request;
  if(!p_request||stable(saved)!==stable(input))throw Error('A previous advance is awaiting confirmation. Recover that saved advance before starting another order.');
  if(running.has(key))return running.get(key)!;
  if(!raw)localStorage.setItem(key,JSON.stringify(request));
  const {data,error}=await supabase.rpc('create_branch_advance_once_v1',request);
  if(error){
   if(error.code&&/^(P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501)$/.test(error.code)&&!/ALREADY_USED|REQUIRES_RECONCILIATION/.test(error.message))localStorage.removeItem(key);
   throw Error(error.code?error.message:'Advance confirmation was lost. Recover the saved advance before collecting any payment again.');
  }
  const order=data?.order;
  if(!order?.id||order.id!==p_request||!String(order.orderNo||'').startsWith(`${branch}-ADV-`)||Number(data.initialOrderValue??order.orderValue)!==Number(input.p_order.orderValue)||Number(data.initialAdvanceAmount??order.advanceAmount)!==Number(input.p_order.advanceAmount)||![order.orderValue,order.advanceAmount].every(v=>Number.isFinite(Number(v))&&Number(v)>=0)||!Array.isArray(order.items))throw Error('Advance confirmation is incomplete. Recover the saved advance; do not collect payment again.');
  // Retain the request until the screen has accepted the order and reset its form.
  return order as CakeAdvanceOrder;
 })().finally(()=>{if(running.get(key)===work)running.delete(key);});
 if(!running.has(key))running.set(key,work);return work;
}
