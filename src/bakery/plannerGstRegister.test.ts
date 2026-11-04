import {expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({fetch:vi.fn(),manual:vi.fn()}));
vi.mock('@/lib/supabase',()=>({fetchAllRows:m.fetch}));vi.mock('./gstTaxInvoice',()=>({listGstTaxInvoices:m.manual}));
import {loadPlannerGstRegister} from './plannerGstRegister';
it('includes GST Sales/festival and Hosur invoices with their original numbers and amounts',async()=>{m.manual.mockResolvedValue([]);m.fetch.mockImplementation(async(table:string)=>({data:[table==='bakery_walkin_bills'?{bill_no:'SALES/26-27/1',total:105,created_at:'2026-11-02',items:[]}:{invoice_no:'SALES/26-27/2',total:210,created_at:'2026-11-02',items:[]}],error:null}));const r=await loadPlannerGstRegister('from','to');expect(r.map(x=>x['Invoice Number'])).toEqual(['SALES/26-27/1','SALES/26-27/2']);expect(r.map(x=>x.Total)).toEqual([105,210]);});
it('rejects partial source failures so Excel cannot silently omit GST bills',async()=>{m.manual.mockResolvedValue([]);m.fetch.mockResolvedValue({data:[],error:'Timeout'});await expect(loadPlannerGstRegister('from','to')).rejects.toThrow('Timeout');});
