import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import { readVerifiedReport } from './adminReportPaging';
const rows = Array.from({length:1503},(_,i)=>({id:String(i).padStart(5,'0'),created_at:'2026-09-01T00:00:00.123456Z',total:1.25}));
const reader = (cap=500) => async (cursor:any,verify:boolean,size:number) => ({rows:verify?[]:rows.filter(r=>!cursor||r.id>cursor.id).slice(0,Math.min(cap,size)),count:rows.length,total:rows.length*1.25});
describe('Verified financial report pagination',()=>{
 it('keeps all tied timestamps across server-capped pages',async()=>{expect(await readVerifiedReport(reader(73),undefined,'total')).toEqual(rows);});
 it('reduces a timed-out page and still verifies every amount',async()=>{let calls=0; const read=reader(); const result=await readVerifiedReport(async(c,v,s)=>{calls++;if(s>125)throw {code:'57014'};return read(c,v,s);},undefined,'total');expect(result).toEqual(rows);expect(calls).toBeGreaterThan(12);});
 it('rejects an interrupted report rather than returning partial sales',async()=>{await expect(readVerifiedReport(async(c,v,s)=>{if(c)throw new Error('offline');return reader()(c,v,s);})).rejects.toThrow('offline');});
 it('rejects changed counts',async()=>{await expect(readVerifiedReport(async(c,v,s)=>({...await reader()(c,v,s),count:v?1504:1503}))).rejects.toThrow('incomplete');});
 it('rejects changed monetary totals even when record count is unchanged',async()=>{await expect(readVerifiedReport(async(c,v,s)=>({...await reader()(c,v,s),total:v?1:rows.length*1.25}),undefined,'total')).rejects.toThrow('incomplete');});
 it('rejects a missing page with a matching final database count',async()=>{await expect(readVerifiedReport(async(c,v,s)=>({...await reader()(c,v,s),rows:c?[]:rows.slice(0,100)}))).rejects.toThrow('incomplete');});
 it('rejects duplicate records',async()=>{await expect(readVerifiedReport(async()=>({rows:[rows[0]],count:2,total:2.5}))).rejects.toThrow('repeated');});
 it('cancels obsolete date selections',async()=>{const controller=new AbortController();controller.abort();await expect(readVerifiedReport(reader(),controller.signal)).rejects.toThrow();});
});
