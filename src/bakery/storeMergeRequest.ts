import {supabase} from '@/lib/supabase';
import type {BakeryOrder, BakeryOrderItem, PreparedItem} from './types';

function itemKey(item: BakeryOrderItem) {
  return JSON.stringify([item.itemName.trim().toLowerCase(), item.dispatchUnit ?? 'kg']);
}

function itemDetails(item: BakeryOrderItem) {
  return JSON.stringify([item.weightGrams ?? null, item.advanceUnitPrice ?? null,
    item.attachmentName ?? null, item.attachmentDataUrl ?? null, item.isCustom ?? null]);
}

export function partitionStoreMergeOrders(orders: BakeryOrder[], keepSeparate: (order: BakeryOrder) => boolean): BakeryOrder[][] {
  const batches: {orders: BakeryOrder[]; details: Map<string, string> | null}[] = [];
  for (const order of orders) {
    const details = new Map<string, string>();
    let standalone = keepSeparate(order);
    for (const item of order.items) {
      const key = itemKey(item);
      const signature = itemDetails(item);
      if (details.has(key) && details.get(key) !== signature) standalone = true;
      details.set(key, signature);
    }
    if (standalone) {
      batches.push({orders: [order], details: null});
      continue;
    }
    const batch = batches.find(candidate => candidate.details && candidate.orders.length < 100 &&
      [...details].every(([key, signature]) => !candidate.details!.has(key) || candidate.details!.get(key) === signature));
    if (!batch) {
      batches.push({orders: [order], details});
      continue;
    }
    batch.orders.push(order);
    for (const [key, signature] of details) batch.details!.set(key, signature);
  }
  return batches.map(batch => batch.orders);
}

export async function saveStoreMerge(staff:string,orders:BakeryOrder[],items:BakeryOrderItem[],produced:PreparedItem[],notes:string|null){
 if(!staff)throw Error('Sign in before sending orders to Store.');
 const expected=orders.map(o=>({id:o.id,items:o.items,produced_items:o.producedItems??[],status:o.status,notes:o.notes??null,target_branch:o.targetBranch??null}));
 const input={p_expected:expected,p_items:items,p_produced:produced,p_notes:notes};
 const scope=JSON.stringify(input,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const key=`store-merge:${staff}:${digest}`,raw=localStorage.getItem(key);
 const request=raw?JSON.parse(raw):{...input,p_request:crypto.randomUUID()};
 if(!request.p_request||JSON.stringify(request.p_expected)!==JSON.stringify(expected))throw Error('Saved merge needs review. No order has been removed.');
 if(!raw)localStorage.setItem(key,JSON.stringify(request));
 const {data,error}=await supabase.rpc('merge_store_orders_v1',request);
 if(error){
  if(error.code&&/^(P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501)$/.test(error.code)&&!error.message.includes('REQUEST_ALREADY_USED'))localStorage.removeItem(key);
  throw Error(error.message);
 }
 if(data?.order?.id!==orders[0]?.id||!Array.isArray(data.removed_ids))throw Error('Store merge confirmation is incomplete. Retry the same selection.');
 localStorage.removeItem(key);return data as {order:Record<string,unknown>;removed_ids:string[]};
}
