import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {supabase} from './supabase';
import {useAuthStore} from '@/stores/authStore';
import {uploadBillingAction,restoreBillingActions,type BillingAction} from './desktopBilling';
const local=vi.hoisted(()=>({orders:[] as any[]}));
vi.mock('@/stores/orderStore',()=>({useOrderStore:{getState:()=>local,setState:(update:any)=>Object.assign(local,update(local))},dbRowToOrder:(r:any)=>({id:r.id,orderNumber:r.order_number,paymentType:r.payment_type,total:r.total}),hydrateCachedCafeOrders:async()=>{}}));
vi.mock('./localCache',()=>({setCached:vi.fn(async()=>{})}));
const original:BillingAction={id:'create',staffId:'staff',deviceId:'device',leaseId:'lease',family:'CAFE',kind:'cafe-order',key:'create',rpc:'save_cafe_order_v1',args:{p_order:{id:'order'}},createdAt:'2026-10-16T05:00:00Z',billNo:'501',receipt:{id:'order',total:105,items:[]},sync:{state:'pending'}};
let actions:BillingAction[];
beforeEach(()=>{actions=[];local.orders=[];useAuthStore.setState({currentUser:{id:'staff'} as any});window.cafeAadvikamDesktop={isElectron:true,sales:vi.fn(async(op,p:any)=>{if(op==='billing-snapshot')return {actions};if(op==='billing-status'){const a=actions.find(a=>a.id===p.id);if(a)a.sync=p.result;}return true;})};});
afterEach(()=>{vi.restoreAllMocks();delete window.cafeAadvikamDesktop;useAuthStore.setState({currentUser:null});});
it('never overwrites a newer offline payment when the original cafe order uploads',async()=>{
 actions=[{...original},{...original,id:'payment',kind:'cafe-finalize'}];local.orders=[{id:'order',orderNumber:501,paymentType:'cash',total:105,pendingSync:true}];
 vi.spyOn(supabase,'rpc').mockResolvedValue({data:{id:'order',order_number:501,total:105,payment_type:'unpaid'},error:null} as never);
 await uploadBillingAction(actions[0]);expect(local.orders[0].paymentType).toBe('cash');expect(local.orders[0].pendingSync).toBe(true);
});
it('reconstructs a server-confirmed bill after a crash before the browser cache was saved',async()=>{
 actions=[{...original,sync:{state:'synced',result:{id:'order',order_number:501,total:105,payment_type:'cash'}}}];
 await restoreBillingActions();expect(local.orders).toEqual([expect.objectContaining({id:'order',orderNumber:501,paymentType:'cash',pendingSync:false})]);
});
it('keeps completed cafe payment snapshots when a stale cached create entry exists',async()=>{
 actions=[{...original},{...original,id:'payment',kind:'cafe-finalize',sync:{state:'synced',result:{id:'order',order_number:501,total:105,payment_type:'upi'}}}];
 local.orders=[{id:'order',orderNumber:501,paymentType:'unpaid',pendingSync:true}];await restoreBillingActions();expect(local.orders[0].paymentType).toBe('upi');expect(local.orders[0].pendingSync).toBe(false);
});
it('refuses to send a receipt under another staff session',async()=>{
 useAuthStore.setState({currentUser:{id:'other'} as any});const rpc=vi.spyOn(supabase,'rpc');await expect(uploadBillingAction(original)).rejects.toThrow('staff member');expect(rpc).not.toHaveBeenCalled();
});
it('does not send changing backup diagnostics as part of the immutable financial payload',async()=>{
 actions=[{...original}];const rpc=vi.spyOn(supabase,'rpc').mockResolvedValue({data:{id:'order',order_number:501,total:105},error:null} as never);
 await uploadBillingAction({...original,backupError:'Disk full'});expect((rpc.mock.calls[0][1] as any).p_action).not.toHaveProperty('backupError');
});
