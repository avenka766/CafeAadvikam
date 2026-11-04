import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),saved:vi.fn()}));vi.mock('@/lib/supabase',()=>({supabase:{rpc:m.rpc}}));
vi.mock('@/stores/authStore',()=>({useAuthStore:(selector:any)=>selector({currentUser:{id:'staff'}})}));
import EmployeeExitDialog from './EmployeeExitDialog';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{localStorage.clear();vi.clearAllMocks();host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.spyOn(window,'confirm').mockReturnValue(true);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
const click=async(text:string)=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes(text));expect(b).toBeTruthy();await act(async()=>b!.click());};
async function prepare(){
 m.rpc.mockImplementation(async(name:string)=>name==='employee_exit_quote_v1'?{data:{year:2026,month:11,earned:19000,pf:1368,deductions:1368,net:17632,version:'quote',payment:null,settlement_scope:'Final monthly salary only'}}:{error:{message:'Network lost'}});
 await act(async()=>root.render(<EmployeeExitDialog employee={{id:'e',name:'Current employee'}} onClose={()=>{}} onSaved={m.saved}/>));
 const reason=host.querySelector('textarea')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(reason,'Resigned');reason.dispatchEvent(new Event('input',{bubbles:true}));});
 await click('Calculate final salary');
 const review=[...host.querySelectorAll('label')].find(l=>l.textContent?.includes('I reviewed'))!.querySelector('input')!;
 await act(async()=>review.click());
}
it('records leaving without marking salary paid unless the operator explicitly selects payment',async()=>{
 await prepare();expect(host.textContent).toContain('1368');await click('Record leaving');
 const request=m.rpc.mock.calls.find(c=>c[0]==='record_employee_exit_v1')![1];expect(request.p_pay).toBe(false);
 expect(localStorage.getItem('employee-exit:staff:e')).toBeTruthy();
 m.rpc.mockResolvedValue({data:{employee_id:'e'}});await click('Retry saved request');
 const attempts=m.rpc.mock.calls.filter(c=>c[0]==='record_employee_exit_v1');expect(attempts[1][1]).toEqual(attempts[0][1]);expect(m.saved).toHaveBeenCalledTimes(1);expect(localStorage.getItem('employee-exit:staff:e')).toBeNull();
});
it('requires explicit payment selection and confirmation before recording payment',async()=>{
 await prepare();const pay=[...host.querySelectorAll('label')].find(l=>l.textContent?.includes('Record this salary as paid now'))!.querySelector('input')!;
 await act(async()=>pay.click());m.rpc.mockResolvedValue({data:{employee_id:'e'}});await click('Record leaving');
 expect(m.rpc.mock.calls.find(c=>c[0]==='record_employee_exit_v1')![1].p_pay).toBe(true);expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('17632'));
});
