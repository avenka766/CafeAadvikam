import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {supabase} from '@/lib/supabase';
import {useAuditReport} from './useAuditReport';
import {AUDIT_SOURCES} from './sources';
it('retries only failed or selected sources while keeping ready data and the same cutoff',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);let fail=true;let report:ReturnType<typeof useAuditReport>;
 const rpc=vi.spyOn(supabase,'rpc').mockImplementation(((_name:unknown,args:any)=>Promise.resolve(args.p_source==='operations'&&fail?{data:null,error:{code:'57014',message:'timeout'}}:{data:{source:args.p_source,rows:[{id:args.p_source}],next:null,scope:'IST'},error:null})) as never);
 const host=document.createElement('div');const root=createRoot(host);
 function Harness(){report=useAuditReport('2026-10-01','2026-10-30','All',0);return null;}
 try{
  await act(async()=>root.render(<Harness/>));expect(report!.ready).toBe(AUDIT_SOURCES.length-1);expect(report!.errors.map(s=>s.id)).toEqual(['operations']);
  const readyRows=report!.snapshot.branch_bills!.rows;const cutoff=(rpc.mock.calls[0][1] as any).p_as_of;rpc.mockClear();fail=false;
  await act(async()=>{await report!.retryFailed();});expect(rpc).toHaveBeenCalledTimes(1);expect((rpc.mock.calls[0][1] as any)).toMatchObject({p_source:'operations',p_as_of:cutoff});expect(report!.snapshot.branch_bills!.rows).toBe(readyRows);expect(report!.ready).toBe(AUDIT_SOURCES.length);
  rpc.mockClear();await act(async()=>{await report!.retrySource('bill_references');});expect(rpc).toHaveBeenCalledTimes(1);expect((rpc.mock.calls[0][1] as any).p_source).toBe('bill_references');expect(report!.snapshot.branch_bills!.rows).toBe(readyRows);
 }finally{await act(async()=>root.unmount());rpc.mockRestore();vi.unstubAllGlobals();}
});
