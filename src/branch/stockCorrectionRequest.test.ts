import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('@/lib/supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {prepareStockCorrection,executeStockCorrection} from './stockCorrectionRequest';
const args={branch:'SNB',itemName:'Bun',expected:10,quantity:8};
beforeEach(()=>{localStorage.clear();mocks.rpc.mockReset();});
it('keeps the correction request until a successful confirmation',async()=>{
 const first=prepareStockCorrection('staff',args);mocks.rpc.mockResolvedValueOnce({error:{message:'Lost response'}});await executeStockCorrection(first);
 const retry=prepareStockCorrection('staff',args);expect(retry.p_request).toBe(first.p_request);
 mocks.rpc.mockResolvedValueOnce({data:{stock:{id:'stock'},after:8}});await executeStockCorrection(retry);expect(localStorage.length).toBe(0);
});
it('does not repeat legacy relative changes without a receipt identity',async()=>{
 expect((await executeStockCorrection(undefined)).error?.message).toContain('reconciliation');expect(mocks.rpc).not.toHaveBeenCalled();
});
it('does not call the server when request storage fails',()=>{
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Storage full');});
 try{expect(()=>prepareStockCorrection('staff',args)).toThrow('Storage full');expect(mocks.rpc).not.toHaveBeenCalled();}finally{spy.mockRestore();}
});
