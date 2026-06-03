import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Users, Building2, Search, ChevronDown, ChevronUp,
  IndianRupee, Calendar, TrendingDown, Plus, Trash2,
  Download, UserPlus, X, Pencil, Loader2,
  AlertCircle, CheckCircle2, BarChart3, CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useScrollLock } from '@/hooks/useScrollLock';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import EmptyState from '@/components/ui/EmptyState';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer, RadialBarChart, RadialBar,
} from 'recharts';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────
type Branch = 'VRSNB' | 'Cafe Aadvikam' | 'SNB' | 'Hosur';

interface Employee {
  id: string;
  name: string;
  branch: Branch;
  department: string;
  grossSalary: number;
  salaryAdvance: number;
  uniformDeduction: number;
  otherDeduction: number;
  accountNumber?: string;
  bankName?: string;
  ifscCode?: string;
}

interface DayAttendance {
  present: boolean;
  half: boolean;   // half day
  woff: boolean;
  bf: boolean;
  lunch: boolean;
  dinner: boolean;
}

type MonthAttendance = Record<string, DayAttendance>;

interface SalaryAdvanceRecord {
  id: string;
  employeeId: string;
  amount: number;
  givenDate: string; // ISO date string e.g. "2025-05-15"
  note?: string;
  cleared: boolean;
}

interface DeductionDecision {
  deductAdvance: boolean;
  deductOther: boolean;
  deductUniform: boolean;
  deductESI: boolean;
  deductPF: boolean;
}
type DeductionDecisions = Record<string, DeductionDecision>;

// ESI: 0.75% employee deduction (applicable if gross <= 21000)
// PF: 12% of gross
const ESI_RATE = 0.0075;
const PF_RATE  = 0.12;
const ESI_WAGE_LIMIT = 21000;

function calcESI(gross: number) { return gross <= ESI_WAGE_LIMIT ? Math.round(gross * ESI_RATE) : 0; }
function calcPF(gross: number)  { return Math.min(1800, Math.round(gross * PF_RATE)); }

// ─── Constants ────────────────────────────────────────────────────────────────
const BRANCHES: Branch[] = ['VRSNB', 'Cafe Aadvikam', 'SNB', 'Hosur'];
const BRANCH_COLORS: Record<Branch, string> = {
  VRSNB: 'bg-blue-100 text-blue-800 border-blue-200',
  'Cafe Aadvikam': 'bg-orange-100 text-orange-800 border-orange-200',
  SNB: 'bg-amber-100 text-amber-700 border-amber-200',
  Hosur: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};
const BRANCH_SHORT: Record<Branch, string> = {
  VRSNB: 'VRSNB',
  'Cafe Aadvikam': 'Cafe',
  SNB: 'SNB',
  Hosur: 'Hosur',
};

const CHART_COLORS = ['#E07A3A', '#2563EB', '#059669', '#F59E0B', '#DC2626', '#7C3AED'];

const ak = (eid: string, d: number) => `${eid}_${d}`;
const defaultDay = (): DayAttendance => ({ present: false, half: false, woff: false, bf: false, lunch: false, dinner: false });
const defaultDecision = (): DeductionDecision => ({ deductAdvance: false, deductOther: true, deductUniform: true, deductESI: false, deductPF: false });

// ─── Month helpers ─────────────────────────────────────────────────────────────
function getMonthMeta(year: number, month: number) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const label = new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  return { daysInMonth, label };
}

function getTwoMonths() {
  const now = new Date();
  const current = { year: now.getFullYear(), month: now.getMonth() + 1 };
  let prevMonth = current.month - 1;
  let prevYear = current.year;
  if (prevMonth === 0) { prevMonth = 12; prevYear--; }
  return [
    { ...current, ...getMonthMeta(current.year, current.month) },
    { year: prevYear, month: prevMonth, ...getMonthMeta(prevYear, prevMonth) },
  ];
}

// ─── DB helpers ───────────────────────────────────────────────────────────────
function dbRowToEmployee(d: Record<string, unknown>): Employee {
  return {
    id: d.id as string,
    name: d.name as string,
    branch: d.branch as Branch,
    department: (d.department as string) || '',
    grossSalary: Number(d.gross_salary),
    salaryAdvance: Number(d.salary_advance),
    uniformDeduction: Number(d.uniform_deduction),
    otherDeduction: Number(d.other_deduction),
    accountNumber: (d.account_number as string) || undefined,
    bankName: (d.bank_name as string) || undefined,
    ifscCode: (d.ifsc_code as string) || undefined,
  };
}

async function fetchEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase.from('employees').select('*').eq('is_active', true).order('id', { ascending: true });
  if (error) throw error;
  return (data || []).map(dbRowToEmployee);
}

async function fetchAttendance(year: number, month: number): Promise<MonthAttendance> {
  const { data, error } = await supabase.from('attendance').select('*').eq('year', year).eq('month', month);
  if (error) throw error;
  const result: MonthAttendance = {};
  for (const row of (data || [])) {
    const k = ak(row.employee_id as string, row.day as number);
    result[k] = { present: row.present as boolean, half: (row.half ?? false) as boolean, woff: row.woff as boolean, bf: row.bf as boolean, lunch: row.lunch as boolean, dinner: row.dinner as boolean };
  }
  return result;
}

async function upsertAttendance(employeeId: string, year: number, month: number, day: number, val: DayAttendance) {
  const { error } = await supabase.from('attendance').upsert({ employee_id: employeeId, year, month, day, present: val.present, half: val.half, woff: val.woff, bf: val.bf, lunch: val.lunch, dinner: val.dinner }, { onConflict: 'employee_id,year,month,day' });
  if (error) console.error('Attendance upsert failed:', error.message);
}

async function fetchDeductionDecisions(year: number, month: number): Promise<DeductionDecisions> {
  const { data, error } = await supabase.from('deduction_decisions').select('*').eq('year', year).eq('month', month);
  if (error) { console.warn('deduction_decisions fetch:', error.message); return {}; }
  const result: DeductionDecisions = {};
  for (const row of (data || [])) {
    result[row.employee_id as string] = { deductAdvance: row.deduct_advance as boolean, deductOther: row.deduct_other as boolean, deductUniform: row.deduct_uniform as boolean, deductESI: (row.deduct_esi ?? false) as boolean, deductPF: (row.deduct_pf ?? false) as boolean };
  }
  return result;
}

async function upsertDeductionDecision(employeeId: string, year: number, month: number, decision: DeductionDecision) {
  const { error } = await supabase.from('deduction_decisions').upsert({ employee_id: employeeId, year, month, deduct_advance: decision.deductAdvance, deduct_other: decision.deductOther, deduct_uniform: decision.deductUniform, deduct_esi: decision.deductESI, deduct_pf: decision.deductPF }, { onConflict: 'employee_id,year,month' });
  if (error) console.error('Deduction decision upsert failed:', error.message);
}

async function insertEmployee(emp: Omit<Employee, 'id'> & { id?: string }): Promise<Employee | null> {
  const id = emp.id || `emp_${Date.now()}`;
  const { data, error } = await supabase.from('employees').insert({ id, name: emp.name, branch: emp.branch, department: emp.department, gross_salary: emp.grossSalary, salary_advance: emp.salaryAdvance, uniform_deduction: emp.uniformDeduction, other_deduction: emp.otherDeduction, account_number: emp.accountNumber || null, bank_name: emp.bankName || null, ifsc_code: emp.ifscCode || null }).select().single();
  if (error || !data) { console.error('Insert employee failed:', error?.message); return null; }
  return dbRowToEmployee(data as Record<string, unknown>);
}

async function updateEmployee(emp: Employee): Promise<boolean> {
  const { error } = await supabase.from('employees').update({ name: emp.name, branch: emp.branch, department: emp.department, gross_salary: emp.grossSalary, salary_advance: emp.salaryAdvance, uniform_deduction: emp.uniformDeduction, other_deduction: emp.otherDeduction, account_number: emp.accountNumber || null, bank_name: emp.bankName || null, ifsc_code: emp.ifscCode || null }).eq('id', emp.id);
  if (error) { console.error('Update employee failed:', error.message); return false; }
  return true;
}

async function clearAdvance(employeeId: string): Promise<void> {
  const { error } = await supabase.from('employees').update({ salary_advance: 0 }).eq('id', employeeId);
  if (error) throw error;
  // Also mark all uncleared advances for this employee as cleared
  await supabase.from('salary_advances').update({ cleared: true }).eq('employee_id', employeeId).eq('cleared', false);
}

// ─── Advance Records DB helpers ───────────────────────────────────────────────
async function fetchAdvanceRecords(): Promise<{ records: SalaryAdvanceRecord[]; tableReady: boolean }> {
  const { data, error } = await supabase
    .from('salary_advances')
    .select('*')
    .order('given_date', { ascending: false });
  if (error) {
    console.warn('salary_advances fetch:', error.message);
    return { records: [], tableReady: false };
  }
  const records = (data || []).map(r => ({
    id: r.id as string,
    employeeId: r.employee_id as string,
    amount: Number(r.amount),
    givenDate: r.given_date as string,
    note: (r.note as string) || undefined,
    cleared: r.cleared as boolean,
  }));
  return { records, tableReady: true };
}

async function insertAdvanceRecord(rec: Omit<SalaryAdvanceRecord, 'id' | 'cleared'>): Promise<{ ok: SalaryAdvanceRecord } | { err: string }> {
  const { data, error } = await supabase
    .from('salary_advances')
    .insert({ employee_id: rec.employeeId, amount: rec.amount, given_date: rec.givenDate, note: rec.note || null, cleared: false })
    .select()
    .single();
  if (error || !data) {
    const msg = error?.message ?? 'No data returned';
    console.error('Insert advance failed:', msg);
    return { err: msg };
  }
  // Also update the employee's salary_advance field to reflect total outstanding
  const { data: emp } = await supabase.from('employees').select('salary_advance').eq('id', rec.employeeId).single();
  const current = Number((emp as { salary_advance: number } | null)?.salary_advance ?? 0);
  await supabase.from('employees').update({ salary_advance: current + rec.amount }).eq('id', rec.employeeId);
  return { ok: {
    id: data.id as string,
    employeeId: data.employee_id as string,
    amount: Number(data.amount),
    givenDate: data.given_date as string,
    note: (data.note as string) || undefined,
    cleared: data.cleared as boolean,
  }};
}

async function markAdvanceRecordCleared(advanceId: string, employeeId: string, amount: number): Promise<void> {
  const { error } = await supabase.from('salary_advances').update({ cleared: true }).eq('id', advanceId);
  if (error) throw error;
  // Deduct this amount from employee's salary_advance field
  const { data: emp } = await supabase.from('employees').select('salary_advance').eq('id', employeeId).single();
  const current = Number((emp as { salary_advance: number } | null)?.salary_advance ?? 0);
  await supabase.from('employees').update({ salary_advance: Math.max(0, current - amount) }).eq('id', employeeId);
}

async function deactivateEmployee(id: string): Promise<void> {
  const { error } = await supabase.from('employees').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

async function deleteOldAttendance(currentYear: number, currentMonth: number): Promise<void> {
  try {
    let cutoffMonth = currentMonth - 2;
    let cutoffYear = currentYear;
    if (cutoffMonth <= 0) { cutoffMonth += 12; cutoffYear--; }
    await supabase.from('attendance').delete().lt('year', cutoffYear);
    await supabase.from('attendance').delete().eq('year', cutoffYear).lt('month', cutoffMonth);
    await supabase.from('deduction_decisions').delete().lt('year', cutoffYear);
    await supabase.from('deduction_decisions').delete().eq('year', cutoffYear).lt('month', cutoffMonth);
  } catch (e) { console.warn('Old data cleanup failed:', e); }
}

// ─── Salary Calc ──────────────────────────────────────────────────────────────
function calcSalary(emp: Employee, att: MonthAttendance, daysInMonth: number, decision: DeductionDecision) {
  let presentDays = 0, halfDays = 0, woffDays = 0, canteenTotal = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const a = att[ak(emp.id, d)];
    if (!a) continue;
    if (a.present) presentDays++;
    if (a.half)    halfDays++;
    if (a.woff)    woffDays++;
    if (a.present || a.half) {
      const m = [a.bf, a.lunch, a.dinner].filter(Boolean).length;
      canteenTotal += m === 3 ? 30 : m * 10;
    }
  }
  const worked = presentDays + halfDays * 0.5 + woffDays;
  const wagePd = emp.grossSalary > 0 ? emp.grossSalary / daysInMonth : 0;
  const earned = Math.round(wagePd * worked);
  const advanceDed  = decision.deductAdvance ? emp.salaryAdvance : 0;
  const uniformDed  = decision.deductUniform ? emp.uniformDeduction : 0;
  const otherDed    = decision.deductOther   ? emp.otherDeduction : 0;
  const esiDed      = decision.deductESI     ? calcESI(emp.grossSalary) : 0;
  const pfDed       = decision.deductPF      ? calcPF(emp.grossSalary)  : 0;
  const totalDed = advanceDed + canteenTotal + uniformDed + otherDed + esiDed + pfDed;
  return { presentDays, halfDays, woffDays, worked, canteenTotal, earned, totalDed, advanceDed, uniformDed, otherDed, esiDed, pfDed, net: Math.max(0, earned - totalDed) };
}

// ─── Excel Export ─────────────────────────────────────────────────────────────
function exportExcel(
  employees: Employee[],
  att: MonthAttendance,
  decisions: DeductionDecisions,
  daysInMonth: number,
  monthLabel: string,
  getDecision: (id: string) => DeductionDecision
) {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Salary Summary ──
  const salaryHeaders = [
    '#', 'Name', 'Branch', 'Department', 'Gross Salary', 'Days Present', 'Half Days',
    'Week Offs', 'Days Worked', 'Earned', 'Food Deduction', 'Advance Ded.',
    'Uniform Ded.', 'Other Ded.', 'ESI (0.75%)', 'PF (12%)', 'Total Deductions', 'Net Payable', 'Bank', 'Account No.', 'IFSC',
  ];
  const salaryRows = employees.map((e, i) => {
    const d = getDecision(e.id);
    const c = calcSalary(e, att, daysInMonth, d);
    return [
      i + 1, e.name, e.branch, e.department,
      e.grossSalary, c.presentDays, c.halfDays, c.woffDays, c.worked,
      c.earned, c.canteenTotal, c.advanceDed, c.uniformDed, c.otherDed,
      c.esiDed, c.pfDed, c.totalDed, c.net,
      e.bankName || '', e.accountNumber || '', e.ifscCode || '',
    ];
  });

  // Totals row
  const totals = ['', 'TOTAL', '', '',
    employees.reduce((s, e) => s + e.grossSalary, 0), '', '', '', '',
    employees.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).earned, 0),
    employees.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).canteenTotal, 0),
    employees.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).advanceDed, 0),
    employees.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).uniformDed, 0),
    employees.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).otherDed, 0),
    employees.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).esiDed, 0),
    employees.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).pfDed, 0),
    employees.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).totalDed, 0),
    employees.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).net, 0),
    '', '', '',
  ];

  const ws1 = XLSX.utils.aoa_to_sheet([
    [`SALARY REPORT — ${monthLabel.toUpperCase()}`],
    [`Cafe Aadvikam Group | Generated on ${new Date().toLocaleDateString('en-IN')} | Confidential`],
    [],
    salaryHeaders,
    ...salaryRows,
    totals,
  ]);

  // Column widths
  ws1['!cols'] = [4, 22, 16, 14, 14, 12, 10, 12, 14, 14, 13, 13, 13, 16, 14, 16, 18, 14].map(w => ({ wch: w }));
  ws1['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 17 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 17 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Salary Summary');

  // ── Sheet 2: Attendance Detail ──
  const attHeaders = ['#', 'Name', 'Branch', 'Dept',
    ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
    'Present', 'Week Off', 'Worked', 'Net Payable',
  ];

  const attRows = employees.map((e, i) => {
    const d = getDecision(e.id);
    const c = calcSalary(e, att, daysInMonth, d);
    const days = Array.from({ length: daysInMonth }, (_, di) => {
      const a = att[ak(e.id, di + 1)];
      if (!a) return '';
      if (a.present) return 'P';
      if (a.half)    return 'H';
      if (a.woff) return 'W';
      return '';
    });
    return [i + 1, e.name, e.branch, e.department, ...days, c.presentDays, c.woffDays, c.worked, c.net];
  });

  const ws2 = XLSX.utils.aoa_to_sheet([
    [`ATTENDANCE REGISTER — ${monthLabel.toUpperCase()}`],
    ['P = Present   W = Week Off   blank = Absent'],
    [],
    attHeaders,
    ...attRows,
  ]);
  ws2['!cols'] = [4, 20, 14, 12, ...Array(daysInMonth).fill({ wch: 4 }), 10, 10, 10, 14];
  ws2['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: daysInMonth + 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: daysInMonth + 7 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Attendance Detail');

  // Save
  XLSX.writeFile(wb, `CafeAadvikam_SalaryReport_${monthLabel.replace(' ', '_')}.xlsx`);
}

// ─── Attendance-only Excel Export ─────────────────────────────────────────────
function exportAttendanceExcel(
  employees: Employee[],
  att: MonthAttendance,
  decisions: DeductionDecisions,
  daysInMonth: number,
  monthLabel: string,
  getDecision: (id: string) => DeductionDecision
) {
  const wb = XLSX.utils.book_new();

  // ── Sheet: Attendance Register ──
  const attHeaders = [
    '#', 'Name', 'Branch', 'Department',
    ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
    'Present', 'Half Days', 'Week Offs', 'Total Worked', 'Food Ded. (₹)', 'Net Payable (₹)',
  ];

  const attRows = employees.map((e, i) => {
    const d = getDecision(e.id);
    const c = calcSalary(e, att, daysInMonth, d);
    const days = Array.from({ length: daysInMonth }, (_, di) => {
      const a = att[ak(e.id, di + 1)];
      if (!a) return '';
      if (a.present) return 'P';
      if (a.half)    return 'H';
      if (a.woff)    return 'W';
      return 'A';
    });
    return [i + 1, e.name, e.branch, e.department, ...days, c.presentDays, c.halfDays, c.woffDays, c.worked, c.canteenTotal, c.net];
  });

  // Totals row
  const totals = [
    '', 'TOTAL', '', '',
    ...Array(daysInMonth).fill(''),
    employees.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).presentDays, 0),
    employees.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).halfDays, 0),
    employees.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).woffDays, 0),
    '',
    employees.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).canteenTotal, 0),
    employees.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).net, 0),
  ];

  const ws = XLSX.utils.aoa_to_sheet([
    [`ATTENDANCE REGISTER — ${monthLabel.toUpperCase()}`],
    [`Cafe Aadvikam Group | Generated on ${new Date().toLocaleDateString('en-IN')} | ${employees.length} employees`],
    ['P = Present   H = Half Day   W = Week Off   A = Absent'],
    [],
    attHeaders,
    ...attRows,
    totals,
  ]);

  ws['!cols'] = [
    { wch: 4 }, { wch: 22 }, { wch: 16 }, { wch: 14 },
    ...Array(daysInMonth).fill({ wch: 4 }),
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 13 }, { wch: 13 }, { wch: 14 },
  ];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: daysInMonth + 11 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: daysInMonth + 11 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: daysInMonth + 11 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Attendance Register');

  // ── Sheet 2: Per-employee meal detail ──
  const mealHeaders = ['#', 'Name', 'Branch', 'Department', 'Day', 'Breakfast', 'Lunch', 'Dinner', 'Meal Cost (₹)'];
  const mealRows: (string | number)[][] = [];
  let mealIdx = 1;
  employees.forEach(e => {
    for (let d = 1; d <= daysInMonth; d++) {
      const a = att[ak(e.id, d)];
      if (!a || (!a.present && !a.half)) continue;
      if (!a.bf && !a.lunch && !a.dinner) continue;
      const cost = [a.bf, a.lunch, a.dinner].filter(Boolean).length * 10;
      mealRows.push([mealIdx++, e.name, e.branch, e.department, d, a.bf ? 'Yes' : '', a.lunch ? 'Yes' : '', a.dinner ? 'Yes' : '', cost]);
    }
  });
  const ws2 = XLSX.utils.aoa_to_sheet([
    [`MEAL / CANTEEN LOG — ${monthLabel.toUpperCase()}`],
    ['Each meal = ₹10 deducted from salary'],
    [],
    mealHeaders,
    ...mealRows,
    mealRows.length > 0
      ? ['', 'TOTAL', '', '', '', '', '', '',
          mealRows.reduce((s, r) => s + (r[8] as number), 0)]
      : ['No meal records for this period'],
  ]);
  ws2['!cols'] = [{ wch: 4 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 6 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 12 }];
  ws2['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Meal Log');

  XLSX.writeFile(wb, `CafeAadvikam_Attendance_${monthLabel.replace(' ', '_')}.xlsx`);
}

// ─── Advance Excel Export ──────────────────────────────────────────────────────
function exportAdvanceExcel(
  employees: Employee[],
  allAdvanceRecords: SalaryAdvanceRecord[],
  monthLabel: string
) {
  const wb = XLSX.utils.book_new();
  const empIds = new Set(employees.map(e => e.id));

  // Filter advance records to the current employee list (dept/branch filter)
  const records = allAdvanceRecords.filter(r => empIds.has(r.employeeId));

  const empMap: Record<string, Employee> = {};
  employees.forEach(e => { empMap[e.id] = e; });

  // ── Sheet 1: All Advance Records ──
  const headers = ['#', 'Employee', 'Branch', 'Department', 'Amount (₹)', 'Date Given', 'Note', 'Status', 'Outstanding (₹)'];
  const rows = records.map((r, i) => {
    const e = empMap[r.employeeId];
    return [
      i + 1,
      e?.name ?? r.employeeId,
      e?.branch ?? '',
      e?.department ?? '',
      r.amount,
      new Date(r.givenDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      r.note ?? '',
      r.cleared ? 'Cleared' : 'Outstanding',
      r.cleared ? 0 : r.amount,
    ];
  });

  const totalOutstanding = records.filter(r => !r.cleared).reduce((s, r) => s + r.amount, 0);
  const totalCleared     = records.filter(r => r.cleared).reduce((s, r) => s + r.amount, 0);

  const ws1 = XLSX.utils.aoa_to_sheet([
    [`SALARY ADVANCE REPORT — ${monthLabel.toUpperCase()}`],
    [`Cafe Aadvikam Group | Generated on ${new Date().toLocaleDateString('en-IN')} | ${employees.length} employees`],
    [],
    headers,
    ...rows,
    [],
    ['', 'TOTAL OUTSTANDING', '', '', totalOutstanding, '', '', '', totalOutstanding],
    ['', 'TOTAL CLEARED',     '', '', totalCleared,     '', '', '', 0],
  ]);
  ws1['!cols'] = [
    { wch: 4 }, { wch: 22 }, { wch: 14 }, { wch: 14 },
    { wch: 13 }, { wch: 16 }, { wch: 24 }, { wch: 12 }, { wch: 15 },
  ];
  ws1['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Advance Records');

  // ── Sheet 2: Per-employee Advance Summary ──
  const summaryHeaders = ['#', 'Employee', 'Branch', 'Department', 'Total Advanced (₹)', 'Total Cleared (₹)', 'Outstanding (₹)', 'No. of Records'];
  const summaryRows = employees
    .map((e, i) => {
      const empRecs = records.filter(r => r.employeeId === e.id);
      if (empRecs.length === 0 && e.salaryAdvance === 0) return null;
      const totalAdv     = empRecs.reduce((s, r) => s + r.amount, 0) || e.salaryAdvance;
      const totalClr     = empRecs.filter(r => r.cleared).reduce((s, r) => s + r.amount, 0);
      const outstanding  = empRecs.length > 0
        ? empRecs.filter(r => !r.cleared).reduce((s, r) => s + r.amount, 0)
        : e.salaryAdvance;
      return [i + 1, e.name, e.branch, e.department, totalAdv, totalClr, outstanding, empRecs.length];
    })
    .filter(Boolean) as (string | number)[][];

  const ws2 = XLSX.utils.aoa_to_sheet([
    [`ADVANCE SUMMARY BY EMPLOYEE — ${monthLabel.toUpperCase()}`],
    [],
    summaryHeaders,
    ...summaryRows,
    ['', 'TOTAL', '', '',
      summaryRows.reduce((s, r) => s + (r[4] as number), 0),
      summaryRows.reduce((s, r) => s + (r[5] as number), 0),
      summaryRows.reduce((s, r) => s + (r[6] as number), 0),
      '',
    ],
  ]);
  ws2['!cols'] = [
    { wch: 4 }, { wch: 22 }, { wch: 14 }, { wch: 14 },
    { wch: 18 }, { wch: 16 }, { wch: 15 }, { wch: 14 },
  ];
  ws2['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Employee Summary');

  XLSX.writeFile(wb, `CafeAadvikam_Advances_${monthLabel.replace(' ', '_')}.xlsx`);
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-body font-semibold text-muted-foreground uppercase mb-1">{label}</p>
      {children}
    </div>
  );
}

function InputCls(extra = '') {
  return `w-full h-10 px-3 rounded-xl border border-border bg-background text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 ${extra}`;
}

function DeductToggle({ label, amount, checked, onChange }: { label: string; amount: number; checked: boolean; onChange: (v: boolean) => void; color?: string; }) {
  if (amount <= 0) return null;
  return (
    <div className={cn('flex items-center justify-between px-3 py-2 rounded-xl border', checked ? 'bg-destructive/5 border-destructive/30' : 'bg-muted/40 border-border/40')}>
      <div className="flex items-center gap-2">
        {checked ? <CheckCircle2 className="size-3.5 text-destructive shrink-0" /> : <AlertCircle className="size-3.5 text-muted-foreground/50 shrink-0" />}
        <div>
          <p className={cn('text-[11px] font-body font-semibold', checked ? 'text-destructive' : 'text-muted-foreground')}>{label}</p>
          <p className="text-[10px] font-body text-muted-foreground">{'₹'}{amount.toLocaleString('en-IN')}</p>
        </div>
      </div>
      <button onClick={() => onChange(!checked)} className={cn('relative h-5 w-9 rounded-full transition-colors shrink-0', checked ? 'bg-destructive' : 'bg-muted border border-border')}>
        <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </div>
  );
}

function AddEmpModal({ onAdd, onClose }: { onAdd: (e: Employee) => void; onClose: () => void }) {
  useScrollLock(); // N-11: prevent background scroll bleed on iOS
  const [name, setName] = useState('');
  const [branch, setBranch] = useState<Branch>('VRSNB');
  const [dept, setDept] = useState('');
  const [salary, setSalary] = useState('');
  const [advance, setAdvance] = useState('');
  const [uniform, setUniform] = useState('');
  const [other, setOther] = useState('');
  const [bank, setBank] = useState('');
  const [acc, setAcc] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [saving, setSaving] = useState(false);
  const valid = name.trim() && dept.trim();

  const handleAdd = async () => {
    if (!valid) return;
    setSaving(true);
    const result = await insertEmployee({ name: name.trim(), branch, department: dept.trim(), grossSalary: parseInt(salary) || 0, salaryAdvance: parseInt(advance) || 0, uniformDeduction: parseInt(uniform) || 0, otherDeduction: parseInt(other) || 0, bankName: bank || undefined, accountNumber: acc || undefined, ifscCode: ifsc || undefined });
    setSaving(false);
    if (result) onAdd(result);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto overscroll-contain">
        <div className="px-5 pt-4 flex items-center justify-end">
          <button onClick={onClose} className="size-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <Field label="Full Name *"><input className={InputCls()} placeholder="Employee name" value={name} onChange={e => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Branch *">
              <select className={InputCls()} value={branch} onChange={e => setBranch(e.target.value as Branch)}>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Department *"><input className={InputCls()} placeholder="e.g. Bakery" value={dept} onChange={e => setDept(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gross Salary (₹)"><input type="number" className={InputCls()} placeholder="18000" value={salary} onChange={e => setSalary(e.target.value)} /></Field>
            <Field label="Salary Advance (₹)"><input type="number" className={InputCls()} placeholder="0" value={advance} onChange={e => setAdvance(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Uniform Ded. (₹)"><input type="number" className={InputCls()} placeholder="0" value={uniform} onChange={e => setUniform(e.target.value)} /></Field>
            <Field label="Other Ded. (₹)"><input type="number" className={InputCls()} placeholder="0" value={other} onChange={e => setOther(e.target.value)} /></Field>
          </div>
          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase">Bank Details (optional)</p>
            <Field label="Bank Name"><input className={InputCls()} placeholder="e.g. INDIAN BANK" value={bank} onChange={e => setBank(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Account No."><input className={InputCls()} placeholder="Account" value={acc} onChange={e => setAcc(e.target.value)} /></Field>
              <Field label="IFSC Code"><input className={InputCls()} placeholder="IFSC" value={ifsc} onChange={e => setIfsc(e.target.value)} /></Field>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-border text-sm font-body font-semibold hover:bg-muted transition-colors">Cancel</button>
          <button disabled={!valid || saving} onClick={handleAdd} className="flex-1 h-11 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-semibold disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
          </button>
        </div>
      </div>
    </div>
  );
}

function EditEmpModal({ emp, onSave, onClose }: { emp: Employee; onSave: (e: Employee) => void; onClose: () => void }) {
  useScrollLock(); // N-11: prevent background scroll bleed on iOS
  const [name, setName] = useState(emp.name);
  const [branch, setBranch] = useState<Branch>(emp.branch);
  const [dept, setDept] = useState(emp.department);
  const [salary, setSalary] = useState(String(emp.grossSalary));
  const [advance, setAdvance] = useState(String(emp.salaryAdvance));
  const [uniform, setUniform] = useState(String(emp.uniformDeduction));
  const [other, setOther] = useState(String(emp.otherDeduction));
  const [bank, setBank] = useState(emp.bankName || '');
  const [acc, setAcc] = useState(emp.accountNumber || '');
  const [ifsc, setIfsc] = useState(emp.ifscCode || '');
  const [saving, setSaving] = useState(false);
  const valid = name.trim() && dept.trim();

  const [saveError, setSaveError] = useState('');

  const handleSave = async () => {
    if (!valid) return;
    const updated: Employee = {
      ...emp,
      name: name.trim(),
      branch,
      department: dept.trim(),
      grossSalary: Number(salary) || 0,
      salaryAdvance: Number(advance) || 0,
      uniformDeduction: Number(uniform) || 0,
      otherDeduction: Number(other) || 0,
      bankName: bank || undefined,
      accountNumber: acc || undefined,
      ifscCode: ifsc || undefined,
    };
    setSaving(true); setSaveError('');
    const ok = await updateEmployee(updated);
    setSaving(false);
    if (ok) { onSave(updated); } else { setSaveError('Failed to save — please try again.'); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto overscroll-contain" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-display font-bold text-lg">Edit Employee</h3>
          <button onClick={onClose} className="size-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <Field label="Full Name *"><input className={InputCls()} placeholder="Employee name" value={name} onChange={e => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Branch *">
              <select className={InputCls()} value={branch} onChange={e => setBranch(e.target.value as Branch)}>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Department *"><input className={InputCls()} placeholder="e.g. Bakery" value={dept} onChange={e => setDept(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gross Salary (₹)"><input type="number" min="0" className={InputCls()} value={salary} onChange={e => setSalary(e.target.value)} /></Field>
            <Field label="Salary Advance (₹)"><input type="number" min="0" className={InputCls()} value={advance} onChange={e => setAdvance(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Uniform Ded. (₹)"><input type="number" min="0" className={InputCls()} value={uniform} onChange={e => setUniform(e.target.value)} /></Field>
            <Field label="Other Ded. (₹)"><input type="number" min="0" className={InputCls()} value={other} onChange={e => setOther(e.target.value)} /></Field>
          </div>
          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase">Bank Details</p>
            <Field label="Bank Name"><input className={InputCls()} placeholder="e.g. INDIAN BANK" value={bank} onChange={e => setBank(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Account No."><input className={InputCls()} placeholder="Account" value={acc} onChange={e => setAcc(e.target.value)} /></Field>
              <Field label="IFSC Code"><input className={InputCls()} placeholder="IFSC" value={ifsc} onChange={e => setIfsc(e.target.value)} /></Field>
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 space-y-2">
          {saveError && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{saveError}</p>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-border text-sm font-body font-semibold hover:bg-muted transition-colors">Cancel</button>
            <button disabled={!valid || saving} onClick={handleSave} className="flex-1 h-11 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-semibold disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />} Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Attendance row ───────────────────────────────────────────────────────────
function AttRow({ emp, att, onUpdate, expanded, onToggle, decision, onDecisionChange, daysInMonth }: {
  emp: Employee; att: MonthAttendance; daysInMonth: number;
  onUpdate: (empId: string, day: number, v: DayAttendance) => void;
  expanded: boolean; onToggle: () => void;
  decision: DeductionDecision;
  onDecisionChange: (empId: string, d: DeductionDecision) => void;
}) {
  const { presentDays, halfDays, woffDays, canteenTotal, net } = calcSalary(emp, att, daysInMonth, decision);

  const woffCount = useMemo(() =>
    Array.from({ length: daysInMonth }, (_, i) => i + 1).filter(d => att[ak(emp.id, d)]?.woff).length,
    [emp.id, att, daysInMonth]
  );

  const toggleDay = (day: number) => {
    const k = ak(emp.id, day);
    const cur = att[k] ?? defaultDay();
    let next: DayAttendance;
    if (!cur.present && !cur.half && !cur.woff) {
      // empty → Present
      next = { ...cur, present: true, half: false };
    } else if (cur.present) {
      // Present → Half day
      next = { ...cur, present: false, half: true, bf: false, lunch: false, dinner: false };
    } else if (cur.half) {
      // Half → Week Off (if slots remain) or Absent
      if (woffCount < 4) {
        next = { ...cur, present: false, half: false, woff: true, bf: false, lunch: false, dinner: false };
      } else {
        next = { ...cur, present: false, half: false, woff: false, bf: false, lunch: false, dinner: false };
      }
    } else {
      // Week Off → empty
      next = { ...cur, present: false, half: false, woff: false };
    }
    onUpdate(emp.id, day, next);
  };

  const toggleMeal = (day: number, meal: 'bf' | 'lunch' | 'dinner') => {
    const k = ak(emp.id, day);
    const cur = att[k];
    if (!cur?.present && !cur?.half) return;
    onUpdate(emp.id, day, { ...cur, [meal]: !cur[meal] });
  };

  const hasAdvance = emp.salaryAdvance > 0;
  const hasOther = emp.otherDeduction > 0;
  const hasUniform = emp.uniformDeduction > 0;

  return (
    <div className={cn('border-b border-border/40', expanded && 'bg-primary/[0.03]')}>
      <button className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors active:bg-muted/40" onClick={onToggle}>
        <span className={cn('shrink-0 px-1.5 py-0.5 rounded text-[9px] font-body font-bold border', BRANCH_COLORS[emp.branch])}>{BRANCH_SHORT[emp.branch]}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-body font-semibold text-foreground truncate">{emp.name}</p>
          <p className="text-[10px] font-body text-muted-foreground">
            {emp.department}
            {hasAdvance && <span className="ml-1 text-amber-600 font-semibold">· Adv {'₹'}{emp.salaryAdvance.toLocaleString('en-IN')}</span>}
          </p>
        </div>
        <div className="text-right shrink-0 mr-1">
          <p className="text-xs font-body font-bold tabular-nums">{presentDays + halfDays * 0.5 + woffDays}d</p>
          <p className={cn('text-[10px] font-body font-semibold tabular-nums', net < 0 ? 'text-destructive' : 'text-primary')}>{'₹'}{net.toLocaleString('en-IN')}</p>
        </div>
        {expanded ? <ChevronUp className="size-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          {(hasAdvance || hasOther || hasUniform) && (
            <div className="mb-3 space-y-1.5">
              <p className="text-[10px] font-body font-bold text-muted-foreground uppercase mb-1">Deductions this month</p>
              {hasAdvance && <DeductToggle label="Salary Advance" amount={emp.salaryAdvance} checked={decision.deductAdvance} onChange={v => onDecisionChange(emp.id, { ...decision, deductAdvance: v })} />}
              {hasUniform && <DeductToggle label="Uniform Deduction" amount={emp.uniformDeduction} checked={decision.deductUniform} onChange={v => onDecisionChange(emp.id, { ...decision, deductUniform: v })} />}
              {hasOther && <DeductToggle label="Other Deduction" amount={emp.otherDeduction} checked={decision.deductOther} onChange={v => onDecisionChange(emp.id, { ...decision, deductOther: v })} />}
              {hasAdvance && !decision.deductAdvance && (
                <p className="text-[10px] font-body text-amber-600 flex items-center gap-1"><AlertCircle className="size-3" /> Advance {'₹'}{emp.salaryAdvance.toLocaleString('en-IN')} will carry forward</p>
              )}
            </div>
          )}
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-1 min-w-max">
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const a = att[ak(emp.id, day)] ?? defaultDay();
                return (
                  <div key={day} className="flex flex-col items-center gap-0.5" style={{ minWidth: 32 }}>
                    <span className="text-[9px] font-body font-semibold text-muted-foreground">{day}</span>
                    <button onClick={() => toggleDay(day)} className={cn('size-7 rounded-lg text-[9px] font-bold transition-all active:scale-90 border flex items-center justify-center',
                      !a.present && !a.half && !a.woff && 'bg-muted border-border text-muted-foreground/60 hover:border-primary/40',
                      a.present && 'bg-emerald-500 border-emerald-600 text-white',
                      a.half    && 'bg-yellow-400 border-yellow-500 text-white',
                      a.woff    && 'bg-sky-100 border-sky-300 text-sky-700',
                    )}>
                      {a.present ? '✓' : a.half ? '½' : a.woff ? 'W' : ''}
                    </button>
                    {(a.present || a.half) ? (
                      <div className="flex gap-[2px] mt-0.5">
                        {(['bf', 'lunch', 'dinner'] as const).map(m => (
                          <button key={m} onClick={e => { e.stopPropagation(); toggleMeal(day, m); }} title={m === 'bf' ? 'Breakfast ₹10' : m === 'lunch' ? 'Lunch ₹10' : 'Dinner ₹10'}
                            className={cn('w-[18px] h-[16px] rounded text-[7px] font-bold transition-all active:scale-90 border leading-none flex items-center justify-center', a[m] ? 'bg-orange-400 border-orange-500 text-white' : 'bg-muted border-border text-muted-foreground hover:border-orange-300')}>
                            {m === 'bf' ? 'B' : m === 'lunch' ? 'L' : 'D'}
                          </button>
                        ))}
                      </div>
                    ) : <div className="h-[16px] mt-0.5" />}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="flex items-center gap-1 text-[10px] font-body text-muted-foreground"><span className="size-2.5 rounded-sm bg-emerald-500 inline-block" /> Present</span>
            <span className="flex items-center gap-1 text-[10px] font-body text-muted-foreground"><span className="size-2.5 rounded-sm bg-yellow-400 inline-block" /> ½ Half Day</span>
            <span className="flex items-center gap-1 text-[10px] font-body text-muted-foreground"><span className="size-2.5 rounded-sm bg-sky-200 inline-block" /> W = Week Off ({woffCount}/4)</span>
            <span className="flex items-center gap-1 text-[10px] font-body text-muted-foreground"><span className="size-2.5 rounded-sm bg-orange-400 inline-block" /> BF / Lunch / Dinner ₹10</span>
            <span className="ml-auto text-[10px] font-body font-bold text-orange-600">🍽 {'₹'}{canteenTotal}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Salary card ──────────────────────────────────────────────────────────────
function SalaryCard({ emp, att, decision, onDecisionChange, daysInMonth, onAdvanceCleared }: {
  emp: Employee; att: MonthAttendance; daysInMonth: number;
  decision: DeductionDecision;
  onDecisionChange: (empId: string, d: DeductionDecision) => void;
  onAdvanceCleared: (empId: string) => void;
}) {
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const { presentDays, halfDays, woffDays, worked, canteenTotal, earned, advanceDed, uniformDed, otherDed, esiDed, pfDed, net } = calcSalary(emp, att, daysInMonth, decision);
  const esiAmount = calcESI(emp.grossSalary);
  const pfAmount  = calcPF(emp.grossSalary);
  const hasAdvance = emp.salaryAdvance > 0;
  const hasOther = emp.otherDeduction > 0;
  const hasUniform = emp.uniformDeduction > 0;

  const handleMarkPaid = async () => {
    if (!decision.deductAdvance || emp.salaryAdvance <= 0) return;
    setClearing(true);
    setClearError(null);
    try {
      await clearAdvance(emp.id);
      onAdvanceCleared(emp.id);
    } catch {
      setClearError('Failed to clear advance — please try again.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-body font-bold border shrink-0', BRANCH_COLORS[emp.branch])}>{BRANCH_SHORT[emp.branch]}</span>
            <span className="text-[10px] font-body text-muted-foreground truncate">{emp.department}</span>
          </div>
          <p className="font-display font-bold text-base text-foreground">{emp.name}</p>
          {emp.accountNumber && <p className="text-[10px] font-body text-muted-foreground mt-0.5 truncate">{emp.bankName} · {emp.accountNumber}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className={cn('font-display font-bold text-xl tabular-nums', net < 0 ? 'text-destructive' : 'text-primary')}>{'₹'}{net.toLocaleString('en-IN')}</p>
          <p className="text-[10px] font-body text-muted-foreground">Net Salary</p>
        </div>
      </div>

      <div className="px-4 pt-3 space-y-1.5">
          <p className="text-[10px] font-body font-bold text-muted-foreground uppercase">Deductions — select what to apply</p>
          {hasAdvance && <DeductToggle label="Salary Advance" amount={emp.salaryAdvance} checked={decision.deductAdvance} onChange={v => onDecisionChange(emp.id, { ...decision, deductAdvance: v })} />}
          {hasUniform && <DeductToggle label="Uniform Deduction" amount={emp.uniformDeduction} checked={decision.deductUniform} onChange={v => onDecisionChange(emp.id, { ...decision, deductUniform: v })} />}
          {hasOther && <DeductToggle label="Other Deduction" amount={emp.otherDeduction} checked={decision.deductOther} onChange={v => onDecisionChange(emp.id, { ...decision, deductOther: v })} />}
          <DeductToggle label={`ESI (0.75%${emp.grossSalary > ESI_WAGE_LIMIT ? ' — not applicable, gross > ₹21k' : ''})`} amount={esiAmount} checked={decision.deductESI} onChange={v => onDecisionChange(emp.id, { ...decision, deductESI: v })} />
          <DeductToggle label={`PF (12% of gross${emp.grossSalary * PF_RATE > 1800 ? ', capped at ₹1,800' : ''})`} amount={pfAmount} checked={decision.deductPF} onChange={v => onDecisionChange(emp.id, { ...decision, deductPF: v })} />
          {hasAdvance && !decision.deductAdvance && (
            <p className="text-[10px] font-body text-amber-600 pb-1 flex items-center gap-1"><AlertCircle className="size-3" /> Advance {'₹'}{emp.salaryAdvance.toLocaleString('en-IN')} carried forward to next month</p>
          )}
        </div>

      <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
        <SalRow label="Gross Salary" value={`₹${emp.grossSalary.toLocaleString('en-IN')}`} />
        <SalRow label="Days Present" value={String(presentDays)} />
        {halfDays > 0 && <SalRow label="Half Days" value={`${halfDays} (= ${halfDays * 0.5}d)`} />}
        <SalRow label="Week Offs" value={String(woffDays)} />
        <SalRow label="Total Worked" value={`${worked} / ${daysInMonth}`} highlight />
        <SalRow label="Earned" value={`₹${earned.toLocaleString('en-IN')}`} highlight />
        <SalRow label="Food Deduction" value={canteenTotal > 0 ? `-₹${canteenTotal}` : '—'} neg={canteenTotal > 0} />
        {decision.deductAdvance && advanceDed > 0 && <SalRow label="Salary Advance" value={`-₹${advanceDed.toLocaleString('en-IN')}`} neg />}
        {!decision.deductAdvance && hasAdvance && <SalRow label="Advance (Carry Fwd)" value={`₹${emp.salaryAdvance.toLocaleString('en-IN')}`} />}
        {decision.deductUniform && uniformDed > 0 && <SalRow label="Uniform Ded." value={`-₹${uniformDed}`} neg />}
        {decision.deductOther && otherDed > 0 && <SalRow label="Other Ded." value={`-₹${otherDed}`} neg />}
        {decision.deductESI && esiDed > 0 && <SalRow label="ESI (0.75%)" value={`-₹${esiDed}`} neg />}
        {decision.deductPF && pfDed > 0 && <SalRow label="PF (12%)" value={`-₹${pfDed.toLocaleString('en-IN')}`} neg />}
        <div className="col-span-2 border-t border-border pt-2 mt-0.5 flex justify-between items-center">
          <span className="text-sm font-body font-bold text-foreground">Net Payable</span>
          <span className={cn('font-display font-bold text-lg tabular-nums', net < 0 ? 'text-destructive' : 'text-primary')}>{'₹'}{net.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {hasAdvance && decision.deductAdvance && (
        <div className="px-4 pb-3">
          <button onClick={handleMarkPaid} disabled={clearing} className="w-full h-9 rounded-xl bg-emerald-500 text-white text-xs font-body font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50">
            {clearing ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Mark Advance Cleared (removes from record)
          </button>
          {clearError && <p className="text-xs font-body text-destructive text-center mt-1">{clearError}</p>}
        </div>
      )}

      {emp.ifscCode && (
        <div className="px-4 py-2 bg-muted/40 border-t border-border flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[9px] font-body font-semibold text-muted-foreground uppercase">IFSC</span>
          <span className="text-[10px] font-mono font-semibold text-foreground">{emp.ifscCode}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-[10px] font-body text-muted-foreground">{emp.bankName}</span>
        </div>
      )}
    </div>
  );
}

function SalRow({ label, value, highlight, neg }: { label: string; value: string; highlight?: boolean; neg?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-body text-muted-foreground">{label}</span>
      <span className={cn('text-[11px] font-body font-semibold tabular-nums', highlight && 'text-primary', neg && 'text-destructive')}>{value}</span>
    </div>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────
function AnalyticsTab({ employees, att, decisions, daysInMonth, monthLabel, getDecision }: {
  employees: Employee[];
  att: MonthAttendance;
  decisions: DeductionDecisions;
  daysInMonth: number;
  monthLabel: string;
  getDecision: (id: string) => DeductionDecision;
}) {
  // 1. Branch-wise salary comparison
  const branchSalaryData = useMemo(() => {
    return BRANCHES.map(branch => {
      const emps = employees.filter(e => e.branch === branch);
      const gross = emps.reduce((s, e) => s + e.grossSalary, 0);
      const net = emps.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).net, 0);
      const earned = emps.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).earned, 0);
      return { branch: branch === 'Cafe Aadvikam' ? 'Cafe' : branch, gross, earned, net, count: emps.length };
    }).filter(d => d.count > 0);
  }, [employees, att, daysInMonth, getDecision]);

  // 2. Deduction breakdown (pie)
  const deductionData = useMemo(() => {
    let canteen = 0, advance = 0, uniform = 0, other = 0, esi = 0, pf = 0;
    employees.forEach(e => {
      const c = calcSalary(e, att, daysInMonth, getDecision(e.id));
      canteen += c.canteenTotal;
      advance += c.advanceDed;
      uniform += c.uniformDed;
      other   += c.otherDed;
      esi     += c.esiDed;
      pf      += c.pfDed;
    });
    return [
      { name: 'Food',    value: canteen },
      { name: 'Advance', value: advance },
      { name: 'Uniform', value: uniform },
      { name: 'Other',   value: other },
      { name: 'ESI',     value: esi },
      { name: 'PF',      value: pf },
    ].filter(d => d.value > 0);
  }, [employees, att, daysInMonth, getDecision]);

  // 3. Net vs Gross per employee
  const netVsGrossData = useMemo(() => {
    return employees.map(e => {
      const c = calcSalary(e, att, daysInMonth, getDecision(e.id));
      return {
        name: e.name.split(' ')[0], // first name only for space
        gross: e.grossSalary,
        net: c.net,
        earned: c.earned,
      };
    });
  }, [employees, att, daysInMonth, getDecision]);

  // 4. Attendance % per employee
  const attendanceData = useMemo(() => {
    return employees.map(e => {
      const c = calcSalary(e, att, daysInMonth, getDecision(e.id));
      const pct = daysInMonth > 0 ? Math.round((c.presentDays / daysInMonth) * 100) : 0;
      return {
        name: e.name.split(' ')[0],
        present: c.presentDays,
        woff: c.woffDays,
        absent: daysInMonth - c.presentDays - c.woffDays,
        pct,
        fill: pct >= 90 ? '#059669' : pct >= 75 ? '#F59E0B' : '#DC2626',
      };
    });
  }, [employees, att, daysInMonth, getDecision]);

  const totalNet = employees.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).net, 0);
  const totalGross = employees.reduce((s, e) => s + e.grossSalary, 0);
  const totalDed   = employees.reduce((s, e) => s + calcSalary(e, att, daysInMonth, getDecision(e.id)).totalDed, 0);
  const avgAttPct = attendanceData.length > 0 ? Math.round(attendanceData.reduce((s, d) => s + d.pct, 0) / attendanceData.length) : 0;

  const fmt = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${n.toLocaleString('en-IN')}`;

  return (
    <div className="px-4 space-y-4 pb-6">
      {/* Header KPIs */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="size-4 text-primary" />
          <h3 className="font-display font-bold text-foreground">Analytics — {monthLabel}</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Total Gross', value: fmt(totalGross), color: 'text-foreground' },
            { label: 'Total Net', value: fmt(totalNet), color: 'text-primary' },
            { label: 'Total Deductions', value: fmt(totalDed), color: 'text-destructive' },
            { label: 'Avg Attendance', value: `${avgAttPct}%`, color: avgAttPct >= 85 ? 'text-emerald-600' : 'text-amber-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-muted/40 rounded-xl p-3">
              <p className={cn('font-display font-bold text-lg tabular-nums', color)}>{value}</p>
              <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Chart 1: Branch-wise Salary Comparison */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <h3 className="font-display font-bold text-sm text-foreground mb-1">Branch-wise Salary</h3>
        <p className="text-[10px] font-body text-muted-foreground mb-3">Gross vs Earned vs Net by branch</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={branchSalaryData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="branch" tick={{ fontSize: 10, fontFamily: 'inherit' }} />
            <YAxis tick={{ fontSize: 9, fontFamily: 'inherit' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, '']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="gross" name="Gross" fill="#E5E7EB" radius={[4, 4, 0, 0]} />
            <Bar dataKey="earned" name="Earned" fill="#2563EB" radius={[4, 4, 0, 0]} />
            <Bar dataKey="net" name="Net" fill="#E07A3A" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 2: Deduction Breakdown Pie */}
      {deductionData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="font-display font-bold text-sm text-foreground mb-1">Deduction Breakdown</h3>
          <p className="text-[10px] font-body text-muted-foreground mb-3">What's being deducted this month</p>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={160}>
              <PieChart>
                <Pie data={deductionData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={3}>
                  {deductionData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, '']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {deductionData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="size-2.5 rounded-sm shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-[11px] font-body text-muted-foreground">{d.name}</span>
                  </div>
                  <span className="text-[11px] font-body font-bold tabular-nums">{'₹'}{d.value.toLocaleString('en-IN')}</span>
                </div>
              ))}
              <div className="border-t border-border pt-1.5 flex justify-between">
                <span className="text-[11px] font-body font-bold text-foreground">Total</span>
                <span className="text-[11px] font-body font-bold text-destructive tabular-nums">{'₹'}{deductionData.reduce((s, d) => s + d.value, 0).toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chart 3: Net vs Gross per employee */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <h3 className="font-display font-bold text-sm text-foreground mb-1">Net vs Gross — Per Employee</h3>
        <p className="text-[10px] font-body text-muted-foreground mb-3">Salary comparison across all staff</p>
        <div className="overflow-x-auto">
          <ResponsiveContainer width={Math.max(employees.length * 72, 320)} height={200}>
            <BarChart data={netVsGrossData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fontFamily: 'inherit' }} />
              <YAxis tick={{ fontSize: 9, fontFamily: 'inherit' }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, '']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="gross" name="Gross" fill="#E5E7EB" radius={[4, 4, 0, 0]} />
              <Bar dataKey="earned" name="Earned" fill="#2563EB" radius={[4, 4, 0, 0]} />
              <Bar dataKey="net" name="Net" fill="#059669" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 4: Attendance % per employee */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <h3 className="font-display font-bold text-sm text-foreground mb-1">Attendance % per Employee</h3>
        <p className="text-[10px] font-body text-muted-foreground mb-3">
          <span className="inline-flex items-center gap-1 mr-2"><span className="size-2 rounded-full bg-emerald-500 inline-block" /> ≥90% Good</span>
          <span className="inline-flex items-center gap-1 mr-2"><span className="size-2 rounded-full bg-amber-400 inline-block" /> 75–89% OK</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-red-500 inline-block" /> &lt;75% Low</span>
        </p>
        <div className="space-y-2.5">
          {attendanceData.map(d => (
            <div key={d.name}>
              <div className="flex justify-between mb-0.5">
                <span className="text-[11px] font-body font-semibold text-foreground">{d.name}</span>
                <span className="text-[11px] font-body font-bold tabular-nums" style={{ color: d.fill }}>{d.pct}% · {d.present}P {d.woff}W {d.absent}A</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${d.pct}%`, background: d.fill }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Absent Alert */}
      {attendanceData.some(d => d.absent > 5) && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="size-4 text-destructive" />
            <h4 className="font-display font-bold text-sm text-destructive">High Absences</h4>
          </div>
          {attendanceData.filter(d => d.absent > 5).map(d => (
            <div key={d.name} className="flex justify-between text-[11px] font-body py-0.5">
              <span className="text-foreground font-semibold">{d.name}</span>
              <span className="text-destructive font-bold">{d.absent} absent days</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Advance Tab ──────────────────────────────────────────────────────────────
function AdvanceTab({ employees, advanceRecords, tableReady, onAdd, onClear }: {
  employees: Employee[];
  advanceRecords: SalaryAdvanceRecord[];
  tableReady: boolean;
  onAdd: (rec: SalaryAdvanceRecord) => void;
  onClear: (advanceId: string, employeeId: string, amount: number) => void;
}) {
  const [empId, setEmpId] = useState('');
  const [amount, setAmount] = useState('');
  const [givenDate, setGivenDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [clearError, setClearError] = useState('');
  const [filterCleared, setFilterCleared] = useState(false);

  const canSubmit = empId && Number(amount) > 0 && givenDate;

  const handleAdd = async () => {
    if (!canSubmit) return;
    setSaving(true); setSaveError('');
    const result = await insertAdvanceRecord({ employeeId: empId, amount: Number(amount), givenDate, note });
    setSaving(false);
    if ('ok' in result) {
      onAdd(result.ok);
      setAmount(''); setNote('');
    } else {
      setSaveError(`Failed to save advance — ${result.err}`);
    }
  };

  const handleClear = async (rec: SalaryAdvanceRecord) => {
    setClearingId(rec.id); setClearError('');
    try {
      await markAdvanceRecordCleared(rec.id, rec.employeeId, rec.amount);
      onClear(rec.id, rec.employeeId, rec.amount);
    } catch {
      setClearError('Failed to mark cleared — please try again.');
    } finally {
      setClearingId(null);
    }
  };

  // Group records by employee
  const displayRecords = advanceRecords.filter(r => filterCleared ? true : !r.cleared);
  const byEmployee = useMemo(() => {
    const map: Record<string, SalaryAdvanceRecord[]> = {};
    for (const r of displayRecords) {
      if (!map[r.employeeId]) map[r.employeeId] = [];
      map[r.employeeId].push(r);
    }
    return map;
  }, [displayRecords]);

  const totalOutstanding = useMemo(() => {
    // Sum from the advance records table (uncleared)
    const fromRecords = advanceRecords.filter(r => !r.cleared).reduce((s, r) => s + r.amount, 0);
    // Fallback: if no records exist yet, sum from employees' salaryAdvance field directly
    if (advanceRecords.length === 0) {
      return employees.reduce((s, e) => s + (e.salaryAdvance || 0), 0);
    }
    return fromRecords;
  }, [advanceRecords, employees]);

  const empMap = useMemo(() => {
    const m: Record<string, Employee> = {};
    employees.forEach(e => { m[e.id] = e; });
    return m;
  }, [employees]);

  return (
    <div className="px-4 space-y-4 pb-6">
      {/* Migration warning */}
      {!tableReady && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
          <AlertCircle className="size-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-body font-bold text-amber-800">Database table not set up</p>
            <p className="text-xs font-body text-amber-700 mt-1">
              Run the <strong>migration_salary_advances.sql</strong> file in your Supabase SQL editor, then refresh the page. Until then, advances can't be saved.
            </p>
          </div>
        </div>
      )}
      <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
        <div className="size-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
          <CreditCard className="size-5 text-amber-600" />
        </div>
        <div>
          <p className="font-display font-bold text-xl tabular-nums text-amber-600">
            {'₹'}{totalOutstanding.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase">Total Outstanding Advances</p>
        </div>
        <div className="ml-auto">
          <p className="text-[10px] font-body text-muted-foreground text-right">
            {advanceRecords.filter(r => !r.cleared).length} pending
          </p>
          <p className="text-[10px] font-body text-muted-foreground text-right">
            {advanceRecords.filter(r => r.cleared).length} cleared
          </p>
        </div>
      </div>

      {/* Add Advance Form */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Plus className="size-4 text-primary" />
          <h3 className="font-display font-bold text-foreground">Record New Advance</h3>
        </div>
        <div className="px-4 py-4 space-y-3">
          <Field label="Employee *">
            <select
              className={InputCls()}
              value={empId}
              onChange={e => setEmpId(e.target.value)}
            >
              <option value="">Select employee…</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.branch})
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹) *">
              <input
                type="number"
                className={InputCls()}
                placeholder="e.g. 2000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Date Given *">
              <input
                type="date"
                className={InputCls()}
                value={givenDate}
                onChange={e => setGivenDate(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Note (optional)">
            <input
              className={InputCls()}
              placeholder="e.g. Emergency advance"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </Field>
          {saveError && <p className="text-xs font-body text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{saveError}</p>}
          <button
            disabled={!canSubmit || saving}
            onClick={handleAdd}
            className="w-full h-11 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-semibold disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Record Advance
          </button>
        </div>
      </div>

      {/* Filter toggle */}
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-sm text-foreground">Advance History</h3>
        <button
          onClick={() => setFilterCleared(v => !v)}
          className={cn('px-3 py-1.5 rounded-lg text-xs font-body font-semibold transition-colors border',
            filterCleared ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'
          )}
        >
          {filterCleared ? 'Showing All' : 'Show Cleared'}
        </button>
      </div>

      {clearError && <p className="text-xs font-body text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{clearError}</p>}

      {/* Records grouped by employee */}
      {Object.keys(byEmployee).length === 0 && advanceRecords.length === 0 ? (
        /* Table empty — show employees who have a salaryAdvance on file */
        (() => {
          const empWithAdvance = employees.filter(e => e.salaryAdvance > 0);
          if (empWithAdvance.length === 0) return (
            <div className="text-center py-10 text-muted-foreground">
              <CreditCard className="size-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-body">No advance records yet</p>
              <p className="text-xs font-body mt-1 opacity-60">Record a new advance above to get started</p>
            </div>
          );
          return (
            <div className="space-y-3">
              <p className="text-[11px] font-body text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                ⚠️ Showing advances from employee records (legacy). Run the SQL migration to enable full advance history tracking.
              </p>
              {empWithAdvance.map(emp => (
                <div key={emp.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-2">
                    <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-body font-bold border shrink-0', BRANCH_COLORS[emp.branch])}>
                      {BRANCH_SHORT[emp.branch]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-body font-bold text-sm text-foreground">{emp.name}</p>
                      <p className="text-[10px] font-body text-muted-foreground">{emp.department}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-body font-bold text-amber-600">{'₹'}{emp.salaryAdvance.toLocaleString('en-IN')}</p>
                      <p className="text-[9px] font-body text-muted-foreground">outstanding</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })()
      ) : Object.keys(byEmployee).length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <CreditCard className="size-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-body">No advance records yet</p>
          <p className="text-xs font-body mt-1 opacity-60">Record a new advance above to get started</p>
        </div>
      ) : (
        Object.entries(byEmployee).map(([eid, recs]) => {
          const emp = empMap[eid];
          if (!emp) return null;
          const empTotal = recs.filter(r => !r.cleared).reduce((s, r) => s + r.amount, 0);
          return (
            <div key={eid} className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-body font-bold border shrink-0', BRANCH_COLORS[emp.branch])}>
                  {BRANCH_SHORT[emp.branch]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-body font-bold text-sm text-foreground">{emp.name}</p>
                  <p className="text-[10px] font-body text-muted-foreground">{emp.department}</p>
                </div>
                {empTotal > 0 && (
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-body font-bold text-amber-600">{'₹'}{empTotal.toLocaleString('en-IN')}</p>
                    <p className="text-[9px] font-body text-muted-foreground">outstanding</p>
                  </div>
                )}
              </div>
              <div className="divide-y divide-border/40">
                {recs.map(rec => (
                  <div key={rec.id} className={cn('px-4 py-3 flex items-center gap-3', rec.cleared && 'opacity-50')}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-body font-bold text-sm tabular-nums">
                          {'₹'}{rec.amount.toLocaleString('en-IN')}
                        </p>
                        {rec.cleared && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-body font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Cleared</span>
                        )}
                      </div>
                      <p className="text-[11px] font-body text-muted-foreground mt-0.5">
                        📅 {new Date(rec.givenDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {rec.note && <span className="ml-2 italic">· {rec.note}</span>}
                      </p>
                    </div>
                    {!rec.cleared && (
                      <button
                        onClick={() => handleClear(rec)}
                        disabled={clearingId === rec.id}
                        className="shrink-0 h-8 px-3 rounded-lg bg-emerald-500 text-white text-[11px] font-body font-bold flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                      >
                        {clearingId === rec.id
                          ? <Loader2 className="size-3 animate-spin" />
                          : <CheckCircle2 className="size-3" />
                        }
                        Clear
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AttendanceSalary() {
  const TWO_MONTHS = useMemo(() => getTwoMonths(), []);
  const [monthIdx, setMonthIdx] = useState(0);
  const activeMonth = TWO_MONTHS[monthIdx];

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [att, setAtt] = useState<MonthAttendance>({});
  const [decisions, setDecisions] = useState<DeductionDecisions>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'attendance' | 'salary' | 'employees' | 'analytics' | 'advance'>('attendance');
  const [branch, setBranch]   = useState<'All' | Branch>('All');
  const [dept, setDept]       = useState<string>('All');
  const [search, setSearch]   = useState('');

  const handleTabChange = (newTab: typeof tab) => {
    setTab(newTab);
    setSearch('');
  };
  // Derive department options dynamically from actual employee data so ALL
  // departments are shown — not just hardcoded 'Store' / 'Admin office'.
  const DEPT_OPTIONS = useMemo<string[]>(() => {
    const unique = Array.from(
      new Set(
        employees
          .map(e => e.department.trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    return ['All', ...unique];
  }, [employees]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Reset dept filter if the selected dept no longer exists in the employee list
  useEffect(() => {
    if (dept !== 'All' && !DEPT_OPTIONS.includes(dept)) setDept('All');
  }, [DEPT_OPTIONS, dept]);

  const [showBranchDD, setShowBranchDD] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [advanceRecords, setAdvanceRecords] = useState<SalaryAdvanceRecord[]>([]);
  const [advanceTableReady, setAdvanceTableReady] = useState(true);
  const ddRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [emps, attData, decData, advResult] = await Promise.all([
          fetchEmployees(),
          fetchAttendance(activeMonth.year, activeMonth.month),
          fetchDeductionDecisions(activeMonth.year, activeMonth.month),
          fetchAdvanceRecords(),
        ]);
        setEmployees(emps);
        setAtt(attData);
        setDecisions(decData);
        setAdvanceRecords(advResult.records);
        setAdvanceTableReady(advResult.tableReady);
        const now = new Date();
        deleteOldAttendance(now.getFullYear(), now.getMonth() + 1);
      } catch (e) {
        console.error('Load error:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [activeMonth.year, activeMonth.month]);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ddRef.current && !ddRef.current.contains(e.target as Node)) setShowBranchDD(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const updateAtt = useCallback((empId: string, day: number, val: DayAttendance) => {
    const k = ak(empId, day);
    setAtt(prev => ({ ...prev, [k]: val }));
    upsertAttendance(empId, activeMonth.year, activeMonth.month, day, val);
  }, [activeMonth.year, activeMonth.month]);

  const updateDecision = useCallback((empId: string, d: DeductionDecision) => {
    setDecisions(prev => ({ ...prev, [empId]: d }));
    upsertDeductionDecision(empId, activeMonth.year, activeMonth.month, d);
  }, [activeMonth.year, activeMonth.month]);

  const getDecision = useCallback((empId: string): DeductionDecision =>
    decisions[empId] ?? defaultDecision(), [decisions]);

  const handleAdvanceCleared = (empId: string) => {
    // Zero out employee advance in local state
    setEmployees(prev => prev.map(e => e.id === empId ? { ...e, salaryAdvance: 0 } : e));
    // Mark all this employee's advance records as cleared in local state too
    setAdvanceRecords(prev => prev.map(r => r.employeeId === empId ? { ...r, cleared: true } : r));
    const cur = getDecision(empId);
    updateDecision(empId, { ...cur, deductAdvance: false });
  };

  const handleAdvanceRecordAdded = (rec: SalaryAdvanceRecord) => {
    setAdvanceRecords(prev => [rec, ...prev]);
    // Update employee's salaryAdvance in local state
    setEmployees(prev => prev.map(e =>
      e.id === rec.employeeId ? { ...e, salaryAdvance: e.salaryAdvance + rec.amount } : e
    ));
  };

  const handleAdvanceRecordCleared = (advanceId: string, employeeId: string, amount: number) => {
    setAdvanceRecords(prev => prev.map(r => r.id === advanceId ? { ...r, cleared: true } : r));
    setEmployees(prev => prev.map(e =>
      e.id === employeeId ? { ...e, salaryAdvance: Math.max(0, e.salaryAdvance - amount) } : e
    ));
  };

  const addEmp = (emp: Employee) => { setEmployees(prev => [...prev, emp]); setShowAddModal(false); };
  const [removeEmpError, setRemoveEmpError] = useState('');
  const [removingEmpId, setRemovingEmpId]   = useState<string | null>(null);

  const removeEmp = async (id: string) => {
    setRemovingEmpId(id); setRemoveEmpError('');
    try {
      await deactivateEmployee(id);
      setEmployees(prev => prev.filter(e => e.id !== id));
    } catch {
      // EMP-FIX: replace blocking alert() with inline error state
      setRemoveEmpError('Failed to remove employee — please try again.');
    } finally {
      setRemovingEmpId(null);
    }
  };
  const saveEmp = (updated: Employee) => {
    const prev = employees.find(e => e.id === updated.id);
    setEmployees(prevList => prevList.map(e => e.id === updated.id ? updated : e));
    // If advance was reduced to 0 via the edit modal, mark all their records as cleared
    if (prev && prev.salaryAdvance > 0 && updated.salaryAdvance === 0) {
      setAdvanceRecords(prevRecs => prevRecs.map(r => r.employeeId === updated.id ? { ...r, cleared: true } : r));
    }
    setEditEmp(null);
  };

  const filtered = useMemo(() => {
    let list = employees;
    if (branch !== 'All') list = list.filter(e => e.branch === branch);
    // Department filter: 'Store' and 'Admin office' are the two department groups
    if (dept !== 'All') list = list.filter(e =>
      e.department.trim().toLowerCase() === dept.toLowerCase()
    );
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(e => e.name.toLowerCase().includes(q) || e.department.toLowerCase().includes(q)); }
    return list;
  }, [employees, branch, dept, search]);

  const summary = useMemo(() => {
    let list = branch === 'All' ? employees : employees.filter(e => e.branch === branch);
    if (dept !== 'All') list = list.filter(e => e.department.trim().toLowerCase() === dept.toLowerCase());
    let gross = 0, net = 0, canteen = 0, advanceTotal = 0;
    list.forEach(e => {
      const d = getDecision(e.id);
      const c = calcSalary(e, att, activeMonth.daysInMonth, d);
      gross += e.grossSalary; net += c.net; canteen += c.canteenTotal; advanceTotal += e.salaryAdvance;
    });
    return { count: list.length, gross, net, canteen, advanceTotal };
  }, [employees, branch, dept, att, decisions, activeMonth.daysInMonth, getDecision]);

  const handleExcelExport = () => {
    let list = branch === 'All' ? employees : employees.filter(e => e.branch === branch);
    if (dept !== 'All') list = list.filter(e => e.department.trim().toLowerCase() === dept.toLowerCase());
    exportExcel(list, att, decisions, activeMonth.daysInMonth, activeMonth.label, getDecision);
  };

  const handleAttendanceExcelExport = () => {
    let list = branch === 'All' ? employees : employees.filter(e => e.branch === branch);
    if (dept !== 'All') list = list.filter(e => e.department.trim().toLowerCase() === dept.toLowerCase());
    exportAttendanceExcel(list, att, decisions, activeMonth.daysInMonth, activeMonth.label, getDecision);
  };

  const handleAdvanceExcelExport = () => {
    let empList = branch === 'All' ? employees : employees.filter(e => e.branch === branch);
    if (dept !== 'All') empList = empList.filter(e => e.department.trim().toLowerCase() === dept.toLowerCase());
    exportAdvanceExcel(empList, advanceRecords, activeMonth.label);
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm font-body">Loading {activeMonth.label}…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-screen min-h-[100dvh] bg-transparent pt-0 pb-6">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Attendance & Salary</h1>
          <p className="text-xs font-body text-muted-foreground mt-0.5">{employees.length} employees</p>
        </div>
        <div className="relative shrink-0" ref={ddRef}>
          <button onClick={() => setShowBranchDD(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-xs font-body font-semibold active:scale-95 transition-all">
            <Building2 className="size-3.5 text-muted-foreground" />
            {branch}
            <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform', showBranchDD && 'rotate-180')} />
          </button>
          {showBranchDD && (
            <div className="absolute top-full right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-30 min-w-[160px] overflow-hidden">
              {(['All', ...BRANCHES] as const).map(b => (
                <button key={b} onClick={() => { setBranch(b); setShowBranchDD(false); }}
                  className={cn('w-full px-4 py-2.5 text-left text-sm font-body font-semibold transition-colors', b === branch ? 'cafe-gradient text-primary-foreground' : 'hover:bg-muted text-foreground')}>
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Month switcher */}
      <div className="px-4 mb-3">
        <div className="flex items-center bg-card border border-border rounded-xl overflow-hidden">
          {TWO_MONTHS.map((m, i) => (
            <button key={`${m.year}-${m.month}`} onClick={() => setMonthIdx(i)}
              className={cn('flex-1 py-2.5 text-sm font-body font-bold transition-all flex items-center justify-center gap-1.5', i === monthIdx ? 'cafe-gradient text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
              <Calendar className="size-3.5" />
              {i === 0 ? 'Current' : 'Previous'}
              <span className={cn('text-[10px] font-normal', i === monthIdx ? 'text-primary-foreground/80' : 'text-muted-foreground/60')}>({m.label})</span>
            </button>
          ))}
        </div>
        {monthIdx === 1 && (
          <p className="text-[10px] font-body text-muted-foreground mt-1.5 flex items-center gap-1">
            <AlertCircle className="size-3" /> Data older than 2 months is auto-deleted
          </p>
        )}
      </div>

      {/* KPI Cards */}
      <div className="px-4 grid grid-cols-2 gap-2 mb-3">
        {[
          { icon: <Users className="size-3.5 text-primary" />, bg: 'bg-primary/10', val: String(summary.count), label: 'Employees' },
          { icon: <IndianRupee className="size-3.5 text-emerald-600" />, bg: 'bg-emerald-50', val: `₹${(summary.net / 100000).toFixed(1)}L`, label: 'Total Net' },
          { icon: <TrendingDown className="size-3.5 text-orange-500" />, bg: 'bg-orange-50', val: `₹${summary.canteen.toLocaleString('en-IN')}`, label: 'Food Ded.' },
          { icon: <AlertCircle className="size-3.5 text-amber-500" />, bg: 'bg-amber-50', val: summary.advanceTotal > 0 ? `₹${summary.advanceTotal.toLocaleString('en-IN')}` : '—', label: 'Advances' },
        ].map(({ icon, bg, val, label }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-3">
            <div className={cn('size-7 rounded-lg flex items-center justify-center mb-1.5', bg)}>{icon}</div>
            <p className="font-display text-xl font-bold tabular-nums">{val}</p>
            <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 px-4 mb-3 overflow-x-auto">
        {([
          { k: 'attendance', l: '📅 Attendance' },
          { k: 'salary', l: '💰 Salary' },
          { k: 'employees', l: '👥 Employees' },
          { k: 'analytics', l: '📊 Analytics' },
          { k: 'advance', l: '💳 Advance' },
        ] as const).map(({ k, l }) => (
          <button key={k} onClick={() => handleTabChange(k)}
            className={cn('shrink-0 px-3 py-2.5 rounded-xl text-xs font-body font-bold transition-all active:scale-95', tab === k ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}>
            {l}
          </button>
        ))}
      </div>

      {/* Department filter — shown on attendance + advance tabs alongside existing filters */}
      {(tab === 'attendance' || tab === 'advance' || tab === 'salary' || tab === 'employees') && (
        <div className="px-4 mb-2 flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] font-body font-semibold text-muted-foreground uppercase shrink-0">Dept:</span>
          {DEPT_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setDept(d)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-lg text-xs font-body font-semibold border transition-all active:scale-95',
                dept === d
                  ? 'cafe-gradient text-primary-foreground border-transparent shadow-sm'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {/* Search + actions — hide on analytics tab */}
      {tab !== 'analytics' && (
        <div className="px-4 mb-3 flex gap-2">
          {tab !== 'advance' && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input type="text" placeholder="Search name or department…" value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          )}
          {tab === 'attendance' && (
            <button onClick={handleAttendanceExcelExport} className="shrink-0 h-10 px-3 rounded-xl bg-emerald-600 text-white flex items-center gap-1 text-xs font-body font-semibold transition-colors hover:bg-emerald-700 active:scale-95">
              <Download className="size-4" /> Excel
            </button>
          )}
          {tab === 'salary' && (
            <button onClick={handleExcelExport} className="shrink-0 h-10 px-3 rounded-xl bg-emerald-600 text-white flex items-center gap-1 text-xs font-body font-semibold transition-colors hover:bg-emerald-700 active:scale-95">
              <Download className="size-4" /> Excel
            </button>
          )}
          {tab === 'advance' && (
            <button onClick={handleAdvanceExcelExport} className="shrink-0 h-10 px-3 rounded-xl bg-emerald-600 text-white flex items-center gap-1 text-xs font-body font-semibold transition-colors hover:bg-emerald-700 active:scale-95">
              <Download className="size-4" /> Excel
            </button>
          )}
          {tab === 'employees' && (
            <button onClick={() => setShowAddModal(true)} className="shrink-0 h-10 px-3 rounded-xl cafe-gradient text-primary-foreground flex items-center gap-1 text-xs font-body font-semibold active:scale-95 transition-all">
              <UserPlus className="size-4" /> Add
            </button>
          )}
        </div>
      )}

      {/* ── ATTENDANCE ─────────────────────────────── */}
      {tab === 'attendance' && (
        <div className="mx-4 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-display font-bold text-foreground">Daily Attendance — {activeMonth.label}</h2>
            <p className="text-[10px] font-body text-muted-foreground mt-0.5">Tap row to expand → tap day: ✓ Present → W Week Off → Absent. Meals ₹10 each. Max 4 week offs/month.</p>
          </div>
          {filtered.length === 0
            ? <EmptyState icon="👥" message="No employees found" sub="Add staff in Staff Management to see them here." />
            : filtered.map(e => (
              <AttRow key={e.id} emp={e} att={att} onUpdate={updateAtt} expanded={expandedId === e.id} onToggle={() => setExpandedId(prev => prev === e.id ? null : e.id)} decision={getDecision(e.id)} onDecisionChange={updateDecision} daysInMonth={activeMonth.daysInMonth} />
            ))
          }
        </div>
      )}

      {/* ── SALARY ──────────────────────────────────── */}
      {tab === 'salary' && (
        <div className="px-4 space-y-3">
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="font-display font-bold text-foreground mb-3 flex items-center gap-2">
              <TrendingDown className="size-4 text-primary" />
              {branch === 'All' ? 'All Branches' : branch} — {activeMonth.label} Summary
            </h3>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm font-body"><span className="text-muted-foreground">Total Gross</span><span className="font-bold tabular-nums">{'₹'}{summary.gross.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between text-sm font-body"><span className="text-muted-foreground">Food Deductions</span><span className="font-bold tabular-nums text-orange-600">-{'₹'}{summary.canteen.toLocaleString('en-IN')}</span></div>
              {summary.advanceTotal > 0 && (
                <div className="flex justify-between text-sm font-body"><span className="text-muted-foreground">Outstanding Advances</span><span className="font-bold tabular-nums text-amber-600">{'₹'}{summary.advanceTotal.toLocaleString('en-IN')}</span></div>
              )}
              <div className="flex justify-between text-sm font-body border-t border-border pt-1.5"><span className="font-bold text-foreground">Net Payable</span><span className="font-bold tabular-nums text-primary">{'₹'}{summary.net.toLocaleString('en-IN')}</span></div>
            </div>
          </div>
          {filtered.map(e => (
            <SalaryCard key={e.id} emp={e} att={att} decision={getDecision(e.id)} onDecisionChange={updateDecision} daysInMonth={activeMonth.daysInMonth} onAdvanceCleared={handleAdvanceCleared} />
          ))}
          {filtered.length === 0 && <EmptyState icon="👥" message="No employees found" sub="Add staff in Staff Management to see them here." />}
        </div>
      )}

      {/* ── EMPLOYEES ───────────────────────────────── */}
      {tab === 'employees' && (
        <div className="px-4 space-y-2">
          {filtered.map(e => (
            <div key={e.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-body font-bold border shrink-0', BRANCH_COLORS[e.branch])}>{BRANCH_SHORT[e.branch]}</span>
                  <span className="text-[10px] font-body text-muted-foreground truncate">{e.department}</span>
                </div>
                <p className="font-body font-bold text-sm text-foreground">{e.name}</p>
                {e.salaryAdvance > 0 && <p className="text-[10px] font-body text-amber-600 font-semibold mt-0.5">Advance pending: {'₹'}{e.salaryAdvance.toLocaleString('en-IN')}</p>}
                {e.accountNumber && <p className="text-[10px] font-body text-muted-foreground mt-0.5 truncate">{e.bankName} · {e.accountNumber}</p>}
              </div>
              <div className="flex items-start gap-2 shrink-0">
                <div className="text-right">
                  <p className="font-display font-bold text-base tabular-nums">{e.grossSalary > 0 ? `₹${e.grossSalary.toLocaleString('en-IN')}` : '—'}</p>
                  <p className="text-[10px] font-body text-muted-foreground">Gross</p>
                </div>
                <button onClick={() => setEditEmp(e)} className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors mt-0.5"><Pencil className="size-3.5" /></button>
                <button
                  onClick={() => removeEmp(e.id)}
                  disabled={removingEmpId === e.id}
                  className="size-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20 transition-colors mt-0.5 disabled:opacity-40"
                >
                  {removingEmpId === e.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                </button>
              </div>
            </div>
          ))}
          {removeEmpError && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{removeEmpError}</p>
          )}
          <button onClick={() => setShowAddModal(true)} className="w-full h-12 rounded-xl border-2 border-dashed border-border text-sm font-body font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-2">
            <Plus className="size-4" /> Add New Employee
          </button>
        </div>
      )}

      {/* ── ANALYTICS ───────────────────────────────── */}
      {tab === 'analytics' && (
        <AnalyticsTab
          employees={branch === 'All' ? employees : employees.filter(e => e.branch === branch)}
          att={att}
          decisions={decisions}
          daysInMonth={activeMonth.daysInMonth}
          monthLabel={activeMonth.label}
          getDecision={getDecision}
        />
      )}

      {/* ── ADVANCE ─────────────────────────────────── */}
      {tab === 'advance' && (
        <AdvanceTab
          employees={dept === 'All' ? employees : employees.filter(e => e.department.trim().toLowerCase() === dept.toLowerCase())}
          advanceRecords={advanceRecords}
          tableReady={advanceTableReady}
          onAdd={handleAdvanceRecordAdded}
          onClear={handleAdvanceRecordCleared}
        />
      )}

      <div className="h-6" />
      {showAddModal && <AddEmpModal onAdd={addEmp} onClose={() => setShowAddModal(false)} />}
      {editEmp && <EditEmpModal emp={editEmp} onSave={saveEmp} onClose={() => setEditEmp(null)} />}
    </div>
  );
}
