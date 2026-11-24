export type AdvanceDeductionChoice = {
  deductAdvance: boolean;
  advanceMode?: 'full' | 'partial' | null;
  advanceAmount?: number | null;
};

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
export const formatAdvanceAmount = (amount: number) => inr.format(amount);

export function advanceDeductionQuote(
  choice: AdvanceDeductionChoice, balance: number, availableSalary: number, foodOnly: boolean,
) {
  if (!choice.deductAdvance || (foodOnly && !choice.advanceMode)) return { amount: 0, issue: '' };
  const requested = choice.advanceMode === 'partial' ? Number(choice.advanceAmount ?? 0) : balance;
  if (requested < 0 || (choice.advanceMode === 'partial' && (requested <= 0 || requested > balance))) {
    return { amount: 0, issue: 'The partial amount exceeds the current advance balance or is invalid. Review the advance choice.' };
  }
  if (choice.advanceMode && requested > Math.max(0, availableSalary)) {
    return { amount: 0, issue: 'The selected advance exceeds the salary available after other deductions. Choose a smaller amount.' };
  }
  return { amount: requested, issue: '' };
}
