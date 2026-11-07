import type {StoreInvoice} from './invoiceStore';

// Header totals appear once per GRN, never once per item.
export function adminInvoiceExportRows(invoices: StoreInvoice[]) {
  return {
    invoices: invoices.map(i => ({
      'Supplier Name': i.supplierName, 'GRN Number': i.invoiceNumber,
      'Supplier Invoice Number': i.supplierInvoiceNumber || '',
      'Supplier Invoice Date': i.supplierInvoiceDate || '', 'Delivery Date': i.deliveryDate,
      'PO Number': i.poNumber || '', Status: i.status, 'Grand Total': i.grandTotal,
      'Stock Synced': i.syncedToStock ? 'Yes' : 'No', Notes: i.notes,
    })),
    items: invoices.flatMap(i => i.lineItems.map(line => ({
      'Supplier Name': i.supplierName, 'GRN Number': i.invoiceNumber,
      'Supplier Invoice Number': i.supplierInvoiceNumber || '', 'Delivery Date': i.deliveryDate,
      'Item Code': line.itemCode || '', Item: line.itemName, Quantity: line.quantity, Unit: line.unit,
      'Accepted Qty': line.acceptedQty ?? line.quantity, 'Rejected Qty': line.rejectedQty ?? 0,
      'Unit Price': line.pricePerUnit, 'Item Amount': line.totalPrice, Remarks: line.remarks || '',
    }))),
  };
}
