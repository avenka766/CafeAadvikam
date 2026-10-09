import type { BakeryOrder } from './types';
import { kgToPcs, itemNamesMatch as sameItem } from './itemMatcher';

export function advanceDispatchProgress(order: Pick<BakeryOrder, 'items' | 'dispatchLog' | 'producedItems' | 'status' | 'targetBranch'>) {
  return order.items.map(item => {
    const unit = item.dispatchUnit || 'kg';
    const requested = unit === 'pcs' && item.originalPcs != null ? item.originalPcs : item.quantity;
    const sent = (order.dispatchLog || []).filter(d => !d.isExtra && (!order.targetBranch || d.branch === order.targetBranch) && d.unit === unit && sameItem(d.itemName, item.itemName)).reduce((sum, d) => sum + d.quantity, 0);
    const pending = Math.max(0, requested - sent);
    const production = (order.producedItems || []).filter(p => sameItem(p.itemName, item.itemName));
    const kg = production.reduce((sum, p) => sum + p.quantityPrepared, 0);
    const prepared = unit === 'pcs' && item.weightGrams != null ? kgToPcs(kg, item.weightGrams) || 0 : kg;
    // Legacy stock dispatch orders have no production rows. Stock availability
    // is still validated by the dispatch workflow before sending anything.
    const available = production.length ? Math.max(0, prepared - sent) : ['produced', 'dispatched'].includes(order.status) ? pending : 0;
    return { itemName: item.itemName, unit, requested, sent, pending, ready: Math.round(Math.min(pending, available) * 1000) / 1000 };
  });
}
export function advanceDispatchComplete(order: Parameters<typeof advanceDispatchProgress>[0]) {
  return order.items.length > 0 && advanceDispatchProgress(order).every(line => line.pending <= 0.001);
}
