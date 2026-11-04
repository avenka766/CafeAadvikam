import {supabase} from '@/lib/supabase';
import {useAuthStore} from '@/stores/authStore';
import {closingStockItemSlug} from './itemMatcher';
const running=new Map<string,Promise<Record<string,unknown>>>();
export function confirmPackingReturn(row:{id:string;item_name:string},quantity:number,remarks:string):Promise<Record<string,unknown>>{
 const staff=useAuthStore.getState().currentUser?.id;if(!staff)return Promise.reject(Error('Sign in before confirming a return.'));
 const key=`packing-return:${staff}:${row.id}`;if(running.has(key))return running.get(key)!;
 const promise=(async()=>{
  const raw=localStorage.getItem(key);const request=raw?JSON.parse(raw):{p_id:row.id,p_received_quantity:quantity,p_remarks:remarks.trim()||null,p_stock_slug:closingStockItemSlug(row.item_name)};
  if(!raw)localStorage.setItem(key,JSON.stringify(request));
  const {data,error}=await supabase.rpc('confirm_packing_return_once_v1',request);
  if(error){if(error.code==='PGRST202')throw Error('The safe return update is not installed on the server yet. Nothing was confirmed. Your request is saved for retry.');
   if(error.code&&/^(P000[123]|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501)$/.test(error.code))localStorage.removeItem(key);
   throw Error(error.code?error.message:'Return confirmation was lost. Retry; the original received quantity is saved.');}
  if(data?.id!==row.id||data.status!=='posted')throw Error('Return confirmation is incomplete. Retry the saved return before recording it again.');
  localStorage.removeItem(key);return data;
 })().finally(()=>running.delete(key));running.set(key,promise);return promise;
}
