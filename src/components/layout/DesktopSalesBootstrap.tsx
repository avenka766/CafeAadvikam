import {useEffect,useState} from 'react';
import {useAuthStore} from '@/stores/authStore';
import {desktopSalesAvailable,desktopSalesSnapshot,desktopSalesCall,syncDesktopSales} from '@/bakery/desktopSales';
import {maintainBillingNumbers,syncBillingActions,billingSnapshot,restoreBillingActions,reprintDesktopBill} from '@/lib/desktopBilling';
import {desktopSilentPrint} from '@/lib/platform';
type Saved={id:string;billNo:string;total:number;state:string;error?:string;backupError?:string};
export default function DesktopSalesBootstrap(){
 const user=useAuthStore(s=>s.currentUser);const [message,setMessage]=useState('');const [saved,setSaved]=useState<Saved[]>([]);const [open,setOpen]=useState(false);
 useEffect(()=>{
  if(!desktopSalesAvailable()||!user)return;let active=true,running=false,restored=false;
  const read=async()=>{const [sales,bills]=await Promise.all([desktopSalesSnapshot(user.id),billingSnapshot()]);const rows=[...sales.receipts.map(r=>({id:r.id,billNo:r.billNo,total:r.total,state:r.sync?.state||'pending',error:r.sync?.error||undefined,backupError:r.backupError})),...bills.actions.map(r=>({id:r.id,billNo:r.billNo,total:r.receipt.total,state:r.sync?.state||'pending',error:r.sync?.error,backupError:r.backupError}))];if(active){setSaved(rows.reverse());const pending=rows.filter(r=>r.state!=='synced').length;const failures=rows.filter(r=>r.backupError||r.error);setMessage(failures.length?`${failures.length} saved records need attention. Open Saved bills for details. Original receipts remain on this computer.`:pending?`${pending} bills saved on this computer, waiting to sync.`:'');}return sales;};
  const run=async()=>{if(running||useAuthStore.getState().currentUser?.id!==user.id)return;running=true;const errors:string[]=[];
   const attempt=async(work:()=>Promise<unknown>)=>{try{await work();}catch(error){errors.push((error as Error)?.message||'Connection unavailable');}};
   try{
    if(!restored)await attempt(async()=>{await restoreBillingActions();restored=true;});
    await attempt(async()=>{const repair=await desktopSalesCall<{errors:unknown[];remaining:number}>('repair-backups',{staffId:user.id});if(repair.errors.length)errors.push('Excel backup could not be written. Check available disk space and close open backup files.');});
    if(navigator.onLine){await attempt(()=>syncDesktopSales(user.id));if(useAuthStore.getState().currentUser?.id===user.id){await attempt(()=>syncBillingActions());await attempt(()=>maintainBillingNumbers());}}
    await attempt(()=>read());
    if(active&&errors.length)setMessage(`Saved bills are kept on this computer. ${errors[0]}`);
   }finally{running=false;}};
  void run();const timer=setInterval(()=>void run(),30000);const events=['online','cafe:connectivity','desktop-sales-saved','desktop-billing-saved'];events.forEach(e=>window.addEventListener(e,run));
  return()=>{active=false;clearInterval(timer);events.forEach(e=>window.removeEventListener(e,run));};
 },[user?.id,user?.role]);
 if(!desktopSalesAvailable()||!user)return null;
 const reprint=async(id:string)=>{try{const html=await desktopSalesCall<string|null>('billing-print-copy',{id});if(!html){await reprintDesktopBill(id);return;}const result=await desktopSilentPrint(html);if(!result?.success)throw Error(result?.errorType||'Printing failed');}catch(e){setMessage((e as Error).message);}};
 return <div className="border-b border-slate-200 bg-white px-4 py-2 text-xs text-slate-700"><div className="flex flex-wrap items-center justify-between gap-2"><span role="status">{message}</span><div className="flex gap-3"><button onClick={()=>setOpen(!open)} className="font-bold underline">Saved bills</button><button onClick={()=>void desktopSalesCall('open-backups')} className="underline">Excel backups</button></div></div>{open&&<div className="mt-3 max-h-64 overflow-auto"><table className="w-full text-left"><thead><tr><th>Bill</th><th>Amount</th><th>Sync</th><th/></tr></thead><tbody>{saved.slice(0,200).map(r=><tr key={r.id} className="border-t border-amber-200"><td className="py-2">{r.billNo}</td><td>₹{Number(r.total).toFixed(2)}</td><td>{r.backupError?`Excel backup needs attention: ${r.backupError}`:r.state==='synced'?'Synced':r.error||'Waiting for connection'}</td><td><button className="underline" onClick={()=>void reprint(r.id)}>Reprint</button></td></tr>)}</tbody></table>{!saved.length&&<p className="py-2">No bills saved on this computer yet.</p>}</div>}</div>;
}
