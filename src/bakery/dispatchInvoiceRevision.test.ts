import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabase:{rpc:m.rpc}}));vi.mock('@/stores/authStore',()=>({useAuthStore:{getState:()=>({currentUser:{id:'staff'}})}}));vi.mock('./bakeryStore',()=>({useBakeryStore:{getState:()=>({fetchOrders:m.fetch,orders:[]})}}));
import {reviseDispatchInvoice} from './dispatchInvoiceRevision';import type {DispatchInvoiceRecord} from './dispatchInvoice';
const record={id:'invoice',scope:'Hosur',items:[],total:20,status:'paid',discountPct:0,isGstInvoice:false,gstSupplyType:'intra',returnLog:[],dispatchEntryIds:[]} as unknown as DispatchInvoiceRecord;
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();m.fetch.mockResolvedValue(undefined);});
it('recovers the same correction and snapshot after the server committed but its response was lost',async()=>{
 m.rpc.mockResolvedValueOnce({error:{message:'Disconnected'}}).mockResolvedValue({data:{id:'invoice',status:'paid'}});
 await expect(reviseDispatchInvoice(record,'edit',{items:[]})).rejects.toThrow('confirmation was lost');const request=m.rpc.mock.calls[0][1];
 await reviseDispatchInvoice({...record,total:30},'edit',{items:[]});expect(m.rpc.mock.calls[1][1]).toEqual(request);expect(localStorage.length).toBe(0);
});
it('blocks a conflicting return while a correction is uncertain',async()=>{
 m.rpc.mockResolvedValue({error:{message:'Disconnected'}});await expect(reviseDispatchInvoice(record,'edit',{items:[]})).rejects.toThrow();await expect(reviseDispatchInvoice(record,'return',{returns:[]})).rejects.toThrow('previous correction');expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('does not write when the correction cannot be saved durably',async()=>{
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Disk full');});await expect(reviseDispatchInvoice(record,'edit',{items:[]})).rejects.toThrow('Disk full');expect(m.rpc).not.toHaveBeenCalled();spy.mockRestore();
});
it('does not race an uncertain cancellation',async()=>{
 localStorage.setItem('branch-transfer-cancel:staff:invoice','{}');await expect(reviseDispatchInvoice(record,'edit',{})).rejects.toThrow('cancellation needs confirmation');expect(m.rpc).not.toHaveBeenCalled();
});
