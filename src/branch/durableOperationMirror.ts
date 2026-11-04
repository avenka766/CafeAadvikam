import {supabase} from '@/lib/supabase';
import {useOfflineQueueStore,registerReplayHandler} from '@/lib/offlineQueue';
export async function writeOperationMirror(row:unknown){
 try{
  if(!row||typeof row!=='object'||Array.isArray(row))return {ok:false,error:'The saved operation record is invalid and needs review.'};
  const {error}=await supabase.from('branch_operation_records').upsert(row,{onConflict:'branch,record_type,record_id'});
  return error?{ok:false,error:error.message}:{ok:true};
 }catch(failure){return {ok:false,error:failure instanceof Error?failure.message:'Unable to upload the saved operation.'};}
}
registerReplayHandler('branch_operation_record',async(_kind,payload)=>writeOperationMirror(payload));
export async function persistOperationMirror(row:unknown){
 await useOfflineQueueStore.getState().enqueue('branch_operation_record',row);
 if(navigator.onLine)void useOfflineQueueStore.getState().flush();
}
