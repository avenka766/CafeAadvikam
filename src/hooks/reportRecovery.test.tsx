import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {useCompleteBranchReports} from './useCompleteBranchReports';
import {useBranchLedger} from './useBranchLedger';
import {useSnbAdminReports} from './useSnbAdminReports';
import {ReportReadCache} from '@/lib/reportReadCache';
const mocks=vi.hoisted(()=>({source:vi.fn(),rpc:vi.fn(),table:vi.fn()}));
vi.mock('@/branch/reports/reportSources',async original=>({...await original<typeof import('@/branch/reports/reportSources')>(),loadReportSource:mocks.source}));
vi.mock('@/lib/supabase',()=>({fetchAllRows:vi.fn(),supabase:{rpc:mocks.rpc,from:(table:string)=>{
 const builder:any={then:(resolve:any,reject:any)=>Promise.resolve(mocks.table(table)).then(resolve,reject)};
 for(const method of ['select','eq','gte','lte','lt','order','range','in','limit'])builder[method]=()=>builder;
 return builder;
}}}));
let root:Root;let container:HTMLDivElement;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.append(container);root=createRoot(container);vi.clearAllMocks();});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();});
it('retries a failed source and its dependent items without reloading other report sources',async()=>{
 let report:ReturnType<typeof useCompleteBranchReports>;let failed=true;
 mocks.source.mockImplementation(async(s:any)=>({rows:s.id==='bills'?[{id:'bill'}]:[],status:(s.id==='bills'||s.id==='billItems')&&failed?'error':'ready',error:failed?'timeout':''}));
 function View(){report=useCompleteBranchReports('2026-10-01','2026-10-31',['SNB']);return null;}
 await act(async()=>root.render(<View/>));expect(report!.snapshot.payments.status).toBe('ready');
 mocks.source.mockClear();failed=false;
 await act(async()=>{report!.retrySource('billItems');});
 expect(mocks.source.mock.calls.map(c=>c[0].id)).toEqual(['bills','billItems']);expect(report!.snapshot.bills.status).toBe('ready');expect(report!.snapshot.payments.status).toBe('ready');
});
it('keeps saved closures when the sales ledger times out and only retries that ledger',async()=>{
 vi.useFakeTimers();let report:ReturnType<typeof useBranchLedger>;let failed=true;
 mocks.rpc.mockImplementation(async()=>({data:failed?null:[{branch:'SNB',sales_total:100}],error:failed?{message:'timeout'}:null}));
 mocks.table.mockResolvedValue({data:[{id:'closure',branch:'SNB'}],error:null});
 function View(){report=useBranchLedger('2026-10-02','2026-10-31',['SNB']);return null;}
 await act(async()=>root.render(<View/>));await act(async()=>vi.advanceTimersByTimeAsync(1000));
 expect(report!.savedClosures).toHaveLength(1);expect(report!.failedSources[0].id).toBe('Sales ledger');expect(mocks.table).toHaveBeenCalledTimes(1);
 failed=false;await act(async()=>{report!.retrySource('Sales ledger');});
 expect(report!.closureRows).toHaveLength(1);expect(report!.savedClosures[0].id).toBe('closure');expect(mocks.table).toHaveBeenCalledTimes(1);expect(report!.error).toBe('');
});
it('retries one SNB cashier source while retaining the successful counter sessions',async()=>{
 let report:ReturnType<typeof useSnbAdminReports>;let failed=true;
 mocks.table.mockImplementation(async(name:string)=>name==='snb_counter_calculated_totals'?{data:failed?null:[{bill_count:5}],error:failed?{message:'timeout'}:null}:{data:[{id:'session'}],error:null});
 function View(){report=useSnbAdminReports('2026-10-01','2026-10-31','cashier-report');return null;}
 await act(async()=>root.render(<View/>));expect(report!.counterSessions).toHaveLength(1);expect(report!.failedSources).toHaveLength(1);
 mocks.table.mockClear();failed=false;await act(async()=>{report!.retrySource('Counter totals');});
 expect(mocks.table.mock.calls.map(c=>c[0])).toEqual(['snb_counter_calculated_totals']);expect(report!.counterSessions[0].id).toBe('session');expect(report!.error).toBe('');
});
it('does not let an earlier range overwrite a newly selected report',async()=>{
 let report:ReturnType<typeof useCompleteBranchReports>;let resolveOld:(value:any)=>void;
 mocks.source.mockImplementation((s:any,_b:any,from:string)=>from==='2026-09-01'&&s.id==='bills'?new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve({rows:[{from}],status:'ready',error:''}));
 function View({from}:{from:string}){report=useCompleteBranchReports(from,'2026-10-31',['SNB']);return null;}
 await act(async()=>root.render(<View from="2026-09-01"/>));await act(async()=>root.render(<View from="2026-10-01"/>));
 await act(async()=>resolveOld!({rows:[{from:'OLD'}],status:'ready',error:''}));expect(report!.snapshot.bills.rows[0].from).toBe('2026-10-01');
});
it('caches successful Admin reads and invalidates only the source being retried',async()=>{
 const cache=new ReportReadCache();const good=vi.fn(async()=>({data:[1],error:null}));const bad=vi.fn(async()=>({data:[],error:{message:'timeout'}}));
 await cache.read('Bills','bills',good);await cache.read('Expenses','expenses',bad);cache.retry('Expenses');
 await cache.read('Bills','bills',good);await cache.read('Expenses','expenses',bad);expect(good).toHaveBeenCalledTimes(1);expect(bad).toHaveBeenCalledTimes(2);
 cache.reset();await cache.read('Bills','bills',good);expect(good).toHaveBeenCalledTimes(2);
});
