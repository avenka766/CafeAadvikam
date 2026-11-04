import {expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());vi.mock('@/lib/supabase',()=>({supabase:{rpc}}));
import {completeBranchCheckout,branchCheckoutRoundOff} from './branchCheckoutRequest';
it('sends payments, packing/delivery and the original offline reference through one transaction',()=>{
 const args={p_idempotency_key:'same-checkout',p_branch:'SNB'},charges={packing:6,delivery:4,payments:[{mode:'cash',amount:10}],purpose:'bill_collection' as const},reference={protocol:2,id:'local',number:'OFFLINE-FIX',bill:{total:110}};
 completeBranchCheckout(args,charges,reference);expect(rpc).toHaveBeenCalledWith('complete_branch_checkout_with_charges_v1',{p_args:args,p_charges:charges,p_reference:reference});
});
it('uses the final bill rounding when fees contain paise',()=>{
 const base=99.49,charges=.5,roundOff=branchCheckoutRoundOff(base,charges);
 expect(roundOff).toBe(.01);expect(Math.round((base+roundOff+charges)*100)/100).toBe(100);
 expect(branchCheckoutRoundOff(99.49,10)).toBe(-.49);
});
it('rejects invalid or unreconcilable fee values',()=>{
 expect(()=>branchCheckoutRoundOff(1,Infinity)).toThrow('finite');expect(()=>branchCheckoutRoundOff(0,.4)).toThrow('rounding');
});
