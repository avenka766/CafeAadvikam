import { useRef, type ReactNode } from 'react';

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function displayDate(value: string) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Choose date';
}

export function AdminReportDateRange({ fromDate, toDate, setFromDate, setToDate, thirtyDays = false }: {
  fromDate: string; toDate: string; setFromDate: (value: string) => void; setToDate: (value: string) => void; thirtyDays?: boolean;
}) {
  const fromInput = useRef<HTMLInputElement>(null);
  const today = localDate();
  const ranges = [{ label: 'Today', days: 0 }, { label: 'Yesterday', days: -1 }, { label: '7 days', days: 6 }, ...(thirtyDays ? [{ label: '30 days', days: 29 }] : [])];
  const bounds = (days: number) => {
    const date = new Date(); date.setDate(date.getDate() - (days === -1 ? 1 : days));
    return [localDate(date), days === -1 ? localDate(date) : today];
  };
  const custom = !ranges.some(({ days }) => { const [from, to] = bounds(days); return from === fromDate && to === toDate; });
  return <section className="admin-range-control" aria-label="Report date range">
    <div className="admin-range-heading"><span>REPORT PERIOD</span><strong>{fromDate === toDate ? displayDate(fromDate) : `${displayDate(fromDate)} – ${displayDate(toDate)}`}</strong></div>
    <div className="admin-range-presets">
      {ranges.map(({ label, days }) => { const [from, to] = bounds(days); const active = fromDate === from && toDate === to;
        return <button key={label} type="button" aria-pressed={active} onClick={() => { setFromDate(from); setToDate(to); }}>{label}</button>;
      })}
      <button type="button" aria-pressed={custom} onClick={() => { fromInput.current?.focus(); fromInput.current?.showPicker?.(); }}>Custom</button>
    </div>
    <div className="admin-range-dates">
      <label><span>From</span><input ref={fromInput} aria-label="Report from date" type="date" value={fromDate} max={toDate || undefined} onChange={event => setFromDate(event.target.value)} /></label>
      <label><span>To</span><input aria-label="Report to date" type="date" value={toDate} min={fromDate || undefined} onChange={event => setToDate(event.target.value)} /></label>
    </div>
  </section>;
}

export function AdminSummaryCard({ label, value, sub, icon, tone = 'slate' }: {
  label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'purple';
}) {
  return <div className={`admin-summary-card admin-summary-${tone}`}>
    <div className="admin-summary-heading"><span>{label}</span><div className="admin-summary-icon">{icon}</div></div>
    <div className="admin-summary-value">{value}</div>
    {sub && <div className="admin-summary-note">{sub}</div>}
  </div>;
}
