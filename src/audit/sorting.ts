export type AuditSort = {key:string; direction:'asc'|'desc'};
export function sortAuditRows<T>(rows:T[],sort:AuditSort|null,value:(row:T,key:string)=>unknown):T[]{
 if(!sort)return rows;
 return rows.map((row,index)=>({row,index})).sort((a,b)=>{
  const x=value(a.row,sort.key),y=value(b.row,sort.key);
  // Empty values stay last in both directions; equal values retain source order.
  const empty=(v:unknown)=>v===null||v===undefined||v==='';
  if(empty(x)||empty(y))return empty(x)===empty(y)?a.index-b.index:empty(x)?1:-1;
  const comparison=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),undefined,{numeric:true,sensitivity:'base'});
  return comparison*(sort.direction==='asc'?1:-1)||a.index-b.index;
 }).map(x=>x.row);
}
