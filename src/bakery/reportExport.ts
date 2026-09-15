// src/bakery/reportExport.ts
// Shared Excel + PDF report engine for Planner's merged Reports tab.
//
// FEATURE (2026-09-15): "top level Excel and PDF of all the sub tabs into
// one combined" + "PDF is not in proper draft, arrange everything properly"
// — before this, ReportsTab / PlannerLeftoverTab / PackingDispatchSummaryPanel
// each hand-rolled their own near-identical (but subtly inconsistent —
// 2-col vs 3-col KPI grids, different font sizes) jsPDF layout code, and
// there was no way to get one file covering every section. This module is
// the single layout engine all of them now go through, both for their own
// standalone "Excel"/"PDF" buttons (one section) and for the top-level
// "Export All" button (every section, one file) — same code path, so the
// combined report can't visually drift from the per-section ones.
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

export interface ExcelSheetSpec {
  name: string;
  rows: Record<string, unknown>[];
  fallback: string;
}

export interface ExcelSectionSpec {
  prefix: string;
  sheets: ExcelSheetSpec[];
}

// Excel sheet names may not contain any of : \ / ? * [ ] — real data here
// (e.g. "Leftover / Undispatched") can legitimately include a few of these,
// so every name is cleaned before use rather than trusting callers to know
// the rule.
const sanitizeSheetName = (raw: string) => raw.replace(/[:\\/?*[\]]/g, '-');

export function generateExcelReport(opts: { filename: string; sections: ExcelSectionSpec[] }): void {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  const combined = opts.sections.length > 1;
  const addSheet = (rawName: string, rows: Record<string, unknown>[], fallback: string) => {
    const cleanName = sanitizeSheetName(rawName);
    let name = cleanName.slice(0, 31);
    let i = 2;
    while (usedNames.has(name)) { const suffix = ` (${i++})`; name = `${cleanName.slice(0, 31 - suffix.length)}${suffix}`; }
    usedNames.add(name);
    const data = rows.length ? rows : [{ Note: fallback }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), name);
  };
  opts.sections.forEach((section) => {
    section.sheets.forEach((sheet) => {
      addSheet(combined ? `${section.prefix} - ${sheet.name}` : sheet.name, sheet.rows, sheet.fallback);
    });
  });
  XLSX.writeFile(wb, opts.filename);
}

export interface PdfTableSpec {
  title: string;
  headers: string[];
  colWidths: number[];
  rows: string[][];
  emptyText: string;
}

export interface PdfSectionSpec {
  title: string;
  subtitle?: string;
  accent?: [number, number, number];
  kpis?: [string, string][];
  kpiCols?: number;
  tables: PdfTableSpec[];
}

const TEAL: [number, number, number] = [13, 115, 108];

export function generatePdfReport(opts: {
  filename: string;
  docTitle: string;
  docSubtitle: string;
  sections: PdfSectionSpec[];
}): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const contentBottom = pageHeight - 34;
  let y = 0;

  const ensureRoom = (needed: number) => {
    if (y + needed > contentBottom) { doc.addPage(); y = 56; }
  };

  // ── Cover page (only when there's more than one section to summarize —
  // a single-section export just starts straight into its own banner). ────
  if (opts.sections.length > 1) {
    doc.setFillColor(...TEAL);
    doc.rect(0, 0, pageWidth, 150, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.setTextColor(255, 255, 255);
    doc.text('Cafe Aadvikam', marginX, 62);
    doc.setFontSize(16);
    doc.text(opts.docTitle, marginX, 90);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(opts.docSubtitle, marginX, 112);
    doc.text(`Generated ${new Date().toLocaleString('en-IN')}`, marginX, 128);

    y = 190;
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text('Contents', marginX, y);
    y += 22;
    opts.sections.forEach((section, i) => {
      doc.setFillColor(...(section.accent ?? TEAL));
      doc.circle(marginX + 6, y - 4, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
      doc.text(String(i + 1), marginX + 3.5, y - 1.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20);
      doc.text(section.title, marginX + 20, y);
      if (section.subtitle) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120);
        doc.text(section.subtitle, marginX + 20, y + 13);
        y += 13;
      }
      y += 22;
    });
    doc.addPage();
  }
  y = 56;

  opts.sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0 || opts.sections.length === 1) {
      if (sectionIndex > 0) { doc.addPage(); y = 56; }
    }
    const accent = section.accent ?? TEAL;

    // Section banner — a solid colour band makes it unmistakable where one
    // area's data ends and the next begins when everything is in one file.
    doc.setFillColor(...accent);
    doc.rect(0, y - 34, pageWidth, 56, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(255, 255, 255);
    doc.text(section.title, marginX, y - 8);
    if (section.subtitle) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(section.subtitle, marginX, y + 8);
    }
    doc.setTextColor(0);
    y += 38;

    if (section.kpis && section.kpis.length) {
      const cols = section.kpiCols ?? 3;
      const kpiColWidth = (pageWidth - marginX * 2) / cols;
      section.kpis.forEach(([label, value], i) => {
        const col = i % cols; const row = Math.floor(i / cols);
        const x = marginX + col * kpiColWidth;
        const yy = y + 16 + row * 38;
        ensureRoom(38);
        doc.setDrawColor(215); doc.setFillColor(250, 250, 250);
        doc.roundedRect(x, yy - 15, kpiColWidth - 8, 34, 3, 3, 'FD');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
        doc.text(label, x + 7, yy - 3, { maxWidth: kpiColWidth - 16 });
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20);
        doc.text(value, x + 7, yy + 13);
      });
      y += 16 + Math.ceil(section.kpis.length / cols) * 38 + 16;
    }

    section.tables.forEach((table) => {
      ensureRoom(44);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(20);
      doc.text(table.title, marginX, y);
      doc.setDrawColor(...accent); doc.setLineWidth(1.4);
      doc.line(marginX, y + 4, marginX + 34, y + 4);
      doc.setLineWidth(1);
      y += 16;
      const totalWidth = table.colWidths.reduce((a, b) => a + b, 0);
      const drawHeader = () => {
        doc.setFillColor(238, 238, 238); doc.setDrawColor(220);
        doc.rect(marginX, y - 10, totalWidth, 16, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(40);
        let x = marginX;
        table.headers.forEach((h, i) => { doc.text(h, x + 4, y, { maxWidth: table.colWidths[i] - 6 }); x += table.colWidths[i]; });
        y += 12;
      };
      drawHeader();
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(30);
      table.rows.forEach((cells, rowIndex) => {
        if (y > contentBottom - 10) { doc.addPage(); y = 56; drawHeader(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(30); }
        if (rowIndex % 2 === 1) { doc.setFillColor(247, 247, 247); doc.rect(marginX, y - 9, totalWidth, 13.5, 'F'); }
        let x = marginX;
        cells.forEach((c, i) => { doc.text(c, x + 4, y, { maxWidth: table.colWidths[i] - 6 }); x += table.colWidths[i]; });
        doc.setDrawColor(233); doc.line(marginX, y + 4, marginX + totalWidth, y + 4);
        y += 13.5;
      });
      if (table.rows.length === 0) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(130);
        doc.text(table.emptyText, marginX, y);
        y += 14; doc.setTextColor(0);
      }
      y += 14;
    });
  });

  // Footer — page numbers + generated-at, added last so it lands on every
  // page including ones appended mid-loop above.
  const totalPages = doc.internal.pages.length - 1;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(150);
    doc.text(`Cafe Aadvikam — ${opts.docTitle}`, marginX, pageHeight - 16);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - marginX - 60, pageHeight - 16);
  }

  doc.save(opts.filename);
}
