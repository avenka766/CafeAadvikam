import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({from:vi.fn(),select:vi.fn(),eq:vi.fn(),limit:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabase:{from:mock.from}}));
import {findLedgerBillForReprint} from './ledgerBill';
beforeEach(()=>{vi.clearAllMocks();mock.from.mockReturnValue(mock);mock.select.mockReturnValue(mock);mock.eq.mockReturnValue(mock);});
const row={id:'main-ledger-id',bill_no:'SNB-43874',invoice_no:43874,bill_type:'counter',total:'655',subtotal:'770',discount:'115.5',round_off:'0.5',created_at:'2026-10-15T14:11:55Z',branch_bill_items:[{item_name:'DILPASAND',quantity:'44',unit:'pcs',unit_price:'17.5',line_total:'770'}],branch_sale_payments:[{payment_mode:'cash',amount:'655'}]};
it('uses one main-ledger bill even when secondary snapshots repeat',async()=>{
 mock.limit.mockResolvedValue({data:[row],error:null});const bill=await findLedgerBillForReprint('SNB','43874');
 expect(mock.from).toHaveBeenCalledExactlyOnceWith('branch_bill_headers');expect(mock.eq).toHaveBeenCalledWith('bill_no','SNB-43874');
 expect(bill).toMatchObject({id:'main-ledger-id',total:655,roundOff:.5,amountBeforeRoundOff:654.5,paymentMode:'cash'});expect(bill!.items[0].quantity).toBe(44);
});
it('supports full bill numbers and isolates VRSNB lookups',async()=>{
 mock.limit.mockResolvedValue({data:[{...row,bill_no:'VRSNB-2483'}],error:null});
 expect((await findLedgerBillForReprint('VRSNB','vrsnb-2483'))!.branch).toBe('VRSNB');expect(mock.eq).toHaveBeenCalledWith('branch','VRSNB');
});
it('does not choose an arbitrary record when the main ledger is ambiguous',async()=>{
 mock.limit.mockResolvedValue({data:[row,{...row,id:'other'}],error:null});await expect(findLedgerBillForReprint('SNB','43874')).rejects.toThrow('More than one main-ledger');
});
it('handles missing bills and rejects a different branch number',async()=>{
 mock.limit.mockResolvedValue({data:[],error:null});expect(await findLedgerBillForReprint('SNB','43874')).toBeNull();
 await expect(findLedgerBillForReprint('SNB','VRSNB-2483')).rejects.toThrow('Enter a SNB bill number');
});
it('preserves wallet and promotion amounts in a reprinted bill',async()=>{
 mock.limit.mockResolvedValue({data:[{...row,wallet_id:'wallet-id',wallet_amount:'100',promotion_discount:'5',promotion_ids:['promo'],branch_sale_payments:[{payment_mode:'cash',amount:'555'},{payment_mode:'wallet',amount:'100'}]}],error:null});
 expect(await findLedgerBillForReprint('SNB','43874')).toMatchObject({paymentMode:'split',walletId:'wallet-id',promotionDiscount:5,split:{cash:555,wallet:100}});
});
