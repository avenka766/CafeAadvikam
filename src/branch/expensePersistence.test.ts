import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({persist:vi.fn(),upsert:vi.fn()}));
vi.mock('./durableOperationMirror',()=>({persistOperationMirror:m.persist}));
vi.mock('@/lib/platform',()=>({isElectronApp:()=>false}));
vi.mock('@/lib/supabase',()=>{const q:any=new Proxy({}, {get:(_,key)=>key==='then'?(resolve:any)=>Promise.resolve({data:null,error:null}).then(resolve):key==='upsert'?(...args:any[])=>{m.upsert(...args);return q;}:()=>q});return {supabase:{from:()=>q,rpc:()=>q},fetchAllRows:async()=>({data:[],error:null})};});
import {useBranchOpsStore as store} from './branchOpsStore';
const input={branch:'SNB' as const,expenseDate:'2026-11-03',category:'Electricity',description:'Fixture expense',amount:100,mode:'cash' as const,enteredBy:'Fixture'};
beforeEach(()=>{m.persist.mockReset().mockResolvedValue(undefined);m.upsert.mockClear();store.setState({expenses:[],cashMovements:[],auditLogs:[]});});
it('does not report or book an expense whose durable save failed',async()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{m.persist.mockRejectedValueOnce(Error('Storage full'));await expect(store.getState().addExpense(input)).rejects.toThrow('safely stored');expect(store.getState().expenses).toHaveLength(0);expect(store.getState().cashMovements).toHaveLength(0);}finally{log.mockRestore();}
});
it('saves first and keeps the matching money movement consistent when an expense is edited',async()=>{
 m.persist.mockImplementationOnce(async()=>{expect(store.getState().expenses).toHaveLength(0);});
 const saved=await store.getState().addExpense(input);expect(store.getState().expenses[0].id).toBe(saved.id);
 await store.getState().updateExpense(saved.id,{amount:200,mode:'upi'},'Fixture');
 expect(store.getState().expenses[0]).toMatchObject({amount:200,mode:'upi'});expect(store.getState().cashMovements[0]).toMatchObject({referenceNumber:saved.id,amount:200,paymentMode:'upi'});
 expect(m.persist.mock.calls[0][0]).toMatchObject({record_type:'expense',amount:100,payload:{amount:100}});
});
it('rejects non-finite expense amounts before sending any record',async()=>{
 await expect(store.getState().addExpense({...input,amount:Infinity})).rejects.toThrow('finite');expect(m.persist).not.toHaveBeenCalled();
});

it('keeps durable expense writes without sending empty whole-store backups',async()=>{
 await store.getState().addExpense(input);expect(m.persist).toHaveBeenCalled();expect(m.upsert).not.toHaveBeenCalled();
});
