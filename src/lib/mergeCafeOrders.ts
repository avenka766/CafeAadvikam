import type {Order} from '@/types';

// Pending local receipts win over stale fetches and realtime events until their own upload is confirmed.
export function mergeCafeOrders(current:Order[],incoming:Order[],replace=false,deletedIds=new Set<string>()){
 const same=(a:Order,b:Order)=>a.id===b.id||(a.orderNumber>0&&a.orderNumber===b.orderNumber);
 const selected:Order[]=[];
 for(const remote of incoming){
  const local=current.find(o=>same(o,remote));
  const row=local&&(local.pendingSync||Date.parse(local.updatedAt)>Date.parse(remote.updatedAt))?local:remote;
  const index=selected.findIndex(o=>same(o,row));if(index>=0)selected[index]=row;else selected.push(row);
 }
 for(const local of current){
  if(selected.some(o=>same(o,local)))continue;
  if(local.pendingSync||(!replace&&!deletedIds.has(local.id)))selected.push(local);
 }
 return selected.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
