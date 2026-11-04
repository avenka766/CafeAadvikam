import {supabase} from '@/lib/supabase';
export type CustomDeductionRequest={request:string;items:{id:string;quantity:number;unit:string}[];reason:string};
const key=(staff:string)=>`store-custom-deduction:${staff}`;
export function pendingCustomDeduction(staff:string):CustomDeductionRequest|null{
 const raw=localStorage.getItem(key(staff));if(!raw)return null;
 const value=JSON.parse(raw) as CustomDeductionRequest;
 if(!value?.request||!Array.isArray(value.items)||!value.items.length||!value.reason)throw Error('The saved deduction request needs Admin review. It has not been removed.');
 return value;
}
export async function saveCustomDeduction(staff:string,input?:Omit<CustomDeductionRequest,'request'>){
 if(!staff)throw Error('Sign in before recording a deduction.');
 let request=pendingCustomDeduction(staff);
 if(!request){if(!input)throw Error('No saved deduction request was found.');request={...input,request:crypto.randomUUID()};localStorage.setItem(key(staff),JSON.stringify(request));}
 const {data,error}=await supabase.rpc('record_store_custom_deduction_v1',{p_request:request.request,p_items:request.items,p_reason:request.reason});
 if(error){
  // Validation failures roll back the database transaction. Transport failures remain pending.
  if(error.code&&/^(P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501)$/.test(error.code))localStorage.removeItem(key(staff));
  throw Error(error.message);
 }
 if(data?.batch_id!==request.request||!Array.isArray(data.rows)||!data.rows.length)throw Error('Deduction confirmation is incomplete. Retry the saved request.');
 localStorage.removeItem(key(staff));return data.rows as Record<string,unknown>[];
}
