import {supabase} from '@/lib/supabase';
export type BranchCheckoutCharges={packing:number;delivery:number;payments:{mode:string;amount:number}[];purpose:'bill_collection'|'credit_upfront'};
export function branchCheckoutRoundOff(base:number,charges:number){
 if(!Number.isFinite(base)||!Number.isFinite(charges)||base<0||charges<0)throw Error('Bill amounts must be finite and non-negative.');
 const full=base+charges,total=Math.round(full);
 if(total<charges)throw Error('The charges do not reconcile after whole-rupee rounding. Review the charge amount.');
 return Math.round((total-full)*100)/100;
}
export function completeBranchCheckout(args:Record<string,unknown>,charges:BranchCheckoutCharges,reference?:Record<string,unknown>){
 return supabase.rpc('complete_branch_checkout_with_charges_v1',{p_args:args,p_charges:charges,p_reference:reference??null});
}
