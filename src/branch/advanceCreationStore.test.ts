import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({mirror:vi.fn()}));vi.mock('./durableOperationMirror',()=>({persistOperationMirror:m.mirror}));
vi.mock('@/lib/platform',()=>({isElectronApp:()=>false}));
vi.mock('@/lib/supabase',()=>{const q:any=new Proxy({}, {get:(_,k)=>k==='then'?(resolve:any)=>Promise.resolve({data:null,error:null}).then(resolve):()=>q});return {supabase:{from:()=>q,rpc:()=>q},fetchAllRows:async()=>({data:[],error:null})};});
import {useBranchOpsStore as store} from './branchOpsStore';
const confirmed:any={id:'confirmed-id',orderNo:'SNB-ADV-1',branch:'SNB',customerName:'Fixture',orderType:'custom',items:[],orderValue:100,advanceAmount:40,balanceAmount:60,paymentMode:'cash',createdBy:'Actual cashier',createdAt:'2026-11-03T10:00:00Z',status:'Pending Store Confirmation'};
beforeEach(()=>{m.mirror.mockClear();store.setState({advanceCakeOrders:[],cashMovements:[],auditLogs:[]});});
it('projects the confirmed order without making another asynchronous order write',()=>{
 expect(store.getState().addAdvanceCakeOrder(confirmed,confirmed).id).toBe('confirmed-id');expect(m.mirror).not.toHaveBeenCalled();expect(store.getState().cashMovements[0]).toMatchObject({amount:40,referenceNumber:'SNB-ADV-1',enteredBy:'Actual cashier'});
});
it('recovers an order without duplicating money and accepts the current server status',()=>{
 store.getState().addAdvanceCakeOrder(confirmed,confirmed);store.getState().addAdvanceCakeOrder(confirmed,{...confirmed,status:'Ready for Final Invoice'});expect(store.getState().advanceCakeOrders).toHaveLength(1);expect(store.getState().cashMovements).toHaveLength(1);expect(store.getState().advanceCakeOrders[0].status).toBe('Ready for Final Invoice');
});
it('refuses to create an unconfirmed financial order locally',()=>{
 expect(()=>store.getState().addAdvanceCakeOrder(confirmed,undefined as any)).toThrow('confirmed by the server');expect(store.getState().advanceCakeOrders).toHaveLength(0);expect(store.getState().cashMovements).toHaveLength(0);
});
