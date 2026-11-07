import { describe, expect, it } from 'vitest';
import { combineDispatchReturns, dispatchRevisionError, planDispatchEditReturns, planInvoiceQuantityReturn } from './dispatchRevisionValidation';

const item = { itemName: 'Bun', unit: 'pcs', quantity: 2, unitPrice: 10 };
describe('dispatch correction input guards', () => {
  it('plans both a reduced quantity and a removed line as recorded returns', () => {
    const bread = {itemName: 'Bread', unit: 'kg', quantity: 0.3, unitPrice: 40};
    expect(planDispatchEditReturns([item, bread], [{...bread, key: 1, quantity: 0.1}])).toEqual({
      returns: [{itemName:'Bun',unit:'pcs',qty:2},{itemName:'Bread',unit:'kg',qty:0.2}], otherEdits:false,
    });
    expect(planDispatchEditReturns([item], [{...item,key:0,quantity:1,unitPrice:12}])).toMatchObject({
      returns:[{itemName:'Bun',unit:'pcs',qty:1}], otherEdits:true,
    });
    // Saved invoice lines may have extra display fields. A quantity-only
    // reduction must still go through the recorded return flow.
    const displayed = {...item, lineTotal:20, isExtra:false};
    expect(planDispatchEditReturns([displayed], [{...displayed,key:0,quantity:1}])).toEqual({
      returns:[{itemName:'Bun',unit:'pcs',qty:1}], otherEdits:false,
    });
  });
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

it('routes a legacy quantity-only edit to returns while preserving GST edits', () => {
 const original = [{itemName:'Cake', unit:'kg', quantity:2, unitPrice:650, gstPct:5}];
 expect(planInvoiceQuantityReturn(original,[{...original[0],quantity:1}])).toEqual({returns:[{itemName:'Cake',unit:'kg',qty:1}],otherEdits:false});
 expect(planInvoiceQuantityReturn(original,[]).returns[0].qty).toBe(2);
 expect(planInvoiceQuantityReturn(original,[{...original[0],quantity:1,gstPct:12}]).otherEdits).toBe(true);
 expect(planInvoiceQuantityReturn(original,[{...original[0],quantity:3}]).otherEdits).toBe(true);
 expect(planInvoiceQuantityReturn([...original,...original],[]).otherEdits).toBe(true);
});
