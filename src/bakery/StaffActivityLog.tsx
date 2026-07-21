// src/bakery/StaffActivityLog.tsx
// Admin view — full audit trail of every staff action in the bakery workflow.

import { useState, useEffect, useMemo } from 'react';
import { Loader2, RefreshCw, ClipboardList, Search, X } from 'lucide-react';
import { useActivityLogStore, type ActivityEntry } from './activityLogStore';
import { cn } from '@/lib/utils';

const ACTION_META: Record<string, { color: string; dot: string }> = {
  'Submitted Order':          { color: 'bg-blue-50 text-blue-700 border-blue-200',    dot: 'bg-blue-500'    },
  'Submitted Prepared Items': { color: 'bg-purple-50 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  'Dispatched Items':         { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
};

function getActionMeta(action: string) {
  return ACTION_META[action] ?? { color: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground' };
}

function ActivityCard({ entry }: { entry: ActivityEntry }) {
  const meta = getActionMeta(entry.action);
  return (
    <div className="flex gap-3 items-start py-3 border-b border-border last:border-0">
      <div className={cn('size-2 rounded-full mt-2 shrink-0', meta.dot)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full border', meta.color)}>
            {entry.action}
          </span>
          {entry.branch && (
            <span className="text-[10px] font-body text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {entry.branch}
            </span>
          )}
        </div>
        <p className="text-sm font-body text-foreground font-semibold truncate">{entry.staffName}</p>
        <p className="text-xs font-body text-muted-foreground mt-0.5 leading-relaxed">{entry.detail}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] font-body text-muted-foreground">
          {new Date(entry.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
        </p>
        <p className="text-[10px] font-body text-muted-foreground">
          {new Date(entry.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

export default function StaffActivityLog() {
  const { entries, loaded, loading, error, load } = useActivityLogStore();
  const [search,      setSearch]      = useState('');
  const [filterRole,  setFilterRole]  = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');

  useEffect(() => { if (!loaded) void load(); }, [loaded, load]);
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) load(); }, 10 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  const roles    = useMemo(() => ['all', ...Array.from(new Set(entries.map(e => e.role)))],    [entries]);
  const branches = useMemo(() => ['all', ...Array.from(new Set(entries.map(e => e.branch ?? '').filter(Boolean)))], [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(e => {
      if (filterRole   !== 'all' && e.role   !== filterRole)   return false;
      if (filterBranch !== 'all' && e.branch !== filterBranch) return false;
      if (q && !e.staffName.toLowerCase().includes(q) && !e.detail.toLowerCase().includes(q) && !e.action.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, search, filterRole, filterBranch]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, ActivityEntry[]>();
    for (const e of filtered) {
      const date = new Date(e.createdAt).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(e);
    }
    return map;
  }, [filtered]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 text-muted-foreground" />
          <p className="text-sm font-body font-bold text-foreground">Staff Activity Log</p>
          <span className="text-[10px] font-body text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {filtered.length} entries
          </span>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          aria-label="Refresh activity log"
          className="size-9 flex items-center justify-center rounded-xl border border-border active:scale-90"
        >
          <RefreshCw className={cn('size-3.5 text-muted-foreground', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search staff, action, detail…"
          className="w-full h-10 pl-9 pr-9 rounded-xl border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="size-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Filter pills */}
      <p className="text-[10px] text-muted-foreground sm:hidden">Swipe horizontally to see all filters →</p>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" tabIndex={0} aria-label="Activity filters; scroll horizontally for more">
        {/* Role filter */}
        <div className="flex gap-1 shrink-0">
          {roles.map(r => (
            <button
              key={r}
              onClick={() => setFilterRole(r)}
              className={cn(
                'px-3 py-1.5 rounded-full text-[11px] font-body font-semibold border transition-all shrink-0',
                filterRole === r ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border'
              )}
            >
              {r === 'all' ? 'All Roles' : r}
            </button>
          ))}
        </div>
        <div className="w-px bg-border shrink-0 self-stretch" />
        {/* Branch filter */}
        {branches.map(b => (
          <button
            key={b}
            onClick={() => setFilterBranch(b)}
            className={cn(
              'px-3 py-1.5 rounded-full text-[11px] font-body font-semibold border transition-all shrink-0',
              filterBranch === b ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border'
            )}
          >
            {b === 'all' ? 'All Branches' : b}
          </button>
        ))}
      </div>

      {/* Log list */}
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">Failed to load activity log: {error}<button className="ml-2 underline" onClick={() => void load()}>Retry</button></div>
      ) : loading && !loaded ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <ClipboardList className="size-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm font-body text-muted-foreground">No activity found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([date, dayEntries]) => (
            <div key={date} className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-2 bg-muted/50 border-b border-border">
                <p className="text-[11px] font-body font-bold text-muted-foreground uppercase tracking-wide">{date}</p>
              </div>
              <div className="px-4">
                {dayEntries.map(e => <ActivityCard key={e.id} entry={e} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
