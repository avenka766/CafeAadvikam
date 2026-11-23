import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { businessDateTime } from '@/lib/businessDate';
import { downloadExcel } from '@/lib/excelDownload';

interface UpiClosureRow {
  id: string;
  closure_date: string;
  created_at: string;
  cashier: string;
  upi_total: number | string | null;
  actual_upi: number | string | null;
  upi_difference: number | string | null;
  upi_notes: string | null;
}

export default function BranchUpiClosureReport({ branch, fromDate, toDate }: {
  branch: 'SNB' | 'VRSNB';
  fromDate: string;
  toDate: string;
}) {
  const [rows, setRows] = useState<UpiClosureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError('');
    const all: UpiClosureRow[] = [];
    try {
      const pageSize = 500;
      for (let offset = 0; id === request.current; offset += pageSize) {
        const { data, error: reportError } = await supabase.rpc('branch_counter_upi_report_v1', {
          p_branch: branch, p_from: fromDate, p_to: toDate,
        }).range(offset, offset + pageSize - 1);
        if (reportError) throw Error(reportError.message);
        const page = (data ?? []) as UpiClosureRow[];
        all.push(...page);
        if (page.length < pageSize) break;
      }
      if (id === request.current) setRows(all);
    } catch (error) {
      if (id === request.current) {
        setRows([]);
        setError(error instanceof Error ? error.message : 'Could not load UPI closures. Refresh to try again.');
      }
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [branch, fromDate, toDate]);
  useEffect(() => {
    void load();
    return () => { request.current++; };
  }, [load]);

  const displayMoney = (value: number | string | null) => value == null ? '—' : formatCurrency(Number(value));
  const headers = ['Date', 'Cashier', 'System UPI', 'Entered UPI', 'UPI difference', 'Remarks'];
  const exportRows = rows.map(row => ({
    Date: businessDateTime(row.created_at), Cashier: row.cashier, 'System UPI': Number(row.upi_total ?? 0),
    'Entered UPI': row.actual_upi == null ? '' : Number(row.actual_upi),
    'UPI difference': row.upi_difference == null ? '' : Number(row.upi_difference), Remarks: row.upi_notes ?? '',
  }));

  return (
    <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-black text-slate-900">Counter UPI reconciliation</h3>
        <div className="flex gap-2">
          <button type="button" disabled={loading} onClick={() => void load()} className="rounded-xl border px-3 py-2 text-xs font-bold">Refresh</button>
          <button type="button" disabled={loading || !rows.length} onClick={() => downloadExcel(branch + '_Counter_UPI_Reconciliation.xls', 'UPI reconciliation', exportRows)} className="rounded-xl border px-3 py-2 text-xs font-bold">Excel</button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {loading ? <p role="status" className="text-sm text-slate-500">Loading counter closures…</p> :
        !error && (!rows.length ? <p className="text-sm text-slate-500">No closures for the selected dates.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600"><tr>{headers.map(header => <th key={header} className="px-3 py-2">{header}</th>)}</tr></thead>
              <tbody>{rows.map(row => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{businessDateTime(row.created_at)}</td>
                  <td className="px-3 py-2">{row.cashier}</td>
                  <td className="px-3 py-2">{displayMoney(row.upi_total)}</td>
                  <td className="px-3 py-2">{displayMoney(row.actual_upi)}</td>
                  <td className={Number(row.upi_difference) === 0 ? 'px-3 py-2' : 'px-3 py-2 font-bold text-amber-800'}>{displayMoney(row.upi_difference)}</td>
                  <td className="px-3 py-2">{row.upi_notes || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ))}
    </section>
  );
}
