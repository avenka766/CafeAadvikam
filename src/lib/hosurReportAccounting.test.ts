import {it,expect} from 'vitest';import {invoiceTax,aggregateInvoiceTax,reconcileHosurItems} from './hosurReportAccounting';
it('preserves saved invoice value and splits exclusive GST',()=>{
 const row={total:907.2,subtotal:864,is_gst_invoice:true,items:[{gstPct:5,gstPricing:'exclusive'}]};
 expect(invoiceTax(row)).toMatchObject({taxableValue:864,cgst:21.6,sgst:21.6,igst:0,invoiceValue:907.2});
 expect(invoiceTax({...row,gst_supply_type:'inter'})).toMatchObject({cgst:0,sgst:0,igst:43.2});
 expect(aggregateInvoiceTax([row,row])?.invoiceValue).toBe(1814.4);
});
it('allocates only reconcilable tax/discount and retains raw item values',()=>{
 const rows=reconcileHosurItems({total:105,itemSubtotal:100},[{lineTotal:33.33},{lineTotal:33.33},{lineTotal:33.34}]);
 expect(rows.reduce((s,r)=>Math.round((s+r.lineTotal)*100)/100,0)).toBe(105);
 expect(rows[0].savedItemValue).toBe(33.33);
 expect(()=>reconcileHosurItems({total:105,itemSubtotal:100},[{lineTotal:200}])).toThrow('reconcile');
 expect(()=>reconcileHosurItems({total:105},[])).toThrow('missing');
});
