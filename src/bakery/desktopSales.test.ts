import {useAuthStore} from '@/stores/authStore';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {supabase} from '@/lib/supabase';
import {desktopSalesSnapshot,prepareDesktopSales,syncDesktopSales} from './desktopSales';
const receipt={id:'sale-id',billNo:'SALES/26-27/501',total:1050,createdAt:'2026-10-16T04:00:00Z',staffId:'staff-id',items:[{quantity:2,price:500}],customerName:'Buyer',sync:{state:'pending'}};
const snapshot={deviceId:'device-id',requestId:'request-id',available:100,receipts:[receipt]};
beforeEach(()=>useAuthStore.setState({currentUser:{id:'staff-id'} as any}));
afterEach(()=>{vi.restoreAllMocks();delete window.cafeAadvikamDesktop;});
it('retries a lost server response with the identical receipt and never acknowledges a failed upload',async()=>{
 const bridge=vi.fn(async(op,payload)=>op==='snapshot'?snapshot:true);
 window.cafeAadvikamDesktop={isElectron:true,sales:bridge};
 const single=vi.fn().mockResolvedValueOnce({data:null,error:{message:'connection lost after commit'}}).mockResolvedValueOnce({data:{id:receipt.id,bill_no:receipt.billNo,total:1050},error:null});
 const rpc=vi.spyOn(supabase,'rpc').mockReturnValue({single} as never);
 await expect(syncDesktopSales('staff-id')).rejects.toMatchObject({message:'connection lost after commit'});
 expect(bridge).not.toHaveBeenCalledWith('sync',expect.objectContaining({result:{state:'synced',error:null}}));
 await syncDesktopSales('staff-id');
 expect(rpc.mock.calls[0][1]).toEqual(rpc.mock.calls[1][1]);
 expect(bridge).toHaveBeenCalledWith('sync',{id:receipt.id,result:{state:'synced',error:null}});
});
it('retains the receipt when the server confirmation has a different amount or number',async()=>{
 const bridge=vi.fn(async(op)=>op==='snapshot'?snapshot:true);window.cafeAadvikamDesktop={isElectron:true,sales:bridge};
 vi.spyOn(supabase,'rpc').mockReturnValue({single:vi.fn().mockResolvedValue({data:{id:receipt.id,bill_no:receipt.billNo,total:999},error:null})} as never);
 await expect(syncDesktopSales('staff-id')).rejects.toThrow('does not match');expect(bridge).toHaveBeenCalledWith('sync',expect.objectContaining({result:expect.objectContaining({state:'pending',error:expect.stringContaining('does not match')})}));
});
it('reuses a persisted reservation request ID after a failed prepare response',async()=>{
 const bridge=vi.fn(async(op)=>op==='snapshot'?{...snapshot,available:0}:true);window.cafeAadvikamDesktop={isElectron:true,sales:bridge};
 const rpc=vi.spyOn(supabase,'rpc').mockResolvedValue({data:{id:'request-id'},error:null} as never);
 await prepareDesktopSales('staff-id');expect(rpc).toHaveBeenCalledWith('reserve_desktop_planner_sales',{p_request_id:'request-id',p_device_id:'device-id'});expect(bridge).toHaveBeenCalledWith('lease',{id:'request-id'});
});
it('does not reserve new numbers while sufficient older numbers remain',async()=>{
 window.cafeAadvikamDesktop={isElectron:true,sales:vi.fn(async()=>snapshot)};const rpc=vi.spyOn(supabase,'rpc');expect((await prepareDesktopSales('staff-id')).available).toBe(100);expect(rpc).not.toHaveBeenCalled();
});
it('fails clearly when opened in a browser without durable desktop storage',async()=>{
 await expect(desktopSalesSnapshot('staff-id')).rejects.toThrow('unavailable');
});
