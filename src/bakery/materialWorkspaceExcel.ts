import { approvalLabel, displayCapturedAt, displayDate, grnNumber, localDay, poNumber, stockStatus,
  type PurchaseData, type StockData } from './materialWorkspace';

type Cell = string | number;
export interface MaterialSheet { name: string; headings: string[]; rows: Cell[][]; currency?: number[] }
export const stockHeadings = ['Item Name', 'Qty', 'UOM', 'Minimum', 'Maximum', 'Downloaded Qty'];
export function stockImportSheet(materials: StockData['materials']): MaterialSheet {
  return {
    name: 'Raw Material Import',
    headings: stockHeadings,
    rows: materials.map(item => [item.name, item.quantity, item.unit, item.minimum ?? 0, item.maximum ?? '', item.quantity]),
  };
}

export const supplierHeadings = ['Supplier Name', 'RM Item Name', 'UOM', 'Price', 'Preferred', 'Contact Name', 'Phone', 'Email', 'Address'];

export function stockSheets(data: StockData, date: string): MaterialSheet[] {
  return [
    { name: 'Opening Stock', headings: ['Sl. No.', 'Item Name', 'Qty', 'UOM', 'Minimum or Maximum Status', 'Minimum', 'Maximum', 'Opening Date', 'Captured At'],
      rows: data.opening.map((item, i) => [i + 1, item.name, item.quantity, item.unit, stockStatus(item), item.minimum ?? 0, item.maximum ?? '', displayDate(date), displayCapturedAt(item.captured_at)]) },
    { name: 'Outward',
      headings: ['Sl. No.', 'Section Name', 'Production Item Name', 'RM Item Name', 'Qty', 'UOM', 'Issue Date', 'Reason',
        'Issued By', 'Root Card', 'Issue Time (IST)', 'Stock Before', 'Stock After', 'Issue Reference', 'Production Batches', 'Production Output Qty', 'Production Output UOM'],
      rows: data.outward.flatMap(batch => batch.lines.map(line => [
        batch.section, batch.recipe, line.name, line.quantity, line.unit, displayDate(batch.created_at), batch.reason,
        batch.created_by, line.production_card ?? line.combined_card ?? line.item_card ?? line.order_card ?? '', displayCapturedAt(batch.created_at),
        line.before ?? '', line.after ?? '', batch.id, line.production_batches ?? '',
        line.production_output_qty ?? '', line.production_output_unit ?? '',
      ])).map((row, i) => [i + 1, ...row]) },
    { name: 'Current Stock', headings: ['Sl. No.', 'RM Item Name', 'Available Qty', 'UOM', 'Minimum', 'Maximum', 'Stock Status'],
      rows: data.materials.map((item, i) => [
        i + 1, item.name, item.quantity, item.unit, item.minimum ?? 0, item.maximum ?? '', stockStatus(item),
      ]) },
  ];
}

export function purchaseSheets(data: PurchaseData, from: string, through: string): MaterialSheet[] {
  const headings = ['Sl. No.', 'PO Date', 'PO Number', 'Supplier Name', 'PO Item Name', 'PO Qty', 'UOM', 'Price'];
  const inRange = (day: string) => day >= from && day <= through;
  const orders = data.orders.filter(order => inRange(localDay(order.created_at)));
  const poLines = orders.flatMap(order => order.lines.map(line => ({
    cells: [displayDate(order.created_at), poNumber(order.number), order.supplier, line.name, line.quantity, line.unit, line.price],
    order,
  })));
  const ordersById = new Map(data.orders.map(order => [order.id, order]));
  const receiptLines = data.receipts.filter(receipt => inRange(receipt.inward_date)).flatMap(receipt => {
    const order = ordersById.get(receipt.po_id);
    if (!order) throw new Error('A GRN is missing its linked PO. Reload the report and try again.');
    return receipt.lines.map(line => {
      const ordered = order.lines.find(item => item.stock_id === line.stock_id);
      if (!ordered) throw new Error('A GRN line is missing its approved PO item.');
      return [displayDate(order.created_at), poNumber(order.number), order.supplier, ordered.name, ordered.quantity, ordered.unit, ordered.price,
        grnNumber(receipt.number), displayDate(receipt.created_at), displayDate(receipt.inward_date), line.quantity, line.price,
        receipt.supplier_invoice, displayDate(receipt.supplier_invoice_date), receipt.created_by];
    });
  });
  return [
    { name: 'Daily PO Report', headings: [...headings, 'Expected Delivery', 'Created By'],
      rows: poLines.map(({ cells, order }, i) => [i + 1, ...cells, displayDate(order.expected_date), order.created_by]), currency: [7] },
    { name: 'Approved Status', headings: [...headings, 'Approved Status', 'Reviewed By', 'Reviewed Date', 'Review Note'],
      rows: poLines.map(({ cells, order }, i) => [i + 1, ...cells, approvalLabel(order.status), order.reviewed_by ?? '', displayDate(order.reviewed_at), order.review_note ?? '']), currency: [7] },
    { name: 'GRN', headings: [...headings, 'GRN No.', 'GRN Date', 'Item Inward Date', 'GRN Qty', 'GRN Price', 'Supplier Invoice', 'Supplier Invoice Date', 'Received By'],
      rows: receiptLines.map((row, i) => [i + 1, ...row]), currency: [7, 12] },
  ];
}

export async function downloadMaterialWorkbook(file: string, sheets: MaterialSheet[]) {
  const { utils, writeFile } = await import('xlsx');
  const book = utils.book_new();
  for (const { name, headings, rows, currency = [] } of sheets) {
    const sheet = utils.aoa_to_sheet([headings, ...rows]);
    sheet['!cols'] = headings.map((heading, index) => ({
      wch: rows.reduce((width, row) => Math.max(width, Math.min(42, String(row[index] ?? '').length + 3)), heading.length + 4),
    }));
    sheet['!autofilter'] = { ref: utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headings.length - 1 } }) };
    for (let r = 1; r <= rows.length; r++) {
      for (const c of currency) {
        const cell = sheet[utils.encode_cell({ r, c })];
        if (cell?.t === 'n') cell.z = '"₹"#,##0.00';
      }
    }
    utils.book_append_sheet(book, sheet, name);
  }
  writeFile(book, file);
}

export async function readMaterialWorkbook(file: File, kind: 'stock' | 'supplier') {
  if (!/\.xlsx$/i.test(file.name) || file.size > 8 * 1024 * 1024) throw new Error('Choose an .xlsx workbook smaller than 8 MB.');
  const { read, utils } = await import('xlsx');
  const book = read(await file.arrayBuffer(), { type: 'array', sheetRows: 2003 });
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) throw new Error('The workbook is empty.');
  const rows = utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });
  const wanted = kind === 'stock' ? stockHeadings : supplierHeadings;
  const headings = rows.shift()?.map(cell => String(cell).trim());
  if (!headings || !wanted.every((heading, i) => headings[i] === heading)) {
    throw new Error('The columns do not match the template. Download a fresh copy and keep its headings.');
  }
  const populated = rows.map((cells, index) => ({ cells, number: index + 2 }))
    .filter(({ cells }) => cells.some(cell => String(cell).trim()));
  if (!populated.length || populated.length > 2000) throw new Error('A workbook must contain between 1 and 2,000 data rows.');
  return populated.map(({ cells, number }) => {
    const field = (i: number) => String(cells[i] ?? '').trim();
    const numeric = (i: number, optional = false) => {
      const value = field(i);
      if (!value && optional) return null;
      if (!/^-?\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) {
        throw new Error('Row ' + number + ' has an invalid ' + wanted[i] + '.');
      }
      return Number(value);
    };
    const required = (i: number) => {
      const value = field(i);
      if (!value) throw new Error('Row ' + number + ' requires ' + wanted[i] + '.');
      return value;
    };
    if (kind === 'stock') return {
      name: required(0), quantity: numeric(1), unit: required(2), minimum: numeric(3, true) ?? 0,
      maximum: numeric(4, true), expected: numeric(5, true),
    };
    const preferred = field(4).toLowerCase();
    if (!['', 'yes', 'no'].includes(preferred)) throw new Error('Row ' + number + ' must use Yes or No for Preferred.');
    return { supplier: required(0), name: required(1), unit: required(2), price: numeric(3, preferred !== 'yes') ?? 0,
      preferred: preferred === 'yes', contact: field(5), phone: field(6), email: field(7), address: field(8) };
  });
}

