import {fetchAllRows} from './supabase';
/** Bound URL length as well as response pages for large linked reports. */
export async function fetchRowsForIds<T=Record<string,unknown>>(table:string,column:string,ids:string[],fields:string,concurrency=1):Promise<{data:T[];error:string|null}>{
 const keys=[...new Set(ids.filter(Boolean))].sort();const data:T[]=[];
 const workers=Math.max(1,Math.min(3,Math.floor(concurrency)||1));
 for(let offset=0;offset<keys.length;offset+=150*workers){
  let results:Awaited<ReturnType<typeof fetchAllRows<T>>>[];
  try{results=await Promise.all(Array.from({length:workers},(_,worker)=>keys.slice(offset+worker*150,offset+(worker+1)*150)).filter(batch=>batch.length).map(batch=>fetchAllRows<T>(table,q=>q.select(fields).in(column,batch).order('id'))));}
  catch(cause){return {data:[],error:cause instanceof Error?cause.message:'Linked report request failed.'};}
  for(const result of results){
  if(result.error)return {data:[],error:result.error};
  data.push(...result.data);
  if(data.length>50000)return {data:[],error:'Linked report exceeded its 50,000-row safety limit. Narrow the date range.'};
  }
 }
 return {data,error:null};
}
