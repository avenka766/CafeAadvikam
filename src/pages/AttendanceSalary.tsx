import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Users, Building2, Search, ChevronDown, ChevronUp,
  IndianRupee, Calendar, TrendingDown, Plus, Trash2,
  Download, UserPlus, X, Pencil, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
type Branch = 'VRSNB' | 'Cafe Aadvikam' | 'SNB';

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
  woff: boolean;
  bf: boolean;
  lunch: boolean;
  dinner: boolean;
}

// attendance keyed by "employeeId_day"
type MonthAttendance = Record<string, DayAttendance>;

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS_IN_MONTH = 30;
const MONTH_LABEL = 'April 2026';
const YEAR = 2026;
const MONTH_IDX = 3; // April = index 3
const DB_MONTH = 4;  // 1-based month for DB
const SUNDAYS = Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1)
  .filter(d => new Date(YEAR, MONTH_IDX, d).getDay() === 0);

const BRANCHES: Branch[] = ['VRSNB', 'Cafe Aadvikam', 'SNB'];
const BRANCH_COLORS: Record<Branch, string> = {
  VRSNB: 'bg-blue-100 text-blue-800 border-blue-200',
  'Cafe Aadvikam': 'bg-orange-100 text-orange-800 border-orange-200',
  SNB: 'bg-amber-100 text-amber-700 border-amber-200',
};
const BRANCH_SHORT: Record<Branch, string> = {
  VRSNB: 'VRSNB',
  'Cafe Aadvikam': 'Cafe',
  SNB: 'SNB',
};

const ak = (eid: string, d: number) => `${eid}_${d}`;
const defaultDay = (): DayAttendance => ({ present: false, woff: false, bf: false, lunch: false, dinner: false });

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
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('is_active', true)
    .order('id', { ascending: true });
  if (error) throw error;
  return (data || []).map(dbRowToEmployee);
}

async function fetchAttendance(year: number, month: number): Promise<MonthAttendance> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('year', year)
    .eq('month', month);
  if (error) throw error;
  const result: MonthAttendance = {};
  for (const row of (data || [])) {
    const k = ak(row.employee_id as string, row.day as number);
    result[k] = {
      present: row.present as boolean,
      woff: row.woff as boolean,
      bf: row.bf as boolean,
      lunch: row.lunch as boolean,
      dinner: row.dinner as boolean,
    };
  }
  return result;
}

async function upsertAttendance(
  employeeId: string, year: number, month: number, day: number, val: DayAttendance
) {
  const { error } = await supabase
    .from('attendance')
    .upsert({
      employee_id: employeeId,
      year,
      month,
      day,
      present: val.present,
      woff: val.woff,
      bf: val.bf,
      lunch: val.lunch,
      dinner: val.dinner,
    }, { onConflict: 'employee_id,year,month,day' });
  if (error) console.error('Attendance upsert failed:', error.message);
}

async function insertEmployee(emp: Omit<Employee, 'id'> & { id?: string }): Promise<Employee | null> {
  const id = emp.id || `emp_${Date.now()}`;
  const { data, error } = await supabase
    .from('employees')
    .insert({
      id,
      name: emp.name,
      branch: emp.branch,
      department: emp.department,
      gross_salary: emp.grossSalary,
      salary_advance: emp.salaryAdvance,
      uniform_deduction: emp.uniformDeduction,
      other_deduction: emp.otherDeduction,
      account_number: emp.accountNumber || null,
      bank_name: emp.bankName || null,
      ifsc_code: emp.ifscCode || null,
    })
    .select()
    .single();
  if (error || !data) { console.error('Insert employee failed:', error?.message); return null; }
  return dbRowToEmployee(data as Record<string, unknown>);
}

async function updateEmployee(emp: Employee): Promise<boolean> {
  const { error } = await supabase
    .from('employees')
    .update({
      name: emp.name,
      branch: emp.branch,
      department: emp.department,
      gross_salary: emp.grossSalary,
      salary_advance: emp.salaryAdvance,
      uniform_deduction: emp.uniformDeduction,
      other_deduction: emp.otherDeduction,
      account_number: emp.accountNumber || null,
      bank_name: emp.bankName || null,
      ifsc_code: emp.ifscCode || null,
    })
    .eq('id', emp.id);
  if (error) { console.error('Update employee failed:', error.message); return false; }
  return true;
}

async function deactivateEmployee(id: string): Promise<void> {
  await supabase.from('employees').update({ is_active: false }).eq('id', id);
}

// ─── Salary Calc ──────────────────────────────────────────────────────────────
function calcSalary(emp: Employee, att: MonthAttendance) {
  let presentDays = 0, woffDays = 0, canteenTotal = 0;
  for (let d = 1; d <= DAYS_IN_MONTH; d++) {
    const a = att[ak(emp.id, d)];
    if (!a) continue;
    if (a.present) presentDays++;
    if (a.woff) woffDays++;
    if (a.present) {
      const m = [a.bf, a.lunch, a.dinner].filter(Boolean).length;
      canteenTotal += m === 3 ? 30 : m * 10;
    }
  }
  const worked = presentDays + woffDays;
  const wagePd = emp.grossSalary > 0 ? emp.grossSalary / DAYS_IN_MONTH : 0;
  const earned = Math.round(wagePd * worked);
  const totalDed = emp.salaryAdvance + canteenTotal + emp.uniformDeduction + emp.otherDeduction;
  return { presentDays, woffDays, worked, canteenTotal, earned, totalDed, net: earned - totalDed };
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

function AddEmpModal({ onAdd, onClose }: { onAdd: (e: Employee) => void; onClose: () => void }) {
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
    const result = await insertEmployee({
      name: name.trim(), branch, department: dept.trim(),
      grossSalary: parseInt(salary) || 0,
      salaryAdvance: parseInt(advance) || 0,
      uniformDeduction: parseInt(uniform) || 0,
      otherDeduction: parseInt(other) || 0,
      bankName: bank || undefined, accountNumber: acc || undefined, ifscCode: ifsc || undefined,
    });
    setSaving(false);
    if (result) onAdd(result);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-card flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-display font-bold text-lg">Add Employee</h3>
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
          <button
            disabled={!valid || saving}
            onClick={handleAdd}
            className="flex-1 h-11 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-semibold disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
          </button>
        </div>
      </div>
    </div>
  );
}

function EditEmpModal({ emp, onSave, onClose }: { emp: Employee; onSave: (e: Employee) => void; onClose: () => void }) {
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

  const handleSave = async () => {
    if (!valid) return;
    const updated: Employee = {
      ...emp, name: name.trim(), branch, department: dept.trim(),
      grossSalary: parseInt(salary) || 0,
      salaryAdvance: parseInt(advance) || 0,
      uniformDeduction: parseInt(uniform) || 0,
      otherDeduction: parseInt(other) || 0,
      bankName: bank || undefined, accountNumber: acc || undefined, ifscCode: ifsc || undefined,
    };
    setSaving(true);
    const ok = await updateEmployee(updated);
    setSaving(false);
    if (ok) onSave(updated);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm max-h-[92vh] overflow-y-auto">
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
            <Field label="Gross Salary (₹)"><input type="number" className={InputCls()} value={salary} onChange={e => setSalary(e.target.value)} /></Field>
            <Field label="Salary Advance (₹)"><input type="number" className={InputCls()} value={advance} onChange={e => setAdvance(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Uniform Ded. (₹)"><input type="number" className={InputCls()} value={uniform} onChange={e => setUniform(e.target.value)} /></Field>
            <Field label="Other Ded. (₹)"><input type="number" className={InputCls()} value={other} onChange={e => setOther(e.target.value)} /></Field>
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
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-border text-sm font-body font-semibold hover:bg-muted transition-colors">Cancel</button>
          <button
            disabled={!valid || saving}
            onClick={handleSave}
            className="flex-1 h-11 rounded-xl cafe-gradient text-primary-foreground text-sm font-body font-semibold disabled:opacity-40 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />} Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Attendance row (expandable) ──────────────────────────────────────────────
function AttRow({ emp, att, onUpdate, expanded, onToggle }: {
  emp: Employee; att: MonthAttendance;
  onUpdate: (empId: string, day: number, v: DayAttendance) => void;
  expanded: boolean; onToggle: () => void;
}) {
  const { presentDays, woffDays, canteenTotal, net } = calcSalary(emp, att);

  const woffCount = useMemo(() =>
    Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1)
      .filter(d => att[ak(emp.id, d)]?.woff).length,
    [emp.id, att]
  );

  const toggleDay = (day: number) => {
    const k = ak(emp.id, day);
    const cur = att[k] ?? defaultDay();
    let next: DayAttendance;
    if (!cur.present && !cur.woff) {
      next = { ...cur, present: true };
    } else if (cur.present) {
      if (woffCount < 4) {
        next = { ...cur, present: false, woff: true, bf: false, lunch: false, dinner: false };
      } else {
        next = { ...cur, present: false, woff: false, bf: false, lunch: false, dinner: false };
      }
    } else {
      next = { ...cur, present: false, woff: false };
    }
    onUpdate(emp.id, day, next);
  };

  const toggleMeal = (day: number, meal: 'bf' | 'lunch' | 'dinner') => {
    const k = ak(emp.id, day);
    const cur = att[k];
    if (!cur?.present) return;
    onUpdate(emp.id, day, { ...cur, [meal]: !cur[meal] });
  };

  return (
    <div className={cn('border-b border-border/40', expanded && 'bg-primary/[0.03]')}>
      <button className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors active:bg-muted/40" onClick={onToggle}>
        <span className={cn('shrink-0 px-1.5 py-0.5 rounded text-[9px] font-body font-bold border', BRANCH_COLORS[emp.branch])}>
          {BRANCH_SHORT[emp.branch]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-body font-semibold text-foreground truncate">{emp.name}</p>
          <p className="text-[10px] font-body text-muted-foreground">{emp.department}</p>
        </div>
        <div className="text-right shrink-0 mr-1">
          <p className="text-xs font-body font-bold tabular-nums">{presentDays + woffDays}d</p>
          <p className={cn('text-[10px] font-body font-semibold tabular-nums', net < 0 ? 'text-destructive' : 'text-primary')}>
            ₹{net.toLocaleString('en-IN')}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-1 min-w-max">
              {Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1).map(day => {
                const isSun = SUNDAYS.includes(day);
                const a = att[ak(emp.id, day)] ?? defaultDay();
                return (
                  <div key={day} className="flex flex-col items-center gap-0.5" style={{ minWidth: 32 }}>
                    <span className={cn('text-[9px] font-body font-semibold', isSun ? 'text-muted-foreground/40' : 'text-muted-foreground')}>
                      {day}
                    </span>
                    <button
                      disabled={isSun}
                      onClick={() => !isSun && toggleDay(day)}
                      className={cn(
                        'size-7 rounded-lg text-[9px] font-bold transition-all active:scale-90 border flex items-center justify-center',
                        isSun && 'bg-muted/20 border-border/20 text-muted-foreground/30 cursor-default',
                        !isSun && !a.present && !a.woff && 'bg-muted border-border text-muted-foreground/60 hover:border-primary/40',
                        a.present && 'bg-emerald-500 border-emerald-600 text-white',
                        a.woff && 'bg-sky-100 border-sky-300 text-sky-700',
                      )}
                    >
                      {isSun ? 'S' : a.present ? '✓' : a.woff ? 'W' : ''}
                    </button>
                    {a.present ? (
                      <div className="flex gap-[2px] mt-0.5">
                        {(['bf', 'lunch', 'dinner'] as const).map(m => (
                          <button
                            key={m}
                            onClick={e => { e.stopPropagation(); toggleMeal(day, m); }}
                            title={m === 'bf' ? 'Breakfast ₹10' : m === 'lunch' ? 'Lunch ₹10' : 'Dinner ₹10'}
                            className={cn(
                              'w-[18px] h-[16px] rounded text-[7px] font-bold transition-all active:scale-90 border leading-none flex items-center justify-center',
                              a[m]
                                ? 'bg-orange-400 border-orange-500 text-white'
                                : 'bg-muted border-border text-muted-foreground hover:border-orange-300'
                            )}
                          >
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
            <span className="flex items-center gap-1 text-[10px] font-body text-muted-foreground">
              <span className="size-2.5 rounded-sm bg-emerald-500 inline-block" /> Present
            </span>
            <span className="flex items-center gap-1 text-[10px] font-body text-muted-foreground">
              <span className="size-2.5 rounded-sm bg-sky-200 inline-block" /> W = Week Off ({woffCount}/4)
            </span>
            <span className="flex items-center gap-1 text-[10px] font-body text-muted-foreground">
              <span className="size-2.5 rounded-sm bg-orange-400 inline-block" /> BF / Lunch / Dinner ₹10
            </span>
            <span className="ml-auto text-[10px] font-body font-bold text-orange-600">🍽 ₹{canteenTotal}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Salary card ──────────────────────────────────────────────────────────────
function SalaryCard({ emp, att }: { emp: Employee; att: MonthAttendance }) {
  const { presentDays, woffDays, worked, canteenTotal, earned, net } = calcSalary(emp, att);
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-body font-bold border shrink-0', BRANCH_COLORS[emp.branch])}>
              {BRANCH_SHORT[emp.branch]}
            </span>
            <span className="text-[10px] font-body text-muted-foreground truncate">{emp.department}</span>
          </div>
          <p className="font-display font-bold text-base text-foreground">{emp.name}</p>
          {emp.accountNumber && <p className="text-[10px] font-body text-muted-foreground mt-0.5 truncate">{emp.bankName} · {emp.accountNumber}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className={cn('font-display font-bold text-xl tabular-nums', net < 0 ? 'text-destructive' : 'text-primary')}>
            ₹{net.toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] font-body text-muted-foreground">Net Salary</p>
        </div>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
        <SalRow label="Gross Salary" value={`₹${emp.grossSalary.toLocaleString('en-IN')}`} />
        <SalRow label="Days Present" value={String(presentDays)} />
        <SalRow label="Week Offs" value={String(woffDays)} />
        <SalRow label="Total Worked" value={`${worked} / ${DAYS_IN_MONTH}`} highlight />
        <SalRow label="Earned" value={`₹${earned.toLocaleString('en-IN')}`} highlight />
        <SalRow label="Canteen Ded." value={canteenTotal > 0 ? `-₹${canteenTotal}` : '—'} neg={canteenTotal > 0} />
        <SalRow label="Salary Advance" value={emp.salaryAdvance > 0 ? `-₹${emp.salaryAdvance.toLocaleString('en-IN')}` : '—'} neg={emp.salaryAdvance > 0} />
        <SalRow label="Uniform Ded." value={emp.uniformDeduction > 0 ? `-₹${emp.uniformDeduction}` : '—'} neg={emp.uniformDeduction > 0} />
        <SalRow label="Other Ded." value={emp.otherDeduction > 0 ? `-₹${emp.otherDeduction}` : '—'} neg={emp.otherDeduction > 0} />
        <div className="col-span-2 border-t border-border pt-2 mt-0.5 flex justify-between items-center">
          <span className="text-sm font-body font-bold text-foreground">Net Payable</span>
          <span className={cn('font-display font-bold text-lg tabular-nums', net < 0 ? 'text-destructive' : 'text-primary')}>
            ₹{net.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
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

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AttendanceSalary() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [att, setAtt] = useState<MonthAttendance>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'attendance' | 'salary' | 'employees'>('attendance');
  const [branch, setBranch] = useState<'All' | Branch>('All');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showBranchDD, setShowBranchDD] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const ddRef = useRef<HTMLDivElement>(null);

  // Load from Supabase on mount
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [emps, attData] = await Promise.all([
          fetchEmployees(),
          fetchAttendance(YEAR, DB_MONTH),
        ]);
        setEmployees(emps);
        setAtt(attData);
      } catch (e) {
        console.error('Load error:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setShowBranchDD(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // Update attendance both in state and DB
  const updateAtt = useCallback((empId: string, day: number, val: DayAttendance) => {
    const k = ak(empId, day);
    setAtt(prev => ({ ...prev, [k]: val }));
    upsertAttendance(empId, YEAR, DB_MONTH, day, val);
  }, []);

  const addEmp = (emp: Employee) => {
    setEmployees(prev => [...prev, emp]);
    setShowAddModal(false);
  };

  const removeEmp = async (id: string) => {
    await deactivateEmployee(id);
    setEmployees(prev => prev.filter(e => e.id !== id));
  };

  const saveEmp = (emp: Employee) => {
    setEmployees(prev => prev.map(e => e.id === emp.id ? emp : e));
    setEditEmp(null);
  };

  const filtered = useMemo(() => {
    let list = employees;
    if (branch !== 'All') list = list.filter(e => e.branch === branch);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(e => e.name.toLowerCase().includes(q) || e.department.toLowerCase().includes(q)); }
    return list;
  }, [employees, branch, search]);

  const summary = useMemo(() => {
    const list = branch === 'All' ? employees : employees.filter(e => e.branch === branch);
    let gross = 0, net = 0, canteen = 0;
    list.forEach(e => { const c = calcSalary(e, att); gross += e.grossSalary; net += c.net; canteen += c.canteenTotal; });
    return { count: list.length, gross, net, canteen };
  }, [employees, branch, att]);

  const exportCSV = () => {
    const list = branch === 'All' ? employees : employees.filter(e => e.branch === branch);
    const rows = [
      ['Name', 'Branch', 'Department', 'Gross', 'Present', 'Week Off', 'Worked', 'Earned', 'Canteen', 'Advance', 'Uniform', 'Other', 'Net', 'Bank', 'Account', 'IFSC'],
      ...list.map(e => { const c = calcSalary(e, att); return [e.name, e.branch, e.department, e.grossSalary, c.presentDays, c.woffDays, c.worked, c.earned, c.canteenTotal, e.salaryAdvance, e.uniformDeduction, e.otherDeduction, c.net, e.bankName || '', e.accountNumber || '', e.ifscCode || '']; }),
    ];
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.map(r => r.join(',')).join('\n'));
    a.download = `salary_april2026.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm font-body">Loading employees & attendance…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-14 pb-24">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Attendance & Salary</h1>
          <p className="text-xs font-body text-muted-foreground mt-0.5">{MONTH_LABEL} · {employees.length} employees</p>
        </div>
        {/* Branch filter */}
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

      {/* KPI Cards */}
      <div className="px-4 grid grid-cols-2 gap-2 mb-3">
        {[
          { icon: <Users className="size-3.5 text-primary" />, bg: 'bg-primary/10', val: String(summary.count), label: 'Employees' },
          { icon: <IndianRupee className="size-3.5 text-emerald-600" />, bg: 'bg-emerald-50', val: `₹${(summary.net / 100000).toFixed(1)}L`, label: 'Total Net' },
          { icon: <TrendingDown className="size-3.5 text-orange-500" />, bg: 'bg-orange-50', val: `₹${summary.canteen.toLocaleString('en-IN')}`, label: 'Canteen Ded.' },
          { icon: <Calendar className="size-3.5 text-blue-600" />, bg: 'bg-blue-50', val: `₹${(summary.gross / 100000).toFixed(1)}L`, label: 'Total Gross' },
        ].map(({ icon, bg, val, label }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-3">
            <div className={cn('size-7 rounded-lg flex items-center justify-center mb-1.5', bg)}>{icon}</div>
            <p className="font-display text-xl font-bold tabular-nums">{val}</p>
            <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 px-4 mb-3">
        {([{ k: 'attendance', l: '📅 Attendance' }, { k: 'salary', l: '💰 Salary' }, { k: 'employees', l: '👥 Employees' }] as const).map(({ k, l }) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('flex-1 py-2.5 rounded-xl text-xs font-body font-bold transition-all active:scale-95', tab === k ? 'cafe-gradient text-primary-foreground shadow-sm' : 'bg-card border border-border text-foreground')}>
            {l}
          </button>
        ))}
      </div>

      {/* Search + actions */}
      <div className="px-4 mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input type="text" placeholder="Search name or department…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm font-body placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        {tab === 'salary' && (
          <button onClick={exportCSV} className="shrink-0 h-10 px-3 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-body font-semibold transition-colors">
            <Download className="size-4" /> CSV
          </button>
        )}
        {tab === 'employees' && (
          <button onClick={() => setShowAddModal(true)} className="shrink-0 h-10 px-3 rounded-xl cafe-gradient text-primary-foreground flex items-center gap-1 text-xs font-body font-semibold active:scale-95 transition-all">
            <UserPlus className="size-4" /> Add
          </button>
        )}
      </div>

      {/* ── ATTENDANCE ─────────────────────────────── */}
      {tab === 'attendance' && (
        <div className="mx-4 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-display font-bold text-foreground">Daily Attendance</h2>
            <p className="text-[10px] font-body text-muted-foreground mt-0.5">
              Tap row to expand → tap day: ✓ Present → W Week Off → Absent. Tap orange dots for meals (₹10 / ₹30 all 3). Max 4 week offs/month.
            </p>
          </div>
          {filtered.length === 0
            ? <p className="text-center py-10 font-body text-sm text-muted-foreground">No employees found</p>
            : filtered.map(e => (
                <AttRow key={e.id} emp={e} att={att} onUpdate={updateAtt}
                  expanded={expandedId === e.id}
                  onToggle={() => setExpandedId(prev => prev === e.id ? null : e.id)} />
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
              {branch === 'All' ? 'All Branches' : branch} — Summary
            </h3>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm font-body"><span className="text-muted-foreground">Total Gross</span><span className="font-bold tabular-nums">₹{summary.gross.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between text-sm font-body"><span className="text-muted-foreground">Food Deductions</span><span className="font-bold tabular-nums text-orange-600">-₹{summary.canteen.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between text-sm font-body border-t border-border pt-1.5"><span className="font-bold text-foreground">Net Payable</span><span className="font-bold tabular-nums text-primary">₹{summary.net.toLocaleString('en-IN')}</span></div>
            </div>
          </div>
          {filtered.map(e => <SalaryCard key={e.id} emp={e} att={att} />)}
          {filtered.length === 0 && <p className="text-center py-10 font-body text-sm text-muted-foreground">No employees found</p>}
        </div>
      )}

      {/* ── EMPLOYEES ───────────────────────────────── */}
      {tab === 'employees' && (
        <div className="px-4 space-y-2">
          {filtered.map(e => (
            <div key={e.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-body font-bold border shrink-0', BRANCH_COLORS[e.branch])}>
                    {BRANCH_SHORT[e.branch]}
                  </span>
                  <span className="text-[10px] font-body text-muted-foreground truncate">{e.department}</span>
                </div>
                <p className="font-body font-bold text-sm text-foreground">{e.name}</p>
                {e.accountNumber && <p className="text-[10px] font-body text-muted-foreground mt-0.5 truncate">{e.bankName} · {e.accountNumber}</p>}
              </div>
              <div className="flex items-start gap-2 shrink-0">
                <div className="text-right">
                  <p className="font-display font-bold text-base tabular-nums">{e.grossSalary > 0 ? `₹${e.grossSalary.toLocaleString('en-IN')}` : '—'}</p>
                  <p className="text-[10px] font-body text-muted-foreground">Gross</p>
                </div>
                <button onClick={() => setEditEmp(e)} className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors mt-0.5">
                  <Pencil className="size-3.5" />
                </button>
                <button onClick={() => removeEmp(e.id)} className="size-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20 transition-colors mt-0.5">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
          <button onClick={() => setShowAddModal(true)} className="w-full h-12 rounded-xl border-2 border-dashed border-border text-sm font-body font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-2">
            <Plus className="size-4" /> Add New Employee
          </button>
        </div>
      )}

      <div className="h-6" />
      {showAddModal && <AddEmpModal onAdd={addEmp} onClose={() => setShowAddModal(false)} />}
      {editEmp && <EditEmpModal emp={editEmp} onSave={saveEmp} onClose={() => setEditEmp(null)} />}
    </div>
  );
}
