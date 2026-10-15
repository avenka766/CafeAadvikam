import type { BakeryOrder } from './types';
import { advanceDispatchProgress } from './advanceDispatchProgress';

export const advanceQuantityKey = (item: { itemName: string; unit: string }) => `${item.itemName}|${item.unit}`;

/** Manual quantities are physical dispatch declarations, independent of production entry. */
export function buildAdvanceDispatchActions(order: BakeryOrder, drafts: Record<string, string> = {}) {
  return advanceDispatchProgress(order).flatMap(line => {
    const draft = drafts[advanceQuantityKey(line)];
    const quantity = draft === undefined ? line.ready : Number(draft);
    if (!Number.isFinite(quantity) || quantity < 0 || (line.unit === 'pcs' && !Number.isInteger(quantity))) {
      throw new Error(`${line.itemName}: enter ${line.unit === 'pcs' ? 'a whole number of pieces' : 'a valid quantity'} (zero skips this item).`);
    }
    if (line.unit === 'kg' && Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.000001) throw new Error(`${line.itemName}: use up to 3 decimal places for kilograms.`);
    const normal = Math.min(quantity, line.pending);
    const extra = Math.round(Math.max(0, quantity - normal) * 1000) / 1000;
    const item = order.items.find(item => item.itemName === line.itemName && (item.dispatchUnit || 'kg') === line.unit);
    const action = { orderId:order.id, itemName:line.itemName, unit:line.unit, unitPrice:item?.advanceUnitPrice, dispatchSource:'advance' as const };
    return [
      ...(normal > 0 ? [{...action, quantity:normal, dispatchEntryId:crypto.randomUUID(), isExtra:false}] : []),
      ...(extra > 0 ? [{...action, quantity:extra, dispatchEntryId:crypto.randomUUID(), isExtra:true}] : []),
    ];
  });
}
