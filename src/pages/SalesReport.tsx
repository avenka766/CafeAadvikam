import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { formatCurrency } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  TrendingUp, ShoppingBag, IndianRupee,
  Download, CalendarDays, QrCode, UserCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PaymentType } from '@/types';

const PAYMENT_LABELS: Record<PaymentType, string> = {
  cash: 'Cash', upi: 'UPI', card: 'Card', part_payment: 'Split Payment', unpaid: 'Unpaid', advance: 'Advance', credit: 'Credit',
};
const PIE_COLORS = ['#2D7D6F', '#C5973E', '#5BA3C9', '#E07B5B', '#999'];
const SOURCE_COLORS = ['#3B82F6', '#8B5CF6'];

function getDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function toInputDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function SalesReport() {
  const { orders, startPolling, stopPolling } = useOrderStore();

  const [startDate, setStartDate] = useState<string>(toInputDate(new Date()));
  const [endDate, setEndDate] = useState<string>(toInputDate(new Date()));
  const [filterMode, setFilterMode] = useState<'today' | 'custom'>('today');
  // U-05 FIX: flag when the user has set an invalid range so we can show inline error
  const dateRangeInvalid = filterMode === 'custom' && startDate > endDate;

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    // Auto-swap if end is now before start
    if (val > endDate) setEndDate(val);
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    // Auto-swap if start is now after end
    if (val < startDate) setStartDate(val);
  };

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const filteredOrders = useMemo(() => {
    if (filterMode === 'today') {
      const today = getDateStr(new Date());
      return orders.filter((o) => getDateStr(new Date(o.createdAt)) === today);
    }
    return orders.filter((o) => {
      const d = getDateStr(new Date(o.createdAt));
      return d >= startDate && d <= endDate;
    });
  }, [orders, filterMode, startDate, endDate]);

  // BUG-C1 FIX: Build the set of balance-collection order IDs so they are excluded from
  // dayOrders. When collectBalance() runs it inserts a new "balance order" row with
  // status='served' and paymentType=cash/upi/card — indistinguishable from a normal order
  // unless we cross-reference the balanceOrderId pointer on the original advance order.
  // DailyClosure.tsx already does this correctly; now SalesReport matches that logic.
  const balanceOrderIds = useMemo(() => new Set(
    filteredOrders
      .filter(o => o.paymentType === 'advance' && o.balanceOrderId)
      .map(o => o.balanceOrderId as string)
  ), [filteredOrders]);

  const dayOrders = useMemo(() =>
    filteredOrders.filter((o) =>
      o.status === 'served' &&
      o.paymentType !== 'advance' &&
      !balanceOrderIds.has(o.id)
    ),
    [filteredOrders, balanceOrderIds]
  );
  const cancelledOrders = useMemo(() => filteredOrders.filter((o) => o.status === 'cancelled'), [filteredOrders]);
  // Advance orders in the period — used for the Advance sheet in Excel
  const advanceOrders = useMemo(() =>
    filteredOrders.filter((o) => o.paymentType === 'advance'),
    [filteredOrders]
  );

  const totalRevenue = dayOrders.reduce((s, o) => s + o.total, 0);
  // BUG-M1 FIX: separate "gross billed" (includes credit) from "cash collected" (cash+upi+card only).
  // The headline shows totalRevenue but cashCollected is available for reconciliation.
  const cashCollected = dayOrders.reduce((s, o) => {
    if (o.paymentType === 'credit' || o.paymentType === 'unpaid') return s;
    return s + o.total;
  }, 0);
  const orderCount = dayOrders.length;
  const avgOrderValue = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0;
  const totalDiscount = dayOrders.reduce((s, o) => s + o.discount, 0);

  // --- Source breakdown ---
  const staffOrders = useMemo(() => dayOrders.filter(o => o.orderSource === 'staff'), [dayOrders]);
  const qrOrders = useMemo(() => dayOrders.filter(o => o.orderSource === 'qr'), [dayOrders]);
  const staffRevenue = staffOrders.reduce((s, o) => s + o.total, 0);
  const qrRevenue = qrOrders.reduce((s, o) => s + o.total, 0);

  const sourceChartData = useMemo(() => {
    const data = [];
    if (staffOrders.length > 0) data.push({ name: 'Staff', orders: staffOrders.length, revenue: staffRevenue });
    if (qrOrders.length > 0) data.push({ name: 'QR', orders: qrOrders.length, revenue: qrRevenue });
    return data;
  }, [staffOrders, qrOrders, staffRevenue, qrRevenue]);

  // Peak QR ordering hours
  const qrHourlyData = useMemo(() => {
    const hours: Record<number, number> = {};
    for (let h = 6; h <= 22; h++) hours[h] = 0;
    qrOrders.forEach((o) => {
      const h = new Date(o.createdAt).getHours();
      if (hours[h] !== undefined) hours[h] += 1;
    });
    return Object.entries(hours).map(([h, count]) => ({
      hour: `${Number(h) > 12 ? Number(h) - 12 : h}${Number(h) >= 12 ? 'PM' : 'AM'}`,
      orders: count,
    }));
  }, [qrOrders]);

  // Top QR items
  const topQrItems = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    qrOrders.forEach((o) =>
      o.items.forEach((ci) => {
        const ex = map.get(ci.menuItem.id);
        if (ex) { ex.qty += ci.quantity; ex.revenue += ci.menuItem.price * ci.quantity; }
        else { map.set(ci.menuItem.id, { name: ci.menuItem.name, qty: ci.quantity, revenue: ci.menuItem.price * ci.quantity }); }
      })
    );
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [qrOrders]);

  const itemSales = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    dayOrders.forEach((o) =>
      o.items.forEach((ci) => {
        const ex = map.get(ci.menuItem.id);
        if (ex) { ex.qty += ci.quantity; ex.revenue += ci.menuItem.price * ci.quantity; }
        else { map.set(ci.menuItem.id, { name: ci.menuItem.name, qty: ci.quantity, revenue: ci.menuItem.price * ci.quantity }); }
      })
    );
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [dayOrders]);

  const hourlyData = useMemo(() => {
    const hours: Record<number, { orders: number; revenue: number }> = {};
    for (let h = 6; h <= 22; h++) hours[h] = { orders: 0, revenue: 0 };
    dayOrders.forEach((o) => {
      const h = new Date(o.createdAt).getHours();
      if (hours[h]) { hours[h].orders += 1; hours[h].revenue += o.total; }
    });
    return Object.entries(hours).map(([h, v]) => ({
      hour: `${Number(h) > 12 ? Number(h) - 12 : h}${Number(h) >= 12 ? 'PM' : 'AM'}`,
      orders: v.orders, revenue: v.revenue,
    }));
  }, [dayOrders]);

  const paymentBreakdown = useMemo(() => {
    let cash = 0, upi = 0, card = 0, credit = 0;
    dayOrders.forEach((o) => {
      if (o.paymentType === 'cash') cash += o.total;
      else if (o.paymentType === 'upi') upi += o.total;
      else if (o.paymentType === 'card') card += o.total;
      else if (o.paymentType === 'credit') credit += o.total;
      else if (o.paymentType === 'part_payment' && o.paymentBreakdown) {
        cash += o.paymentBreakdown.cash; upi += o.paymentBreakdown.upi; card += o.paymentBreakdown.card;
      }
    });
    const result = [];
    if (cash > 0) result.push({ name: 'Cash', value: cash });
    if (upi > 0) result.push({ name: 'UPI', value: upi });
    if (card > 0) result.push({ name: 'Card', value: card });
    if (credit > 0) result.push({ name: 'Credit', value: credit });
    return result;
  }, [dayOrders]);

  const dineInCount = dayOrders.filter((o) => o.orderType === 'dine_in').length;
  const takeawayCount = dayOrders.filter((o) => o.orderType === 'takeaway').length;

  const handleExportExcel = async () => {
    const XLSX = await import('@/lib/safeSpreadsheet');

    const dateLabel = filterMode === 'today'
      ? new Date().toLocaleDateString('en-IN').replace(/\//g, '-')
      : `${startDate}_to_${endDate}`;

    // ── Sheet 1: Sales Report (all served orders) ─────────────────────────────
    const mainRows = dayOrders.map((o, i) => {
      const gstBase = Math.round((o.total / 1.05) * 100) / 100;
      const gst5    = Math.round((o.total - gstBase) * 100) / 100;
      const cashAmt = o.paymentType === 'cash'  ? o.total : o.paymentType === 'part_payment' ? (o.paymentBreakdown?.cash || 0) : 0;
      const upiAmt  = o.paymentType === 'upi'   ? o.total : o.paymentType === 'part_payment' ? (o.paymentBreakdown?.upi  || 0) : 0;
      const cardAmt = o.paymentType === 'card'  ? o.total : o.paymentType === 'part_payment' ? (o.paymentBreakdown?.card || 0) : 0;
      return {
        'S.No':             i + 1,
        'Order ID':         `#${String(o.orderNumber).padStart(3, '0')}`,
        'Source':           o.orderSource === 'qr' ? 'QR' : 'Staff',
        'Date':             new Date(o.createdAt).toLocaleDateString('en-IN'),
        'Time':             new Date(o.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        'Order Type':       o.orderType === 'dine_in' ? 'Dine In' : 'Takeaway',
        'Table No':         o.tableNumber || '-',
        'Customer':         o.customerName || '-',
        'Items Ordered':    o.items.map(ci => ci.menuItem.name).join(', '),
        'Total Qty':        o.items.reduce((s, ci) => s + ci.quantity, 0),
        'Item-wise Breakup': o.items.map(ci => `${ci.menuItem.name} x${ci.quantity} = ₹${ci.menuItem.price * ci.quantity}`).join(' | '),
        'Subtotal (₹)':     o.subtotal,
        'Discount (₹)':     o.discount,
        'Total Amount (₹)': o.total,
        'Taxable Amt (₹)':  gstBase,
        'GST 5% (₹)':      gst5,
        'CGST 2.5% (₹)':   Math.round((gst5 / 2) * 100) / 100,
        'SGST 2.5% (₹)':   Math.round((gst5 / 2) * 100) / 100,
        'Payment Type':     PAYMENT_LABELS[o.paymentType || 'unpaid'],
        'Cash (₹)':         cashAmt || '-',
        'UPI (₹)':          upiAmt  || '-',
        'Card (₹)':         cardAmt || '-',
        'Biller':           o.billedBy || '-',
      };
    });

    // ── Sheet 2: Cancelled Orders ─────────────────────────────────────────────
    const cancelRows = cancelledOrders.map((o, i) => {
      const gstBase = Math.round((o.total / 1.05) * 100) / 100;
      const gst5    = Math.round((o.total - gstBase) * 100) / 100;
      return {
        'S.No':             i + 1,
        'Order ID':         `#${String(o.orderNumber).padStart(3, '0')}`,
        'Source':           o.orderSource === 'qr' ? 'QR' : 'Staff',
        'Date':             new Date(o.createdAt).toLocaleDateString('en-IN'),
        'Time':             new Date(o.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        'Order Type':       o.orderType === 'dine_in' ? 'Dine In' : 'Takeaway',
        'Table No':         o.tableNumber || '-',
        'Customer':         o.customerName || '-',
        'Items':            o.items.map(ci => `${ci.menuItem.name} x${ci.quantity}`).join(', '),
        'Total Amount (₹)': o.total,
        'Taxable Amt (₹)':  gstBase,
        'GST 5% (₹)':      gst5,
        'CGST 2.5% (₹)':   Math.round((gst5 / 2) * 100) / 100,
        'SGST 2.5% (₹)':   Math.round((gst5 / 2) * 100) / 100,
        'Cancel Reason':    o.cancelReason || '-',
        'Biller':           o.billedBy || '-',
      };
    });

    // ── Sheet 3: CGST ─────────────────────────────────────────────────────────
    const cgstRows = dayOrders.map((o, i) => {
      const gstBase = Math.round((o.total / 1.05) * 100) / 100;
      return {
        'S.No':             i + 1,
        'Order ID':         `#${String(o.orderNumber).padStart(3, '0')}`,
        'Date':             new Date(o.createdAt).toLocaleDateString('en-IN'),
        'Total Amount (₹)': o.total,
        'Taxable Amt (₹)':  gstBase,
        'CGST 2.5% (₹)':   Math.round(((o.total - gstBase) / 2) * 100) / 100,
        'Biller':           o.billedBy || '-',
      };
    });

    // ── Sheet 4: SGST ─────────────────────────────────────────────────────────
    const sgstRows = dayOrders.map((o, i) => {
      const gstBase = Math.round((o.total / 1.05) * 100) / 100;
      return {
        'S.No':             i + 1,
        'Order ID':         `#${String(o.orderNumber).padStart(3, '0')}`,
        'Date':             new Date(o.createdAt).toLocaleDateString('en-IN'),
        'Total Amount (₹)': o.total,
        'Taxable Amt (₹)':  gstBase,
        'SGST 2.5% (₹)':   Math.round(((o.total - gstBase) / 2) * 100) / 100,
        'Biller':           o.billedBy || '-',
      };
    });

    // ── Sheet 5: GST Summary ──────────────────────────────────────────────────
    const taxableTotal  = Math.round((totalRevenue / 1.05) * 100) / 100;
    const gstCollected  = Math.round((totalRevenue - taxableTotal) * 100) / 100;
    const cgstTotal     = Math.round((gstCollected / 2) * 100) / 100;
    const sgstTotal     = cgstTotal;

    // GST by order rows
    const gstSummaryRows = [
      { 'Metric': 'Period', 'Value': filterMode === 'today' ? formatDisplayDate(new Date()) : `${startDate} to ${endDate}` },
      { 'Metric': 'Total Orders (Served)', 'Value': orderCount },
      { 'Metric': '', 'Value': '' },
      { 'Metric': 'Total Revenue (incl. GST)', 'Value': totalRevenue },
      { 'Metric': 'Taxable Amount', 'Value': taxableTotal },
      { 'Metric': 'Total GST @ 5%', 'Value': gstCollected },
      { 'Metric': 'CGST @ 2.5%', 'Value': cgstTotal },
      { 'Metric': 'SGST @ 2.5%', 'Value': sgstTotal },
    ];

    // ── Sheet 6: Payment Breakdown ────────────────────────────────────────────
    let totalCash = 0, totalUpi = 0, totalCard = 0, totalCredit = 0;
    dayOrders.forEach(o => {
      if (o.paymentType === 'cash') totalCash += o.total;
      else if (o.paymentType === 'upi') totalUpi += o.total;
      else if (o.paymentType === 'card') totalCard += o.total;
      else if (o.paymentType === 'credit') totalCredit += o.total;
      else if (o.paymentType === 'part_payment' && o.paymentBreakdown) {
        totalCash += o.paymentBreakdown.cash; totalUpi += o.paymentBreakdown.upi; totalCard += o.paymentBreakdown.card;
      }
    });
    const paymentRows = [
      { 'Payment Method': 'Cash',   'Orders': dayOrders.filter(o => o.paymentType === 'cash' || (o.paymentType === 'part_payment' && (o.paymentBreakdown?.cash || 0) > 0)).length, 'Amount (₹)': totalCash },
      { 'Payment Method': 'UPI',    'Orders': dayOrders.filter(o => o.paymentType === 'upi'  || (o.paymentType === 'part_payment' && (o.paymentBreakdown?.upi  || 0) > 0)).length, 'Amount (₹)': totalUpi  },
      { 'Payment Method': 'Card',   'Orders': dayOrders.filter(o => o.paymentType === 'card' || (o.paymentType === 'part_payment' && (o.paymentBreakdown?.card || 0) > 0)).length, 'Amount (₹)': totalCard },
      { 'Payment Method': 'Credit', 'Orders': dayOrders.filter(o => o.paymentType === 'credit').length, 'Amount (₹)': totalCredit },
      { 'Payment Method': 'TOTAL',  'Orders': orderCount, 'Amount (₹)': totalRevenue },
    ];

    // ── Sheet 7: Top Items ────────────────────────────────────────────────────
    const topItemsRows = itemSales.map((item, i) => ({
      'Rank':        i + 1,
      'Item Name':   item.name,
      'Qty Sold':    item.qty,
      'Revenue (₹)': item.revenue,
    }));

    // ── Sheet 8: Daily Closing ────────────────────────────────────────────────
    const closingRows = [
      { 'Metric': 'Period', 'Value': filterMode === 'today' ? formatDisplayDate(new Date()) : `${startDate} to ${endDate}` },
      { 'Metric': 'Total Orders (Served)', 'Value': orderCount },
      { 'Metric': 'Cancelled Orders', 'Value': cancelledOrders.length },
      { 'Metric': 'Total Revenue (₹)', 'Value': totalRevenue },
      { 'Metric': 'Taxable Amount (₹)', 'Value': taxableTotal },
      { 'Metric': 'GST Collected 5% (₹)', 'Value': gstCollected },
      { 'Metric': 'CGST 2.5% (₹)', 'Value': cgstTotal },
      { 'Metric': 'SGST 2.5% (₹)', 'Value': sgstTotal },
      { 'Metric': 'Total Discounts (₹)', 'Value': totalDiscount },
      { 'Metric': 'Avg Order Value (₹)', 'Value': avgOrderValue },
      { 'Metric': '', 'Value': '' },
      { 'Metric': 'SOURCE BREAKDOWN', 'Value': '' },
      { 'Metric': 'Staff Orders', 'Value': staffOrders.length },
      { 'Metric': 'Staff Revenue (₹)', 'Value': staffRevenue },
      { 'Metric': 'QR Orders', 'Value': qrOrders.length },
      { 'Metric': 'QR Revenue (₹)', 'Value': qrRevenue },
      { 'Metric': '', 'Value': '' },
      { 'Metric': 'PAYMENT BREAKDOWN', 'Value': '' },
      { 'Metric': 'Cash (₹)', 'Value': totalCash },
      { 'Metric': 'UPI (₹)', 'Value': totalUpi },
      { 'Metric': 'Card (₹)', 'Value': totalCard },
      { 'Metric': '', 'Value': '' },
      { 'Metric': 'ORDER TYPE', 'Value': '' },
      { 'Metric': 'Dine In', 'Value': dineInCount },
      { 'Metric': 'Takeaway', 'Value': takeawayCount },
      { 'Metric': '', 'Value': '' },
      { 'Metric': 'CANCELLATIONS', 'Value': '' },
      { 'Metric': 'Cancelled Orders', 'Value': cancelledOrders.length },
      { 'Metric': 'Lost Revenue (₹)', 'Value': cancelledOrders.reduce((s, o) => s + o.total, 0) },
    ];

    // ── Build workbook ────────────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();

    const autoWidth = (ws: ReturnType<typeof XLSX.utils.json_to_sheet>, data: Record<string, unknown>[]) => {
      if (!data.length) return;
      const keys = Object.keys(data[0]);
      ws['!cols'] = keys.map(k => ({ wch: Math.max(k.length, ...data.map(r => String(r[k] ?? '').length)) + 2 }));
    };

    const addSheet = (data: Record<string, unknown>[], name: string, fallback: string) => {
      const rows = data.length > 0 ? data : [{ Note: fallback }];
      const ws = XLSX.utils.json_to_sheet(rows);
      if (data.length > 0) autoWidth(ws, data);
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    // ── Sheet 2: Advance Orders ───────────────────────────────────────────────
    const advanceTotalPaid    = advanceOrders.reduce((s, o) => s + (o.advanceAmount ?? o.total), 0);
    const advanceTotalBalance = advanceOrders.reduce((s, o) => s + (o.balanceDue ?? 0), 0);
    const advancePending      = advanceOrders.filter(o => (o.balanceDue ?? 0) > 0).length;
    const advanceClosed       = advanceOrders.filter(o => (o.balanceDue ?? 0) === 0).length;

    const advanceRows = advanceOrders.map((o, i) => ({
      'S.No':                i + 1,
      'Order ID':            `#${String(o.orderNumber).padStart(3, '0')}`,
      'Order Date':          new Date(o.createdAt).toLocaleDateString('en-IN'),
      'Order Time':          new Date(o.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      'Delivery Date':       o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('en-IN') : '-',
      'Customer':            o.customerName || '-',
      'Items':               o.items.map(ci => `${ci.menuItem.name} x${ci.quantity}`).join(', '),
      'Full Bill (₹)':       o.fullAmount ?? o.subtotal,
      'Advance Paid (₹)':    o.advanceAmount ?? o.total,
      'Balance Due (₹)':     o.balanceDue ?? 0,
      'Advance Via':         o.advancePaidBy ? o.advancePaidBy.toUpperCase() : '-',
      'Status':              (o.balanceDue ?? 0) === 0 ? 'Fully Paid' : 'Balance Pending',
      'Balance Paid Via':    o.balancePaymentType ? o.balancePaymentType.toUpperCase() : '-',
      'Fully Paid At':       o.fullyPaidAt ? new Date(o.fullyPaidAt).toLocaleString('en-IN') : '-',
      'Biller':              o.billedBy || o.createdBy || '-',
    }));

    // Append advance summary to Daily Closing
    closingRows.push(
      { 'Metric': '', 'Value': '' },
      { 'Metric': 'ADVANCE ORDERS', 'Value': '' },
      { 'Metric': 'Total Advance Orders', 'Value': advanceOrders.length },
      { 'Metric': 'Pending Balance', 'Value': advancePending },
      { 'Metric': 'Fully Paid', 'Value': advanceClosed },
      { 'Metric': 'Total Advance Collected (₹)', 'Value': advanceTotalPaid },
      { 'Metric': 'Total Balance Outstanding (₹)', 'Value': advanceTotalBalance },
    );

    addSheet(mainRows,       'Sales Report',     'No served orders');
    addSheet(advanceRows,    'Advance Orders',   'No advance orders');
    addSheet(cancelRows,     'Cancelled Orders', 'No cancellations');
    addSheet(cgstRows,       'CGST 2.5%',        'No data');
    addSheet(sgstRows,       'SGST 2.5%',        'No data');
    addSheet(gstSummaryRows, 'GST Summary',      'No data');
    addSheet(paymentRows,    'Payment Breakdown', 'No data');
    addSheet(topItemsRows,   'Top Items',        'No items sold');
    addSheet(closingRows,    'Daily Closing',    'No data');

    XLSX.writeFile(wb, `CafeAadvikam_Report_${dateLabel}.xlsx`);
  };

  return (
    <div className="dashboard-screen min-h-screen bg-transparent pt-0 pb-6">

      {/* ── Page title ── */}
      <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
        <Download className="size-5 text-primary" />
        <h1 className="font-display text-2xl font-bold text-foreground">Sales Report</h1>
      </div>

      {/* ── Filter toolbar ── */}
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3 space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => { setFilterMode('today'); setStartDate(toInputDate(new Date())); setEndDate(toInputDate(new Date())); }}
            className={cn('flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all active:scale-95', filterMode === 'today' ? 'text-primary-foreground shadow-teal' : 'bg-card border border-border text-foreground')}
            style={filterMode === 'today' ? { background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' } : {}}
          >
            Today
          </button>
          <button
            onClick={() => setFilterMode('custom')}
            className={cn('flex-1 py-2.5 rounded-xl text-sm font-body font-semibold transition-all active:scale-95', filterMode === 'custom' ? 'text-primary-foreground shadow-teal' : 'bg-card border border-border text-foreground')}
            style={filterMode === 'custom' ? { background: 'linear-gradient(135deg,hsl(164 52% 28%),hsl(164 52% 20%))' } : {}}
          >
            Custom Range
          </button>
        </div>
        {filterMode === 'custom' && (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1 block">From</label>
              <input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} max={toInputDate(new Date())} className="w-full px-3 py-2.5 bg-card border border-border rounded-xl text-sm font-body" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-body font-bold text-muted-foreground uppercase tracking-widest mb-1 block">To</label>
              <input type="date" value={endDate} onChange={(e) => handleEndDateChange(e.target.value)} max={toInputDate(new Date())} className="w-full px-3 py-2.5 bg-card border border-border rounded-xl text-sm font-body" />
            </div>
          </div>
        )}
        {/* U-05 FIX: show inline error when date range is invalid */}
        {dateRangeInvalid && (
          <p className="text-xs font-body text-destructive flex items-center gap-1">
            ⚠ Start date must be before end date — dates have been swapped automatically.
          </p>
        )}
        <div className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5 text-primary" />
          <span className="text-xs font-body font-medium text-muted-foreground">
            {filterMode === 'today' ? formatDisplayDate(new Date()) : `${startDate} → ${endDate}`}
          </span>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <KPICard icon={<IndianRupee className="size-4" />} label="Total Revenue" value={formatCurrency(totalRevenue)} color="bg-primary/10 text-primary" sub={cashCollected < totalRevenue ? `Cash collected: ${formatCurrency(cashCollected)}` : undefined} />
          <KPICard icon={<ShoppingBag className="size-4" />} label="Orders" value={String(orderCount)} color="bg-accent/20 text-accent-foreground" />
          <KPICard icon={<TrendingUp className="size-4" />} label="Avg Order Value" value={formatCurrency(avgOrderValue)} color="bg-blue-50 text-blue-700" />
          <KPICard icon={<IndianRupee className="size-4" />} label="Discounts Given" value={formatCurrency(totalDiscount)} color="bg-red-50 text-red-600" />
        </div>

        {/* Order Type breakdown */}
        <div className="flex gap-3">
          <div className="flex-1 bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase">Dine In</p>
            <p className="font-display text-xl font-bold text-foreground">{dineInCount}</p>
          </div>
          <div className="flex-1 bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-[10px] font-body font-semibold text-muted-foreground uppercase">Takeaway</p>
            <p className="font-display text-xl font-bold text-foreground">{takeawayCount}</p>
          </div>
        </div>

        {/* === SOURCE BREAKDOWN === */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-lg font-bold text-foreground mb-3 flex items-center gap-2">
            📊 Order Source Breakdown
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <UserCheck className="size-3.5 text-blue-600" />
                <p className="text-[10px] font-body font-bold text-blue-700 uppercase">Staff Orders</p>
              </div>
              <p className="font-display text-xl font-bold text-blue-800">{staffOrders.length}</p>
              <p className="text-xs font-body text-blue-600 tabular-nums">{formatCurrency(staffRevenue)}</p>
            </div>
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <QrCode className="size-3.5 text-violet-600" />
                <p className="text-[10px] font-body font-bold text-violet-700 uppercase">QR Orders</p>
              </div>
              <p className="font-display text-xl font-bold text-violet-800">{qrOrders.length}</p>
              <p className="text-xs font-body text-violet-600 tabular-nums">{formatCurrency(qrRevenue)}</p>
            </div>
          </div>

          {/* Revenue comparison chart */}
          {sourceChartData.length > 0 ? (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(38 25% 85%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: 'Source Sans 3' }} />
                  <YAxis tick={{ fontSize: 10, fontFamily: 'Source Sans 3' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontFamily: 'Source Sans 3', fontSize: 12, borderRadius: 8 }} formatter={(value: number, name: string) => [name === 'revenue' ? formatCurrency(value) : value, name === 'revenue' ? 'Revenue' : 'Orders']} />
                  <Bar dataKey="orders" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Orders" />
                  <Bar dataKey="revenue" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyChart message="No source data" />
          )}
        </div>

        {/* Peak QR Ordering Times */}
        {qrOrders.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-display text-lg font-bold text-foreground mb-1 flex items-center gap-2">
              <QrCode className="size-4 text-violet-600" />Peak QR Ordering Times
            </h3>
            <p className="text-xs font-body text-muted-foreground mb-3">QR orders by hour</p>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={qrHourlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(38 25% 85%)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fontFamily: 'Source Sans 3' }} interval={1} />
                  <YAxis tick={{ fontSize: 10, fontFamily: 'Source Sans 3' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontFamily: 'Source Sans 3', fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="orders" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="QR Orders" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Top QR Ordered Items */}
        {topQrItems.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-display text-lg font-bold text-foreground mb-1 flex items-center gap-2">
              <QrCode className="size-4 text-violet-600" />Most Popular QR Items
            </h3>
            <div className="space-y-2 mt-3">
              {topQrItems.map((item, i) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className={cn('size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', i === 0 ? 'bg-violet-600 text-white' : i < 3 ? 'bg-violet-100 text-violet-700' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-body font-semibold text-foreground truncate">{item.name}</p>
                    <div className="w-full bg-muted rounded-full h-1.5 mt-1"><div className="h-full rounded-full bg-violet-500" style={{ width: `${(item.qty / (topQrItems[0]?.qty || 1)) * 100}%` }} /></div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-body font-bold tabular-nums">{item.qty}</p>
                    <p className="text-[10px] font-body text-muted-foreground tabular-nums">{formatCurrency(item.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Peak Hours (all orders) */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-lg font-bold text-foreground mb-1">Peak Hours</h3>
          <p className="text-xs font-body text-muted-foreground mb-3">All orders by hour of day</p>
          {orderCount === 0 ? <EmptyChart message="No orders for this period" /> : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(38 25% 85%)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fontFamily: 'Source Sans 3' }} interval={1} />
                  <YAxis tick={{ fontSize: 10, fontFamily: 'Source Sans 3' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontFamily: 'Source Sans 3', fontSize: 12, borderRadius: 8 }} formatter={(value: number, name: string) => [name === 'revenue' ? formatCurrency(value) : value, name === 'revenue' ? 'Revenue' : 'Orders']} />
                  <Bar dataKey="orders" fill="hsl(164 52% 28%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-lg font-bold text-foreground mb-1">Payment Breakdown</h3>
          {paymentBreakdown.length === 0 ? <EmptyChart message="No payment data" /> : (
            <div className="h-52 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={40} paddingAngle={2} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10, fontFamily: 'Source Sans 3' }}>
                    {paymentBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'Source Sans 3' }} formatter={(value, entry) => { const { payload } = entry as { payload?: { value: number } }; return `${value}: ${formatCurrency(payload?.value ?? 0)}`; }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-lg font-bold text-foreground mb-1">Top Selling Items</h3>
          {itemSales.length === 0 ? <EmptyChart message="No items sold" /> : (
            <div className="space-y-2">
              {itemSales.map((item, i) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span className={cn('size-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0', i === 0 ? 'gold-gradient text-white' : i < 3 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-body font-semibold text-foreground truncate">{item.name}</p>
                    <div className="w-full bg-muted rounded-full h-1.5 mt-1"><div className="h-full rounded-full cafe-gradient" style={{ width: `${(item.qty / (itemSales[0]?.qty || 1)) * 100}%` }} /></div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-body font-bold tabular-nums">{item.qty}</p>
                    <p className="text-[10px] font-body text-muted-foreground tabular-nums">{formatCurrency(item.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-lg font-bold text-foreground mb-3">GST Summary</h3>
          {orderCount === 0 ? <p className="text-sm font-body text-muted-foreground text-center py-4">No data</p> : (() => {
            const taxableAmount = Math.round((totalRevenue / 1.05) * 100) / 100;
            const totalGST = Math.round((totalRevenue - taxableAmount) * 100) / 100;
            return (
              <div className="space-y-2">
                <GSTRow label="Total Revenue (incl. GST)" value={formatCurrency(totalRevenue)} bold />
                <GSTRow label="Taxable Amount" value={formatCurrency(taxableAmount)} />
                <GSTRow label="GST @ 5%" value={formatCurrency(totalGST)} />
                <div className="border-t border-border pt-2 mt-2">
                  <GSTRow label="CGST @ 2.5%" value={formatCurrency(Math.round((totalGST / 2) * 100) / 100)} highlight />
                  <GSTRow label="SGST @ 2.5%" value={formatCurrency(Math.round((totalGST / 2) * 100) / 100)} highlight />
                </div>
              </div>
            );
          })()}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-display text-lg font-bold text-foreground mb-1">Cancelled Orders</h3>
          {cancelledOrders.length === 0 ? <p className="text-sm font-body text-muted-foreground text-center py-4">No cancellations</p> : (
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-body">
                <span className="text-muted-foreground">Cancelled Orders</span><span className="font-bold text-destructive">{cancelledOrders.length}</span>
              </div>
              <div className="flex justify-between text-sm font-body">
                <span className="text-muted-foreground">Lost Revenue</span><span className="font-bold text-destructive">{formatCurrency(cancelledOrders.reduce((s, o) => s + o.total, 0))}</span>
              </div>
              <div className="border-t border-border pt-2 mt-2 space-y-1.5">
                {cancelledOrders.slice(0, 10).map((o) => (
                  <div key={o.id} className="text-xs font-body">
                    <div className="flex justify-between">
                      <span className="font-semibold text-foreground">#{String(o.orderNumber).padStart(3, '0')}</span>
                      <span className="text-destructive font-semibold tabular-nums">{formatCurrency(o.total)}</span>
                    </div>
                    {o.cancelReason && <p className="text-muted-foreground mt-0.5">Reason: {o.cancelReason}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleExportExcel}
          disabled={orderCount === 0 && cancelledOrders.length === 0}
          className="w-full py-3.5 rounded-xl cafe-gradient text-primary-foreground font-body font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg disabled:opacity-40 disabled:pointer-events-none"
        >
          <Download className="size-5" />Download Sales Report (Excel)
        </button>
      </div>
    </div>
  );
}

function KPICard({ icon, label, value, color, sub }: { icon: React.ReactNode; label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="kpi-card">
      <div className={cn('size-9 rounded-xl flex items-center justify-center mb-3 shadow-sm', color)}>{icon}</div>
      <p className="font-display text-2xl font-bold text-foreground tabular-nums leading-none">{value}</p>
      <p className="text-[11px] font-body font-semibold text-muted-foreground uppercase tracking-wider mt-1.5">{label}</p>
      {sub && <p className="text-[10px] font-body text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function GSTRow({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  return (
    <div className={cn('flex justify-between py-1', highlight && 'pl-3')}>
      <span className={cn('text-sm font-body', bold ? 'font-bold text-foreground' : 'text-muted-foreground')}>{label}</span>
      <span className={cn('text-sm font-body tabular-nums', bold ? 'font-bold text-foreground' : highlight ? 'font-semibold text-primary' : 'text-foreground')}>{value}</span>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return <div className="flex items-center justify-center py-10"><p className="text-sm font-body text-muted-foreground">{message}</p></div>;
}
