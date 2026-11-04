import type {CashierPayment} from './cashierSalesReport';
import { supabase } from './supabase';
import { fetchVerifiedAdminRows } from './adminReportPaging';
import { fetchAdminRows } from './adminReportData';
import { reportBounds } from '@/branch/reports/reportSources';
import type { BranchBillRecord, ReturnRecord } from '@/branch/branchOpsStore';

export async function loadSnbCanonicalHistory(from: string, to: string, includeCashierPayments = false) {
  const bounds = reportBounds(from, to);
  const headers = await fetchVerifiedAdminRows('branch_headers', bounds.from, bounds.until, { branch: 'SNB' });
  if (headers.error) throw new Error(headers.error.message);
  const items = new Map<string, any[]>();
  const payments = new Map<string, Record<string, number>>();
  const ids = headers.data.map(h => String(h.id));
  for (let start = 0; start < ids.length; start += 200) {
    const billIds = ids.slice(start, start + 200);
    const lines = await fetchVerifiedAdminRows('branch_items', bounds.from, bounds.until, { billIds });
    if (lines.error) throw new Error(lines.error.message);
    lines.data.forEach(i => {
      const list = items.get(i.bill_id) || [];
      list.push({ id: i.id, itemName: i.item_name, quantity: Number(i.quantity), unit: i.unit,
        price: Number(i.unit_price), discount: Number(i.discount || 0), tax: Number(i.tax || 0), lineTotal: Number(i.line_total) });
      items.set(i.bill_id, list);
    });
    const paid = await fetchAdminRows<any>(() => supabase.from('branch_sale_payments')
      .select('id,bill_id,payment_mode,amount').in('bill_id', billIds)
      .in('payment_purpose', ['bill_collection','credit_upfront','credit_settlement','advance_balance']));
    if (paid.error) throw new Error(paid.error.message);
    paid.data.forEach(p => {
      const row = payments.get(p.bill_id) || {};
      row[p.payment_mode] = (row[p.payment_mode] || 0) + Number(p.amount);
      payments.set(p.bill_id, row);
    });
  }
  const refunds = await fetchAdminRows<any>(() => supabase.from('branch_return_records').select('*')
    .eq('branch', 'SNB').gte('created_at', bounds.from).lt('created_at', bounds.until));
  if (refunds.error) throw new Error(refunds.error.message);
  const cashierPayments = includeCashierPayments
    ? await fetchVerifiedAdminRows<CashierPayment>('snb_cashier_payments', bounds.from, bounds.until, {branch: 'SNB'})
    : {data: [] as CashierPayment[], error: null};
  if (cashierPayments.error) throw new Error(cashierPayments.error.message);
  if (includeCashierPayments) {
    // A bill created while its items/payments were loading must not leave a
    // receipt in the cashier summary without its matching sales invoice.
    const checked = await supabase.rpc('admin_sales_report_page_v1', {
      p_source: 'branch_headers', p_from: bounds.from, p_until: bounds.until,
      p_branch: 'SNB', p_verify: true,
    });
    if (checked.error) throw new Error(checked.error.message);
    const expectedTotal = headers.data.reduce((sum, h) => sum + Number(h.total || 0), 0);
    if (!checked.data || Number(checked.data.count) !== headers.data.length ||
        !Number.isFinite(Number(checked.data.total)) || Math.abs(Number(checked.data.total) - expectedTotal) > 0.005) {
      throw new Error('Sales changed while cashier details were loading. Reload before exporting.');
    }
  }
  return {
    cashierPayments: cashierPayments.data,
    operationBills: headers.data.filter(h => h.bill_type !== 'return' && !/returned|cancelled|void|deleted/i.test(h.status)).map(h => {
      const paid = payments.get(h.id) || {};
      const modes = Object.keys(paid).filter(k => paid[k] > 0);
      if (!(items.get(h.id) || []).length && Number(h.total) !== 0) throw new Error(`Missing item breakdown for ${h.bill_no}. Reconcile before exporting.`);
      return { id: h.id, sourceBillId: h.id, branch: 'SNB', billNo: h.bill_no, invoiceNo: Number(h.invoice_no),
        subtotal: Number(h.subtotal), discount: Number(h.discount), tax: Number(h.tax), roundOff: Number(h.round_off),
        total: Number(h.total), tendered: Number(h.tendered), balance: Number(h.balance),
        paymentMode: h.bill_type === 'credit' ? 'credit' : modes.length === 1 ? modes[0] : 'split', split: paid,
        salesperson: h.salesperson, biller: h.cashier_username || h.biller, cashierUserId: h.cashier_user_id, counterSessionId: h.counter_session_id, source: h.bill_type === 'advance_final' ? 'advance-final' : 'counter', createdAt: h.created_at, status: h.status,
        items: items.get(h.id) || [] } as BranchBillRecord;
    }),
    operationReturns: refunds.data.map(r => ({ id: r.id, branch: 'SNB', returnNo: r.return_no,
      originalBillNo: r.bill_no, items: r.items || [], total: Number(r.amount), refundAmount:r.refund_amount==null?(r.payment_mode==='credit_adjustment'?0:Number(r.amount)):Number(r.refund_amount),creditAdjusted:r.credit_adjusted==null?undefined:Number(r.credit_adjusted),
      returnedBy: r.cashier_username || r.returned_by, cashierUserId: r.cashier_user_id, counterSessionId: r.counter_session_id, returnPayMode: r.payment_mode, reason: r.reason, createdAt: r.created_at } as ReturnRecord)),
  };
}
