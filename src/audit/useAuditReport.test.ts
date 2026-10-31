import {afterEach,it,expect,vi} from 'vitest';
import {supabase} from '@/lib/supabase';
import {loadAuditSource} from './useAuditReport';
afterEach(()=>vi.restoreAllMocks());
it('loads every page using stable cursors and keeps the same business-date scope',async()=>{
 const rpc=vi.spyOn(supabase,'rpc').mockResolvedValueOnce({data:{source:'branch_bills',rows:Array.from({length:500},(_,i)=>({id:String(i)})),next:'499',scope:'IST'},error:null} as never).mockResolvedValueOnce({data:{source:'branch_bills',rows:Array.from({length:500},(_,i)=>({id:String(i+500)})),next:'999',scope:'IST'},error:null} as never).mockResolvedValueOnce({data:{source:'branch_bills',rows:Array.from({length:201},(_,i)=>({id:String(i+1000)})),next:null,scope:'IST'},error:null} as never);
 const result=await loadAuditSource('branch_bills','2026-10-01','2026-10-31','SNB','2026-11-01T00:00:00Z',()=>false);expect(result.status).toBe('ready');expect(result.rows).toHaveLength(1201);expect(rpc.mock.calls.map(c=>(c[1] as any).p_after)).toEqual([null,'499','999']);expect((rpc.mock.calls[2][1] as any).p_branch).toBe('SNB');
});
it('fails closed instead of returning a partial report after a later-page timeout',async()=>{
 vi.spyOn(supabase,'rpc').mockResolvedValueOnce({data:{source:'branch_bills',rows:[{id:'one'}],next:'one'},error:null} as never).mockResolvedValueOnce({data:null,error:{code:'57014',message:'statement timeout'}} as never);
 await expect(loadAuditSource('branch_bills','2026-10-01','2026-10-31',null,'2026-11-01T00:00:00Z',()=>false)).rejects.toThrow('57014');
});
it('detects a non-advancing cursor instead of looping or silently truncating',async()=>{
 vi.spyOn(supabase,'rpc').mockResolvedValue({data:{source:'branch_bills',rows:[{id:'one'}],next:'one'},error:null} as never);
 await expect(loadAuditSource('branch_bills','2026-10-01','2026-10-31',null,'2026-11-01T00:00:00Z',()=>false)).rejects.toThrow('did not advance');
});
