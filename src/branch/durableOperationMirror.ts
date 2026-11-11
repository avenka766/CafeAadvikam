import {supabase} from '@/lib/supabase';
import {useOfflineQueueStore,registerReplayHandler} from '@/lib/offlineQueue';
import {getAppSessionToken} from '@/lib/appSession';
export async function writeOperationMirror(row:unknown){
 try{
  if(!row||typeof row!=='object'||Array.isArray(row))return {ok:false,error:'The saved operation record is invalid and needs review.'};
  const token=getAppSessionToken();
  if(!token){
   window.dispatchEvent(new CustomEvent('cafe:session-expired',{detail:{at:Date.now()}}));
   return {ok:false,waitForSession:true};
  }
  const {error}=await supabase.from('branch_operation_records')
    .upsert(row,{onConflict:'branch,record_type,record_id'}).setHeader('x-cafe-session',token);
  if(!error)return {ok:true};
  if(error.code==='42501'){
   const session=await supabase.rpc('current_app_session_context').setHeader('x-cafe-session',token);
   if(!session.error && Array.isArray(session.data) && !session.data.length){
    if(getAppSessionToken()===token)window.dispatchEvent(new CustomEvent('cafe:session-expired',{detail:{at:Date.now()}}));
    return {ok:false,waitForSession:true};
   }
   if(session.error)return {ok:false,error:'Could not verify the signed-in session. The record is still saved on this device.'};
   return {ok:false,needsReview:true,error:'This record cannot be posted with your current branch permissions. It is saved on this device for review.'};
  }
  return {ok:false,error:error.message};
 }catch(failure){return {ok:false,error:failure instanceof Error?failure.message:'Unable to upload the saved operation.'};}
}
registerReplayHandler('branch_operation_record',async(_kind,payload)=>writeOperationMirror(payload));
export async function persistOperationMirror(row:unknown){
 await useOfflineQueueStore.getState().enqueue('branch_operation_record',row);
 if(navigator.onLine)void useOfflineQueueStore.getState().flush();
}
