import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({upsert:vi.fn(),context:vi.fn(),token:vi.fn(),enqueue:vi.fn(),flush:vi.fn()}));
vi.mock('@/lib/appSession',()=>({getAppSessionToken:mocks.token}));
vi.mock('@/lib/supabase',()=>({supabase:{
 from:()=>({upsert:(...args:unknown[])=>({setHeader:(...headers:unknown[])=>mocks.upsert(args,headers)})}),
 rpc:()=>({setHeader:mocks.context}),
}}));
vi.mock('@/lib/offlineQueue',()=>({useOfflineQueueStore:{getState:()=>({enqueue:mocks.enqueue,flush:mocks.flush})},registerReplayHandler:vi.fn()}));
import {persistOperationMirror,writeOperationMirror} from './durableOperationMirror';
beforeEach(()=>{mocks.upsert.mockReset();mocks.context.mockReset();mocks.token.mockReset().mockReturnValue('session');mocks.enqueue.mockReset();mocks.flush.mockReset().mockResolvedValue(undefined);vi.spyOn(navigator,'onLine','get').mockReturnValue(true);});
it('does not treat a table/schema/permission error as a saved financial record',async()=>{
 for(const message of ['permission denied for branch_operation_records','branch_operation_records schema cache missing','statement timeout']){
  mocks.upsert.mockResolvedValueOnce({error:{message}});expect(await writeOperationMirror({})).toEqual({ok:false,error:message});
 }
});
it('returns a transport failure for retry instead of losing the operation',async()=>{
 mocks.upsert.mockRejectedValue(Error('Connection lost'));expect(await writeOperationMirror({})).toEqual({ok:false,error:'Connection lost'});
});
it('waits for the original session and uses that session for the entire replay',async()=>{
 mocks.token.mockReturnValue(null);
 expect(await writeOperationMirror({})).toMatchObject({waitForSession:true});
 expect(mocks.upsert).not.toHaveBeenCalled();
 mocks.token.mockReturnValue('original');
 mocks.upsert.mockResolvedValue({error:{code:'42501'}});
 mocks.context.mockResolvedValue({data:[{staff_id:'snb-staff'}],error:null});
 expect(await writeOperationMirror({})).toMatchObject({needsReview:true});
 expect(mocks.upsert.mock.calls[0][1]).toEqual(['x-cafe-session','original']);
 expect(mocks.context).toHaveBeenCalledWith('x-cafe-session','original');
});
it('requests sign-in for an expired session without marking a legitimate record permanently rejected',async()=>{
 mocks.upsert.mockResolvedValue({error:{code:'42501'}});
 mocks.context.mockResolvedValue({data:[],error:null});
 const expired=vi.fn();
 window.addEventListener('cafe:session-expired',expired,{once:true});
 expect(await writeOperationMirror({})).toMatchObject({waitForSession:true});
 expect(expired).toHaveBeenCalledTimes(1);
});
it('persists before starting an online upload',async()=>{
 let saved=false;mocks.enqueue.mockImplementation(async()=>{saved=true;});mocks.flush.mockImplementation(async()=>{expect(saved).toBe(true);});
 const row={record_type:'expense',record_id:'one',amount:100};await persistOperationMirror(row);
 expect(mocks.enqueue).toHaveBeenCalledWith('branch_operation_record',row);expect(mocks.flush).toHaveBeenCalledTimes(1);
});
it('does not upload or report success when local durability fails',async()=>{
 mocks.enqueue.mockRejectedValue(Error('Disk full'));await expect(persistOperationMirror({})).rejects.toThrow('Disk full');expect(mocks.flush).not.toHaveBeenCalled();
});
