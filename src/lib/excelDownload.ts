export type ExcelExportValue = string | number | boolean | null | undefined;
export type ExcelExportRow = Record<string, ExcelExportValue>;

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeSheetName(value: string) {
  return value.replace(/[\\/:*?]/g, " ").replace(/[[\]]/g, " ").trim().slice(0, 31) || "Stock Audit";
}

function safeFilename(value: string) {
  const base = value.replace(/[\\/:*?"<>|]/g, "-").trim() || "export";
  return base.toLowerCase().endsWith(".xls") ? base : `${base}.xls`;
}

function numberStyle(header: string) {
  return /price|amount|value|cost/i.test(header) ? "Currency" : "Decimal";
}

/**
 * Downloads an Excel 2003 SpreadsheetML workbook. Excel and LibreOffice open
 * this format directly, while keeping numeric cells numeric for sorting/totals.
 */
export function downloadExcel(
  filename: string,
  sheetName: string,
  rows: ExcelExportRow[],
) {
  const safeRows = rows.length ? rows : [{ Note: "No data available" }];
  const headers = Array.from(
    safeRows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );

  const columnWidths = headers.map((header) => {
    const longest = safeRows.reduce(
      (max, row) => Math.max(max, String(row[header] ?? "").length),
      header.length,
    );
    return Math.min(260, Math.max(72, longest * 7.2 + 18));
  });

  const cellXml = (header: string, value: ExcelExportValue) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return `<Cell ss:StyleID="${numberStyle(header)}"><Data ss:Type="Number">${value}</Data></Cell>`;
    }
    if (typeof value === "boolean") {
      return `<Cell><Data ss:Type="Boolean">${value ? 1 : 0}</Data></Cell>`;
    }
    return `<Cell><Data ss:Type="String">${escapeXml(String(value ?? ""))}</Data></Cell>`;
  };

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Calibri" ss:Size="11"/></Style>
  <Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0F172A" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/></Borders></Style>
  <Style ss:ID="Decimal"><NumberFormat ss:Format="0.###"/></Style>
  <Style ss:ID="Currency"><NumberFormat ss:Format="₹#,##0.00;[Red]-₹#,##0.00"/></Style>
 </Styles>
 <Worksheet ss:Name="${escapeXml(safeSheetName(sheetName))}">
  <Table ss:ExpandedColumnCount="${headers.length}" ss:ExpandedRowCount="${safeRows.length + 1}" x:FullColumns="1" x:FullRows="1">
   ${columnWidths.map((width) => `<Column ss:AutoFitWidth="0" ss:Width="${width.toFixed(1)}"/>`).join("\n   ")}
   <Row ss:StyleID="Header" ss:AutoFitHeight="1">${headers.map((header) => `<Cell><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`).join("")}</Row>
   ${safeRows.map((row) => `<Row>${headers.map((header) => cellXml(header, row[header])).join("")}</Row>`).join("\n   ")}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions>
  <AutoFilter x:Range="R1C1:R${safeRows.length + 1}C${headers.length}" xmlns="urn:schemas-microsoft-com:office:excel"/>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFilename(filename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
