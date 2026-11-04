import {supabase} from '@/lib/supabase';
export type CreditActionRequest={p_request:string;p_action:'collect'|'discount'|'create';p_args:Record<string,unknown>;storageKey:string};
export function prepareCreditAction(staff:string,action:CreditActionRequest['p_action'],args:Record<string,unknown>):CreditActionRequest{
 if(!staff)throw Error('Sign in before recording a credit payment or discount.');
 const scope=JSON.stringify(args,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 const storageKey=`branch-credit-action:${staff}:${action}:${scope}`,raw=localStorage.getItem(storageKey);
 const request=raw?JSON.parse(raw):{p_request:crypto.randomUUID(),p_action:action,p_args:action==='create'?{...args,p_created_at:new Date().toISOString()}:args,storageKey};
 if(!request.p_request||request.p_action!==action||request.storageKey!==storageKey)throw Error('Saved credit request needs review. It has not been removed.');
 if(!raw)localStorage.setItem(storageKey,JSON.stringify(request));return request;
}
export async function executeCreditAction(request:CreditActionRequest|undefined){
 if(!request?.p_request)return {data:null,error:{message:'This older queued credit action needs reconciliation before replay; it may already have been recorded.'}};
 const {data,error}=await supabase.rpc('branch_credit_action_once_v1',{p_request:request.p_request,p_action:request.p_action,p_args:request.p_args});
 if(error){
  if(error.code&&/^(P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501)$/.test(error.code)&&!error.message.includes('REQUEST_ALREADY_USED'))localStorage.removeItem(request.storageKey);
  return {data:null,error};
 }
 if((request.p_action==='collect'&&!data?.paymentId)||(request.p_action==='discount'&&data?.id!==request.p_args.p_credit_sale_id)||(request.p_action==='create'&&data?.id!==request.p_request))return {data:null,error:{message:'Credit confirmation is incomplete. Retry the same request.'}};
 localStorage.removeItem(request.storageKey);return {data,error:null};
}
