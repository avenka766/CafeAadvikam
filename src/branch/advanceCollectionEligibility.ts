import type { BranchAdvanceOrder } from './branchStore';

// Closing an order elsewhere is not evidence that its remaining balance was cash.
// Preserve recorded payment fields; only remove the stale collection action.
export function advanceCollectionBlocked(order: BranchAdvanceOrder): boolean {
  return order.status !== 'pending' || Boolean(order.finalizedInMain || order.cancelledInMain);
}

export function advanceDisplayStatus(order: BranchAdvanceOrder): BranchAdvanceOrder['status'] {
  if (order.cancelledInMain) return 'cancelled';
  if (order.finalizedInMain) return 'completed';
  return order.status;
}
