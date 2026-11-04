import type {Branch} from './types';
import type {BranchBillRecord} from './branchOpsStore';
import {supabase} from '@/lib/supabase';
const num = (value: unknown) => Number(value) || 0;
const roundMoney = (value: number) => Math.round(value * 100) / 100;

export type LedgerBillRow = {
  id: string;
  bill_no: string;
  invoice_no: number;
  bill_type: string;
  customer_name: string | null;
  customer_phone: string | null;
  salesperson: string | null;
  biller: string | null;
  subtotal: number | string;
  discount: number | string;
  discount_percent?: number | string | null;
  tax: number | string;
  round_off?: number | string | null;
  total: number | string;
  tendered: number | string;
  balance: number | string;
  status: string;
  created_at: string;
  wallet_id?: string | null;
  wallet_amount?: number | string | null;
  promotion_discount?: number | string | null;
  promotion_ids?: string[] | null;
  wallet_cashback?: number | string | null;
  branch_bill_items?: Array<{
    item_name: string;
    quantity: number | string;
    unit: 'pcs' | 'kg';
    unit_price: number | string;
    discount: number | string | null;
    tax: number | string | null;
    line_total: number | string;
  }>;
  branch_sale_payments?: Array<{
    payment_mode: 'cash' | 'upi' | 'card' | 'bank' | 'mixed' | 'wallet';
    amount: number | string;
  }>;
};

// Shared by BranchBillHistoryProTab's initial load AND its reprint() action -
// factored out so a duplicate-print can re-fetch and re-map a single fresh
// row (picking up any Payment Mode Edit / credit conversion made after the
// tab first loaded) instead of reusing the stale snapshot from mount time.
export function mapLedgerBillRow(row: LedgerBillRow, branch: Branch): BranchBillRecord {
  const items = (row.branch_bill_items || []).map((item) => ({
    itemName: item.item_name,
    quantity: num(item.quantity),
    unit: item.unit,
    price: num(item.unit_price),
    discount: num(item.discount),
    tax: num(item.tax),
    lineTotal: num(item.line_total),
  }));
  const payments = row.branch_sale_payments || [];
  const splitTotals = payments.reduce<Record<string, number>>((acc, payment) => {
    acc[payment.payment_mode] = (acc[payment.payment_mode] || 0) + num(payment.amount);
    return acc;
  }, {});
  if (num(row.wallet_amount) > 0 && !splitTotals.wallet) splitTotals.wallet = num(row.wallet_amount);
  const modes = Object.keys(splitTotals).filter((mode) => splitTotals[mode] > 0);
  const paymentMode = row.bill_type === 'credit'
    ? 'credit'
    : modes.length > 1
      ? 'split'
      : ((modes[0] || 'cash') as BranchBillRecord['paymentMode']);
  const split = {
    cash: splitTotals.cash || 0,
    upi: splitTotals.upi || 0,
    card: splitTotals.card || 0,
    wallet: splitTotals.wallet || 0,
  };

  return {
    id: row.id,
    branch,
    billNo: row.bill_no,
    invoiceNo: num(row.invoice_no),
    items,
    subtotal: num(row.subtotal),
    discount: num(row.discount),
    discountPercent: row.discount_percent == null ? undefined : num(row.discount_percent),
    tax: num(row.tax),
    roundOff: row.round_off == null ? undefined : num(row.round_off),
    amountBeforeRoundOff: roundMoney(num(row.total) - num(row.round_off)),
    total: num(row.total),
    tendered: num(row.tendered),
    balance: num(row.balance),
    paymentMode,
    creditCustomerName: row.customer_name || undefined,
    creditCustomerMobile: row.customer_phone || undefined,
    split: paymentMode === 'split' || row.bill_type === 'credit' ? split : undefined,
    walletId: row.wallet_id || undefined,
    promotionDiscount: num(row.promotion_discount),
    promotionIds: row.promotion_ids || [],
    walletCashback: num(row.wallet_cashback),
    salesperson: row.salesperson || 'Staff',
    biller: row.biller || 'Staff',
    createdAt: row.created_at,
    printCount: row.status === 'duplicate_printed' ? 2 : 1,
    status: row.status === 'duplicate_printed' ? 'Duplicate Bill' : row.status === 'returned' ? 'Returned' : 'Original Bill',
    source: row.bill_type === 'advance_final' ? 'advance-final' : 'counter',
  } as BranchBillRecord;
}


export const LEDGER_BILL_SELECT = 'id, bill_no, invoice_no, bill_type, customer_name, customer_phone, salesperson, biller, subtotal, discount, discount_percent, tax, round_off, total, tendered, balance, status, created_at, wallet_id, wallet_amount, promotion_discount, promotion_ids, wallet_cashback, branch_bill_items(item_name, quantity, unit, unit_price, discount, tax, line_total), branch_sale_payments(payment_mode, amount)';

export async function findLedgerBillForReprint(branch: Branch, input: string): Promise<BranchBillRecord | null> {
  const value = input.trim().toUpperCase();
  const suffix = value.startsWith(`${branch.toUpperCase()}-`) ? value.slice(branch.length + 1) : value;
  if (!/^\d+$/.test(suffix) || !Number.isSafeInteger(Number(suffix)) || Number(suffix) <= 0) {
    throw new Error(`Enter a ${branch} bill number, for example ${branch}-43874.`);
  }
  const billNo = `${branch.toUpperCase()}-${Number(suffix)}`;
  // Main-ledger identity is authoritative. Secondary operation snapshots may repeat.
  const {data, error} = await supabase.from('branch_bill_headers').select(LEDGER_BILL_SELECT)
    .eq('branch', branch).eq('bill_no', billNo).limit(2);
  if (error) throw new Error(error.message);
  if (!data?.length) return null;
  if (data.length !== 1) throw new Error(`More than one main-ledger bill matches ${billNo}. Reconcile before printing.`);
  return mapLedgerBillRow(data[0] as LedgerBillRow, branch);
}
