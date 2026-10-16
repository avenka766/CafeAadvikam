import { afterEach, expect, it, vi } from 'vitest';
import { calculatePlannerSalesGst } from './plannerSalesGst';
import { renderSavedSalesTaxInvoice, renderDispatchInvoiceHtml, walkinBillToInvoiceRecord, saveWalkinBillSecure, type WalkinBillRow } from './dispatchInvoice';
import { buildGstTaxInvoiceHtml } from './gstTaxInvoice';
import { supabase } from '@/lib/supabase';

const buyer={name:'GST Buyer',address:'Hosur',gstin:'TEST-GSTIN',stateName:'Tamil Nadu',stateCode:'33'};
const bill:WalkinBillRow={id:'test',billNo:'SALES/26-27/TEST',items:[{itemName:'Festival pack',unit:'pcs',quantity:2,price:500,lineTotal:1000,gstPct:5,hsnCode:'2106',gstPricing:'exclusive',gstBuyerDetails:buyer}],subtotal:1000,discountType:'none',discountValue:0,discountAmount:0,total:1050,paymentMode:'cash',cashierName:'Planner',customerName:'Customer',customerMobile:'9999999999',status:'active',createdAt:'2026-10-16T02:00:00Z',isGstInvoice:true,gstSupplyType:'intra',cancelledAt:null,cancelledReason:null};
afterEach(()=>vi.restoreAllMocks());

it('adds 5% to the whole bill, after discount, with reconciling CGST/SGST',()=>{
  expect(calculatePlannerSalesGst(1000,0,true,5)).toEqual({taxableValue:1000,totalTax:50,cgst:25,sgst:25,igst:0,total:1050});
  expect(calculatePlannerSalesGst(1000,100,true,5).total).toBe(945);
  expect(calculatePlannerSalesGst(1000,100,false,5).total).toBe(900);
  const small=calculatePlannerSalesGst(1.01,0,true,5);expect(small.total).toBe(1.06);expect(small.cgst+small.sgst).toBeCloseTo(small.totalTax,2);
  expect(calculatePlannerSalesGst(1000,0,true,5,'inter').igst).toBe(50);
});
it('uses one overall GST calculation even when per-line rounding would differ',()=>{
  const result=buildGstTaxInvoiceHtml({buyer,invoiceNo:'TEST',invoiceDate:'2026-10-16',supplyType:'intra',preparedBy:'Planner',lines:Array.from({length:3},()=>({itemName:'Small item',qty:1,rate:0.1,gstPct:5,hsnCode:'2106',uom:'pcs'})),overallSalesTax:{subtotal:0.3,discountAmount:0,gstPct:5}});
  expect(result.beforeTaxValue).toBe(.3);expect(result.totalGst).toBe(.02);expect(result.totalAmount).toBe(.32);expect(result.html).toContain('Rs. 0.32');
});
it('prints the saved added GST total and buyer details, rather than extracting GST from the old value',()=>{
  const html=renderSavedSalesTaxInvoice(bill);expect(html).toContain('VRSNB FOODS LLP');expect(html).toContain('GST Buyer');expect(html).toContain('TEST-GSTIN');expect(html).toContain('Rs. 1050.00');expect(html).toContain('25.00');
  const normal=renderDispatchInvoiceHtml(walkinBillToInvoiceRecord(bill),'thermal');expect(normal).toContain('GST added');expect(normal).toContain('Rs 1050.00');expect(normal).toContain('50.00');
});
it('keeps historical unmarked inclusive bills at their original amount',()=>{
  const legacy={...bill,total:1000,items:bill.items.map(({gstPricing:_,...line})=>line)};
  const html=renderDispatchInvoiceHtml(walkinBillToInvoiceRecord(legacy),'thermal');expect(html).toContain('Includes GST');expect(html).toContain('Rs 1000');expect(html).not.toContain('GST added');
});
it('saves tax metadata and payable amount through the same atomic Sales RPC and keeps its assigned number',async()=>{
  const single=vi.fn().mockResolvedValue({data:{id:'test',bill_no:'SALES/26-27/900',items:bill.items,total:1050,subtotal:1000,created_at:bill.createdAt,is_gst_invoice:true},error:null});
  const rpc=vi.spyOn(supabase,'rpc').mockReturnValue({single} as never);
  const saved=await saveWalkinBillSecure({items:bill.items,subtotal:1000,discountType:'none',discountValue:0,discountAmount:0,total:1050,paymentMode:'cash',cashierName:'Planner',customerName:'Customer',customerMobile:null,isGstInvoice:true});
  expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('save_walkin_bill_secure',expect.objectContaining({p_items:bill.items,p_total:1050}));expect(saved.billNo).toBe('SALES/26-27/900');expect(saved.items[0].gstPricing).toBe('exclusive');expect(saved.items[0].gstBuyerDetails).toEqual(buyer);
});
it('reports a failed save without returning a fake saved bill',async()=>{
  vi.spyOn(supabase,'rpc').mockReturnValue({single:vi.fn().mockResolvedValue({data:null,error:{message:'Save failed'}})} as never);
  await expect(saveWalkinBillSecure({items:bill.items,subtotal:1000,discountType:'none',discountValue:0,discountAmount:0,total:1050,paymentMode:'cash',cashierName:'Planner',customerName:'Customer',customerMobile:null,isGstInvoice:true})).rejects.toThrow('Save failed');
});
