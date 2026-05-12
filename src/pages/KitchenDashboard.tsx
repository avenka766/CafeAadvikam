import { useState, useMemo, useEffect, useRef } from 'react';
import { useOrderStore } from '@/stores/orderStore';
import { formatTime, cn } from '@/lib/utils';
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, CAFE_CONFIG } from '@/constants/config';
import type { OrderStatus, Order } from '@/types';
import {
  Wifi, Inbox, Clock, MapPin, User as UserIcon,
  ChefHat, Bell, CheckCircle2, QrCode, UserCheck,
  Volume2, VolumeX, Printer,
} from 'lucide-react';

const TABS: { key: OrderStatus | 'active'; label: string; accent: string; textColor: string }[] = [
  { key: 'active',    label: 'Active',   accent: '#1D9E75', textColor: '#fff' },
  { key: 'pending',   label: 'New',      accent: '#F59E0B', textColor: '#fff' },
  { key: 'preparing', label: 'Cooking',  accent: '#3B82F6', textColor: '#fff' },
  { key: 'ready',     label: 'Ready',    accent: '#10B981', textColor: '#fff' },
];

function playBeep() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach(offset => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 960; osc.type = 'square';
      gain.gain.setValueAtTime(0, ctx.currentTime + offset);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.28);
      osc.start(ctx.currentTime + offset); osc.stop(ctx.currentTime + offset + 0.3);
    });
  } catch { /**/ }
}

function printKot(order: Order) {
  const win = window.open('', '_blank', 'width=320,height=600');
  if (!win) return;
  const items = order.items.map(ci =>
    `<tr><td style="font-size:16px;font-weight:900;padding:2px 0;width:36px">${ci.quantity}×</td><td style="font-size:15px;font-weight:700;padding:2px 6px">${ci.menuItem.name}</td></tr>`
  ).join('');
  win.document.write(`<!DOCTYPE html><html><head><title>KOT #${String(order.orderNumber).padStart(3,'0')}</title>
<style>@page{margin:4mm;size:80mm auto}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;width:72mm;margin:0 auto;padding:2mm}.c{text-align:center}.d{border-top:1px dashed #000;margin:5px 0}</style></head>
<body><div class="c" style="font-size:13px;font-weight:700">${CAFE_CONFIG.name}</div>
<div class="c" style="font-size:11px">KITCHEN ORDER TICKET</div><div class="d"></div>
<div class="c" style="font-size:36px;font-weight:900;margin:8px 0">#${String(order.orderNumber).padStart(3,'0')}</div>
<div class="d"></div>
<div style="display:flex;justify-content:space-between;font-size:12px;margin:4px 0">
<span>${order.orderType==='dine_in'&&order.tableNumber?'Table '+order.tableNumber:'📦 Takeaway'}</span>
<span>${formatTime(order.createdAt)}</span></div>
${order.customerName?`<div style="font-size:12px">Customer: ${order.customerName}</div>`:''}
<div class="d"></div><table style="width:100%">${items}</table>
${order.notes?`<div class="d"></div><div style="background:#f5f5f5;padding:4px 6px;font-size:12px">⚠️ ${order.notes}</div>`:''}
<div class="d"></div><div class="c" style="font-size:11px">${new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div>
</body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

export default function KitchenDashboard() {
  const { orders, updateOrderStatus, startPolling, stopPolling, polling } = useOrderStore();
  const [activeTab, setActiveTab] = useState<OrderStatus | 'active'>('active');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const lastIdsRef = useRef<Set<string>>(new Set());
  const alertRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    startPolling();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const todayOrders = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter(o => new Date(o.createdAt).toDateString() === today);
  }, [orders]);

  const pending    = useMemo(() => todayOrders.filter(o => o.status === 'pending'), [todayOrders]);
  const cancelled  = useMemo(() => todayOrders.filter(o => o.status === 'cancelled'), [todayOrders]);

  // Track recently cancelled orders to flash them
  const lastCancelledIdsRef = useRef<Set<string>>(new Set());
  const [newlyCancelledIds, setNewlyCancelledIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const curr = new Set(pending.map(o => o.id));
    const newO = pending.filter(o => !lastIdsRef.current.has(o.id));
    if (newO.length > 0 && lastIdsRef.current.size > 0) {
      if (soundEnabled) playBeep();
      newO.forEach(o => {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`🔔 New Order #${String(o.orderNumber).padStart(3,'0')}`, {
            body: o.items.map(ci => `${ci.quantity}× ${ci.menuItem.name}`).join(', '), tag: o.id,
          });
        }
      });
    }
    lastIdsRef.current = curr;
  }, [pending, soundEnabled]);

  // Detect newly cancelled orders and alert kitchen
  useEffect(() => {
    const currCancelled = new Set(cancelled.map(o => o.id));
    const newCancelledOrders = cancelled.filter(o => !lastCancelledIdsRef.current.has(o.id));
    if (newCancelledOrders.length > 0 && lastCancelledIdsRef.current.size >= 0) {
      const freshIds = new Set(newCancelledOrders.map(o => o.id));
      setNewlyCancelledIds(prev => new Set([...prev, ...freshIds]));
      // Play alert beep for cancellations
      if (soundEnabled) {
        try {
          const ctx = new AudioContext();
          [0, 0.2, 0.4, 0.6].forEach(offset => {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 300; osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0, ctx.currentTime + offset);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + offset + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.18);
            osc.start(ctx.currentTime + offset); osc.stop(ctx.currentTime + offset + 0.2);
          });
        } catch { /**/ }
      }
      newCancelledOrders.forEach(o => {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`❌ Order CANCELLED #${String(o.orderNumber).padStart(3,'0')}`, {
            body: `Reason: ${o.cancelReason || 'Not specified'} — STOP preparing this order`, tag: `cancel-${o.id}`,
          });
        }
      });
      // Auto-clear highlight after 30 seconds
      setTimeout(() => {
        setNewlyCancelledIds(prev => {
          const next = new Set(prev);
          freshIds.forEach(id => next.delete(id));
          return next;
        });
      }, 30000);
    }
    lastCancelledIdsRef.current = currCancelled;
  }, [cancelled, soundEnabled]);

  useEffect(() => {
    if (alertRef.current) { clearInterval(alertRef.current); alertRef.current = null; }
    if (pending.length > 0 && soundEnabled) {
      alertRef.current = setInterval(playBeep, 8000);
    }
    return () => { if (alertRef.current) clearInterval(alertRef.current); };
  }, [pending.length, soundEnabled]);

  const filtered = useMemo(() => {
    if (activeTab === 'active')
      return todayOrders.filter(o => ['pending','preparing','ready'].includes(o.status));
    return todayOrders.filter(o => o.status === activeTab);
  }, [todayOrders, activeTab]);

  const elapsedMins = (t: string) => Math.floor((Date.now() - new Date(t).getTime()) / 60000);

  const STATUS_STYLE: Record<string, { border: string; badge: string; action?: string }> = {
    pending:   { border: '#F59E0B', badge: 'bg-amber-500 text-white' },
    preparing: { border: '#3B82F6', badge: 'bg-blue-500 text-white' },
    ready:     { border: '#10B981', badge: 'bg-emerald-500 text-white' },
    cancelled: { border: '#EF4444', badge: 'bg-red-500 text-white' },
  };

  return (
    <div className="min-h-screen pt-14 pb-24" style={{ background: '#0E0A06' }}>

      {/* ── Top bar ── */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b"
        style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(29,158,117,0.2)', border: '1px solid rgba(29,158,117,0.3)' }}>
            <ChefHat className="size-5" style={{ color: '#1D9E75' }} />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-white">Kitchen</h1>
            <div className="flex items-center gap-1.5">
              <div className={cn('size-1.5 rounded-full', polling ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600')} />
              <span className="text-[10px] font-body" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {polling ? 'Live · 3s' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pending.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full animate-pulse"
              style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)' }}>
              <Bell className="size-3.5" style={{ color: '#F59E0B' }} />
              <span className="text-xs font-body font-bold" style={{ color: '#F59E0B' }}>{pending.length} New</span>
            </div>
          )}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="size-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
            style={{ background: soundEnabled ? 'rgba(29,158,117,0.2)' : 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {soundEnabled
              ? <Volume2 className="size-4" style={{ color: '#1D9E75' }} />
              : <VolumeX className="size-4" style={{ color: 'rgba(255,255,255,0.4)' }} />}
          </button>
        </div>
      </div>

      {/* ── CANCELLED ORDER ALERT BANNER ── */}
      {newlyCancelledIds.size > 0 && (
        <div className="px-4 py-3 flex items-start gap-3 animate-pulse"
          style={{ background: 'rgba(239,68,68,0.25)', borderBottom: '2px solid #EF4444' }}>
          <span className="text-2xl shrink-0">🚫</span>
          <div className="flex-1">
            <p className="font-body font-black text-sm text-red-300">ORDER CANCELLED — STOP PREPARING!</p>
            {[...newlyCancelledIds].map(cid => {
              const o = todayOrders.find(x => x.id === cid);
              if (!o) return null;
              return (
                <p key={cid} className="text-xs font-body text-red-200 mt-0.5">
                  #{String(o.orderNumber).padStart(3,'0')} — {o.cancelReason || 'Reason not specified'}
                </p>
              );
            })}
          </div>
          <button onClick={() => setNewlyCancelledIds(new Set())}
            className="shrink-0 text-red-400 text-lg font-bold">✕</button>
        </div>
      )}

      {/* ── Tab strip ── */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          const count = tab.key === 'active'
            ? todayOrders.filter(o => ['pending','preparing','ready'].includes(o.status)).length
            : todayOrders.filter(o => o.status === tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-body font-bold whitespace-nowrap transition-all shrink-0 active:scale-95"
              style={isActive ? {
                background: tab.accent,
                color: tab.textColor,
                boxShadow: `0 4px 16px ${tab.accent}50`,
              } : {
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.55)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {tab.label}
              {count > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={isActive
                    ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                    : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Orders grid ── */}
      <div className="px-4 py-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="size-20 rounded-3xl flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Inbox className="size-10" style={{ color: 'rgba(255,255,255,0.2)' }} />
            </div>
            <p className="font-body font-semibold text-lg" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {activeTab === 'pending' ? 'Waiting for new orders…' : 'All clear!'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(order => {
              const elapsed = elapsedMins(order.createdAt);
              const isUrgent = order.status === 'pending' && elapsed > 5;
              const isNewlyCancelled = newlyCancelledIds.has(order.id);
              const s = STATUS_STYLE[order.status] || { border: '#555', badge: 'bg-gray-600 text-white' };
              return (
                <div
                  key={order.id}
                  className={cn('rounded-2xl overflow-hidden transition-all', (isUrgent || isNewlyCancelled) && 'animate-pulse')}
                  style={{
                    background: isNewlyCancelled ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `2px solid ${isNewlyCancelled ? '#EF4444' : isUrgent ? '#EF4444' : s.border}`,
                    boxShadow: `0 4px 24px ${isNewlyCancelled ? '#EF444440' : isUrgent ? '#EF444420' : s.border + '20'}`,
                  }}
                >
                  {/* Card header */}
                  <div className="px-4 py-3 flex items-center justify-between"
                    style={{ background: `${isNewlyCancelled ? '#EF4444' : isUrgent ? '#EF4444' : s.border}18`, borderBottom: `1px solid ${s.border}30` }}>
                    <div className="flex items-center gap-3">
                      <span className="font-display text-3xl font-bold text-white tabular-nums">
                        #{String(order.orderNumber).padStart(3, '00')}
                      </span>
                      <div className="flex flex-col gap-1">
                        <span className={cn('text-[10px] font-body font-bold px-2 py-0.5 rounded-full', isNewlyCancelled ? 'bg-red-600 text-white' : s.badge)}>
                          {isNewlyCancelled ? '🚫 CANCELLED' : ORDER_STATUS_LABELS[order.status]}
                        </span>
                        <span className="text-[9px] font-body flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          {order.orderSource === 'qr'
                            ? <><QrCode className="size-3" />QR Order</>
                            : <><UserCheck className="size-3" />Staff</>}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className={cn('text-sm font-body font-bold tabular-nums', isUrgent ? 'text-red-400' : 'text-white/60')}>
                          <Clock className="size-3 inline mr-0.5" />{elapsed}m
                        </p>
                        <p className="text-[10px] font-body" style={{ color: 'rgba(255,255,255,0.35)' }}>{formatTime(order.createdAt)}</p>
                      </div>
                      <button onClick={() => printKot(order)}
                        className="size-9 rounded-xl flex items-center justify-center active:scale-90 transition-all"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <Printer className="size-4 text-white/60" />
                      </button>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="px-4 py-2 flex flex-wrap gap-1.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    {order.orderType === 'dine_in' && order.tableNumber && (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-body font-bold"
                        style={{ background: 'rgba(29,158,117,0.2)', color: '#4EEDB5', border: '1px solid rgba(29,158,117,0.3)' }}>
                        <MapPin className="size-3" />Table {order.tableNumber}
                      </span>
                    )}
                    {order.orderType === 'takeaway' && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-body font-bold"
                        style={{ background: 'rgba(245,158,11,0.15)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.25)' }}>
                        📦 Takeaway
                      </span>
                    )}
                    {order.customerName && (
                      <span className="flex items-center gap-1 text-xs font-body" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        <UserIcon className="size-3" />{order.customerName}
                      </span>
                    )}
                  </div>

                  {/* Items — BIG text for kitchen readability */}
                  <div className="px-4 py-3 space-y-2">
                    {order.items.map(ci => (
                      <div key={ci.menuItem.id} className="flex items-start gap-3">
                        <span className="text-xl font-body font-black tabular-nums shrink-0 w-10 text-right"
                          style={{ color: s.border }}>
                          {ci.quantity}×
                        </span>
                        <span className="text-lg font-body font-bold text-white leading-tight">{ci.menuItem.name}</span>
                      </div>
                    ))}
                  </div>

                  {/* Notes */}
                  {order.notes && (
                    <div className="px-4 pb-3">
                      <p className="text-sm font-body px-3 py-2 rounded-xl"
                        style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', color: '#FCD34D' }}>
                        ⚠️ {order.notes}
                      </p>
                    </div>
                  )}

                  {/* Action */}
                  <div className="px-4 pb-4 flex gap-2">
                    {order.status === 'pending' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'preparing')}
                        className="flex-1 py-3.5 rounded-xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
                        style={{ background: '#3B82F6', color: '#fff', boxShadow: '0 4px 16px rgba(59,130,246,0.4)' }}>
                        <ChefHat className="size-4" />Start Cooking
                      </button>
                    )}
                    {order.status === 'preparing' && (
                      <button
                        onClick={() => updateOrderStatus(order.id, 'ready')}
                        className="flex-1 py-3.5 rounded-xl font-body font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
                        style={{ background: '#10B981', color: '#fff', boxShadow: '0 4px 16px rgba(16,185,129,0.4)' }}>
                        <CheckCircle2 className="size-4" />Mark Ready
                      </button>
                    )}
                    {order.status === 'ready' && (
                      <div className="flex-1 py-3.5 rounded-xl font-body font-bold text-sm flex items-center justify-center gap-2"
                        style={{ background: 'rgba(16,185,129,0.15)', color: '#4EEDB5', border: '1px solid rgba(16,185,129,0.3)' }}>
                        <CheckCircle2 className="size-4" />Ready for Pickup
                      </div>
                    )}
                    <button onClick={() => printKot(order)}
                      className="px-4 py-3.5 rounded-xl font-body font-bold text-sm flex items-center justify-center active:scale-95 transition-all"
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                      <Printer className="size-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
