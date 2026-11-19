import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadMaterialWorkbook, type MaterialSheet } from '@/bakery/materialWorkspaceExcel';

export default function CatalogueExcelButton({ filename, sheet, disabled }: {
  filename: string;
  sheet: () => MaterialSheet;
  disabled?: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(false);

  async function exportExcel() {
    setExporting(true);
    setError(false);
    try {
      await downloadMaterialWorkbook(filename, [sheet()]);
    } catch {
      setError(true);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-w-max">
      <Button type="button" variant="outline" size="sm" disabled={disabled || exporting} onClick={() => void exportExcel()}>
        <Download className="size-4" /> {exporting ? 'Exporting…' : 'Export Excel'}
      </Button>
      {error && <p role="alert" className="mt-1 text-xs text-destructive">Could not download Excel. Try again.</p>}
    </div>
  );
}

