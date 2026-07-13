import { supabase } from '@/lib/supabase';
import type { Branch } from './types';

export type CakeDispatchSource = {
  id: string;
  branch: Branch;
  order_no: string;
  cake_kg: string | null;
  prepared_quantity: number | null;
  flavor: string | null;
  cream_type?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type AdvanceLine = {
  barcode?: number;
  itemName: string;
  quantity: number;
  unit: 'pcs' | 'kg';
  price: number;
  lineTotal: number;
};

type AdvancePayload = {
  id: string;
  branch: Branch;
  orderNo: string;
  items?: AdvanceLine[];
  cakeKg?: string;
  originalCakeKg?: string;
  orderValue: number;
  originalOrderValue?: number;
  advanceAmount?: number;
  balanceAmount?: number;
  storeStatus?: string;
  storeAcceptedBy?: string;
  storeStatusHistory?: Array<{ status: string; by: string; at: string }>;
};

const quantity = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const cakeIncomingDispatchId = (cakeOrderId: string) => `cake-master:${cakeOrderId}`;

export async function ensureCakeDispatchIncoming(order: CakeDispatchSource, actor: string) {
  const dispatchedQty = order.prepared_quantity ?? quantity(order.cake_kg);
  if (!order.order_no || dispatchedQty <= 0) {
    throw new Error('Cake dispatch requires an order number and a prepared quantity greater than zero.');
  }

  const { data: operationRow, error: operationError } = await supabase
    .from('branch_operation_records')
    .select('record_id,payload')
    .eq('branch', order.branch)
    .eq('record_type', 'advance_order')
    .eq('record_no', order.order_no)
    .limit(1)
    .maybeSingle();

  if (operationError) throw new Error(`Advance order lookup failed: ${operationError.message}`);
  const advance = operationRow?.payload as AdvancePayload | undefined;
  const firstLine = advance?.items?.[0];
  if (!advance || !operationRow?.record_id || !firstLine?.itemName?.trim()) {
    throw new Error(`Advance order ${order.order_no} could not be matched to its exact cake item.`);
  }

  const now = new Date().toISOString();
  const dispatchId = cakeIncomingDispatchId(order.id);
  const { data: existingIncoming, error: incomingLookupError } = await supabase
    .from('branch_incoming')
    .select('id')
    .eq('dispatch_id', dispatchId)
    .limit(1)
    .maybeSingle();
  if (incomingLookupError) throw new Error(`Incoming stock lookup failed: ${incomingLookupError.message}`);

  if (!existingIncoming) {
    const { error: incomingError } = await supabase.from('branch_incoming').insert({
      dispatch_id: dispatchId,
      branch: order.branch,
      item_name: firstLine.itemName,
      item_barcode: firstLine.barcode ?? null,
      quantity: dispatchedQty,
      unit: firstLine.unit || 'kg',
      received_at: order.updated_at || now,
      dispatched_by: actor,
      confirmed: false,
    });
    if (incomingError && incomingError.code !== '23505') {
      throw new Error(`Incoming stock could not be created: ${incomingError.message}`);
    }
  }

  const placedQty = quantity(advance.originalCakeKg) || quantity(firstLine.quantity) || quantity(advance.cakeKg);
  const placedValue = quantity(advance.originalOrderValue) || quantity(firstLine.lineTotal) || quantity(advance.orderValue);
  const rate = quantity(firstLine.price) || (placedQty > 0 ? placedValue / placedQty : 0);
  const orderValue = Math.round(rate * dispatchedQty * 100) / 100;
  const history = advance.storeStatusHistory || [];
  const nextPayload: AdvancePayload = {
    ...advance,
    originalCakeKg: advance.originalCakeKg ?? String(placedQty),
    originalOrderValue: advance.originalOrderValue ?? placedValue,
    cakeKg: String(dispatchedQty),
    items: (advance.items || []).map((line, index) => index === 0
      ? { ...line, quantity: dispatchedQty, lineTotal: orderValue }
      : line),
    orderValue,
    balanceAmount: Math.round((orderValue - quantity(advance.advanceAmount)) * 100) / 100,
    storeStatus: 'dispatched',
    storeAcceptedBy: actor,
    storeStatusHistory: history.at(-1)?.status === 'dispatched'
      ? history
      : [...history, { status: 'dispatched', by: actor, at: now }],
  };

  const { error: syncError } = await supabase
    .from('branch_operation_records')
    .update({ payload: nextPayload, amount: orderValue, status: 'dispatched', actor, updated_at: now })
    .eq('branch', order.branch)
    .eq('record_type', 'advance_order')
    .eq('record_id', operationRow.record_id);
  if (syncError) throw new Error(`Advance order dispatch sync failed: ${syncError.message}`);

  return { dispatchedQty, dispatchId };
}
