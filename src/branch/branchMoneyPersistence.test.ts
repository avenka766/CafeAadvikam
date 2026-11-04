import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),enqueue:vi.fn(),pending:[] as {payload:unknown}[],handlers:new Map(),fetch:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabase:{rpc:mocks.rpc},fetchAllRows:vi.fn()}));
vi.mock('@/stores/authStore',()=>({useAuthStore:{getState:()=>({currentUser:{id:'staff'}})}}));
vi.mock('@/stores/branchCatalogStore',()=>({useBranchCatalogStore:{getState:()=>({items:{SNB:[],VRSNB:[]}})}}));
vi.mock('@/bakery/bakeryStore',()=>({isAdvanceOrderTagged:()=>false,parseAdvanceOrderNotes:()=>null}));
vi.mock('@/lib/localCache',()=>({getCached:vi.fn(),setCached:vi.fn()}));
vi.mock('@/lib/offlineQueue',()=>({useOfflineQueueStore:{getState:()=>({pending:mocks.pending,hydrate:async()=>{},enqueue:mocks.enqueue})},registerReplayHandler:(kind:string,handler:unknown)=>mocks.handlers.set(kind,handler)}));
import {useBranchStore as store} from './branchStore';
afterEach(()=>vi.restoreAllMocks());
beforeEach(()=>{
 localStorage.clear();mocks.rpc.mockReset();mocks.enqueue.mockReset();mocks.pending=[];mocks.fetch.mockReset();
 store.setState({fetchBranchData:mocks.fetch,stock:{SNB:[{itemName:'Bun',itemBarcode:1,quantity:10,reservedQuantity:2,availableQuantity:8,unit:'pcs',price:10,minThreshold:0}],VRSNB:[],Hosur:[],Cafe:[]},creditSales:{SNB:[{id:'sale',branch:'SNB',billNo:'SNB-1',subtotal:1000,amountPaid:200,creditAmount:700,discountAmount:100,status:'partial',items:[],customerName:'Fixture',customerPhone:null,dueDate:null,settledAt:null,notes:null,soldBy:'Fixture',createdAt:'2026-11-03'}],VRSNB:[],Hosur:[],Cafe:[]},creditPayments:{SNB:[],VRSNB:[],Hosur:[],Cafe:[]}});
});
it('keeps credit balances unchanged when the offline queue cannot save',async()=>{
 mocks.rpc.mockResolvedValue({error:{message:'Failed to fetch'}});mocks.enqueue.mockRejectedValue(Error('Disk full'));
 expect(await store.getState().settleCreditSale('SNB','sale',100)).toBe('Disk full');expect(store.getState().creditSales.SNB[0].creditAmount).toBe(700);expect(store.getState().creditPayments.SNB).toHaveLength(0);
});
it('preserves earlier discounts when applying an offline collection',async()=>{
 mocks.rpc.mockResolvedValue({error:{message:'Failed to fetch'}});mocks.enqueue.mockResolvedValue(undefined);
 expect(await store.getState().settleCreditSale('SNB','sale',100)).toBeNull();expect(store.getState().creditSales.SNB[0].creditAmount).toBe(600);
 expect(mocks.enqueue.mock.calls[0][1].request.p_args.p_amount).toBe(100);expect(localStorage.length).toBe(1);
});
it('uses confirmed server balances and payment identity',async()=>{
 mocks.rpc.mockResolvedValue({data:{paymentId:'real-payment',amountPaid:300,creditAmount:600,status:'partial'}});
 expect(await store.getState().settleCreditSale('SNB','sale',100)).toBeNull();expect(store.getState().creditSales.SNB[0].creditAmount).toBe(600);expect(store.getState().creditPayments.SNB[0].id).toBe('real-payment');
});
it('does not queue a rejected business rule or pretend it changed money',async()=>{
 mocks.rpc.mockResolvedValue({error:{code:'P0001',message:'ROLE_NOT_ALLOWED'}});
 expect(await store.getState().applyCreditDiscount('SNB','sale',100)).toContain('ROLE_NOT_ALLOWED');expect(mocks.enqueue).not.toHaveBeenCalled();expect(store.getState().creditSales.SNB[0].creditAmount).toBe(700);
});
it('does not change working stock when the durable queue write fails',async()=>{
 mocks.rpc.mockResolvedValue({error:{message:'Failed to fetch'}});mocks.enqueue.mockRejectedValue(Error('Disk full'));
 expect(await store.getState().manualUpdateStock('SNB','Bun',8,'Fixture',1)).toBe('Disk full');expect(store.getState().stock.SNB[0].quantity).toBe(10);
});
it('does not blindly replay legacy stock changes or credit collections',async()=>{
 expect((await mocks.handlers.get('branch_manual_stock_delta')('',{branch:'SNB',delta:2})).ok).toBe(false);
 expect((await mocks.handlers.get('branch_settle_credit_sale')('',{branch:'SNB',amountCollected:100})).ok).toBe(false);expect(mocks.rpc).not.toHaveBeenCalled();
});
it('saves new credit bills and upfront payment history through one atomic call',async()=>{
 mocks.rpc.mockImplementation(async(_name,args)=>({data:{id:args.p_request,status:'partial',upfrontPaymentId:'upfront',created_at:'2026-11-03T10:00:00Z'}}));
 const sale={...store.getState().creditSales.SNB[0],subtotal:1000,amountPaid:200,creditAmount:800,billNo:'SNB-2'};
 expect(await store.getState().recordCreditSale('SNB',sale)).toBeNull();expect(mocks.rpc).toHaveBeenCalledTimes(1);expect(mocks.rpc.mock.calls[0][0]).toBe('branch_credit_action_once_v1');expect(mocks.rpc.mock.calls[0][1].p_action).toBe('create');expect(store.getState().creditPayments.SNB[0].id).toBe('upfront');
});
it('does not claim a new credit sale is saved if durable queuing fails',async()=>{
 mocks.rpc.mockResolvedValue({error:{message:'Failed to fetch'}});mocks.enqueue.mockRejectedValue(Error('Disk full'));
 const sale={...store.getState().creditSales.SNB[0],subtotal:1000,amountPaid:200,creditAmount:800,billNo:'SNB-2'};
 expect(await store.getState().recordCreditSale('SNB',sale)).toBe('Disk full');expect(store.getState().creditSales.SNB).toHaveLength(1);expect(store.getState().creditPayments.SNB).toHaveLength(0);
});
it('retains uncertain legacy sales and advance creations without replaying stock or money writes',async()=>{
 for(const kind of ['branch_record_sale','branch_record_snb_sale','branch_record_advance_order']){
  expect(await mocks.handlers.get(kind)(kind,{branch:'SNB'})).toMatchObject({ok:false,error:expect.stringContaining('reconciliation')});
 }
 expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.enqueue).not.toHaveBeenCalled();
});
it('blocks obsolete direct creation methods before any stock or money changes',async()=>{
 expect(await store.getState().recordSale('SNB','Bun',1,'Fixture','cash')).toContain('older billing path');
 expect(await store.getState().recordSnbSale('SNB','Bun',1,'Fixture','cash',10)).toMatchObject({error:expect.stringContaining('older billing path'),mismatch:false});
 expect(await store.getState().recordAdvanceOrder('SNB',pendingAdvance)).toContain('older billing path');
 expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.enqueue).not.toHaveBeenCalled();expect(store.getState().stock.SNB[0].quantity).toBe(10);
});
const pendingAdvance={id:'advance',branch:'SNB' as const,customerName:'Fixture',items:[],subtotal:100,advanceAmount:40,advanceMethod:'cash',balanceDue:60,soldBy:'Fixture',createdAt:'2026-11-03',fullyPaidAt:null,balanceMethod:null,status:'pending' as const,deliveryDate:null};
it('does not complete an advance locally if its durable offline collection cannot save',async()=>{
 vi.spyOn(navigator,'onLine','get').mockReturnValue(false);mocks.rpc.mockResolvedValue({error:{message:'Failed to fetch'}});mocks.enqueue.mockRejectedValue(Error('Disk full'));
 store.setState({advanceOrders:{SNB:[pendingAdvance],VRSNB:[],Hosur:[],Cafe:[]}});
 expect(await store.getState().collectAdvanceBalance('SNB','advance','cash')).toBe('Disk full');expect(store.getState().advanceOrders.SNB[0]).toMatchObject({status:'pending',balanceDue:60});
});
it('does not queue a business-rule rejection even if the device reports offline',async()=>{
 vi.spyOn(navigator,'onLine','get').mockReturnValue(false);mocks.rpc.mockResolvedValue({error:{code:'P0001',message:'ROLE_NOT_ALLOWED'}});
 store.setState({advanceOrders:{SNB:[pendingAdvance],VRSNB:[],Hosur:[],Cafe:[]}});
 expect(await store.getState().collectAdvanceBalance('SNB','advance','cash')).toContain('ROLE_NOT_ALLOWED');expect(mocks.enqueue).not.toHaveBeenCalled();expect(store.getState().advanceOrders.SNB[0].status).toBe('pending');
});
it('does not issue a second advance collection during a concurrent save',async()=>{
 let release!:(r:unknown)=>void;mocks.rpc.mockReturnValue(new Promise(resolve=>{release=resolve;}));
 store.setState({advanceOrders:{SNB:[pendingAdvance],VRSNB:[],Hosur:[],Cafe:[]}});
 const first=store.getState().collectAdvanceBalance('SNB','advance','cash');
 expect(await store.getState().collectAdvanceBalance('SNB','advance','upi')).toContain('already being saved');
 release({data:{fully_paid_at:'2026-11-03T10:00:00Z'}});expect(await first).toBeNull();expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
