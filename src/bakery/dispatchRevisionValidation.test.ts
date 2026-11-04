import { describe, expect, it } from 'vitest';
import { combineDispatchReturns, dispatchRevisionError } from './dispatchRevisionValidation';

const item = { itemName: 'Bun', unit: 'pcs', quantity: 2, unitPrice: 10 };
describe('dispatch correction input guards', () => {
  it('rejects non-finite money and quantities instead of silently dropping a line', () => {
    for (const bad of [NaN, Infinity, -Infinity, -1]) {
      expect(dispatchRevisionError([{ ...item, quantity: bad }], 0)).toBeTruthy();
      expect(dispatchRevisionError([{ ...item, unitPrice: bad }], 0)).toBeTruthy();
      expect(dispatchRevisionError([item], bad)).toBeTruthy();
    }
    expect(dispatchRevisionError([{ ...item, quantity: 1e308, unitPrice: 1e308 }], 0)).toBeTruthy();
    expect(dispatchRevisionError([item], 101)).toBeTruthy();
  });
  it('preserves fractional kilograms and free items but rejects fractional pieces', () => {
    expect(dispatchRevisionError([{ ...item, quantity: 1.5 }], 0)).toBeTruthy();
    expect(dispatchRevisionError([{ ...item, unit: 'kg', quantity: 0.125, unitPrice: 0 }], 100)).toBeNull();
  });
  it('combines repeated return entries before checking remaining invoice quantity', () => {
    expect(combineDispatchReturns([
      { itemName: ' Bun ', unit: 'pcs', qty: 2 },
      { itemName: 'BUN', unit: 'pcs', qty: 3 },
      { itemName: 'Bun', unit: 'kg', qty: 0.25 },
    ])).toEqual([{ itemName: 'Bun', unit: 'pcs', qty: 5 }, { itemName: 'Bun', unit: 'kg', qty: 0.25 }]);
  });
  it('rejects invalid return rows even alongside valid rows', () => {
    for (const qty of [NaN, Infinity, -Infinity, -1, 0.5]) {
      expect(() => combineDispatchReturns([{ itemName: 'Bun', unit: 'pcs', qty: 1 }, { itemName: 'Bun', unit: 'pcs', qty }])).toThrow();
    }
    expect(() => combineDispatchReturns([{ itemName: ' ', unit: 'pcs', qty: 1 }])).toThrow();
    expect(combineDispatchReturns([{ itemName: '', unit: 'pcs', qty: 0 }])).toEqual([]);
  });
});
