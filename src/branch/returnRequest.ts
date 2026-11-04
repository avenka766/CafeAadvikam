import {supabase} from '@/lib/supabase';
import type {BranchBillItem} from './branchOpsStore';
export type ReturnRequestInput={p_branch:string;p_bill_no:string;p_payment_mode:string;p_reason:string;p_items:BranchBillItem[]};
export type ConfirmedReturn={id:string;returnNo:string;amount:number;items:BranchBillItem[];refundAmount:number;creditAdjusted:number;refundMode?:string;createdAt:string;duplicate?:boolean;cashierUserId?:string;counterSessionId?:string|null};
const stable=(value:unknown)=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const keyFor=(staff:string,branch:string,bill:string)=>`branch-return:${staff}:${branch}:${bill}`;
export function pendingBranchReturn(staff:string,branch:string,bill:string):ReturnRequestInput|null{
 const raw=localStorage.getItem(keyFor(staff,branch,bill));if(!raw)return null;
 const request=JSON.parse(raw);if(!request.p_request||request.p_branch!==branch||request.p_bill_no!==bill)throw Error('Saved return request needs review. It has not been removed.');
 const {p_request:_id,...input}=request;return input;
}
export async function saveBranchReturn(staff:string,input:ReturnRequestInput):Promise<ConfirmedReturn>{
 if(!staff)throw Error('Sign in before returning a bill.');
 const key=keyFor(staff,input.p_branch,input.p_bill_no),raw=localStorage.getItem(key);
 const request=raw?JSON.parse(raw):{...input,p_request:crypto.randomUUID()};
 const {p_request,...savedInput}=request;
 if(!p_request||stable(savedInput)!==stable(input))throw Error('A return for this bill is awaiting confirmation. Reload the bill to restore and retry that saved return first.');
 if(!raw)localStorage.setItem(key,JSON.stringify(request));
 const {data,error}=await supabase.rpc('process_branch_return_once_v1',request);
 if(error){
  if(error.code&&/^(P0001|22[0-9A-Z]{3}|23[0-9A-Z]{3}|42501)$/.test(error.code)&&!error.message.includes('REQUEST_ALREADY_USED')&&!error.message.includes('REQUIRES_RECONCILIATION'))localStorage.removeItem(key);
  throw Error(error.code?error.message:`Return confirmation was lost: ${error.message}. The saved return may already be recorded. Retry it before issuing any refund.`);
 }
 if(!data?.id||!String(data.returnNo||'').startsWith(`${input.p_branch}-RET-`)||!Array.isArray(data.items)||![data.amount,data.refundAmount,data.creditAdjusted].every(v=>Number.isFinite(Number(v))&&Number(v)>=0)||Math.abs(Number(data.amount)-Number(data.refundAmount)-Number(data.creditAdjusted))>0.005||data.items.some(i=>!Number.isFinite(Number(i.quantity))||Number(i.quantity)<=0||!Number.isFinite(Number(i.lineTotal))||Number(i.lineTotal)<0)||Math.abs(data.items.reduce((sum,i)=>sum+Number(i.lineTotal),0)-Number(data.amount))>0.005)throw Error('Return confirmation is incomplete. Retry the saved return; do not issue another refund.');
 localStorage.removeItem(key);return data as ConfirmedReturn;
}
