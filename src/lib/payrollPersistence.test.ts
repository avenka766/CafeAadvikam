import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({upsert:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from:()=>({upsert:mock.upsert})}}));
import {savePayrollDay,savePayrollDeduction} from './payrollPersistence';
const day={present:true,half:false,woff:false,absent:false,bf:true,lunch:false,dinner:false};
const deduction={deductAdvance:false,deductOther:true,deductUniform:false,deductESI:true,deductPF:true};
describe('Payroll save failure handling',()=>{
 beforeEach(()=>{mock.upsert.mockReset();mock.upsert.mockResolvedValue({error:null});});
 it('rejects failed attendance saves instead of claiming success',async()=>{mock.upsert.mockResolvedValue({error:{message:'Connection lost'}});await expect(savePayrollDay('a',2026,11,2,day)).rejects.toThrow('Connection lost');});
 it('meal-only saves do not overwrite attendance flags',async()=>{await savePayrollDay('a',2026,11,2,day,true);expect(mock.upsert.mock.calls[0][0]).toEqual({employee_id:'a',year:2026,month:11,day:2,bf:true,lunch:false,dinner:false});});
 it('rejects failed deductions so payroll can restore the saved values',async()=>{mock.upsert.mockResolvedValue({error:{message:'Permission denied'}});await expect(savePayrollDeduction('a',2026,11,deduction)).rejects.toThrow('Permission denied');});
});
