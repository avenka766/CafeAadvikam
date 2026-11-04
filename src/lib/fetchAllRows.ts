import {supabase} from './supabase';
/** Descending keyset cursors include a unique ID so equal timestamps cannot skip rows. */
export async function fetchAllRows<T = Record<string, unknown>>(
 table:string,build:(query:any)=>any,
 options:{pageSize?:number;maxRows?:number;cursorColumn?:string;cursorIdColumn?:string}={},
):Promise<{data:T[];error:string|null}>{
 const pageSize=Math.min(options.pageSize??1000,1000),maxRows=options.maxRows??50000;
 if(!Number.isInteger(pageSize)||pageSize<=0||!Number.isInteger(maxRows)||maxRows<=0)return {data:[],error:'Invalid pagination limits.'};
 const rows:T[]=[];const column=options.cursorColumn;const idColumn=options.cursorIdColumn??'id';
 if(column&&![column,idColumn].every(v=>/^[a-z_][a-z0-9_]*$/i.test(v)))return {data:[],error:'Invalid pagination cursor column.'};
 let cursor:unknown=null,id:unknown=null;
 for(let offset=0;offset<maxRows;){
  let query=build(supabase.from(table));const size=Math.min(pageSize,maxRows-offset);
  if(column){
   query=query.order(idColumn,{ascending:false});
   if(cursor!==null)query=query.or(`${column}.lt.${JSON.stringify(cursor)},and(${column}.eq.${JSON.stringify(cursor)},${idColumn}.lt.${JSON.stringify(id)})`);
   query=query.limit(size);
  }else query=query.range(offset,offset+size-1);
  const {data,error}=await query;
  if(error)return {data:rows,error:error.message};
  const page=(data??[]) as T[];rows.push(...page);offset+=page.length;
  if(page.length<size)return {data:rows,error:null};
  if(column){
   const last=page[page.length-1] as Record<string,unknown>;
   if(last[column]==null||last[idColumn]==null)return {data:rows,error:`Pagination cursor missing — select() must include ${column} and ${idColumn}.`};
   if(last[column]===cursor&&last[idColumn]===id)return {data:rows,error:'Pagination cursor did not advance. Report is incomplete.'};
   cursor=last[column];id=last[idColumn];
  }
 }
 return {data:rows,error:`Report exceeded its ${maxRows}-record safety limit. Narrow the date range; these results are incomplete.`};
}
