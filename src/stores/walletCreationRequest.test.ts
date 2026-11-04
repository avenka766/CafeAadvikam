import {beforeEach,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());vi.mock('@/lib/supabase',()=>({supabase:{rpc}}));
import {createConfiguredWallet} from './walletCreationRequest';
const customer={customerName:'Fixture',mobile:'9000000000',openingBalance:100},limits={transactionLimit:50};
beforeEach(()=>{localStorage.clear();rpc.mockReset();});
it('retries the same wallet/opening/limits request after an uncertain response',async()=>{
 rpc.mockRejectedValueOnce(Error('Response lost'));await expect(createConfiguredWallet('staff',customer,limits)).rejects.toThrow();
 rpc.mockResolvedValueOnce({data:{id:'wallet',wallet_number:'WAL-FIX'},error:null});
 await createConfiguredWallet('staff',customer,{transactionLimit:999});expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);expect(localStorage.length).toBe(0);
});
it('retains an incomplete confirmation and rejects invalid numeric input before sending',async()=>{
 rpc.mockResolvedValueOnce({data:{},error:null});await expect(createConfiguredWallet('staff',customer,limits)).rejects.toThrow('incomplete');expect(localStorage.length).toBe(1);
 rpc.mockClear();await expect(createConfiguredWallet('other',{...customer,openingBalance:NaN},limits)).rejects.toThrow('finite');expect(rpc).not.toHaveBeenCalled();
});
it('does not create a wallet when its durable request cannot be saved',async()=>{
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('Disk full');});
 try{await expect(createConfiguredWallet('staff',customer,limits)).rejects.toThrow('Disk full');expect(rpc).not.toHaveBeenCalled();}finally{spy.mockRestore();}
});
