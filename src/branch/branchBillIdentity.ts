export function dedupeBranchBills<T extends {id:string;branch:string;billNo:string;sourceBillId?:string;pendingSync?:boolean}>(rows:T[]):T[]{
 const bills=new Map<string,T>();
 const score=(b:T)=>b.sourceBillId===b.id?3:b.sourceBillId?2:b.pendingSync?0:1;
 for(const bill of rows){
  const key=bill.billNo?`${bill.branch}:${bill.billNo}`:`id:${bill.id}`;
  const previous=bills.get(key);if(!previous||score(bill)>score(previous))bills.set(key,bill);
 }
 return [...bills.values()];
}
