import {useAuthStore} from '@/stores/authStore';
import {supabase} from '@/lib/supabase';
import {isElectronApp} from '@/lib/platform';
import {closingStockItemSlug} from './itemMatcher';
import type {WalkinBillRow,saveWalkinBillSecure} from './dispatchInvoice';
export type DesktopSaleInput=Parameters<typeof saveWalkinBillSecure>[0];
export type LocalSale=WalkinBillRow & {staffId:string;leaseId:string;deviceId:string;stockSlug?:string;inputHash:string;backupError?:string;sync?:{state:'pending'|'synced';error?:string|null}};
export type DesktopSnapshot={deviceId:string;requestId:string;backupFolder:string;available:number;receipts:LocalSale[];cache:{catalog?:unknown[];counter?:{date:string;isOpen:boolean}};draft:Record<string,unknown>|null};
export const desktopSalesAvailable=()=>isElectronApp()&&!!window.cafeAadvikamDesktop?.sales;
export async function desktopSalesCall<T>(operation:string,payload?:unknown):Promise<T>{
 const bridge=window.cafeAadvikamDesktop?.sales;
 if(!desktopSalesAvailable()||!bridge)throw new Error('Desktop sales storage is unavailable.');
 return await bridge(operation,payload) as T;
}
export const desktopSalesSnapshot=(staffId:string)=>desktopSalesCall<DesktopSnapshot>('snapshot',{staffId});
export async function prepareDesktopSales(staffId:string){
 const state=await desktopSalesSnapshot(staffId);
 if(state.available>=20)return state;
 const {data,error}=await supabase.rpc('reserve_desktop_planner_sales',{p_request_id:state.requestId,p_device_id:state.deviceId});
 if(error)throw error;
 await desktopSalesCall('lease',data);
 return desktopSalesSnapshot(staffId);
}
export function saveDesktopSale(input:DesktopSaleInput,staffId:string,id:string){
 return desktopSalesCall<LocalSale>('save',{...input,staffId,id,items:input.items.map(i=>({...i,...(i.unit!=='charge'?{stockSlug:closingStockItemSlug(i.itemName)}:{})}))});
}
let flushing:Promise<void>|null=null;
export function syncDesktopSales(staffId:string){
 if(flushing)return flushing;
 flushing=(async()=>{
   const state=await desktopSalesSnapshot(staffId);let firstError:unknown;
   for(const entry of state.receipts.filter(r=>r.sync?.state!=='synced').sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||Number(a.billNo.split('/').pop())-Number(b.billNo.split('/').pop()))){
     if(useAuthStore.getState().currentUser?.id!==staffId)break;
     const {sync:_sync,backupError:_backup,...receipt}=entry;
     const {data,error}=await supabase.rpc('sync_desktop_planner_sale',{p_receipt:receipt}).single();
     if(error){await desktopSalesCall('sync',{id:receipt.id,result:{state:'pending',error:error.message}});firstError??=error;if(!navigator.onLine||/network|connection|failed to fetch|fetch failed/i.test(error.message))break;continue;}
     const saved=data as Record<string,unknown>|null;
     if(!saved || saved.id!==receipt.id || saved.bill_no!==receipt.billNo || Number(saved.total)!==receipt.total){const error=new Error('Server confirmation does not match the local receipt. It remains pending.');await desktopSalesCall('sync',{id:receipt.id,result:{state:'pending',error:error.message}});firstError??=error;continue;}
     await desktopSalesCall('sync',{id:receipt.id,result:{state:'synced',error:null}});
   }
   if(firstError)throw firstError;
 })().finally(()=>{flushing=null;window.dispatchEvent(new Event('desktop-sales-changed'));});
 return flushing;
}
