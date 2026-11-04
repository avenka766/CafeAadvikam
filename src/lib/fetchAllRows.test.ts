import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({rows:[] as Array<{id:string;created_at:string}>,filters:[] as string[],error:null as null|{message:string}}));
vi.mock('./supabase',()=>({supabase:{from:()=>{
 let size=1000,start=0,filter='';const q:any={order:()=>q,limit:(v:number)=>{size=v;return q;},range:(a:number,b:number)=>{start=a;size=b-a+1;return q;},or:(v:string)=>{filter=v;mock.filters.push(v);return q;},then:(resolve:any)=>{
 let rows=mock.rows;if(filter){const values=[...filter.matchAll(/"([^"]*)"/g)].map(m=>m[1]);rows=rows.filter(r=>r.created_at<values[0]||(r.created_at===values[1]&&r.id<values[2]));}
 return Promise.resolve({data:rows.slice(start,start+size),error:mock.error}).then(resolve);
 }};return q;}}}));
import {fetchAllRows} from './fetchAllRows';
describe('Complete report paging',()=>{
 beforeEach(()=>{mock.rows=[];mock.filters=[];mock.error=null;});
 it('retains all rows that share the page-boundary timestamp',async()=>{mock.rows=[{id:'c',created_at:'2026-11-02'},{id:'b',created_at:'2026-11-02'},{id:'a',created_at:'2026-11-02'}];const r=await fetchAllRows('fixture',q=>q,{pageSize:2,cursorColumn:'created_at'});expect(r.error).toBeNull();expect(r.data).toHaveLength(3);expect(mock.filters[0]).toContain('id.lt."b"');});
 it('reports a truncated range as incomplete rather than success',async()=>{mock.rows=[{id:'c',created_at:'x'},{id:'b',created_at:'x'},{id:'a',created_at:'x'}];const r=await fetchAllRows('fixture',q=>q,{pageSize:2,maxRows:2});expect(r.error).toContain('incomplete');});
 it('reports an absent tie-breaker instead of skipping timestamp ties',async()=>{mock.rows=[{created_at:'x'},{created_at:'x'}] as any;const r=await fetchAllRows('fixture',q=>q,{pageSize:2,cursorColumn:'created_at'});expect(r.error).toContain('must include');});
 it('propagates database failures with no false success',async()=>{mock.error={message:'Timeout'};expect((await fetchAllRows('fixture',q=>q)).error).toBe('Timeout');});
 it('rejects invalid limits before fetching',async()=>{expect((await fetchAllRows('fixture',q=>q,{maxRows:0})).error).toContain('Invalid');});
});
