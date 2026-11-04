import {it,expect} from 'vitest';import {invoiceTax,aggregateInvoiceTax,reconcileHosurItems,hosurLedgerTax} from './hosurReportAccounting';
it('preserves saved invoice value and splits exclusive GST',()=>{
 const row={total:907.2,subtotal:864,is_gst_invoice:true,items:[{gstPct:5,gstPricing:'exclusive'}]};
 expect(invoiceTax(row)).toMatchObject({taxableValue:864,cgst:21.6,sgst:21.6,igst:0,invoiceValue:907.2});
 expect(invoiceTax({...row,gst_supply_type:'inter'})).toMatchObject({cgst:0,sgst:0,igst:43.2});
 expect(aggregateInvoiceTax([row,row])?.invoiceValue).toBe(1814.4);
});
it('reconciles separately rounded multi-batch invoices to the exact discounted shop ledger',()=>{
 const rows=[{invoice_no:'SALES/26-27/1612',subtotal:804,discount_amount:120.6,total:683,is_gst_invoice:false},
 {invoice_no:'SALES/26-27/1613',subtotal:1532,discount_amount:275.76,total:1256,is_gst_invoice:false}];
 const resolved=hosurLedgerTax(rows,1939.64,[]);
 expect(resolved.tax).toMatchObject({invoiceValue:1939.64,taxableValue:1939.64,printedInvoiceValue:1939,ledgerAdjustment:.64});
 expect(resolved.invoiceTaxes[rows[0].invoice_no].invoiceValue).toBe(683.4);
 expect(resolved.invoiceTaxes[rows[1].invoice_no].invoiceValue).toBe(1256.24);
 expect(rows[0].total).toBe(683);
 expect(hosurLedgerTax(rows,2000,[]).tax?.invoiceValue).toBe(1939);
});
it('excludes a cancelled replacement while retaining the active GST invoice once',()=>{
 const row={invoice_no:'SALES/26-27/1413',status:'paid',subtotal:13800,total:14490,is_gst_invoice:true,items:[{gstPct:5,gstPricing:'exclusive'}]};
 const result=hosurLedgerTax([row,{...row,invoice_no:'SALES/26-27/1414',status:'cancelled'}],14490,[]);
 expect(result.tax).toMatchObject({invoiceValue:14490,taxableValue:13800,cgst:345,sgst:345});
 expect(Object.keys(result.invoiceTaxes)).toEqual(['SALES/26-27/1413']);
});
it('recognises a saved two-decimal kg ledger conversion without accepting arbitrary price/quantity changes',()=>{
 const invoice={invoice_no:'SALES/26-27/864',subtotal:2129.6,total:2130,discount_amount:0,is_gst_invoice:false,items:[
 {itemName:'Banana cake',unit:'kg',quantity:2.134,unitPrice:400,lineTotal:853.6},
 {itemName:'Other',unit:'pcs',quantity:1,unitPrice:1276,lineTotal:1276}]};
 const ledger=[{item_name:'Banana cake',unit:'kg',quantity:2.13,unit_price:400,line_total:852},
 {item_name:'Other',unit:'pcs',quantity:1,unit_price:1276,line_total:1276}];
 expect(hosurLedgerTax([invoice],2128,ledger).tax).toMatchObject({invoiceValue:2128,printedInvoiceValue:2130,ledgerAdjustment:-2});
 expect(hosurLedgerTax([invoice],2128,[{...ledger[0],quantity:2.12},ledger[1]]).tax?.invoiceValue).toBe(2130);
 expect(hosurLedgerTax([invoice],2128,[{...ledger[0],unit_price:399},ledger[1]]).tax?.invoiceValue).toBe(2130);
});
it('retains legacy inclusive GST while matching the saved paise ledger, without adding new tax',()=>{
 const row={invoice_no:'SALES/26-27/218',subtotal:9494.4,total:9494,is_gst_invoice:true,items:[{gstPct:5}]};
 expect(hosurLedgerTax([row],9494.4,[]).tax).toMatchObject({invoiceValue:9494.4,printedInvoiceValue:9494,ledgerAdjustment:.4,taxableValue:9042.29});
});
it('allocates only reconcilable tax/discount and retains raw item values',()=>{
 const rows=reconcileHosurItems({total:105,itemSubtotal:100},[{lineTotal:33.33},{lineTotal:33.33},{lineTotal:33.34}]);
 expect(rows.reduce((s,r)=>Math.round((s+r.lineTotal)*100)/100,0)).toBe(105);
 expect(rows[0].savedItemValue).toBe(33.33);
 expect(()=>reconcileHosurItems({total:105,itemSubtotal:100},[{lineTotal:200}])).toThrow('reconcile');
 expect(()=>reconcileHosurItems({total:105},[])).toThrow('missing');
});
