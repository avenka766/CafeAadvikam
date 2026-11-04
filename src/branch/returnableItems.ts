import type {BranchBillItem} from './branchOpsStore';
export const returnItemKey=(item:Pick<BranchBillItem,'itemName'|'unit'>)=>JSON.stringify([item.itemName.trim().toLowerCase(),item.unit]);
export function returnableItems(items:BranchBillItem[],total:number,previous:{return_no?:string;items?:unknown}[]):BranchBillItem[]{
 const groups=new Map<string,{item:BranchBillItem;quantity:number;value:number;returned:number}>();
 for(const item of items){const key=returnItemKey(item),group=groups.get(key)??{item,quantity:0,value:0,returned:0};group.quantity+=item.quantity;group.value+=item.lineTotal;groups.set(key,group);}
 for(const record of previous){
  if(record.return_no?.includes('-ADV-REF-'))continue;
  if(!Array.isArray(record.items))throw Error('Previous return items need review before another refund.');
  for(const raw of record.items){
   const quantity=Number(raw.quantity);if(!Number.isFinite(quantity)||quantity<0||!raw.itemName)throw Error('Previous return quantities need review.');
   const group=groups.get(returnItemKey({itemName:String(raw.itemName),unit:raw.unit==='kg'?'kg':'pcs'}));if(group)group.returned+=quantity;
  }
 }
 const weight=[...groups.values()].reduce((sum,group)=>sum+group.value,0);
 if(!Number.isFinite(total)||!Number.isFinite(weight)||weight<=0)throw Error('The bill item values need review before a refund.');
 return [...groups.values()].flatMap(group=>{
  const remaining=Math.round((group.quantity-group.returned)*1000)/1000;
  if(remaining<0)throw Error('Recorded returns exceed the sold quantity. Review this bill before refunding.');
  if(!remaining)return [];
  const price=Math.round((total*group.value/weight/group.quantity)*10000)/10000;
  return [{...group.item,quantity:remaining,price,tax:0,discount:0,lineTotal:Math.round(remaining*price*100)/100}];
 });
}
