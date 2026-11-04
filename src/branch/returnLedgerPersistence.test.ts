import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({save:vi.fn(),mirror:vi.fn()}));
vi.mock('./returnRequest',()=>({saveBranchReturn:m.save}));vi.mock('./durableOperationMirror',()=>({persistOperationMirror:m.mirror}));
vi.mock('@/stores/authStore',()=>({useAuthStore:{getState:()=>({currentUser:{id:'staff',username:'Actual cashier'}})}}));
vi.mock('@/lib/platform',()=>({isElectronApp:()=>false}));
vi.mock('@/lib/supabase',()=>{const q:any=new Proxy({}, {get:(_,key)=>key==='then'?(resolve:any)=>Promise.resolve({data:null,error:null}).then(resolve):()=>q});return {supabase:{from:()=>q,rpc:()=>q},fetchAllRows:async()=>({data:[],error:null})};});
import {useBranchOpsStore as store} from './branchOpsStore';
const item={itemName:'Bun',unit:'pcs' as const,quantity:1,price:100,lineTotal:100,tax:0,discount:0};
const input={branch:'SNB' as const,originalBillNo:'SNB-1',originalPaymentMode:'cash' as const,items:[item],total:100,returnedBy:'Fixture',reason:'Fixture',returnPayMode:'cash' as const};
beforeEach(()=>{m.save.mockReset().mockResolvedValue({id:'real-id',returnNo:'SNB-RET-42',amount:80,refundAmount:55,creditAdjusted:25,refundMode:'cash',createdAt:'2026-11-03T10:00:00Z',items:[{...item,price:80,lineTotal:80}]});m.mirror.mockClear();store.setState({returns:[],cashMovements:[],auditLogs:[]});});
it('uses the server value and final receipt reference for the return and money movement',async()=>{
 const saved=await store.getState().addReturn(input);expect(saved).toMatchObject({id:'real-id',returnNo:'SNB-RET-42',total:80,refundAmount:55,creditAdjusted:25});
 expect(store.getState().cashMovements[0]).toMatchObject({referenceNumber:'SNB-RET-42',amount:55});expect(m.mirror).not.toHaveBeenCalled();
});
it('does not duplicate working money movements when the same return is confirmed again',async()=>{
 await store.getState().addReturn(input);await store.getState().addReturn(input);expect(store.getState().returns).toHaveLength(1);expect(store.getState().cashMovements).toHaveLength(1);
});
it('keeps all local money records unchanged when confirmation fails',async()=>{
 m.save.mockRejectedValue(Error('Confirmation lost'));await expect(store.getState().addReturn(input)).rejects.toThrow('Confirmation lost');expect(store.getState().returns).toHaveLength(0);expect(store.getState().cashMovements).toHaveLength(0);
});
