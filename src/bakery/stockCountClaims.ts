// src/bakery/stockCountClaims.ts
// FEATURE (2026-08-28): SNB Stock Count split across 2 people on 2 devices.
// Kept as its own small module rather than folded into branchOpsStore.ts —
// that store is already enormous, and this feature is a self-contained set
// of thin RPC wrappers with no need for centralized Zustand state (claims
// and draft lines are read directly per-component, not shared app-wide).
// Same pattern as storeStockStore.ts/recipeStore.ts existing as their own
// focused stores alongside the bigger ones.
import { supabase } from '@/lib/supabase';
import { makeSingletonSubscriber } from '@/lib/realtimeChannel';

export type StockGroup = 'stock_1' | 'stock_2';

export interface StockCountGroupClaim {
  id: string;
  branch: string;
  business_date: string;
  stock_group: StockGroup;
  status: 'in_progress' | 'done';
  claimed_by: string;
  claimed_at: string;
  last_activity_at: string;
  done_at: string | null;
  released_at: string | null;
}

export interface StockCountDraftLine {
  item_name: string;
  unit: string;
  system_qty: number;
  physical_qty: number | null;
  counted: boolean;
  updated_at: string;
}

export interface ClaimResult {
  ok: boolean;
  reason?: 'in_progress' | 'done';
  claimedBy?: string;
  claim?: StockCountGroupClaim;
}

export interface DoneResult {
  ok: boolean;
  counted?: number;
  total?: number;
}

// Kolkata business date — same boundary convention used everywhere else in
// this app for "today" (bakery orders, closures, reports).
export function stockCountBusinessDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

// item name -> assigned stock group. Fetched directly against branch_items
// rather than extending branchCatalogStore's shared type/select — this data
// is only needed by this one feature, and branchCatalogStore is used broadly
// across item management/ordering for both branches.
export async function fetchStockCountGroupAssignment(branch: string): Promise<Map<string, StockGroup>> {
  const { data, error } = await supabase
    .from('branch_items')
    .select('name, stock_count_group')
    .eq('branch', branch)
    .eq('active', true);
  if (error) throw new Error(error.message || 'Could not load stock group assignment.');
  const map = new Map<string, StockGroup>();
  for (const row of data ?? []) {
    const group = row.stock_count_group as StockGroup | null;
    if (group) map.set(String(row.name), group);
  }
  return map;
}

export async function claimStockCountGroup(
  branch: string,
  businessDate: string,
  stockGroup: StockGroup,
  claimedBy: string,
): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc('claim_stock_count_group', {
    p_branch: branch,
    p_business_date: businessDate,
    p_stock_group: stockGroup,
    p_claimed_by: claimedBy,
  });
  if (error) throw new Error(error.message || 'Could not claim this stock group.');
  return data as ClaimResult;
}

export async function upsertStockCountLine(
  branch: string,
  businessDate: string,
  stockGroup: StockGroup,
  itemName: string,
  unit: string,
  systemQty: number,
  physicalQty: number,
  updatedBy: string,
): Promise<void> {
  const { error } = await supabase.rpc('upsert_stock_count_line', {
    p_branch: branch,
    p_business_date: businessDate,
    p_stock_group: stockGroup,
    p_item_name: itemName,
    p_unit: unit,
    p_system_qty: systemQty,
    p_physical_qty: physicalQty,
    p_updated_by: updatedBy,
  });
  if (error) throw new Error(error.message || 'Could not save this count — please try again.');
}

// Deletes the persisted line — matches PhysicalStockCalculator's "Reset"
// (undoes a count entirely, back to "Uncounted"), so a refresh right after
// resetting doesn't silently re-load the stale counted value.
export async function resetStockCountLine(
  branch: string,
  businessDate: string,
  stockGroup: StockGroup,
  itemName: string,
  requestedBy: string,
): Promise<void> {
  const { error } = await supabase.rpc('reset_stock_count_line', {
    p_branch: branch,
    p_business_date: businessDate,
    p_stock_group: stockGroup,
    p_item_name: itemName,
    p_requested_by: requestedBy,
  });
  if (error) throw new Error(error.message || 'Could not reset this item — please try again.');
}

export async function markStockCountGroupDone(
  branch: string,
  businessDate: string,
  stockGroup: StockGroup,
  totalItems: number,
  markedBy: string,
): Promise<DoneResult> {
  const { data, error } = await supabase.rpc('mark_stock_count_group_done', {
    p_branch: branch,
    p_business_date: businessDate,
    p_stock_group: stockGroup,
    p_total_items: totalItems,
    p_marked_by: markedBy,
  });
  if (error) throw new Error(error.message || 'Could not mark this stock group done.');
  return data as DoneResult;
}

export async function releaseStockCountClaim(
  branch: string,
  businessDate: string,
  stockGroup: StockGroup,
  releasedBy: string,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc('release_stock_count_claim', {
    p_branch: branch,
    p_business_date: businessDate,
    p_stock_group: stockGroup,
    p_released_by: releasedBy,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message || 'Could not release this stock group.');
}

export async function clearStockCountSession(branch: string, businessDate: string): Promise<void> {
  const { error } = await supabase.rpc('clear_stock_count_session', {
    p_branch: branch,
    p_business_date: businessDate,
  });
  if (error) throw new Error(error.message || 'Stock count was saved, but the session could not be cleared — it will show as already-done next time.');
}

export async function fetchStockCountClaims(branch: string, businessDate: string): Promise<StockCountGroupClaim[]> {
  const { data, error } = await supabase
    .from('stock_count_group_claims')
    .select('id, branch, business_date, stock_group, status, claimed_by, claimed_at, last_activity_at, done_at, released_at')
    .eq('branch', branch)
    .eq('business_date', businessDate)
    .is('released_at', null);
  if (error) throw new Error(error.message || 'Could not load stock count status.');
  return (data ?? []) as StockCountGroupClaim[];
}

export async function fetchStockCountDraftLines(
  branch: string,
  businessDate: string,
  stockGroup: StockGroup,
): Promise<StockCountDraftLine[]> {
  const { data, error } = await supabase
    .from('stock_count_draft_lines')
    .select('item_name, unit, system_qty, physical_qty, counted, updated_at')
    .eq('branch', branch)
    .eq('business_date', businessDate)
    .eq('stock_group', stockGroup);
  if (error) throw new Error(error.message || 'Could not load saved counts.');
  return (data ?? []) as StockCountDraftLine[];
}

// Realtime — any change to today's claims for this branch triggers the
// callback so both counters' screens see each other's progress live.
// makeSingletonSubscriber avoids the "already subscribed" crash if both the
// chooser screen and the in-progress screen mount a subscription at once.
export const subscribeStockCountClaims = makeSingletonSubscriber(
  'stock-count-claims-live',
  (channel) =>
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'stock_count_group_claims' },
      () => {
        window.dispatchEvent(new CustomEvent('stock-count-claims-changed'));
      },
    ),
);
