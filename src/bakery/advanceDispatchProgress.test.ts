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
