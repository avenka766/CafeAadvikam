import {expect,it,vi,afterEach} from 'vitest';
import {hosurInvoiceLedgerLines} from './hosurGstLedger';
import {saveDispatchInvoice,renderSavedDispatchTaxInvoice} from './dispatchInvoice';
import {supabase} from '@/lib/supabase';
const buyer={name:'Hosur Buyer',address:'Hosur',gstin:'TEST-GST',stateName:'Tamil Nadu',stateCode:'33'};
const item={itemName:'Sweet mix',unit:'pcs',quantity:2,unitPrice:500,lineTotal:1000,gstPct:5,gstPricing:'exclusive' as const,gstBuyerDetails:buyer,hsnCode:'2106'};
const sum=(lines:ReturnType<typeof hosurInvoiceLedgerLines>)=>Math.round(lines.reduce((s,i)=>s+Math.round(i.quantity*i.unitPrice*100)/100,0)*100)/100;
afterEach(()=>vi.restoreAllMocks());
it('includes GST in the Hosur credit ledger exactly once',()=>{
 const lines=hosurInvoiceLedgerLines([item],0);expect(sum(lines)).toBe(1050);expect(lines.filter(i=>i.itemName==='GST @ 5%')).toHaveLength(1);
});
it('reconciles whole-bill discount and fractional quantity rounding to the tax invoice',()=>{
 const items=[{...item,quantity:.333,unitPrice:123.45,lineTotal:41.11},{...item,itemName:'Other',quantity:3,unitPrice:.11,lineTotal:.33}];
 const lines=hosurInvoiceLedgerLines(items,13);expect(sum(lines)).toBe(37.85);expect(lines.every(i=>i.unitPrice>=0)).toBe(true);
 expect(lines.find(i=>i.itemName==='GST @ 5%')?.unitPrice).toBe(1.8);
});
it('preserves the legacy non-GST ledger projection',()=>{
 const {gstPricing:_,...legacy}=item;expect(sum(hosurInvoiceLedgerLines([legacy],10))).toBe(900);
});
it('saves Hosur tax with the existing atomic invoice RPC and reprints the full invoice format',async()=>{
 const single=vi.fn().mockResolvedValue({data:{id:'test',invoice_no:'SALES/26-27/TEST',created_at:'2026-10-16T02:00:00Z'},error:null});
 const rpc=vi.spyOn(supabase,'rpc').mockReturnValue({single} as never);
 const record=await saveDispatchInvoice({scope:'Hosur',hosurShopName:'Shop',dispatchedBy:'Planner',items:[item],discountPct:10,isGstInvoice:true,gstSupplyType:'intra'});
 expect(rpc).toHaveBeenCalledWith('save_dispatch_invoice_secure',expect.objectContaining({p_total:945,p_subtotal:1000,p_discount_amount:100,p_round_off:0,p_items:[item]}));
 expect(record.invoiceNo).toBe('SALES/26-27/TEST');const html=renderSavedDispatchTaxInvoice(record);expect(html).toContain('VRSNB FOODS LLP');expect(html).toContain('Hosur Buyer');expect(html).toContain('TEST-GST');expect(html).toContain('Rs. 945.00');expect(html).toContain('Bill discount');
});
