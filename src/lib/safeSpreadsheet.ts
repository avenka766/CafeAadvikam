export type CellValue = string | number | boolean | null | undefined | Date;
export type RowObject = Record<string, unknown>;
export type WorkSheet = {
  name?: string;
  rows: CellValue[][];
  '!cols'?: Array<{ wch?: number }>;
};
export type WorkBook = {
  SheetNames: string[];
  Sheets: Record<string, WorkSheet>;
};

const escapeHtml = (value: CellValue) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normaliseFileName = (name: string) => name.replace(/\.xlsx$/i, '.xls');

function book_new(): WorkBook {
  return { SheetNames: [], Sheets: {} };
}

const toCellValue = (value: unknown): CellValue => {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) return value;
  return JSON.stringify(value);
};

function json_to_sheet(rows: RowObject[]): WorkSheet {
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key));
    return set;
  }, new Set<string>()));
  return {
    rows: [headers, ...rows.map((row) => headers.map((header) => toCellValue(row[header])))],
  };
}

function aoa_to_sheet(rows: CellValue[][]): WorkSheet {
  return { rows };
}

function book_append_sheet(wb: WorkBook, ws: WorkSheet, name: string) {
  const safeName = name || `Sheet ${wb.SheetNames.length + 1}`;
  ws.name = safeName;
  wb.SheetNames.push(safeName);
  wb.Sheets[safeName] = ws;
}

function worksheetToHtml(ws: WorkSheet, name: string) {
  const rows = ws.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
  return `<h2>${escapeHtml(name)}</h2><table border="1">${rows}</table>`;
}

function writeFile(wb: WorkBook, filename: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body>${wb.SheetNames
    .map((name) => worksheetToHtml(wb.Sheets[name], name))
    .join('<br/>')}</body></html>`;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    console.warn('[safeSpreadsheet] Export skipped because document is unavailable.');
    return;
  }
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = normaliseFileName(filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const utils = { book_new, json_to_sheet, aoa_to_sheet, book_append_sheet };
export { writeFile };
export default { utils, writeFile };
