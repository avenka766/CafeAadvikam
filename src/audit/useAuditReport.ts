import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {AUDIT_SOURCES,type AuditSnapshot,type AuditRaw,type AuditSourceId} from './sources';
export async function loadAuditSource(source:string,from:string,to:string,branch:string|null,asOf:string,cancelled:()=>boolean,onProgress?:(count:number)=>void){
 const rows:AuditRaw[]=[];let cursor:string|null=null;const cursors=new Set<string>();
 for(;;){
  if(cancelled())throw Error('Report cancelled');
  const response=await supabase.rpc('audit_finance_page',{p_source:source,p_from:from,p_to:to,p_branch:branch,p_after:cursor,p_as_of:asOf});
  if(response.error)throw Error(`${response.error.code || ''} ${response.error.message}`.trim());
  const page=response.data as {source:string;rows:AuditRaw[];next:string|null;asOf:string;scope:string};
  if(!page||page.source!==source||!Array.isArray(page.rows))throw Error('Invalid report response. Refresh before using these totals.');
  rows.push(...page.rows);onProgress?.(rows.length);cursor=page.next;
  if(cursor){if(cursors.has(cursor)||!page.rows.length)throw Error('Report pagination did not advance; export blocked to avoid missing records.');cursors.add(cursor);}
  if(!cursor)return {rows,status:'ready' as const,error:'',scope:page.scope};
 }
}
const allSourceIds=AUDIT_SOURCES.map(s=>s.id);
export function useAuditReport(from:string,to:string,branch:string,revision:number,sourceIds:AuditSourceId[]=allSourceIds){
 const sources=useMemo(()=>AUDIT_SOURCES.filter(s=>sourceIds.includes(s.id)),[sourceIds]);const sourceKey=sourceIds.join(',');
 const[snapshot,setSnapshot]=useState<AuditSnapshot>({});const[initial,setInitial]=useState(true);const[loadedAt,setLoadedAt]=useState('');const[loadedFor,setLoadedFor]=useState('');const requestedKey=[from,to,branch,revision,sourceKey].join('|');
 const run=useRef<{key:string;from:string;to:string;branch:string;asOf:string;active:Set<AuditSourceId>}|null>(null);
 const loadSources=useCallback(async(ids:AuditSourceId[],context:NonNullable<typeof run.current>)=>{
  const selected=ids.filter(id=>!context.active.has(id));selected.forEach(id=>context.active.add(id));
  if(run.current!==context)return;
  setSnapshot(current=>{const next={...current};selected.forEach(id=>{next[id]={...next[id],rows:next[id]?.rows||[],status:'loading',error:''};});return next;});
  let index=0;
  const worker=async()=>{while(index<selected.length&&run.current===context){const id=selected[index++];let result;try{result=await loadAuditSource(id,context.from,context.to,context.branch==='All'?null:context.branch,context.asOf,()=>run.current!==context);}catch(e){result={rows:[],status:'error' as const,error:(e as Error).message};}context.active.delete(id);if(run.current===context)setSnapshot(current=>({...current,[id]:result}));}};
  await Promise.all([worker(),worker()]);
  if(run.current===context){setLoadedAt(new Date().toISOString());setLoadedFor(context.key);}
 },[]);
 useEffect(()=>{
  const context={key:requestedKey,from,to,branch,asOf:new Date().toISOString(),active:new Set<AuditSourceId>()};run.current=context;
  const next:AuditSnapshot={};sources.forEach(s=>{next[s.id]={rows:[],status:'loading',error:''};});setSnapshot(next);setInitial(true);setLoadedAt('');
  if(!from||!to||from>to){sources.forEach(s=>{next[s.id]={rows:[],status:'error',error:'Choose a valid date range.'};});setSnapshot({...next});setInitial(false);setLoadedFor(requestedKey);return()=>{if(run.current===context)run.current=null;};}
  void loadSources(sourceIds,context).then(()=>{if(run.current===context)setInitial(false);});
  return()=>{if(run.current===context)run.current=null;};
 },[from,to,branch,revision,requestedKey,loadSources,sourceIds,sources]);
 const retrySource=useCallback((id:AuditSourceId)=>{const context=run.current;if(context&&context.key===requestedKey)return loadSources([id],context);},[loadSources,requestedKey]);
 const retryFailed=useCallback(()=>{const context=run.current;if(context&&context.key===requestedKey)return loadSources(sources.filter(s=>snapshot[s.id]?.status==='error').map(s=>s.id),context);},[loadSources,requestedKey,snapshot,sources]);
 const initialLoading=initial||loadedFor!==requestedKey;const refreshing=sources.some(s=>snapshot[s.id]?.status==='loading');
 return {snapshot,loading:initialLoading||refreshing,initialLoading,reloading:!initialLoading&&refreshing,loadedAt,ready:sources.filter(s=>snapshot[s.id]?.status==='ready').length,errors:sources.filter(s=>snapshot[s.id]?.status==='error'),retrySource,retryFailed};
}
