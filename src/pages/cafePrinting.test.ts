import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Order} from '@/types';
beforeEach(()=>{vi.resetModules();delete window.qz;localStorage.clear();});
afterEach(()=>{document.querySelectorAll('iframe,script[data-qz-tray]').forEach(n=>n.remove());vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();});
it('opens the existing saved Cafe bill in the browser fallback when QZ fails, without saving another bill',async()=>{
 const {setPrinterPref}=await import('@/lib/qzPrint');setPrinterPref('bill','Receipt printer');
 const {supabase}=await import('@/lib/supabase');const rpc=vi.spyOn(supabase,'rpc');
 const {printPaidBill}=await import('./BillingDashboard');
 vi.useFakeTimers();
 const order:Order={id:'isolated-print',orderNumber:123,orderType:'takeaway',items:[{menuItem:{id:'food',name:'Saved food',price:100,category:'food',timing:'all',enabled:true},quantity:1}],subtotal:100,discount:0,discountType:'flat',discountValue:0,total:105,gstEnabled:true,gstAmount:5,status:'served',paymentType:'cash',createdBy:'Biller',createdAt:'2026-11-01T06:00:00Z',updatedAt:'2026-11-01T06:00:00Z'};
 const printing=printPaidBill(order,'duplicate');
 document.querySelector('script[data-qz-tray]')!.dispatchEvent(new Event('error'));
 await vi.advanceTimersByTimeAsync(0);
 const frame=document.querySelector('iframe')!;expect(frame).not.toBeNull();expect(frame.contentDocument!.body.textContent).toContain('Saved food');expect(frame.contentDocument!.title).toBe('Bill 123');
 const win=frame.contentWindow!;vi.spyOn(win,'focus').mockImplementation(()=>{});
 const print=vi.spyOn(win,'print').mockImplementation(()=>{const event=frame.contentDocument!.createEvent('Event');event.initEvent('afterprint',false,false);win.dispatchEvent(event);});
 await vi.advanceTimersByTimeAsync(350);await printing;
 expect(print).toHaveBeenCalledTimes(1);expect(document.querySelector('iframe')).toBeNull();expect(rpc).not.toHaveBeenCalled();
},15000);
