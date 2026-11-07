import {expect, it} from 'vitest';
import {adminInvoiceExportRows} from './adminInvoiceExport';
import type {StoreInvoice} from './invoiceStore';
it('exports supplier/GRN references with item prices without repeating the GRN total', () => {
 const invoice = {supplierName:'Fixture Supplier',invoiceNumber:'GRN-1',supplierInvoiceNumber:'SUP-1',deliveryDate:'2026-11-07',grandTotal:100,status:'pending_review',syncedToStock:true,lineItems:[{itemName:'Flour',quantity:2,unit:'kg',pricePerUnit:30,totalPrice:60,acceptedQty:1.5,rejectedQty:.5},{itemName:'Sugar',quantity:1,unit:'kg',pricePerUnit:40,totalPrice:40}]} as StoreInvoice;
 const result=adminInvoiceExportRows([invoice]);
 expect(result.invoices).toHaveLength(1);expect(result.invoices[0]).toMatchObject({'Supplier Name':'Fixture Supplier','GRN Number':'GRN-1','Grand Total':100});
 expect(result.items).toHaveLength(2);expect(result.items[0]).toMatchObject({'Supplier Invoice Number':'SUP-1','Accepted Qty':1.5,'Rejected Qty':.5,'Unit Price':30});
 expect(result.items.reduce((sum,i)=>sum+i['Item Amount'],0)).toBe(100);
 expect(result.items[0]).not.toHaveProperty('Grand Total');
});
