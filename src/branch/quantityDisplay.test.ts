import { expect, it } from 'vitest';
import { formatBranchQuantity } from './quantityDisplay';
it('shows pieces only as whole numbers', () => {
  expect(formatBranchQuantity(12, 'pcs')).toBe('12 pcs');
  expect(formatBranchQuantity(0, 'pcs')).toBe('0 pcs');
  expect(formatBranchQuantity(-2, 'pcs')).toBe('-2 pcs');
});
it('flags corrupt fractional piece balances without inventing a stock count', () => {
  expect(formatBranchQuantity(0.956, 'pcs')).toBe('Stock check needed');
  expect(formatBranchQuantity(5.044, 'pcs')).toBe('Stock check needed');
  expect(formatBranchQuantity(Number.NaN, 'pcs')).toBe('Stock check needed');
});
it('preserves weighted quantities', () => {
  expect(formatBranchQuantity(0.956, 'kg')).toBe('956 g');
  expect(formatBranchQuantity(5.044, 'kg')).toBe('5.044 kg');
});
