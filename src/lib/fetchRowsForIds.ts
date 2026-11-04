import {fetchAllRows} from './supabase';
/** Bound URL length as well as response pages for large linked reports. */
export async function fetchRowsForIds<T=Record<string,unknown>>(table:string,column:string,ids:string[],fields:string):Promise<{data:T[];error:string|null}>{
 const keys=[...new Set(ids.filter(Boolean))].sort();const data:T[]=[];
 for(let offset=0;offset<keys.length;offset+=150){
  const batch=keys.slice(offset,offset+150);
  let result:Awaited<ReturnType<typeof fetchAllRows<T>>>;
  try{result=await fetchAllRows<T>(table,q=>q.select(fields).in(column,batch).order('id'));}
  catch(cause){return {data:[],error:cause instanceof Error?cause.message:'Linked report request failed.'};}
  if(result.error)return {data:[],error:result.error};
  data.push(...result.data);
  if(data.length>50000)return {data:[],error:'Linked report exceeded its 50,000-row safety limit. Narrow the date range.'};
 }
 return {data,error:null};
}
