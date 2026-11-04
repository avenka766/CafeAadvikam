import {supabase} from '@/lib/supabase';
export type StockCorrectionRequest={p_request:string;p_args:Record<string,unknown>;storageKey:string};
export function prepareStockCorrection(staff:string,args:Record<string,unknown>):StockCorrectionRequest{
 if(!staff)throw Error('Sign in before correcting stock.');
 const storageKey=`branch-stock-correction:${staff}:${JSON.stringify(args)}`,raw=localStorage.getItem(storageKey);
 const request=raw?JSON.parse(raw):{p_request:crypto.randomUUID(),p_args:args,storageKey};
 if(!request.p_request||request.storageKey!==storageKey)throw Error('Saved stock correction needs review.');
 if(!raw)localStorage.setItem(storageKey,JSON.stringify(request));return request;
}
export async function executeStockCorrection(request:StockCorrectionRequest|undefined){
 if(!request?.p_request)return {data:null,error:{message:'This older stock correction needs reconciliation before replay; it may already have been applied.'}};
 const {data,error}=await supabase.rpc('correct_branch_stock_once_v1',{p_request:request.p_request,p_args:request.p_args});
 if(error){
  if(error.code&&/^(P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501)$/.test(error.code)&&!error.message.includes('REQUEST_ALREADY_USED'))localStorage.removeItem(request.storageKey);
  return {data:null,error};
 }
 if(!data?.stock?.id||!Number.isFinite(Number(data.after)))return {data:null,error:{message:'Stock correction confirmation is incomplete. Retry the same request.'}};
 localStorage.removeItem(request.storageKey);return {data,error:null};
}
