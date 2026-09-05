// src/components/admin/SortableTable.tsx
// FEATURE (2026-09-05): "Also allow sort in all the tab" — a small, shared
// click-to-sort helper for the Admin Dashboard's bill-wise tables (Branch
// Sales, Hosur Sales, Cafe Control, Dispatch Details), so every one of them
// gets the same behavior instead of four separate hand-rolled copies.
import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortDir = 'asc' | 'desc';

export function useSortableRows<T>(
  rows: T[],
  getValue: (row: T, key: string) => string | number,
  initialKey: string,
  initialDir: SortDir = 'desc',
) {
  const [sortKey, setSortKey] = useState(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = getValue(a, sortKey);
      const bv = getValue(b, sortKey);
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  return { sorted, sortKey, sortDir, toggleSort };
}

export function SortableTh({
  label, sortKey, activeKey, dir, onSort, align = 'left', className,
}: {
  label: React.ReactNode;
  sortKey: string;
  activeKey: string;
  dir: SortDir;
  onSort: (key: string) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = sortKey === activeKey;
  return (
    <th
      className={cn('p-3 cursor-pointer select-none whitespace-nowrap hover:text-slate-700', align === 'right' && 'text-right', className)}
      onClick={() => onSort(sortKey)}
    >
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
        {label}
        {active
          ? (dir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)
          : <ChevronsUpDown className="size-3 opacity-30" />}
      </span>
    </th>
  );
}
