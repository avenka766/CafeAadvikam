import {expect,it} from 'vitest';
import {buildCashierSalesRows,type CashierPayment} from './cashierSalesReport';
import type {BranchBillRecord,ReturnRecord} from '@/branch/branchOpsStore';
const bill=(no:string,total:number,date:string,more:Partial<BranchBillRecord>={})=>({id:no,billNo:no,biller:'SNB Billing 3',salesperson:'Harish V',createdAt:date,total,discount:0,paymentMode:'upi',counterSessionId:'old-16-oct-session',...more} as BranchBillRecord);
const bills=[bill('SNB-44091',60,'2026-10-16T11:36:21Z',{discount:10.5}),bill('SNB-44198',8064,'2026-10-16T14:42:34Z',{discount:240}),bill('SNB-44207',2090,'2026-10-16T14:59:39Z',{source:'advance-final'}),bill('SNB-44255',4744,'2026-10-17T04:08:26Z',{paymentMode:'cash'})];
const payment=(id:string,amount:number,purpose:string,mode='upi')=>({id,bill_id:id,payment_mode:mode,payment_purpose:purpose,amount,cashier_username:'SNB Billing 3',created_at:'2026-10-16T11:00:00Z'} as CashierPayment);
it('reconciles 16 October to three invoices, excluding the next-day bill on the same session',()=>{
 const day16=bills.filter(b=>b.createdAt<'2026-10-16T18:30:00Z');
 const row=buildCashierSalesRows(day16,[],[payment('SNB-44091',60,'bill_collection'),payment('SNB-44198',8064,'bill_collection'),payment('SNB-44207',1090,'advance_balance')],[])[0];
 expect(row).toMatchObject({bills:3,grossSales:10214,discount:250.5,netSales:10214,cash:0,upi:9214,advanceBalance:1090,totalAmount:9214,sessions:1});
 const day17=buildCashierSalesRows([bills[3]],[],[payment('SNB-44255',4744,'bill_collection','cash')],[])[0];expect(day17).toMatchObject({bills:1,grossSales:4744,cash:4744});
});
it('does not count advances or credit settlements as new sales',()=>{
 const row=buildCashierSalesRows([bill('credit',100,'2026-10-16T10:00:00Z',{paymentMode:'credit'})],[],[payment('credit',20,'credit_upfront','cash'),payment('old-credit',35,'credit_settlement'),payment('old-advance',50,'advance_paid')],[])[0];
 expect(row).toMatchObject({bills:1,grossSales:100,credit:80,creditCollected:35,advance:50,totalAmount:105,cash:20});
});
it('keeps returns separate and does not treat credit adjustment as a cash refund',()=>{
 const returns=[{id:'r',returnedBy:'SNB Billing 3',total:30,returnPayMode:'cash'},{id:'c',returnedBy:'SNB Billing 3',total:10,returnPayMode:'credit_adjustment'}] as ReturnRecord[];
 const row=buildCashierSalesRows([bill('b',100,'2026-10-16')],returns,[payment('b',100,'bill_collection','cash')],[])[0];expect(row).toMatchObject({bills:1,grossSales:100,returns:40,netSales:60,totalAmount:70});
});
it('blocks a repeated payment instead of silently counting it twice',()=>{
 const p=payment('b',100,'bill_collection');expect(()=>buildCashierSalesRows([],[],[p,p],[])).toThrow('more than once');
});
