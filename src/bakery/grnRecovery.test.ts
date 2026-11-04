import {beforeEach,expect,it,vi} from 'vitest';import {webcrypto} from 'node:crypto';
const m=vi.hoisted(()=>({saved:null as any,failedLookup:false,creates:0}));
vi.mock('@/stores/authStore',()=>({useAuthStore:{getState:()=>({currentUser:{id:'fixture',role:'store'}})}}));
vi.mock('@/lib/offlineQueue',()=>({useOfflineQueueStore:{},registerReplayHandler:vi.fn()}));
vi.mock('@/lib/supabase',()=>({fetchAllRows:vi.fn(),supabase:{rpc:async(name:string,p:any)=>{if(name==='create_store_invoice_secure'){m.creates++;m.saved={id:'fixture-grn',invoice_number:p.p_invoice_number,synced_to_stock:true};m.failedLookup=true;return {data:null,error:{message:'Failed to fetch'}};}return {data:[],error:null};},from:()=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>{if(m.failedLookup){m.failedLookup=false;return {data:null,error:{message:'Offline'}};}return {data:m.saved,error:null};}};return q;}}}));
import {useInvoiceStore} from './invoiceStore';
beforeEach(()=>{localStorage.clear();m.saved=null;m.failedLookup=false;m.creates=0;Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});});
it('recovers a committed GRN after the response and recovery lookup were lost, without adding stock again',async()=>{
 const input={supplierId:'supplier',supplierName:'Fixture',supplierAddress:'',deliveryDate:'2026-11-02',lineItems:[],grandTotal:100,notes:'Fixture',syncedToStock:false} as any;
 const first=await useInvoiceStore.getState().createInvoice(input);expect(first.invoice).toBeNull();
 const retry=await useInvoiceStore.getState().createInvoice(input);expect(retry.invoice?.id).toBe('fixture-grn');expect(m.creates).toBe(1);
});
