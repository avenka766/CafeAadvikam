import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('@/lib/supabase',()=>({supabase:{rpc:m.rpc}}));vi.mock('@/stores/authStore',()=>({useAuthStore:{getState:()=>({currentUser:{id:'staff'}})}}));
import {changeSampleInvoice} from './sampleInvoiceRequest';import type {DispatchInvoiceRecord} from './dispatchInvoice';
const record={id:'invoice',items:[{itemName:'Bun',quantity:2,unit:'pcs',unitPrice:10,lineTotal:20}],total:20,discountPct:0,status:'unpaid'} as DispatchInvoiceRecord;
beforeEach(()=>{localStorage.clear();m.rpc.mockReset();});
it('recovers a lost payment response using the same saved request and snapshot',async()=>{
 m.rpc.mockResolvedValueOnce({error:{message:'Connection lost'}});await expect(changeSampleInvoice(record,'pay')).rejects.toThrow('confirmation was lost');const first=m.rpc.mock.calls[0][1];
 m.rpc.mockResolvedValue({data:{id:record.id,status:'paid'}});await changeSampleInvoice({...record,status:'paid'},'pay');expect(m.rpc.mock.calls[1][1]).toEqual(first);expect(localStorage.length).toBe(0);
});
it('blocks a different edit until an uncertain operation is recovered',async()=>{
 m.rpc.mockResolvedValue({error:{message:'Connection lost'}});await expect(changeSampleInvoice(record,'pay')).rejects.toThrow();await expect(changeSampleInvoice(record,'edit',{items:record.items,discountPct:10})).rejects.toThrow('previous invoice');expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('does not mutate an invoice unless the recovery request is saved durably',async()=>{
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Disk full');});await expect(changeSampleInvoice(record,'pay')).rejects.toThrow('Disk full');expect(m.rpc).not.toHaveBeenCalled();spy.mockRestore();
});
