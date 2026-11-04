import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({fetch:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/fetchAllRows',()=>({fetchAllRows:mocks.fetch}));
vi.mock('@/lib/supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {loadReceiverSharedRecords,sharedOperationIdentity} from './receiverSharedRecords';
beforeEach(()=>{mocks.fetch.mockReset().mockResolvedValue({data:[],error:null});mocks.rpc.mockReset().mockResolvedValue({data:[],error:null});});
it('retains all paged purchase rows and scopes waste to the selected branch',async()=>{
 const rows=Array.from({length:1201},(_,i)=>({id:String(i)}));
 mocks.fetch.mockResolvedValueOnce({data:rows,error:null});
 const result=await loadReceiverSharedRecords('SNB');expect(result[0].data).toHaveLength(1201);
 expect(mocks.fetch.mock.calls.every(c=>c[2].cursorColumn==='created_at')).toBe(true);
 const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),in:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis()};
 mocks.fetch.mock.calls[2][1](query);expect(query.eq).toHaveBeenCalledWith('branch','SNB');
 mocks.fetch.mock.calls[3][1](query);expect(query.eq).toHaveBeenLastCalledWith('branch','SNB');
});
it('does not present a successful partial source as a complete report',async()=>{
 mocks.fetch.mockResolvedValueOnce({data:[{id:'partial'}],error:'statement timeout'});
 await expect(loadReceiverSharedRecords('SNB')).rejects.toThrow('Shared records are incomplete');
});
it('rejects a failed or malformed operation response',async()=>{
 mocks.fetch.mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({data:null,error:'permission denied'});
 await expect(loadReceiverSharedRecords('SNB')).rejects.toThrow('permission denied');
 mocks.fetch.mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({data:null,error:null});
 await expect(loadReceiverSharedRecords('SNB')).rejects.toThrow('incomplete response');
});
it('keeps supplier-specific invoices and every unnumbered stock log',()=>{
 const row={id:'one',type:'Purchase Invoice',reference:'INV-1',party:'Supplier A',amount:50};
 expect(sharedOperationIdentity(row)).not.toBe(sharedOperationIdentity({...row,id:'two',party:'Supplier B'}));
 expect(sharedOperationIdentity(row)).toBe(sharedOperationIdentity({...row,id:'register-copy'}));
 const waste={...row,type:'Damage',reference:'-'};
 expect(sharedOperationIdentity(waste)).not.toBe(sharedOperationIdentity({...waste,id:'two'}));
});
