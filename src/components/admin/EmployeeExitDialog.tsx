import {useState,useRef} from 'react';
import {useAuthStore} from '@/stores/authStore';
import {supabase} from '@/lib/supabase';
import {businessDate} from '@/lib/businessDate';
import {useScrollLock} from '@/hooks/useScrollLock';
type Quote={version:string;year:number;month:number;earned:number;pf:number;deductions:number;net:number;payment?:{amount:number};settlement_scope:string};
export default function EmployeeExitDialog({employee,onClose,onSaved}:{employee:{id:string;name:string};onClose:()=>void;onSaved:()=>void}){
 useScrollLock(true);
 const staff=useAuthStore(s=>s.currentUser?.id);const initialStaff=useRef(staff);const running=useRef(false);
 const key=`employee-exit:${staff}:${employee.id}`;
 const [date,setDate]=useState(businessDate());const [reason,setReason]=useState('');const [quote,setQuote]=useState<Quote|null>(null);
 const [pay,setPay]=useState(false),[mode,setMode]=useState('cash'),[reference,setReference]=useState(''),[reviewed,setReviewed]=useState(false);
 const [pending,setPending]=useState<Record<string,unknown>|null>(()=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function preview(){setBusy(true);setError('');try{const r=await supabase.rpc('employee_exit_quote_v1',{p_employee:employee.id,p_left_on:date});if(r.error)throw Error(r.error.message);setQuote(r.data);setReviewed(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function record(){
  if(busy||running.current)return;
  if(!staff||staff!==initialStaff.current){setError('Your login changed. Close this form and sign in again before recording an exit.');return;}
  if(!pending&&(!quote||!reviewed||!reason.trim()))return;
  if(!pending&&!window.confirm(`Mark ${employee.name} as left from ${date}? Attendance history is preserved; attendance from this date will be blocked.${pay&&!quote?.payment?` Confirm actual salary payment of ₹${quote?.net}.`:' Salary will not be recorded as newly paid.'}`))return;
  running.current=true;setBusy(true);setError('');
  try{
   const request=pending||{p_request:crypto.randomUUID(),p_employee:employee.id,p_left_on:date,p_reason:reason.trim(),p_version:quote!.version,p_pay:pay,p_mode:mode,p_reference:reference,p_reviewed:true};
   localStorage.setItem(key,JSON.stringify(request));setPending(request);
   const r=await supabase.rpc('record_employee_exit_v1',request);
   if(r.error){if(r.error.code&&/^(P000[123]|22|23|42501)/.test(r.error.code)){localStorage.removeItem(key);setPending(null);}throw Error(r.error.message);}
   if(r.data?.employee_id!==employee.id)throw Error('Exit confirmation is incomplete. Retry the saved request.');
   localStorage.removeItem(key);onSaved();
  }catch(e){setError((e as Error).message);}finally{running.current=false;setBusy(false);}
 }
 return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"><section role="dialog" aria-modal="true" aria-label="Employee leaving and settlement" className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-auto rounded-2xl bg-white p-6 text-slate-900"><h2 className="text-xl font-bold">Leaving & final salary — {employee.name}</h2><p className="text-sm">Previous attendance and salary records stay stored. Attendance and meals stop from the leaving date.</p>
 {pending?<p role="status">An exit request is saved and needs confirmation. Leaving date: {String(pending.p_left_on)}. Payment requested: {pending.p_pay?'Yes':'No'}. Mode: {String(pending.p_mode)}. Retry the saved, reviewed request before changing these details.</p>:<>
 <label className="block">Leaving date — no attendance from this date<input className="block w-full rounded border p-2" type="date" max={businessDate()} value={date} onChange={e=>{setDate(e.target.value);setQuote(null);}}/></label>
 <label className="block">Reason<textarea className="block w-full rounded border p-2" value={reason} onChange={e=>setReason(e.target.value)}/></label>
 <button className="rounded border px-4 py-2" disabled={busy||!date} onClick={()=>void preview()}>Calculate final salary</button>
 {quote&&<div className="space-y-3 rounded-xl bg-slate-50 p-4"><p className="font-bold">Payroll {quote.year}-{String(quote.month).padStart(2,'0')}</p><p>Earned ₹{quote.earned} · PF ₹{quote.pf} · Deductions ₹{quote.deductions} · Net ₹{quote.net}</p><p className="text-xs">{quote.settlement_scope}</p>{quote.payment?<p>Already paid: ₹{quote.payment.amount}. This payment will be preserved.</p>:<><label className="block"><input type="checkbox" checked={pay} onChange={e=>setPay(e.target.checked)}/> Record this salary as paid now</label>{pay&&<div className="flex gap-2"><select aria-label="Settlement payment mode" value={mode} onChange={e=>setMode(e.target.value)}>{['cash','upi','card','bank'].map(m=><option key={m}>{m}</option>)}</select><input aria-label="Settlement payment reference" className="rounded border p-2" placeholder="Payment reference" value={reference} onChange={e=>setReference(e.target.value)}/></div>}</>}<label className="block text-sm"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I reviewed the final attendance, deductions and payment status.</label></div>}
 </>}
 {error&&<p role="alert" className="text-red-700">{error}</p>}<div className="flex justify-end gap-3"><button disabled={busy} onClick={onClose}>Close</button><button className="rounded bg-emerald-800 px-4 py-2 text-white disabled:opacity-40" disabled={busy||(!pending&&(!quote||!reviewed||!reason.trim()||(pay&&mode!=='cash'&&!reference.trim())))} onClick={()=>void record()}>{busy?'Saving…':pending?'Retry saved request':'Record leaving & settlement'}</button></div></section></div>;
}
