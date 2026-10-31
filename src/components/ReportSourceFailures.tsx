import type {ReportReadFailure} from '@/lib/reportReadCache';
export function ReportSourceFailures({failures,busy,onRetry}:{failures:ReportReadFailure[];busy?:boolean;onRetry:(id:string)=>void}){
 if(!failures.length)return null;
 return <section role="alert" className="my-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950"><p className="mb-2 font-bold">Data sources requiring attention</p>{failures.map(f=><div key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-1"><span><strong>{f.id.replaceAll('_',' ')}</strong>: {f.error}</span><button disabled={busy} onClick={()=>onRetry(f.id)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold disabled:opacity-40">Retry this source</button></div>)}</section>;
}
