// src/components/KitchenWasteLogTab.tsx
// Shared Kitchen Waste Log viewer for Admin and VRSNB Admin dashboards.
// Shows the last 7 days of waste entries with Excel download support.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { businessDate } from '@/lib/businessDate';
import { Trash2, Download, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WasteEntry {
  id: string;
  food_item: string;
  quantity: string;
  logged_at: string;
}

function groupByDate(entries: WasteEntry[]): Record<string, WasteEntry[]> {
  return entries.reduce<Record<string, WasteEntry[]>>((acc, entry) => {
    const date = entry.logged_at.slice(0, 10);
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {});
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  const label = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  if (diff === 0) return `Today · ${label}`;
  if (diff === 1) return `Yesterday · ${label}`;
  return label;
}

export default function KitchenWasteLogTab() {
  const [entries, setEntries] = useState<WasteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    // Use UTC date arithmetic to match Supabase's UTC timestamps (consistent with KitchenDashboard)
    const todayUTC = businessDate();
    const sinceDate = new Date(todayUTC);
    sinceDate.setUTCDate(sinceDate.getUTCDate() - 6);
    const sinceISO = sinceDate.toISOString().slice(0, 10) + 'T00:00:00';

    const { data, error: err } = await supabase
      .from('kitchen_waste_log')
      .select('id, food_item, quantity, logged_at')
      .gte('logged_at', sinceISO)
      .order('logged_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setEntries((data as WasteEntry[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const XLSX = await import('@/lib/safeSpreadsheet');
      const rows = entries.map(e => ({
        Date: e.logged_at.slice(0, 10),
        Time: new Date(e.logged_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        'Food Item': e.food_item,
        Quantity: e.quantity,
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No waste data in last 7 days' }]),
        'Kitchen Waste Log'
      );
      XLSX.writeFile(wb, `KitchenWasteLog_7days_${businessDate()}.xlsx`);
    } catch (e) {
      console.error('XLSX download failed', e);
    } finally {
      setDownloading(false);
    }
  };

  const grouped = groupByDate(entries);
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-xl flex items-center justify-center bg-red-50">
            <Trash2 className="size-4 text-red-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Kitchen Waste Log</p>
            <p className="text-[11px] text-muted-foreground">Last 7 days</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-muted transition disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading || loading || entries.length === 0}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-muted transition disabled:opacity-50"
          >
            {downloading
              ? <Loader2 className="size-3 animate-spin" />
              : <Download className="size-3" />}
            Excel
          </button>
        </div>
      </div>

      {/* Summary */}
      {!loading && entries.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-50 border border-red-100 rounded-2xl p-3 text-center">
            <p className="font-display text-2xl font-bold text-red-700 tabular-nums">{entries.length}</p>
            <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mt-0.5">Total Entries</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-3 text-center">
            <p className="font-display text-2xl font-bold text-foreground tabular-nums">{sortedDates.length}</p>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-0.5">Days with Waste</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="size-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!loading && !error && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
            <Trash2 className="size-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No waste logged in the last 7 days</p>
        </div>
      )}

      {/* Grouped by date */}
      {!loading && sortedDates.map(date => (
        <div key={date} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              {formatDateLabel(date)}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-bold">
              {grouped[date].length} {grouped[date].length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <div className="space-y-1.5">
            {grouped[date].map(entry => (
              <div
                key={entry.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border"
              >
                <div className="size-8 rounded-xl flex items-center justify-center shrink-0 bg-red-50">
                  <Trash2 className="size-3.5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{entry.food_item}</p>
                  <p className="text-[11px] text-muted-foreground">{entry.quantity}</p>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                  {new Date(entry.logged_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
