import {expect,it} from 'vitest';
import type {BranchAdvanceOrder} from './branchStore';
import {advanceCollectionBlocked,advanceDisplayStatus} from './advanceCollectionEligibility';
const order={id:'one',status:'pending',balanceDue:500,advanceAmount:100} as BranchAdvanceOrder;
it('blocks the old collection action after current finalization without inventing cash payments',()=>{
 const finalized={...order,finalizedInMain:true};
 expect(advanceCollectionBlocked(finalized)).toBe(true);expect(advanceDisplayStatus(finalized)).toBe('completed');
 expect(finalized.balanceDue).toBe(500);expect(finalized.advanceAmount).toBe(100);expect(finalized.status).toBe('pending');
});
it('allows pending orders only, including blocking cancelled and completed rows',()=>{
 expect(advanceCollectionBlocked(order)).toBe(false);
 for(const closed of [{...order,status:'cancelled' as const},{...order,status:'completed' as const},{...order,cancelledInMain:true}])expect(advanceCollectionBlocked(closed)).toBe(true);
});
