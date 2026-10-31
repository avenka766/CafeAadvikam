import {afterEach,expect,it,vi} from 'vitest';
import {useBranchStore,type IncomingStock} from './branchStore';
import {supabase} from '@/lib/supabase';
const initial=useBranchStore.getState();
const row:IncomingStock={id:'receipt-test',itemName:'Bun',quantity:3,reservedQuantity:0,availableQuantity:3,unit:'pcs',receivedAt:'2026-10-31T05:00:00Z',dispatchedBy:'Planner',confirmed:false};
afterEach(()=>{useBranchStore.setState(initial,true);vi.restoreAllMocks();});
it('shows already synced without making another confirmation request',async()=>{
 useBranchStore.setState({incoming:{...initial.incoming,SNB:[{...row,confirmed:true}]}});
 const rpc=vi.spyOn(supabase,'rpc');
 expect(await useBranchStore.getState().confirmIncoming('SNB',row.id)).toContain('already been synced once');expect(rpc).not.toHaveBeenCalled();
});
it('blocks a second click while the first confirmation is in flight',async()=>{
 useBranchStore.setState({incoming:{...initial.incoming,SNB:[row]},fetchBranchData:vi.fn().mockResolvedValue(undefined)});
 let resolve!:(value:unknown)=>void;const rpc=vi.spyOn(supabase,'rpc').mockReturnValue(new Promise(r=>{resolve=r;}) as never);
 const first=useBranchStore.getState().confirmIncoming('SNB',row.id);
 expect(await useBranchStore.getState().confirmIncoming('SNB',row.id)).toContain('already being confirmed');expect(rpc).toHaveBeenCalledTimes(1);
 resolve({data:13,error:null});expect(await first).toBeNull();
});
