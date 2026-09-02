// Shared multi-sheet Excel + printable PDF report helpers for Admin Dashboard
// tabs. Excel uses the dependency-free safeSpreadsheet writer (same one
// AdminCreditTab already uses) so multiple sheets in one workbook is just
// multiple book_append_sheet calls. PDF uses jsPDF with hand-drawn tables
// (no autotable plugin dependency), following the pattern already
// established in AdminSNBDashboard.tsx's quotation PDF.

export type ReportColumn = { header: string; key: string; width?: number };
export type ReportSheet = { name: string; title: string; columns: ReportColumn[]; rows: Record<string, unknown>[] };

export async function exportWorkbook(filename: string, sheets: ReportSheet[]) {
  const XLSX = await import('@/lib/safeSpreadsheet');
  const wb = XLSX.utils.book_new();
  sheets.forEach((sheet) => {
    const aoa: unknown[][] = [];
    aoa.push([sheet.title]);
    aoa.push([`Exported ${new Date().toLocaleString('en-IN')}`]);
    aoa.push([]);
    aoa.push(sheet.columns.map((c) => c.header));
    (sheet.rows.length ? sheet.rows : [{}]).forEach((row) => {
      aoa.push(sheet.columns.map((c) => row[c.key] ?? ''));
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa as never);
    ws['!cols'] = sheet.columns.map((c) => ({ wch: c.width ?? Math.max(12, c.header.length + 2) }));
    // FEATURE (2026-09-02): row 0 is the sheet title (bold, larger), row 3 is the column
    // header row (bold, bordered, light fill) — matches the aoa layout built above
    // (title, exported-at, blank, headers, ...rows).
    ws['!bold'] = [0, 3];
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  });
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// jsPDF's built-in Helvetica font has no glyph for ₹ — same workaround used
// in AdminSNBDashboard.tsx's quotation PDF.
export function pdfMoney(value: number) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export type PdfColumn = { header: string; width: number; align?: 'left' | 'right' };
export type PdfSection = { heading: string; columns: PdfColumn[]; rows: string[][] };

export async function exportReportPdf(params: {
  filename: string;
  title: string;
  subtitle?: string;
  kpis?: Array<{ label: string; value: string }>;
  sections: PdfSection[];
}) {
  const { jsPDF } = await import('jspdf');
  const { filename, title, subtitle, kpis, sections } = params;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const marginX = 12;
  const pageWidth = 297;
  const pageHeight = 210;
  const contentWidth = pageWidth - marginX * 2;
  let y = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, marginX, y);
  y += 6;
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(subtitle, marginX, y);
    y += 5;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString('en-IN')}`, marginX, y);
  doc.setTextColor(20);
  y += 5;
  doc.setDrawColor(20);
  doc.setLineWidth(0.4);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 6;

  if (kpis && kpis.length > 0) {
    const colWidth = contentWidth / Math.min(kpis.length, 6);
    let x = marginX;
    let rowStartY = y;
    kpis.forEach((kpi, i) => {
      if (i > 0 && i % 6 === 0) { x = marginX; rowStartY = y; }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100);
      doc.text(kpi.label.toUpperCase(), x, rowStartY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(20);
      doc.text(kpi.value, x, rowStartY + 6);
      x += colWidth;
      if ((i + 1) % 6 === 0 || i === kpis.length - 1) y = rowStartY + 12;
    });
    y += 4;
  }

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 12) {
      doc.addPage();
      y = 14;
    }
  };

  sections.forEach((section, sIdx) => {
    if (sIdx > 0) y += 4;
    ensureSpace(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text(section.heading, marginX, y);
    y += 5;

    const totalColWidth = section.columns.reduce((s, c) => s + c.width, 0);
    const scale = totalColWidth > contentWidth ? contentWidth / totalColWidth : 1;
    const cols = section.columns.map((c) => ({ ...c, width: c.width * scale }));

    const drawHeaderRow = () => {
      let x = marginX;
      doc.setFillColor(240, 230, 210);
      doc.rect(marginX, y, contentWidth, 6.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(20);
      cols.forEach((col) => {
        const textX = col.align === 'right' ? x + col.width - 1.5 : x + 1.5;
        doc.text(col.header, textX, y + 4.5, { align: col.align ?? 'left', maxWidth: col.width - 3 });
        x += col.width;
      });
      y += 6.5;
    };

    if (section.rows.length === 0) {
      drawHeaderRow();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(120);
      doc.text('No records for the selected range.', marginX + 1.5, y + 4.5);
      y += 8;
      return;
    }

    drawHeaderRow();
    section.rows.forEach((row) => {
      ensureSpace(6.5);
      if (y === 14) drawHeaderRow();
      let x = marginX;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(30);
      cols.forEach((col, ci) => {
        const textX = col.align === 'right' ? x + col.width - 1.5 : x + 1.5;
        doc.text(String(row[ci] ?? ''), textX, y + 4.2, { align: col.align ?? 'left', maxWidth: col.width - 3 });
        x += col.width;
      });
      doc.setDrawColor(225);
      doc.setLineWidth(0.15);
      doc.line(marginX, y + 5.8, pageWidth - marginX, y + 5.8);
      y += 5.8;
    });
    y += 2;
  });

  doc.save(`${filename}.pdf`);
}
