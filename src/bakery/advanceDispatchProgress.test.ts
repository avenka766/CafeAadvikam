import { expect, it } from 'vitest';
import { advanceDispatchComplete, advanceDispatchProgress } from './advanceDispatchProgress';
import type { BakeryOrder } from './types';
const order = (changes: Partial<BakeryOrder> = {}) => ({ items: [{ itemName:'OPPAT',quantity:30,dispatchUnit:'pcs' }], producedItems:[], dispatchLog:[], status:'produced',targetBranch:'SNB', ...changes } as BakeryOrder);
it('completes stock dispatches without requiring a production entry', () => {
  expect(advanceDispatchComplete(order({ dispatchLog:[{ itemName:'OPPAT',quantity:30,unit:'pcs',branch:'SNB' } as any] }))).toBe(true);
  expect(advanceDispatchProgress(order())[0].ready).toBe(30);
});
it('keeps partial orders active and caps dispatch at the unfulfilled request', () => {
  const partial = order({ status:'dispatched',dispatchLog:[{ itemName:'OPPAT',quantity:20,unit:'pcs',branch:'SNB' } as any] });
  expect(advanceDispatchComplete(partial)).toBe(false);
  expect(advanceDispatchProgress(partial)[0].ready).toBe(10);
});
it('ignores extra items, another branch and mismatched units', () => {
  const wrong = order({ dispatchLog:[{ itemName:'OPPAT',quantity:100,unit:'pcs',branch:'SNB',isExtra:true },{ itemName:'OPPAT',quantity:100,unit:'pcs',branch:'VRSNB' },{ itemName:'OPPAT',quantity:100,unit:'kg',branch:'SNB' }] as any });
  expect(advanceDispatchProgress(wrong)[0].pending).toBe(30);
});
it('keeps an order active until every requested item is delivered', () => {
  const partial = order({ items:[{itemName:'OPPAT',quantity:30,dispatchUnit:'pcs'},{itemName:'PEDA',quantity:11,dispatchUnit:'kg'}] as any,dispatchLog:[{itemName:'OPPAT',quantity:55,unit:'pcs',branch:'SNB'}] as any });
  expect(advanceDispatchComplete(partial)).toBe(false);
  expect(advanceDispatchProgress(partial).map(i=>i.ready)).toEqual([0,11]);
});
it('allows reserved stock remainders despite later partial production entries', () => {
  const partial = order({ notes:'SNB-ADV-446 | Existing branch stock [Stock Reserved]', items:[{itemName:'CREAM BUN',quantity:15,dispatchUnit:'pcs'},{itemName:'SPL DOUGHNUT',quantity:10,dispatchUnit:'pcs'}] as any, producedItems:[{itemName:'CREAM BUN',quantityPrepared:4},{itemName:'SPL DOUGHNUT',quantityPrepared:3}] as any, dispatchLog:[{itemName:'CREAM BUN',quantity:6,unit:'pcs',branch:'SNB'},{itemName:'SPL DOUGHNUT',quantity:6,unit:'pcs',branch:'SNB'}] as any });
  expect(advanceDispatchProgress(partial).map(line=>line.ready)).toEqual([9,4]);
  expect(advanceDispatchComplete(partial)).toBe(false);
});
it('still limits production orders to quantities actually prepared', () => {
  const partial = order({ producedItems:[{itemName:'OPPAT',quantityPrepared:24}] as any,dispatchLog:[{itemName:'OPPAT',quantity:20,unit:'pcs',branch:'SNB'}] as any });
  expect(advanceDispatchProgress(partial)[0].ready).toBe(4);
});
it('keeps a completely unsent reserved-stock order dispatchable', () => {
  const unsent = order({notes:'SNB-ADV-447 | Existing stock [Stock Reserved]',producedItems:[{itemName:'OPPAT',quantityPrepared:2}] as any});
  expect(advanceDispatchProgress(unsent)[0].ready).toBe(30);
  expect(advanceDispatchComplete(unsent)).toBe(false);
});
