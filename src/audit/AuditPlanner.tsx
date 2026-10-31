import {AuditVisuals} from './AuditVisuals';
import {useMemo,useState} from 'react';
import {buildAuditPlanner} from './planner';
import {AuditTable} from './AuditTable';
import {plannerInvoiceColumns,plannerLineColumns,plannerOrderColumns} from './plannerColumns';
import type {AuditSnapshot} from './sources';
export function AuditPlanner({snapshot,from,to,loading}:{snapshot:AuditSnapshot;from:string;to:string;loading:boolean}){
 const report=useMemo(()=>buildAuditPlanner(snapshot,from,to),[snapshot,from,to]);const[view,setView]=useState('All invoices');
 const options=['All invoices','Sales / Festival','Hosur','Branch / cake TO','Orders & dispatches','Invoice item details'];
 const rows=view==='Orders & dispatches'?report.orders:view==='Invoice item details'?report.lines:view==='All invoices'?report.invoices:report.invoices.filter(r=>r.type===view||(view==='Sales / Festival'&&r.type==='Planner advance settlement'));
 return <div className="space-y-4"><p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-600">Planner sales, Hosur invoices and branch TOs are labelled separately. Advance and cake orders are together under Orders &amp; dispatches, linked only by saved order/dispatch IDs or the branch receipt’s order number. Invoice registers use the selected dates; order rows include orders placed or dispatched within those dates. Order values and internal TOs are not added again to sales.</p><div className="flex flex-wrap gap-2">{options.map(name=><button key={name} onClick={()=>setView(name)} className={`rounded-full px-3 py-2 text-xs font-semibold ${view===name?'bg-[#153e36] text-white':'border border-slate-200 bg-white text-slate-600'}`}>{name}</button>)}</div><AuditVisuals rows={rows} loading={loading} groupKey={view==='Invoice item details'?'type':'branch'} countKey={view==='Orders & dispatches'?'dispatchStatus':'type'} valueKey={view==='Orders & dispatches'?'value':view==='Invoice item details'?'amount':'total'} metric={view==='Orders & dispatches'?'Order value INR':view==='Invoice item details'?'Item value INR':'Invoice face value INR (includes internal TOs)'}/><AuditTable key={view} title={`Planner · ${view}`} columns={view==='Orders & dispatches'?plannerOrderColumns:view==='Invoice item details'?plannerLineColumns:plannerInvoiceColumns} rows={rows} loading={loading}/></div>;
}
