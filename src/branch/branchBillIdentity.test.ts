import {expect,it} from 'vitest';import {dedupeBranchBills} from './branchBillIdentity';
it('keeps the canonical ledger copy once after provisional reconciliation',()=>{
 const local={id:'local',sourceBillId:'ledger',branch:'SNB',billNo:'SNB-1',pendingSync:false,total:100};
 const canonical={...local,id:'ledger',total:110};
 expect(dedupeBranchBills([local,canonical])).toEqual([canonical]);expect(dedupeBranchBills([canonical,local])).toEqual([canonical]);
});
it('does not merge different branches, bill numbers or unresolved provisional receipts by amount',()=>{
 const b={id:'one',branch:'SNB',billNo:'SNB-1',total:100};
 expect(dedupeBranchBills([b,{...b,id:'two',branch:'VRSNB'},{...b,id:'three',billNo:'SNB-2'},{...b,id:'four',billNo:'OFFLINE-FIX',pendingSync:true}])).toHaveLength(4);
});
