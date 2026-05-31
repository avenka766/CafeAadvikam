// src/bakery/IncomingDebugPage.tsx
// DROP THIS FILE IN, add a route /debug/incoming, and open it in browser.
// It shows exactly what's in branch_incoming and bakery_orders dispatch_log,
// and lets you manually trigger the write.

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Row { id: string; dispatch_id: string | null; branch: string; item_name: string; quantity: number; unit: string; confirmed: boolean; received_at: string; dispatched_by: string; }
interface DispatchEntry { id: string; itemName: string; quantity: number; unit?: string; branch: string; dispatchedAt: string; dispatchedBy: string; }
interface Order { id: string; order_number: number; status: string; dispatch_log: DispatchEntry[]; }

export default function IncomingDebugPage() {
  const [branch, setBranch] = useState('VRSNB');
  const [rows, setRows] = useState<Row[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addLog = (msg: string) => setLog(p => [msg, ...p]);

  const fetchIncoming = async () => {
    setLoading(true);
    addLog(`Fetching branch_incoming for branch=${branch}...`);
    const { data, error } = await supabase
      .from('branch_incoming')
      .select('*')
      .eq('branch', branch)
      .order('received_at', { ascending: false });
    if (error) addLog(`ERROR: ${error.message} | code: ${error.code}`);
    else {
      addLog(`Found ${data.length} rows in branch_incoming`);
      setRows(data as Row[]);
    }
    setLoading(false);
  };

  const fetchOrders = async () => {
    setLoading(true);
    addLog(`Fetching bakery_orders with dispatch_log...`);
    const { data, error } = await supabase
      .from('bakery_orders')
      .select('id, order_number, status, dispatch_log')
      .not('dispatch_log', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) addLog(`ERROR: ${error.message}`);
    else {
      const withDispatches = (data as Order[]).filter(o => o.dispatch_log?.length > 0);
      addLog(`Found ${data.length} orders, ${withDispatches.length} have dispatch_log entries`);
      withDispatches.forEach(o => {
        const forBranch = o.dispatch_log.filter(e => e.branch === branch);
        addLog(`  Order #${o.order_number} (${o.status}): ${o.dispatch_log.length} total dispatch entries, ${forBranch.length} for ${branch}`);
        forBranch.forEach(e => addLog(`    → ${e.itemName} ${e.quantity} ${e.unit ?? 'kg'} | dispatch_id=${e.id}`));
      });
      setOrders(withDispatches);
    }
    setLoading(false);
  };

  const testInsert = async () => {
    setLoading(true);
    const testId = crypto.randomUUID();
    addLog(`Testing plain INSERT into branch_incoming with dispatch_id=${testId}...`);
    const { error } = await supabase.from('branch_incoming').insert({
      dispatch_id:   testId,
      branch,
      item_name:     'DEBUG_TEST_ITEM',
      quantity:      1,
      unit:          'kg',
      received_at:   new Date().toISOString(),
      dispatched_by: 'DebugPage',
      confirmed:     false,
    });
    if (error) addLog(`INSERT ERROR: ${error.message} | code: ${error.code} | hint: ${error.hint}`);
    else addLog(`INSERT SUCCESS — row written! dispatch_id=${testId}`);
    setLoading(false);
  };

  const testUpsert = async () => {
    setLoading(true);
    const testId = crypto.randomUUID();
    addLog(`Testing UPSERT onConflict:dispatch_id into branch_incoming...`);
    const { error } = await supabase.from('branch_incoming').upsert({
      dispatch_id:   testId,
      branch,
      item_name:     'DEBUG_UPSERT_ITEM',
      quantity:      1,
      unit:          'kg',
      received_at:   new Date().toISOString(),
      dispatched_by: 'DebugPage',
      confirmed:     false,
    }, { onConflict: 'dispatch_id' });
    if (error) addLog(`UPSERT ERROR: ${error.message} | code: ${error.code} | hint: ${error.hint}`);
    else addLog(`UPSERT SUCCESS`);
    setLoading(false);
  };

  const syncFromDispatchLog = async () => {
    setLoading(true);
    addLog(`Syncing all dispatch_log entries for ${branch} → branch_incoming...`);
    const { data: existing } = await supabase.from('branch_incoming').select('dispatch_id').eq('branch', branch);
    const existingIds = new Set((existing || []).map(r => r.dispatch_id).filter(Boolean));
    addLog(`  ${existingIds.size} dispatch_ids already in branch_incoming`);

    const { data: ordersData } = await supabase.from('bakery_orders').select('id, dispatch_log').not('dispatch_log', 'is', null);
    let inserted = 0, skipped = 0, errors = 0;
    for (const order of (ordersData || [])) {
      const log_ = (order.dispatch_log || []) as DispatchEntry[];
      for (const e of log_.filter(e => e.branch === branch)) {
        if (existingIds.has(e.id)) { skipped++; continue; }
        const { error } = await supabase.from('branch_incoming').insert({
          dispatch_id: e.id, branch, item_name: e.itemName,
          quantity: e.quantity, unit: e.unit ?? 'kg',
          received_at: e.dispatchedAt, dispatched_by: e.dispatchedBy, confirmed: false,
        });
        if (error) { addLog(`  INSERT ERROR for ${e.itemName}: ${error.message} | code: ${error.code}`); errors++; }
        else { inserted++; }
      }
    }
    addLog(`  Done: ${inserted} inserted, ${skipped} skipped (already exist), ${errors} errors`);
    await fetchIncoming();
    setLoading(false);
  };

  const deleteTestRows = async () => {
    await supabase.from('branch_incoming').delete().eq('dispatched_by', 'DebugPage');
    addLog('Deleted debug test rows');
    await fetchIncoming();
  };

  return (
    <div style={{ fontFamily: 'monospace', padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>🔍 branch_incoming Debug</h1>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={branch} onChange={e => setBranch(e.target.value)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ccc' }}>
          <option>VRSNB</option><option>SNB</option><option>Hosur</option><option>Cafe</option>
        </select>
        <button onClick={fetchIncoming} disabled={loading} style={btn('#2563eb')}>1. Fetch branch_incoming</button>
        <button onClick={fetchOrders} disabled={loading} style={btn('#7c3aed')}>2. Fetch dispatch_logs</button>
        <button onClick={testInsert} disabled={loading} style={btn('#059669')}>3. Test INSERT</button>
        <button onClick={testUpsert} disabled={loading} style={btn('#d97706')}>4. Test UPSERT</button>
        <button onClick={syncFromDispatchLog} disabled={loading} style={btn('#dc2626')}>5. Force sync all → branch_incoming</button>
        <button onClick={deleteTestRows} disabled={loading} style={btn('#6b7280')}>Delete test rows</button>
      </div>

      <div style={{ background: '#111', color: '#0f0', padding: 12, borderRadius: 8, minHeight: 120, maxHeight: 300, overflowY: 'auto', fontSize: 12, marginBottom: 16 }}>
        {log.length === 0 ? <span style={{ color: '#666' }}>Click buttons above to start debugging...</span> : log.map((l, i) => <div key={i}>{l}</div>)}
      </div>

      {rows.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>branch_incoming ({rows.length} rows for {branch})</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr style={{ background: '#f3f4f6' }}>{['dispatch_id','item_name','qty','unit','confirmed','received_at','dispatched_by'].map(h => <th key={h} style={{ padding: '4px 8px', textAlign: 'left', border: '1px solid #e5e7eb' }}>{h}</th>)}</tr></thead>
            <tbody>{rows.map(r => <tr key={r.id} style={{ background: r.confirmed ? '#f0fdf4' : '#fff' }}>
              <td style={td}>{r.dispatch_id ? r.dispatch_id.slice(0, 8) + '...' : 'NULL'}</td>
              <td style={td}>{r.item_name}</td>
              <td style={td}>{r.quantity}</td>
              <td style={td}>{r.unit}</td>
              <td style={{ ...td, color: r.confirmed ? 'green' : 'red', fontWeight: 'bold' }}>{String(r.confirmed)}</td>
              <td style={td}>{new Date(r.received_at).toLocaleString('en-IN')}</td>
              <td style={td}>{r.dispatched_by}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const btn = (bg: string) => ({ padding: '6px 14px', background: bg, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' });
const td: React.CSSProperties = { padding: '4px 8px', border: '1px solid #e5e7eb' };
