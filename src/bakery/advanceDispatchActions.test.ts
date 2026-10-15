import { expect, it } from 'vitest';
import { buildAdvanceDispatchActions } from './advanceDispatchActions';
import { advanceDispatchComplete, advanceDispatchProgress } from './advanceDispatchProgress';
import type { BakeryOrder } from './types';
const order = { id:'advance-1',items:[{itemName:'BUN',quantity:10,dispatchUnit:'pcs',advanceUnitPrice:12}],status:'accepted',targetBranch:'SNB',producedItems:[],dispatchLog:[] } as unknown as BakeryOrder;
it('allows manual dispatch without a production entry and keeps booking rates', () => {
  const actions=buildAdvanceDispatchActions(order,{'BUN|pcs':'12'});
  expect(actions.map(a=>[a.quantity,a.isExtra,a.unitPrice,a.dispatchSource])).toEqual([[10,false,12,'advance'],[2,true,12,'advance']]);
  expect(order.items[0].quantity).toBe(10);
});
it('allows partial dispatch and zero skips items', () => {
  expect(buildAdvanceDispatchActions(order,{'BUN|pcs':'4'}).map(a=>a.quantity)).toEqual([4]);
  expect(buildAdvanceDispatchActions(order,{'BUN|pcs':'0'})).toEqual([]);
});
it('only allocates the remaining requested quantity before marking extras', () => {
  const partial={...order,dispatchLog:[{itemName:'BUN',quantity:6,unit:'pcs',branch:'SNB'}]} as BakeryOrder;
  expect(buildAdvanceDispatchActions(partial,{'BUN|pcs':'7'}).map(a=>[a.quantity,a.isExtra])).toEqual([[4,false],[3,true]]);
});
it('keeps extras distinct from fulfillment and counts total production used', () => {
  const partial={...order,producedItems:[{itemName:'BUN',quantityPrepared:20}],dispatchLog:[{itemName:'BUN',quantity:5,unit:'pcs',branch:'SNB'},{itemName:'BUN',quantity:2,unit:'pcs',branch:'SNB',isExtra:true}]} as BakeryOrder;
  const line=advanceDispatchProgress(partial)[0];
  expect([line.sent,line.extraSent,line.pending]).toEqual([5,2,5]); expect(advanceDispatchComplete(partial)).toBe(false);
});
it('rejects fractional pieces, negatives and non-numeric values', () => {
  for(const value of ['1.5','-1','abc','Infinity']) expect(()=>buildAdvanceDispatchActions(order,{'BUN|pcs':value})).toThrow();
});
it('permits decimal kilograms and extras on completed orders', () => {
  const kg={...order,items:[{itemName:'BUN',quantity:1,dispatchUnit:'kg',advanceUnitPrice:200}]} as BakeryOrder;
  expect(buildAdvanceDispatchActions(kg,{'BUN|kg':'1.25'}).map(a=>[a.quantity,a.isExtra])).toEqual([[1,false],[0.25,true]]);
  const done={...order,dispatchLog:[{itemName:'BUN',quantity:10,unit:'pcs',branch:'SNB'}]} as BakeryOrder;
  expect(buildAdvanceDispatchActions(done,{'BUN|pcs':'3'}).map(a=>[a.quantity,a.isExtra])).toEqual([[3,true]]);
});
