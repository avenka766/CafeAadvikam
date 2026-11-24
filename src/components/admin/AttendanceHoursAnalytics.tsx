import { useMemo, useState } from 'react';
import { formatWorkDuration, summarizeWorkHours, type AttendanceTimes } from '@/lib/attendanceHours';

type Staff = { id: string; name: string; branch: string; department: string };
type WorkDay = AttendanceTimes & { present: boolean; half: boolean };
const duration = formatWorkDuration;

export default function AttendanceHoursAnalytics({ employees, daysInMonth, getDay }: {
  employees: Staff[];
  daysInMonth: number;
  getDay: (employeeId: string, day: number) => WorkDay | undefined;
}) {
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('');
  const branches = [...new Set(employees.map(employee => employee.branch))].sort();
  const scoped = employees.filter(employee => (!branch || employee.branch === branch)
    && [employee.name, employee.department, employee.branch].some(value => value?.toLowerCase().includes(search.trim().toLowerCase())));
  const dates = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const rows = useMemo(() => employees.map(employee => ({
    ...employee,
    ...summarizeWorkHours(Array.from({ length: daysInMonth }, (_, index) => getDay(employee.id, index + 1))),
  })).sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name)), [employees, daysInMonth, getDay]);
  const ids = new Set(scoped.map(employee => employee.id));
  const visible = rows.filter(employee => ids.has(employee.id));
  const totals = visible.reduce((sum, row) => ({
    minutes: sum.minutes + row.minutes, shifts: sum.shifts + row.shifts, missing: sum.missing + row.missing,
  }), { minutes: 0, shifts: 0, missing: 0 });
  const metrics = [
    ['Total recorded hours', duration(totals.minutes)],
    ['Average per complete shift', totals.shifts ? duration(totals.minutes / totals.shifts) : '—'],
    ['Complete shifts', totals.shifts],
    ['Days missing a time', totals.missing],
  ];

  return <section className="space-y-4 rounded-2xl border bg-card p-4" aria-label="Working hours analytics">
    <div>
      <h3 className="font-display text-base font-bold">Working hours</h3>
      <p className="text-xs text-muted-foreground">Hours use complete IN and OUT times. An earlier OUT time counts as the following day.</p>
    </div>
    <div className="flex flex-wrap gap-3">
      <label className="grid gap-1 text-xs font-semibold">Find employee
        <input type="search" className="rounded-lg border bg-background px-3 py-2 text-sm" value={search} onChange={event => setSearch(event.target.value)} />
      </label>
      <label className="grid gap-1 text-xs font-semibold">Branch
        <select className="rounded-lg border bg-background px-3 py-2 text-sm" value={branch} onChange={event => setBranch(event.target.value)}>
          <option value="">All branches</option>
          {branches.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
    </div>
    <dl className="grid gap-2 sm:grid-cols-4">
      {metrics.map(([label, value]) => <div key={label} className="rounded-xl border bg-muted/30 p-3">
        <dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-bold tabular-nums">{value}</dd>
      </div>)}
    </dl>
    <div className="overflow-x-auto" tabIndex={0} aria-label="Hours by employee">
      <table className="w-full whitespace-nowrap text-left text-sm">
        <thead><tr>{['Employee', 'Branch', 'Total hours', 'Average shift', 'Longest shift', 'Complete shifts', 'Missing time'].map(label =>
          <th key={label} scope="col" className="px-3 py-2">{label}</th>)}</tr></thead>
        <tbody>{visible.map(row => <tr className="border-t" key={row.id}>
          <th scope="row" className="px-3 py-2 font-semibold">{row.name}</th><td className="px-3 py-2">{row.branch}</td>
          <td className="px-3 py-2">{row.shifts ? duration(row.minutes) : '—'}</td>
          <td className="px-3 py-2">{row.shifts ? duration(row.minutes / row.shifts) : '—'}</td>
          <td className="px-3 py-2">{row.shifts ? duration(row.longest) : '—'}</td>
          <td className="px-3 py-2">{row.shifts}</td><td className="px-3 py-2">{row.missing}</td>
        </tr>)}</tbody>
      </table>
      {!visible.length && <p className="py-3 text-sm text-muted-foreground">No employees match the filters.</p>}
    </div>
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-semibold">Daily breakdown</summary>
      <ul className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {dates.map(day => {
          const result = summarizeWorkHours(scoped.map(employee => getDay(employee.id, day)));
          return <li key={day} className="rounded-lg bg-muted/30 p-2 text-xs">
            <strong>Day {day}</strong><p>{result.shifts ? duration(result.minutes) : '—'} · {result.shifts} complete</p>
            <p className="text-muted-foreground">{result.missing} missing time</p>
          </li>;
        })}
      </ul>
    </details>
  </section>;
}
