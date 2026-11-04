import {supabase} from '@/lib/supabase';
import {useAuthStore} from '@/stores/authStore';
type Input={p_invoice:Record<string,any>;p_hosur:Record<string,any>|null;p_cakes:Record<string,any>[]};
const stable=(v:unknown)=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const inFlight=new Map<string,{payload:string;promise:Promise<any>}>();
export function pendingRegularDispatch(orderIds:string[]):Input|null{
 const staff=useAuthStore.getState().currentUser?.id;if(!staff)return null;
 for(let i=0;i<localStorage.length;i++){
  const key=localStorage.key(i);if(!key?.startsWith(`web-dispatch:${staff}:`))continue;
  const saved=JSON.parse(localStorage.getItem(key)||'null');
  if(saved?.p_invoice?.p_regular_actions?.some((a:any)=>orderIds.includes(a.orderId))){const {p_request,...input}=saved;return input;}
 }return null;
}
export function webDispatchIdentity(scope:string):string{
 const staff=useAuthStore.getState().currentUser?.id;if(!staff)throw Error('Sign in before dispatching.');
 const key=`web-dispatch-identity:${staff}:${scope}`;let id=localStorage.getItem(key);
 if(!id){id=crypto.randomUUID();localStorage.setItem(key,id);}return id;
}
export function finishWebDispatchIdentity(scope:string){const staff=useAuthStore.getState().currentUser?.id;localStorage.removeItem(`web-dispatch-identity:${staff}:${scope}`);}
export function saveWebDispatch(input:Input):Promise<any>{
 const staff=useAuthStore.getState().currentUser?.id;if(!staff)return Promise.reject(Error('Sign in before dispatching.'));
 const identity=input.p_invoice.p_regular_actions?.length?['regular',input.p_invoice.p_regular_actions.map((a:any)=>a.dispatchEntryId).sort()]:input.p_hosur?['hosur',input.p_hosur.orderId,input.p_hosur.targets]:['cake',input.p_cakes.map(c=>c.id).sort()];
 const key=`web-dispatch:${staff}:${stable(identity)}`;
 if(input.p_invoice.p_regular_actions?.length){
  try{
   const pending=pendingRegularDispatch(input.p_invoice.p_regular_actions.map((a:any)=>a.orderId));
   if(pending&&stable(pending.p_invoice.p_regular_actions.map((a:any)=>a.dispatchEntryId).sort())!==stable(input.p_invoice.p_regular_actions.map((a:any)=>a.dispatchEntryId).sort()))return Promise.reject(Error('A previous dispatch for this order needs confirmation. Use Recover saved dispatch before sending another batch.'));
  }catch(cause){return Promise.reject(cause);}
 }
 const existing=inFlight.get(key);if(existing)return existing.payload===stable(input)?existing.promise:Promise.reject(Error('This dispatch is already being saved with different details.'));
 const work=(async()=>{
  const raw=localStorage.getItem(key);const request=raw?JSON.parse(raw):{...input,p_request:crypto.randomUUID()};
  const {p_request,...saved}=request;
  if(!p_request||stable(saved)!==stable(input))throw Error('A saved dispatch is awaiting confirmation. Retry its original details before changing this dispatch.');
  if(!raw)localStorage.setItem(key,JSON.stringify(request));
  const {data,error}=await supabase.rpc('commit_dispatch_workflow_once_v1',request);
  if(error){
   if(error.code&&/^(P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501)$/.test(error.code)&&!/ALREADY_USED|ALREADY_SAVED/.test(error.message))localStorage.removeItem(key);
   throw Error(error.code?error.message:'Dispatch confirmation was lost. Its details are saved; retry before sending another batch.');
  }
  if(!data?.id||!data.invoice_no||Number(data.total)!==Number(input.p_invoice.p_total))throw Error('Dispatch confirmation is incomplete. The saved request is retained for recovery.');
  localStorage.removeItem(key);return data;
 })().finally(()=>inFlight.delete(key));inFlight.set(key,{payload:stable(input),promise:work});return work;
}
