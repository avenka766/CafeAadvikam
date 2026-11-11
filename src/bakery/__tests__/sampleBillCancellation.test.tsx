import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import type {DispatchInvoiceRecord} from '../dispatchInvoice';

const m=vi.hoisted(()=>({list:vi.fn(),cancel:vi.fn(),load:vi.fn(),paid:vi.fn()}));
vi.mock('../dispatchInvoice',async original=>({...await original<typeof import('../dispatchInvoice')>(),listDispatchInvoices:m.list,cancelDispatchInvoice:m.cancel,markDispatchInvoicePaid:m.paid}));
vi.mock('../packingCounter',async original=>({...await original<typeof import('../packingCounter')>(),getPackingCounterStatus:vi.fn().mockResolvedValue({isOpen:true})}));
vi.mock('@/stores/branchCatalogStore',()=>({useBranchCatalogStore:()=>({items:{SNB:[],VRSNB:[]},loadCatalog:m.load})}));
vi.mock('@/lib/supabase',()=>({supabase:{from:vi.fn(),rpc:vi.fn()},fetchAllRows:vi.fn()}));
import {SampleBillTab} from '../PlannerDashboard';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const bill:DispatchInvoiceRecord={
 id:'sample-1',invoiceNo:'SALES/26-27/101',scope:'SNB',status:'unpaid',notes:'Sample Bill',customerName:'Fixture',
 hosurShopId:null,hosurShopName:null,hosurShopPhone:null,customerPhone:null,customerAddress:null,dispatchedBy:'Fixture',
 items:[{itemName:'Bun',unit:'pcs',quantity:2,unitPrice:10,lineTotal:20}],total:20,subtotal:20,discountPct:0,discountAmount:0,roundOff:0,
 paidAt:null,isGstInvoice:false,gstSupplyType:'intra',cancelledAt:null,cancelledBy:null,cancelledReason:null,originalItems:null,
 createdAt:'2026-11-10T06:00:00Z',dispatchEntryIds:[],returnLog:[],
};
let host:HTMLDivElement,root:Root;
const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===text)!;
const render=()=>act(async()=>root.render(<SampleBillTab/>));
beforeEach(()=>{
 vi.clearAllMocks();m.load.mockResolvedValue(undefined);m.list.mockResolvedValue([bill]);
 vi.spyOn(window,'confirm').mockReturnValue(true);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();});

it('cancels through the existing workflow and updates the row without deleting history',async()=>{
 m.cancel.mockResolvedValue({ok:true,record:{...bill,status:'cancelled'}});
 await render();await act(async()=>button('Cancel Bill').click());
 expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining(bill.invoiceNo));
 expect(m.cancel).toHaveBeenCalledWith({invoiceId:bill.id,reason:'Cancelled from Planner Sample Bill'});
 expect(host.textContent).toContain(bill.invoiceNo);expect(host.textContent).toContain('Cancelled');
 expect(button('Cancel Bill')).toBeUndefined();expect(button('Mark Paid')).toBeUndefined();expect(button('Edit').disabled).toBe(true);
});
it('does nothing when the user declines cancellation',async()=>{
 vi.mocked(window.confirm).mockReturnValue(false);await render();await act(async()=>button('Cancel Bill').click());
 expect(m.cancel).not.toHaveBeenCalled();expect(host.textContent).toContain('Awaiting Payment');
});
it('blocks double submission and competing payment actions while cancellation is pending',async()=>{
 let complete!:(value:unknown)=>void;m.cancel.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
 await render();const cancel=button('Cancel Bill');await act(async()=>{cancel.click();cancel.click();});
 expect(m.cancel).toHaveBeenCalledTimes(1);expect(button('Mark Paid').disabled).toBe(true);
 await act(async()=>complete({ok:true,record:{...bill,status:'cancelled'}}));
 expect(m.paid).not.toHaveBeenCalled();
});
it('handles a stale unpaid bill that was paid on another device',async()=>{
 m.cancel.mockResolvedValue({error:'RECORDED_REFUND_REQUIRED'});
 await render();await act(async()=>button('Cancel Bill').click());
 expect(host.querySelector('[role="alert"]')?.textContent).toContain('Refresh the bill');
 expect(host.textContent).toContain('Awaiting Payment');expect(button('Cancel Bill').disabled).toBe(false);
});
it('records the confirmed full refund before cancelling a paid bill',async()=>{
 m.list.mockResolvedValue([{...bill,status:'paid'}]);
 m.cancel.mockResolvedValue({ok:true,record:{...bill,status:'cancelled'}});
 await render();await act(async()=>button('Record Refund & Cancel').click());
 expect(host.textContent).toContain('₹20.00');
 const form=host.querySelector('form')!;
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(m.cancel).not.toHaveBeenCalled();
 form.querySelector('select')!.value='upi';
 form.querySelector<HTMLInputElement>('[name=reference]')!.value='UPI-123';
 form.querySelector<HTMLInputElement>('[name=reason]')!.value='Customer returned the order';
 form.querySelector<HTMLInputElement>('[name=confirmed]')!.checked=true;
 form.querySelector<HTMLInputElement>('[name=restock]')!.checked=true;
 await act(async()=>button('Confirm Refund & Cancel Bill').click());
 expect(m.cancel).toHaveBeenCalledWith({invoiceId:bill.id,reason:'Customer returned the order',
   sampleRefund:{bill:{...bill,status:'paid'},details:{amount:20,method:'upi',reference:'UPI-123',confirmed:true,restock:true}}});
 expect(host.textContent).toContain('Cancelled');
 expect(host.querySelector('form')).toBeNull();
});
it('shows transport errors and lets the same cancellation be retried',async()=>{
 m.cancel.mockRejectedValue(Error('Connection lost'));await render();await act(async()=>button('Cancel Bill').click());
 expect(host.querySelector('[role="alert"]')?.textContent).toContain('Connection lost');
 expect(button('Cancel Bill').disabled).toBe(false);expect(host.textContent).toContain('Awaiting Payment');
});
