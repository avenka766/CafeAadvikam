import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({upsert:vi.fn(),enqueue:vi.fn(),flush:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabase:{from:()=>({upsert:mocks.upsert})}}));
vi.mock('@/lib/offlineQueue',()=>({useOfflineQueueStore:{getState:()=>({enqueue:mocks.enqueue,flush:mocks.flush})},registerReplayHandler:vi.fn()}));
import {persistOperationMirror,writeOperationMirror} from './durableOperationMirror';
beforeEach(()=>{mocks.upsert.mockReset();mocks.enqueue.mockReset();mocks.flush.mockReset().mockResolvedValue(undefined);vi.spyOn(navigator,'onLine','get').mockReturnValue(true);});
it('does not treat a table/schema/permission error as a saved financial record',async()=>{
 for(const message of ['permission denied for branch_operation_records','branch_operation_records schema cache missing','statement timeout']){
  mocks.upsert.mockResolvedValueOnce({error:{message}});expect(await writeOperationMirror({})).toEqual({ok:false,error:message});
 }
});
it('returns a transport failure for retry instead of losing the operation',async()=>{
 mocks.upsert.mockRejectedValue(Error('Connection lost'));expect(await writeOperationMirror({})).toEqual({ok:false,error:'Connection lost'});
});
it('persists before starting an online upload',async()=>{
 let saved=false;mocks.enqueue.mockImplementation(async()=>{saved=true;});mocks.flush.mockImplementation(async()=>{expect(saved).toBe(true);});
 const row={record_type:'expense',record_id:'one',amount:100};await persistOperationMirror(row);
 expect(mocks.enqueue).toHaveBeenCalledWith('branch_operation_record',row);expect(mocks.flush).toHaveBeenCalledTimes(1);
});
it('does not upload or report success when local durability fails',async()=>{
 mocks.enqueue.mockRejectedValue(Error('Disk full'));await expect(persistOperationMirror({})).rejects.toThrow('Disk full');expect(mocks.flush).not.toHaveBeenCalled();
});
