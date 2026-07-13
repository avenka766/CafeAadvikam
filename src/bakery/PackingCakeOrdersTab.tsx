// src/bakery/PackingCakeOrdersTab.tsx
import { useCallback, useEffect, useState } from 'react';
import { Cake, Loader2, Package, Send, AlertTriangle, RefreshCcw, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { useBranchOpsStore } from '@/branch/branchOpsStore';
import { ensureCakeDispatchIncoming } from '@/branch/cakeDispatchSync';

interface CakeOrderRow {
  id: string;
  branch: 'SNB' | 'VRSNB';
  order_no: string;
  slip_number: string | null;
  customer_name: string;
  delivery_date: string | null;
  delivery_time: string | null;
  cake_kg: string | null;
  prepared_quantity: number | null;
  flavor: string | null;
  shape: string | null;
  cream_type: string | null;
  updated_at: string | null;
  created_at: string | null;
  status: string;
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export default function PackingCakeOrdersTab() {
  const { currentUser } = useAuthStore();
  const [orders, setOrders] = useState<CakeOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('cake_master_orders')
      .select('id,branch,order_no,slip_number,customer_name,delivery_date,delivery_time,cake_kg,prepared_quantity,flavor,shape,cream_type,updated_at,created_at,status')
      .in('status', ['Ready for Packing', 'Packed'])
      .order('delivery_date', { ascending: true });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setError('');
    setOrders((data || []) as CakeOrderRow[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel('packing_cake_orders_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cake_master_orders' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const dispatch = async (order: CakeOrderRow) => {
    setBusyId(order.id);
    const actor = currentUser?.displayName || currentUser?.username || 'Packing';
    try {
      if (order.status === 'Ready for Packing') {
        const { error: packedError } = await supabase.rpc('update_cake_master_order_status', { p_id: order.id, p_new_status: 'Packed', p_actor: actor });
        if (packedError) throw new Error(packedError.message);
      }

      // Keep cakes on the same confirm-into-stock path as regular dispatches.
      const { dispatchedQty } = await ensureCakeDispatchIncoming(order, actor);
      const { error: dispatchError } = await supabase.rpc('update_cake_master_order_status', { p_id: order.id, p_new_status: 'Dispatched', p_actor: actor });
      if (dispatchError) throw new Error(dispatchError.message);

      useBranchOpsStore.getState().syncAdvanceCakeDispatch(order.order_no, dispatchedQty, actor);
      useBranchOpsStore.getState().updateAdvanceStoreStatusByOrderNo(order.order_no, 'dispatched', actor);
      setError('');
      await load();
    } catch (dispatchError) {
      setError(dispatchError instanceof Error ? dispatchError.message : 'Cake dispatch failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-3.5">
        <div className="flex items-center gap-2">
          <Cake className="size-4 text-rose-500" />
          <h3 className="text-sm font-black text-foreground">Cake Orders Ready for Dispatch</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-black text-muted-foreground">{orders.length}</span>
        </div>
        <button type="button" onClick={() => void load()} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-black text-muted-foreground">
          <RefreshCcw className={cn('size-3.5', loading && 'animate-spin')} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-bold text-red-700">
          <AlertTriangle className="size-4 shrink-0" />{error}
        </div>
      )}

      {!loading && orders.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
          <Package className="size-8 text-muted-foreground/40" />
          <p className="text-sm font-bold text-muted-foreground">No cake orders waiting on Packing right now.</p>
        </div>
      )}

      <div className="space-y-2.5">
        {orders.map((order) => (
          <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-50">
                <Cake className="size-5 text-rose-500" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-slate-950 px-1.5 py-0.5 text-[10px] font-black text-white">{order.branch}</span>
                  {order.slip_number && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">Slip {order.slip_number}</span>}
                  <span className="flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600"><Receipt className="size-3" />{order.order_no}</span>
                </div>
                <p className="mt-0.5 truncate text-sm font-black text-foreground">{order.customer_name || 'Customer'}</p>
                <p className="truncate text-[11px] font-bold text-muted-foreground">
                  Prepared: <span className="font-black text-foreground">{order.prepared_quantity ?? order.cake_kg ?? '—'}</span> · {order.flavor} · {order.shape} · Delivery {fmtDate(order.delivery_date)} {order.delivery_time || ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={busyId === order.id}
              onClick={() => void dispatch(order)}
              className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white active:scale-95 disabled:opacity-50"
            >
              {busyId === order.id ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Dispatch to {order.branch}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
