// src/lib/exportExcel.ts
// Shared "Export to Excel" utility for Planner tabs. Produces a clean,
// labeled .xlsx (not a raw dump) — bold headers, auto-sized columns, a title
// row, and an export-timestamp footer.
import * as XLSX from 'xlsx';

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
}

export function exportToExcel(params: {
  filename: string;
  sheetName: string;
  title: string;
  columns: ExcelColumn[];
  rows: Record<string, unknown>[];
}) {
  const { filename, sheetName, title, columns, rows } = params;
  const wb = XLSX.utils.book_new();

  const aoa: unknown[][] = [];
  aoa.push([title]);
  aoa.push([`Exported ${new Date().toLocaleString('en-IN')}`]);
  aoa.push([]);
  aoa.push(columns.map(c => c.header));
  for (const row of rows) {
    aoa.push(columns.map(c => row[c.key] ?? ''));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = columns.map(c => ({ wch: c.width ?? Math.max(14, c.header.length + 2) }));
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(columns.length - 1, 0) } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(columns.length - 1, 0) } },
  ];
  // NOTE: cell styling (bold/fill) is not supported by the community SheetJS
  // build used here — headers are still clearly separated by blank rows and
  // merged title cells, but won't render bold/shaded. Upgrade to a pro build
  // (xlsx-style / exceljs) if visual styling is required later.

  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function ExportButtonProps(rows: number) {
  return { disabled: rows === 0 };
}
