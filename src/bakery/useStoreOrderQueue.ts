import {useCallback, useEffect, useRef, useState} from 'react';
import {businessDate} from '@/lib/businessDate';
import {fetchAllRows, supabase} from '@/lib/supabase';
import {rowToOrder} from './bakeryStore';
import type {BakeryOrder} from './types';

const DAY = 24 * 60 * 60 * 1000;

export function storeOrderCutoff(now: number): number {
  const today = Date.parse(`${businessDate(now)}T23:00:00+05:30`);
  return now < today ? today - DAY : today;
}

export function useStoreOrderQueue() {
  const [orders, setOrders] = useState<BakeryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const boundary = storeOrderCutoff(Date.now());
    const cutoff = new Date(boundary).toISOString();
    try {
      const {data, error: readError} = await fetchAllRows('bakery_orders', query => query
        .select('id,order_number,items,status,created_at,store_confirmed_at,production_released_at,target_branch,notes')
        .in('status', ['store_confirmed', 'produced'])
        .is('production_released_at', null)
        .or(`store_confirmed_at.gte.${cutoff},and(store_confirmed_at.is.null,created_at.gte.${cutoff})`)
        .order('created_at', {ascending: false}), {cursorColumn: 'created_at'});
      if (request !== generation.current) return;
      if (readError) throw new Error(readError);
      const currentBoundary = storeOrderCutoff(Date.now());
      setOrders(data.map(rowToOrder).filter(order => Date.parse(order.storeConfirmedAt ?? order.createdAt) >= currentBoundary));
      setError('');
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause.message : 'Could not load Store orders.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let debounce: number;
    let cutoffTimer: number;
    let stopped = false;
    const updateSoon = () => {
      if (stopped) return;
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void refresh(), 200);
    };
    const scheduleCutoff = () => {
      window.clearTimeout(cutoffTimer);
      const now = Date.now();
      const boundary = storeOrderCutoff(now);
      setOrders(current => current.filter(order => Date.parse(order.storeConfirmedAt ?? order.createdAt) >= boundary));
      cutoffTimer = window.setTimeout(() => {
        scheduleCutoff();
        void refresh();
      }, boundary + DAY - now);
    };
    const onVisible = () => {
      if (document.hidden) return;
      scheduleCutoff();
      void refresh();
    };
    const channel = supabase.channel(`store-orders-queue-${crypto.randomUUID()}`)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'bakery_orders'}, updateSoon)
      .subscribe(status => { if (status === 'SUBSCRIBED') updateSoon(); });
    document.addEventListener('visibilitychange', onVisible);
    onVisible();
    return () => {
      stopped = true;
      generation.current++;
      window.clearTimeout(debounce);
      window.clearTimeout(cutoffTimer);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return {orders, loading, error, refresh};
}
