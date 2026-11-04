import {supabase} from '@/lib/supabase';
export type StoreReleaseInput={p_order:string;p_expected_items:unknown[];p_indexes:number[];p_materials:{id:string;quantity:number;unit:string}[];p_mode:'confirm'|'release'};
export async function saveStoreRelease(staff:string,input:StoreReleaseInput){
 if(!staff)throw Error('Sign in before releasing Store items.');
 const scope=JSON.stringify({...input,p_materials:undefined,p_indexes:[...input.p_indexes].sort((a,b)=>a-b)},(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const key=`store-release:${staff}:${digest}`;
 const raw=localStorage.getItem(key);
 const request=raw?JSON.parse(raw):{...input,p_request:crypto.randomUUID()};
 if(!request.p_request||request.p_order!==input.p_order)throw Error('Saved Store release needs Admin review. It has not been removed.');
 if(!raw)localStorage.setItem(key,JSON.stringify(request));
 const {data,error}=await supabase.rpc('release_store_order_items_v1',request);
 if(error){if(error.code&&/^(P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501)$/.test(error.code)&&!error.message.includes('REQUEST_ALREADY_USED'))localStorage.removeItem(key);throw Error(error.message);}
 if(data?.source?.id!==input.p_order||!data?.released?.id||!Array.isArray(data.stock))throw Error('Store release confirmation is incomplete. Retry the same selection.');
 localStorage.removeItem(key);return data as {source:Record<string,unknown>;released:Record<string,unknown>;stock:{id:string;quantity:number}[]};
}
