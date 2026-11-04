import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),fetch:vi.fn(),orders:[] as any[]}));
vi.mock('@/lib/supabase',()=>({supabase:{rpc:m.rpc}}));
vi.mock('@/stores/authStore',()=>({useAuthStore:{getState:()=>({currentUser:{id:'staff'}})}}));
vi.mock('./bakeryStore',()=>({useBakeryStore:{getState:()=>({orders:m.orders,fetchOrders:m.fetch})}}));
import {cancelBranchTransfer} from './branchTransferCancellation';
import type {DispatchInvoiceRecord} from './dispatchInvoice';
const record={id:'invoice',scope:'SNB',items:[],total:20,status:'paid',dispatchEntryIds:[{orderId:'order',dispatchEntryId:'entry'}]} as unknown as DispatchInvoiceRecord;
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();m.fetch.mockResolvedValue(undefined);m.orders=[{id:'order',dispatchLog:[{id:'entry',itemName:'Bun'}]}];});
it('retains the original cancellation request after a lost response, even if the invoice now reads cancelled',async()=>{
 m.rpc.mockResolvedValueOnce({error:{message:'Network lost'}}).mockResolvedValue({data:{id:'invoice',status:'cancelled'}});
 await expect(cancelBranchTransfer(record,'Wrong dispatch')).rejects.toThrow('confirmation was lost');const request=m.rpc.mock.calls[0][1];
 m.orders=[];await cancelBranchTransfer({...record,status:'cancelled'},'Wrong dispatch');expect(m.rpc.mock.calls[1][1]).toEqual(request);expect(localStorage.length).toBe(0);
});
it('does not cancel if the local recovery request cannot be saved',async()=>{
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Disk full');});
 await expect(cancelBranchTransfer(record)).rejects.toThrow('Disk full');expect(m.rpc).not.toHaveBeenCalled();spy.mockRestore();
});
it('does not guess the stock item when its source dispatch is missing',async()=>{
 m.orders=[];await expect(cancelBranchTransfer(record)).rejects.toThrow('linked dispatch');expect(m.rpc).not.toHaveBeenCalled();
});
it('clears an explicitly rejected request so the corrected invoice can be retried',async()=>{
 m.rpc.mockResolvedValue({error:{code:'P0001',message:'TRANSFER_ALREADY_RECEIVED'}});
 await expect(cancelBranchTransfer(record)).rejects.toThrow('TRANSFER_ALREADY_RECEIVED');expect(localStorage.length).toBe(0);
});
it('retains the request and explains a missing server update without falling back to unsafe writes',async()=>{
 m.rpc.mockResolvedValue({error:{code:'PGRST202',message:'Function not found'}});
 await expect(cancelBranchTransfer(record)).rejects.toThrow('not installed');expect(localStorage.length).toBe(1);expect(m.rpc).toHaveBeenCalledTimes(1);
});
