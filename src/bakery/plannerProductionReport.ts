import {businessDate} from '@/lib/businessDate';
import {closingStockItemSlug} from './itemMatcher';
import type {DispatchEntry} from './types';

export type ProductionReportMovement = {
  item_slug: string;
  item_name: string;
  unit: string;
  business_date: string;
  delta: number;
  reason: string;
  created_at: string;
};

export function buildProductionDispatchSheet({
  productionRows, dispatches, movements, from, to, stockCutoff, categoryFor,
}: {
  productionRows: {itemName: string; unit: string; totalRequested: number; preparedTotal: number}[];
  dispatches: DispatchEntry[];
  movements: ProductionReportMovement[];
  from: string;
  to: string;
  stockCutoff: string | null;
  categoryFor: (name: string) => string;
}) {
  const keyFor = (name: string, unit: string) => `${closingStockItemSlug(name) || name.trim().toLowerCase()}|${unit}`;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const rows = new Map<string, {item: string; unit: string; requested: number; prepared: number; dispatched: number; extra: number}>();
  const stock = new Map<string, number>();
  const produced = new Map<string, number>();
  const ensure = (key: string, item: string, unit: string) => {
    const current = rows.get(key);
    if (current) return current;
    const row = {item: item.replace(/\s*\((?:kgs?|pcs|pieces?|nos)\)\s*$/i, '').trim(), unit, requested: 0, prepared: 0, dispatched: 0, extra: 0};
    rows.set(key, row);
    return row;
  };
  const inRange = (date: string) => date >= from && date <= to;

  for (const item of productionRows) {
    const row = ensure(keyFor(item.itemName, item.unit), item.itemName, item.unit);
    row.requested += item.totalRequested;
    row.prepared += item.preparedTotal;
  }
  for (const entry of dispatches) {
    if (!inRange(businessDate(entry.dispatchedAt))) continue;
    const unit = entry.unit ?? 'kg';
    const row = ensure(keyFor(entry.itemName, unit), entry.itemName, unit);
    const quantity = Number(entry.quantity) || 0;
    row.dispatched += quantity;
    if (entry.isExtra) row.extra += quantity;
  }
  for (const movement of movements) {
    if (!movement.business_date || movement.business_date > to) continue;
    const key = keyFor(movement.item_slug || movement.item_name, movement.unit);
    const quantity = Number(movement.delta) || 0;
    if (!stockCutoff || Date.parse(movement.created_at) >= Date.parse(stockCutoff)) {
      stock.set(key, (stock.get(key) ?? 0) + quantity);
    }
    if (movement.reason === 'production_carryover' && inRange(movement.business_date)) {
      ensure(key, movement.item_name || movement.item_slug, movement.unit);
      produced.set(key, (produced.get(key) ?? 0) + quantity);
    }
  }

  return Array.from(rows, ([key, row]) => ({
    Category: categoryFor(row.item),
    Item: row.item,
    Unit: row.unit,
    Requested: round(row.requested),
    'Closing Stock': round(stock.get(key) ?? 0),
    Produced: round(produced.get(key) ?? row.prepared),
    'Regular Dispatch': round(row.dispatched - row.extra),
    'Extra Dispatch': round(row.extra),
    'Total Dispatched': round(row.dispatched),
  })).sort((a, b) => a.Category.localeCompare(b.Category) || a.Item.localeCompare(b.Item) || a.Unit.localeCompare(b.Unit));
}
