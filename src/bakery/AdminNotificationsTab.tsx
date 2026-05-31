// src/bakery/AdminNotificationsTab.tsx
// Admin Notifications Tab – unified feed for invoice alerts, baker shortages,
// and packing→branch discrepancies. Click any notification to see full detail.

import { useState, useEffect } from 'react';
import {
  Bell, FileText, ChevronDown, ChevronUp, Check,
  Trash2, RefreshCw, Loader2, X, AlertTriangle,
  PackageX, Scale, CheckCheck, CreditCard, IndianRupee, Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useNotificationStore,
  type AdminNotification,
  type NotificationType,
} from './notificationStore';

// ─── Type metadata ────────────────────────────────────────────────────────────

const TYPE_META: Record<
  NotificationType,
  { label: string; icon: React.ElementType; cardBorder: string; iconBg: string; iconColor: string; badgeCls: string }
> = {
  invoice_pending: {
    label: 'Invoice Pending',
    icon: FileText,
    cardBorder: 'border-amber-300',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    badgeCls: 'bg-amber-100 text-amber-700 border-amber-300',
  },
  baker_shortage: {
    label: 'Baker Shortage',
    icon: PackageX,
    cardBorder: 'border-red-300',
    iconBg: 'bg-red-50',
    iconColor: 'text-red-600',
    badgeCls: 'bg-red-100 text-red-700 border-red-200',
  },
  packing_discrepancy: {
    label: 'Packing Discrepancy',
    icon: Scale,
    cardBorder: 'border-orange-300',
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-600',
    badgeCls: 'bg-orange-100 text-orange-700 border-orange-200',
  },
  low_stock: {
    label: 'Low Stock',
    icon: AlertTriangle,
    cardBorder: 'border-yellow-300',
    iconBg: 'bg-yellow-50',
    iconColor: 'text-yellow-600',
    badgeCls: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  },
  credit_sale: {
    label: 'Credit Sale',
    icon: CreditCard,
    cardBorder: 'border-red-400',
    iconBg: 'bg-red-50',
    iconColor: 'text-red-600',
    badgeCls: 'bg-red-100 text-red-700 border-red-300',
  },
  price_change: {
    label: 'Price Updated',
    icon: Tag,
    cardBorder: 'border-blue-300',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    badgeCls: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  packing_remainder: {
    label: 'Packing Remainder',
    icon: Scale,
    cardBorder: 'border-amber-300',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    badgeCls: 'bg-amber-100 text-amber-700 border-amber-200',
  },
};

// ─── Detail modal ─────────────────────────────────────────────────────────────

function NotificationDetailModal({
  notification,
  onClose,
}: {
  notification: AdminNotification;
  onClose: () => void;
}) {
  const meta = TYPE_META[notification.type];
  const Icon = meta.icon;
  const { markRead, deleteNotification } = useNotificationStore();

  // U-12 FIX: mark read only once when the modal actually opens (on mount of the detail view),
  // not from the list card's render. This preserves unread styling until the admin actively opens it.
  useEffect(() => {
    if (!notification.isRead) markRead(notification.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification.id]);

  const handleDelete = async () => {
    await deleteNotification(notification.id);
    onClose();
  };

  // Render rich detail based on notification type
  const renderDetail = () => {
    const m = notification.meta;

    if (notification.type === 'invoice_pending' && m) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1.5">
          <p className="text-xs font-body font-bold text-amber-800 uppercase tracking-wide">Invoice Details</p>
          <p className="text-sm font-body text-amber-900">
            <span className="font-bold">Supplier:</span> {String(m.supplierName ?? '—')}
          </p>
          <p className="text-sm font-body text-amber-900">
            <span className="font-bold">Amount:</span> ₹{Number(m.grandTotal ?? 0).toFixed(2)}
          </p>
          <p className="text-xs font-body text-amber-700 mt-1">
            Go to the <span className="font-bold">Store Invoices</span> tab to review and approve or reject this invoice.
          </p>
        </div>
      );
    }

    if (notification.type === 'baker_shortage' && m?.items) {
      const items = m.items as { itemName: string; prepared: number; requested: number; unit: string }[];
      return (
        <div className="space-y-2">
          <p className="text-xs font-body font-bold text-muted-foreground uppercase tracking-wide">Items with Shortage</p>
          <div className="rounded-xl border border-red-200 overflow-hidden">
            <div className="grid grid-cols-12 px-3 py-2 bg-red-50 text-[9px] font-body font-bold text-red-700 uppercase">
              <span className="col-span-5">Item</span>
              <span className="col-span-3 text-right">Requested</span>
              <span className="col-span-4 text-right">Prepared</span>
            </div>
            {items.map((item, i) => {
              const shortage = item.requested - item.prepared;
              return (
                <div key={i} className="grid grid-cols-12 px-3 py-2.5 border-t border-red-100 text-xs font-body items-center">
                  <span className="col-span-5 font-semibold text-foreground truncate">{item.itemName}</span>
                  <span className="col-span-3 text-right text-muted-foreground">{item.requested} {item.unit}</span>
                  <span className="col-span-4 text-right">
                    <span className="font-bold text-red-600">{item.prepared} {item.unit}</span>
                    {shortage > 0 && (
                      <span className="block text-[9px] text-red-500">−{shortage} {item.unit} short</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs font-body text-muted-foreground bg-muted/40 px-3 py-2 rounded-xl">
            Baker sent fewer items to packing than what was ordered. Verify with the baker and take corrective action.
          </p>
        </div>
      );
    }

    if (notification.type === 'packing_discrepancy' && m?.items) {
      const items = m.items as { itemName: string; dispatched: number; requested: number; unit: string }[];
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-xl">
            <AlertTriangle className="size-4 text-orange-600 shrink-0" />
            <p className="text-xs font-body text-orange-800">
              <span className="font-bold">Branch:</span> {String(m.branch ?? '—')} · <span className="font-bold">Order:</span> {String(m.orderNumber ?? '—')}
            </p>
          </div>
          <p className="text-xs font-body font-bold text-muted-foreground uppercase tracking-wide">Receiver Ordered vs Packing Dispatched</p>
          <div className="rounded-xl border border-orange-200 overflow-hidden">
            <div className="grid grid-cols-12 px-3 py-2 bg-orange-50 text-[9px] font-body font-bold text-orange-700 uppercase">
              <span className="col-span-4">Item</span>
              <span className="col-span-3 text-right">Receiver Ordered</span>
              <span className="col-span-3 text-right">Dispatched</span>
              <span className="col-span-2 text-right">Gap</span>
            </div>
            {items.map((item, i) => {
              const missing = item.requested - item.dispatched;  // requested = baker prepared
              const isMissing = missing > 0;
              const isExtra   = missing < 0;
              return (
                <div key={i} className={cn(
                  'grid grid-cols-12 px-3 py-2.5 border-t text-xs font-body items-center',
                  isMissing ? 'border-red-100 bg-red-50/40' : isExtra ? 'border-blue-100 bg-blue-50/20' : 'border-orange-100'
                )}>
                  <span className="col-span-4 font-semibold text-foreground truncate">{item.itemName}</span>
                  <span className="col-span-3 text-right text-muted-foreground">{item.requested} {item.unit}</span>
                  <span className="col-span-3 text-right font-bold text-foreground">{item.dispatched} {item.unit}</span>
                  <span className={cn('col-span-2 text-right text-[10px] font-bold',
                    isMissing ? 'text-red-600' : isExtra ? 'text-blue-600' : 'text-emerald-600'
                  )}>
                    {missing === 0 ? '✓' : isMissing ? `−${missing}` : `+${Math.abs(missing)}`}
                  </span>
                </div>
              );
            })}
          </div>
          {items.some(i => i.dispatched < i.requested) && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="size-3.5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs font-body text-red-700">
                <span className="font-bold">Action needed:</span> Packing closed out with less than what the baker prepared. Check if the missing quantity was retained, lost, or dispatched to another branch.
              </p>
            </div>
          )}
        </div>
      );
    }

    if (notification.type === 'low_stock' && m?.items) {
      const items = m.items as { name: string; quantity: number; minThreshold: number; unit: string }[];
      return (
        <div className="space-y-2">
          <p className="text-xs font-body font-bold text-muted-foreground uppercase tracking-wide">Items Below Threshold</p>
          <div className="rounded-xl border border-yellow-200 overflow-hidden">
            <div className="grid grid-cols-12 px-3 py-2 bg-yellow-50 text-[9px] font-body font-bold text-yellow-700 uppercase">
              <span className="col-span-5">Material</span>
              <span className="col-span-3 text-right">Current</span>
              <span className="col-span-4 text-right">Min Level</span>
            </div>
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 px-3 py-2.5 border-t border-yellow-100 text-xs font-body items-center">
                <span className="col-span-5 font-semibold text-foreground truncate">{item.name}</span>
                <span className="col-span-3 text-right font-bold text-red-600">{item.quantity.toFixed(2)} {item.unit}</span>
                <span className="col-span-4 text-right text-muted-foreground">{item.minThreshold} {item.unit}</span>
              </div>
            ))}
          </div>
          <p className="text-xs font-body text-muted-foreground bg-muted/40 px-3 py-2 rounded-xl">
            Raise a Purchase Order in the Store dashboard to replenish these materials.
          </p>
        </div>
      );
    }

    if (notification.type === 'credit_sale' && m) {
      const amount = Number(m.amount ?? 0);
      const dueDate = m.dueDate ? new Date(m.dueDate as string).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
      return (
        <div className="space-y-3">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
            <p className="text-xs font-body font-bold text-red-800 uppercase tracking-wide">Credit Sale Details</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div>
                <p className="text-[10px] font-body text-red-600 uppercase font-bold">Customer</p>
                <p className="text-sm font-body font-semibold text-foreground">{String(m.customerName ?? '—')}</p>
              </div>
              <div>
                <p className="text-[10px] font-body text-red-600 uppercase font-bold">Amount</p>
                <p className="text-sm font-body font-bold text-red-700 tabular-nums">
                  ₹{amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-body text-red-600 uppercase font-bold">Branch</p>
                <p className="text-sm font-body text-foreground">{String(m.branch ?? '—')}</p>
              </div>
              <div>
                <p className="text-[10px] font-body text-red-600 uppercase font-bold">Billed By</p>
                <p className="text-sm font-body text-foreground">{String(m.soldBy ?? '—')}</p>
              </div>
              <div>
                <p className="text-[10px] font-body text-red-600 uppercase font-bold">Bill No</p>
                <p className="text-sm font-body text-foreground font-mono">{String(m.billNo ?? '—')}</p>
              </div>
              {dueDate && (
                <div>
                  <p className="text-[10px] font-body text-red-600 uppercase font-bold">Due Date</p>
                  <p className="text-sm font-body text-foreground">{dueDate}</p>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs font-body text-amber-800">
              Go to <span className="font-bold">Billing → Credit tab</span> to track and settle this credit sale.
            </p>
          </div>
        </div>
      );
    }

    if (notification.type === 'price_change' && m) {
      return (
        <div className="space-y-3">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
            <p className="text-xs font-body font-bold text-blue-800 uppercase tracking-wide">Price Change Details</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              <div>
                <p className="text-[10px] font-body text-blue-600 uppercase font-bold">Branch</p>
                <p className="text-sm font-body font-semibold text-foreground">{String(m.branch ?? '—')}</p>
              </div>
              <div>
                <p className="text-[10px] font-body text-blue-600 uppercase font-bold">Barcode</p>
                <p className="text-sm font-body font-semibold text-foreground">#{String(m.barcode ?? '—')}</p>
              </div>
              <div>
                <p className="text-[10px] font-body text-blue-600 uppercase font-bold">Item Name</p>
                <p className="text-sm font-body font-semibold text-foreground">{String(m.name ?? '—')}</p>
              </div>
              {m.oldName && m.oldName !== m.name && (
                <div>
                  <p className="text-[10px] font-body text-blue-600 uppercase font-bold">Previous Name</p>
                  <p className="text-sm font-body text-muted-foreground line-through">{String(m.oldName)}</p>
                </div>
              )}
              {m.oldPrice !== undefined && (
                <div>
                  <p className="text-[10px] font-body text-blue-600 uppercase font-bold">Old Price</p>
                  <p className="text-sm font-body text-muted-foreground line-through tabular-nums">₹{Number(m.oldPrice).toLocaleString('en-IN')}</p>
                </div>
              )}
              {m.price !== undefined && (
                <div>
                  <p className="text-[10px] font-body text-blue-600 uppercase font-bold">New Price</p>
                  <p className="text-sm font-body font-bold text-blue-700 tabular-nums">₹{Number(m.price).toLocaleString('en-IN')}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-body text-blue-600 uppercase font-bold">Changed By</p>
                <p className="text-sm font-body text-foreground">{String(m.updatedBy ?? '—')}</p>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
            <Tag className="size-3.5 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs font-body text-blue-800">
              New prices take effect immediately on <span className="font-bold">BillTab</span> for the {String(m.branch ?? '')} branch.
            </p>
          </div>
        </div>
      );
    }

    if (notification.type === 'packing_remainder' && m?.items) {
      const items = m.items as { itemName: string; remainderKg: number; dispatchedPcs: number; preparedKg: number }[];
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
            <Scale className="size-4 text-amber-600 shrink-0" />
            <p className="text-xs font-body text-amber-800">
              <span className="font-bold">Branch:</span> {String(m.branch ?? '—')} · <span className="font-bold">Order:</span> {String(m.orderNumber ?? '—')}
            </p>
          </div>
          <p className="text-xs font-body font-bold text-muted-foreground uppercase tracking-wide">Remainder After Pcs Conversion</p>
          <div className="rounded-xl border border-amber-200 overflow-hidden">
            <div className="grid grid-cols-12 px-3 py-2 bg-amber-50 text-[9px] font-body font-bold text-amber-700 uppercase">
              <span className="col-span-4">Item</span>
              <span className="col-span-2 text-right">Baker Sent</span>
              <span className="col-span-3 text-right">Dispatched</span>
              <span className="col-span-3 text-right">Remainder</span>
            </div>
            {items.map((item, i) => {
              const remainderGrams = Math.round(item.remainderKg * 1000);
              return (
                <div key={i} className="grid grid-cols-12 px-3 py-2.5 border-t border-amber-100 text-xs font-body items-center">
                  <span className="col-span-4 font-semibold text-foreground truncate">{item.itemName}</span>
                  <span className="col-span-2 text-right text-muted-foreground">{item.preparedKg} kg</span>
                  <span className="col-span-3 text-right font-bold text-emerald-700">{item.dispatchedPcs} pcs</span>
                  <span className="col-span-3 text-right font-bold text-amber-600">{remainderGrams}g</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs font-body text-amber-800">
              <span className="font-bold">Note:</span> These grams cannot form a complete piece and are kept at the bakery. Consider accumulating remainders before the next batch.
            </p>
          </div>
        </div>
      );
    }

    return (
      <p className="text-sm font-body text-muted-foreground px-3 py-2 bg-muted/40 rounded-xl">
        {notification.body}
      </p>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full bg-background rounded-t-3xl px-4 pt-5 pb-10 space-y-4 max-h-[88vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-border rounded-full mx-auto -mt-1 mb-2" />

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={cn('size-10 rounded-xl flex items-center justify-center shrink-0', meta.iconBg)}>
            <Icon className={cn('size-5', meta.iconColor)} />
          </div>
          <div className="flex-1 min-w-0">
            <span className={cn('text-[9px] font-body font-bold px-2 py-0.5 rounded-full border inline-block mb-1', meta.badgeCls)}>
              {meta.label}
            </span>
            <h3 className="font-display font-bold text-base text-foreground leading-tight">{notification.title}</h3>
            {notification.refLabel && (
              <p className="text-[11px] font-body text-muted-foreground mt-0.5">{notification.refLabel}</p>
            )}
          </div>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-xl hover:bg-muted shrink-0">
            <X className="size-4" />
          </button>
        </div>

        {/* Detail */}
        {renderDetail()}

        {/* Timestamp */}
        <p className="text-[10px] font-body text-muted-foreground text-right">
          {new Date(notification.createdAt).toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </p>

        {/* Actions */}
        <button
          onClick={handleDelete}
          className="w-full h-11 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-body font-semibold flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          <Trash2 className="size-4" /> Dismiss Notification
        </button>
      </div>
    </div>
  );
}

// ─── Notification card ────────────────────────────────────────────────────────

function NotifCard({
  notif,
  onClick,
}: {
  notif: AdminNotification;
  onClick: (n: AdminNotification) => void;
}) {
  const meta = TYPE_META[notif.type];
  const Icon = meta.icon;

  return (
    <button
      className={cn(
        'w-full rounded-2xl border-2 overflow-hidden text-left transition-all active:scale-[0.98]',
        notif.isRead ? 'border-border bg-card' : meta.cardBorder,
      )}
      onClick={() => onClick(notif)}
    >
      <div className={cn('px-4 py-3.5 flex items-center gap-3', !notif.isRead ? 'bg-white/60' : '')}>
        {/* Unread dot */}
        <div className="relative">
          <div className={cn('size-9 rounded-xl flex items-center justify-center shrink-0', meta.iconBg)}>
            <Icon className={cn('size-4', meta.iconColor)} />
          </div>
          {!notif.isRead && (
            <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-red-500 border-2 border-background" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={cn('text-[9px] font-body font-bold px-2 py-0.5 rounded-full border', meta.badgeCls)}>
              {meta.label}
            </span>
            {!notif.isRead && (
              <span className="text-[9px] font-body font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                New
              </span>
            )}
          </div>
          <p className="text-sm font-body font-semibold text-foreground truncate">{notif.title}</p>
          <p className="text-[11px] font-body text-muted-foreground truncate mt-0.5">{notif.body}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[10px] font-body text-muted-foreground">
            {new Date(notif.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          </p>
          <p className="text-[10px] font-body text-muted-foreground">
            {new Date(notif.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    </button>
  );
}

// ─── Main AdminNotificationsTab ───────────────────────────────────────────────

export default function AdminNotificationsTab() {
  const { notifications, loaded, loading, load, markAllRead, unreadCount } = useNotificationStore();
  const [selected, setSelected] = useState<AdminNotification | null>(null);
  const [filterType, setFilterType] = useState<'all' | NotificationType>('all');

  useEffect(() => { if (!loaded) load(); }, [loaded]);

  // Poll every 20 seconds
  useEffect(() => {
    const id = setInterval(() => load(), 20_000);
    return () => clearInterval(id);
  }, []);

  const unread = unreadCount();

  const filtered = notifications.filter(n =>
    filterType === 'all' ? true : n.type === filterType
  );

  const invoiceCount     = notifications.filter(n => n.type === 'invoice_pending').length;
  const shortageCount    = notifications.filter(n => n.type === 'baker_shortage').length;
  const discrepancyCount = notifications.filter(n => n.type === 'packing_discrepancy').length;
  const lowStockCount    = notifications.filter(n => n.type === 'low_stock').length;
  const creditCount      = notifications.filter(n => n.type === 'credit_sale').length;
  const priceChangeCount = notifications.filter(n => n.type === 'price_change').length;

  return (
    <div className="space-y-4">
      {/* Unread banner */}
      {unread > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border-2 border-red-300 rounded-2xl">
          <Bell className="size-5 text-red-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-body font-bold text-red-800">
              {unread} unread notification{unread > 1 ? 's' : ''}
            </p>
            <p className="text-[11px] font-body text-red-700 mt-0.5">
              Tap a notification to view full details
            </p>
          </div>
          <button
            onClick={markAllRead}
            className="shrink-0 text-[10px] font-body font-bold text-red-700 flex items-center gap-1 px-3 py-1.5 rounded-full bg-red-100 border border-red-200 active:scale-95"
          >
            <CheckCheck className="size-3" /> Mark all read
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: 'Invoices',    value: invoiceCount,     color: invoiceCount > 0 ? 'text-amber-600' : 'text-muted-foreground',    bg: invoiceCount > 0 ? 'bg-amber-50 border-amber-200' : '' },
          { label: 'Shortages',  value: shortageCount,    color: shortageCount > 0 ? 'text-red-600' : 'text-muted-foreground',      bg: shortageCount > 0 ? 'bg-red-50 border-red-200' : '' },
          { label: 'Discrep.',   value: discrepancyCount, color: discrepancyCount > 0 ? 'text-orange-600' : 'text-muted-foreground', bg: discrepancyCount > 0 ? 'bg-orange-50 border-orange-200' : '' },
          { label: 'Low Stock',  value: lowStockCount,    color: lowStockCount > 0 ? 'text-yellow-600' : 'text-muted-foreground',   bg: lowStockCount > 0 ? 'bg-yellow-50 border-yellow-200' : '' },
          { label: 'Credit',     value: creditCount,      color: creditCount > 0 ? 'text-red-700' : 'text-muted-foreground',        bg: creditCount > 0 ? 'bg-red-50 border-red-300' : '' },
          { label: 'Prices',     value: priceChangeCount, color: priceChangeCount > 0 ? 'text-blue-600' : 'text-muted-foreground',  bg: priceChangeCount > 0 ? 'bg-blue-50 border-blue-200' : '' },
        ].map(s => (
          <div key={s.label} className={cn('bg-card border border-border rounded-xl p-2.5 text-center', s.bg)}>
            <p className={cn('font-display text-xl font-bold', s.color)}>{s.value}</p>
            <p className="text-[9px] font-body text-muted-foreground uppercase font-semibold mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter pills + Refresh */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto flex-1 pb-0.5">
          {([
            { id: 'all',                 label: 'All' },
            { id: 'invoice_pending',     label: '📄 Invoices' },
            { id: 'baker_shortage',      label: '📦 Shortage' },
            { id: 'packing_discrepancy', label: '⚖️ Discrepancy' },
            { id: 'packing_remainder',   label: '⚖️ Remainder' },
            { id: 'low_stock',           label: '⚠️ Low Stock' },
            { id: 'credit_sale',         label: '💳 Credit' },
            { id: 'price_change',        label: '🏷️ Prices' },
          ] as const).map(f => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              className={cn(
                'shrink-0 text-[11px] font-body font-semibold px-3 py-1.5 rounded-full border transition-all',
                filterType === f.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="size-9 flex items-center justify-center rounded-xl border border-border hover:bg-muted active:scale-90 shrink-0"
        >
          <RefreshCw className={cn('size-3.5 text-muted-foreground', loading && 'animate-spin')} />
        </button>
      </div>

      {/* List */}
      {loading && !loaded ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
          <Bell className="size-10 opacity-20" />
          <p className="text-sm font-body">
            {notifications.length === 0 ? 'No notifications yet — all clear!' : 'No notifications match this filter'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => (
            <NotifCard key={n.id} notif={n} onClick={setSelected} />
          ))}
        </div>
      )}

      {selected && (
        <NotificationDetailModal
          notification={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
