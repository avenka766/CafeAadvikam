import { useState } from 'react';
import { formatAdvanceAmount, type AdvanceDeductionChoice } from '@/lib/payrollAdvance';

type Mode = 'none' | 'full' | 'partial';

export default function AdvanceDeductionPicker({ balance, choice, onSave, disabled }: {
  balance: number;
  choice: AdvanceDeductionChoice;
  onSave: (choice: AdvanceDeductionChoice) => void;
  disabled?: boolean;
}) {
  const savedMode = choice.deductAdvance ? choice.advanceMode ?? 'full' : 'none';
  const [mode, setMode] = useState<Mode>(savedMode);
  const [amount, setAmount] = useState(choice.advanceAmount?.toString() ?? '');
  const partial = Number(amount);
  const valid = mode !== 'partial' || (/^\d+(?:\.\d{1,2})?$/.test(amount) && partial > 0 && partial <= balance);
  const changed = mode !== savedMode || (mode === 'partial' && partial !== choice.advanceAmount)
    || (mode === 'full' && !choice.advanceMode);
  const carry = mode === 'full' ? 0 : mode === 'partial' && valid ? Math.round((balance - partial) * 100) / 100 : balance;

  return <fieldset disabled={disabled} className="space-y-2 rounded-lg border bg-card p-3 text-xs">
    <legend className="px-1 font-semibold">Salary advance deduction</legend>
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1">Deduct this month
        <select className="rounded border bg-background px-2 py-1.5" value={mode} onChange={event => setMode(event.target.value as Mode)}>
          <option value="none">No deduction</option>
          <option value="full">Full advance</option>
          <option value="partial">Partial amount</option>
        </select>
      </label>
      {mode === 'partial' && <label className="grid gap-1">Amount to deduct (₹)
        <input type="number" min="0.01" max={balance} step="0.01" value={amount} onChange={event => setAmount(event.target.value)}
          className="w-36 rounded border bg-background px-2 py-1.5" />
      </label>}
      <button type="button" disabled={!changed || !valid}
        onClick={() => onSave({ deductAdvance: mode !== 'none', advanceMode: mode === 'none' ? null : mode,
          advanceAmount: mode === 'partial' ? partial : null })}
        className="rounded bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-50">Save advance choice</button>
    </div>
    {valid ? <p className="text-muted-foreground">Outstanding {formatAdvanceAmount(balance)} · {formatAdvanceAmount(carry)} carries forward after payroll is recorded.</p>
      : <p className="text-destructive">Enter an amount from ₹0.01 to {formatAdvanceAmount(balance)}.</p>}
  </fieldset>;
}
