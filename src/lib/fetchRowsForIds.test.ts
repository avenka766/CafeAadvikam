import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({fetch:vi.fn()}));vi.mock('./supabase',()=>({fetchAllRows:m.fetch}));
import {fetchRowsForIds} from './fetchRowsForIds';
beforeEach(()=>vi.clearAllMocks());
it('bounds large id filters, deduplicates input and returns every linked row',async()=>{
 const sizes:number[]=[];m.fetch.mockImplementation(async(_table,build)=>{let ids:string[]=[];const q={select:()=>q,in:(_field:string,values:string[])=>{ids=values;return q;},order:()=>q};build(q);sizes.push(ids.length);return {data:ids.map(id=>({id})),error:null};});
 const ids=Array.from({length:501},(_,i)=>'id-'+i);const result=await fetchRowsForIds('fixture','id',[...ids,ids[0]],'id');expect(result.error).toBeNull();expect(result.data).toHaveLength(501);expect(new Set(result.data.map(r=>r.id)).size).toBe(501);expect(sizes).toEqual([150,150,150,51]);
});
it('does not return a partial success if a later batch fails',async()=>{
 m.fetch.mockResolvedValueOnce({data:[{id:'first'}],error:null}).mockResolvedValue({data:[],error:'Statement timeout'});
 const result=await fetchRowsForIds('fixture','id',Array.from({length:151},(_,i)=>String(i)),'id');expect(result).toEqual({data:[],error:'Statement timeout'});
});
it('does not query for an empty linked set',async()=>{expect(await fetchRowsForIds('fixture','id',[],'id')).toEqual({data:[],error:null});expect(m.fetch).not.toHaveBeenCalled();});
it('reports a thrown transport error without accepting incomplete data',async()=>{m.fetch.mockRejectedValue(Error('Disconnected'));expect(await fetchRowsForIds('fixture','id',['one'],'id')).toEqual({data:[],error:'Disconnected'});});
it('bounds parallel reads to three batches and preserves all rows',async()=>{
 let active=0,peak=0;
 m.fetch.mockImplementation(async(_table,build)=>{
  let ids:string[]=[];const q={select:()=>q,in:(_field:string,values:string[])=>{ids=values;return q;},order:()=>q};build(q);
  active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,1));active--;
  return {data:ids.map(id=>({id})),error:null};
 });
 const result=await fetchRowsForIds('fixture','id',Array.from({length:601},(_,i)=>String(i)),'id',20);
 expect(peak).toBe(3);expect(result.data).toHaveLength(601);expect(result.error).toBeNull();
});
