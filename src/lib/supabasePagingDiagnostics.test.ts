import {afterEach,expect,it,vi} from 'vitest';
import {supabase} from './supabase';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
function mockPage(){vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(Array.from({length:1000},(_,id)=>({id}))),{status:200,headers:{'Content-Type':'application/json'}})));}
it('warns about a capped unpaged result without altering the returned rows',async()=>{
 mockPage();const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});const result=await supabase.from('orders').select('id').limit(1000);
 expect(result.data).toHaveLength(1000);await vi.waitFor(()=>expect(warn).toHaveBeenCalledWith(expect.stringContaining('exactly 1000 rows')));
});
it('does not clone or warn for explicit pages used by complete paginated reports',async()=>{
 mockPage();const warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),clone=vi.spyOn(Response.prototype,'clone');const result=await supabase.from('orders').select('id').range(0,999);
 expect(result.data).toHaveLength(1000);expect(clone).not.toHaveBeenCalled();expect(warn).not.toHaveBeenCalled();
});
