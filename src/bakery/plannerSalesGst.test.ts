import { afterEach, expect, it, vi } from 'vitest';
import { calculatePlannerSalesGst, gstBuyerError } from './plannerSalesGst';
import { renderSavedSalesTaxInvoice, renderDispatchInvoiceHtml, walkinBillToInvoiceRecord, saveWalkinBillSecure, type WalkinBillRow } from './dispatchInvoice';
import { buildGstTaxInvoiceHtml } from './gstTaxInvoice';
import { supabase } from '@/lib/supabase';

const buyer={name:'GST Buyer',address:'Hosur',gstin:'TEST-GSTIN',stateName:'Tamil Nadu',stateCode:'33'};
const bill:WalkinBillRow={id:'test',billNo:'SALES/26-27/TEST',items:[{itemName:'Festival pack',unit:'pcs',quantity:2,price:500,lineTotal:1000,gstPct:5,hsnCode:'2106',gstPricing:'exclusive',gstBuyerDetails:buyer}],subtotal:1000,discountType:'none',discountValue:0,discountAmount:0,total:1050,paymentMode:'cash',cashierName:'Planner',customerName:'Customer',customerMobile:'9999999999',status:'active',createdAt:'2026-10-16T02:00:00Z',isGstInvoice:true,gstSupplyType:'intra',cancelledAt:null,cancelledReason:null};
afterEach(()=>vi.restoreAllMocks());

it.each(['thermal','a4'] as const)('prints the current invoice without internal return history (%s)', paper => {
  const current = {itemName:'Egg Puff',unit:'pcs',quantity:5,unitPrice:24,lineTotal:120};
  const removed = {itemName:'Samosa',unit:'pcs',quantity:15,unitPrice:16,lineTotal:240};
  const record = {...walkinBillToInvoiceRecord(bill), items:[current], originalItems:[current,removed],
    returnLog:[{at:bill.createdAt,by:'Planner',reason:'Internal reason',items:[{itemName:'Samosa',unit:'pcs',qty:15}]}],
    total:120, subtotal:120, isGstInvoice:false};
  const html = renderDispatchInvoiceHtml(record, paper);
  expect(html).toContain('Egg Puff');
  expect(html).toContain('Net Bill Amount');
  expect(html).toMatch(/Rs 120(?:\.00)?</);
  expect(html).not.toMatch(/Samosa|Returned|Internal reason|>360</);
});

it('requires both buyer fields and validates GST number length and characters', () => {
  expect(gstBuyerError(' ', '33ABCDE1234F1Z5')).toMatch(/registered GST name/);
  expect(gstBuyerError('Shop Legal Name', '')).toMatch(/GST number/);
  expect(gstBuyerError('Shop Legal Name', 'not-a-gstin')).toMatch(/15 letters and digits/);
  expect(gstBuyerError('Shop Legal Name', ' 33abcde1234f1z5 ')).toBeUndefined();
});

it.each(['intra','inter'] as const)('keeps GST totals identical on 80 mm and A4 (%s)',supplyType=>{
 const params={buyer,invoiceNo:'SALES/26-27/TEST',invoiceDate:'2026-10-31',supplyType,preparedBy:'Planner',lines:[{itemName:'Pack <special>',qty:2,rate:500,gstPct:5,hsnCode:'2106',uom:'pcs'}],overallSalesTax:{subtotal:1000,discountAmount:100,gstPct:5}};
 const a4=buildGstTaxInvoiceHtml(params),thermal=buildGstTaxInvoiceHtml({...params,paper:'thermal'});
 expect(thermal.totalAmount).toBe(a4.totalAmount);expect(thermal.totalGst).toBe(a4.totalGst);expect(thermal.beforeTaxValue).toBe(900);
 expect(thermal.html).toContain('data-print-format="thermal"');expect(thermal.html).toContain('80mm');expect(thermal.html).not.toContain('size:A4');
 expect(thermal.html).toContain('Pack &lt;special&gt;');expect(thermal.html).toContain(supplyType==='intra'?'CGST':'IGST');expect(thermal.html).toContain('945.00');
 expect(renderSavedSalesTaxInvoice({...bill,gstSupplyType:supplyType},'thermal')).toContain('data-print-format="thermal"');
});

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
  expect(rpc).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledWith('save_walkin_bill_atomic_v1',expect.objectContaining({p_sale:expect.objectContaining({items:expect.arrayContaining([expect.objectContaining({gstPricing:'exclusive',gstPct:5,gstBuyerDetails:buyer,stockSlug:'festival-pack'})]),total:1050})}));expect(saved.billNo).toBe('SALES/26-27/900');expect(saved.items[0].gstPricing).toBe('exclusive');expect(saved.items[0].gstBuyerDetails).toEqual(buyer);
});
it('reports a failed save without returning a fake saved bill',async()=>{
  vi.spyOn(supabase,'rpc').mockReturnValue({single:vi.fn().mockResolvedValue({data:null,error:{message:'Save failed'}})} as never);
  await expect(saveWalkinBillSecure({items:bill.items,subtotal:1000,discountType:'none',discountValue:0,discountAmount:0,total:1050,paymentMode:'cash',cashierName:'Planner',customerName:'Customer',customerMobile:null,isGstInvoice:true})).rejects.toThrow('Save failed');
});
