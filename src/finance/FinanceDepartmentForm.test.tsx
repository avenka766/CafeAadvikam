import {act} from 'react';import {createRoot} from 'react-dom/client';import {it,expect,vi} from 'vitest';
import {FinanceDepartmentForm} from './FinanceDepartmentForm';
it('requires confirmed payment details and a bill reference before saving an expense',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);const save=vi.fn(async()=>{});
 const fill=async(label:string,value:string)=>{const input=host.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;expect(input).not.toBeNull();await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});};
 const select=async(label:string,value:string)=>{const input=host.querySelector(`[aria-label="${label}"]`) as HTMLSelectElement;await act(async()=>{input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));});};
 try{
  await act(async()=>root.render(<FinanceDepartmentForm kind="other_expense" employees={[]} defaultUnit="All" busy={false} onClose={()=>{}} onSave={save}/>));
  const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='Record payment & save')!;expect(button.disabled).toBe(true);
  await select('Payment method','Cash');await select('Expense category','Electricity');await fill('Amount paid','25.50');await fill('Payee / vendor','Fixture utility');await fill('Purpose / description','Fixture bill');await fill('Paid by','Fixture payer');
  await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());expect(button.disabled).toBe(true);
  await fill('Bill / voucher number','TEST-INV-1');expect(button.disabled).toBe(false);
  await act(async()=>button.click());expect(save).toHaveBeenCalledWith(expect.objectContaining({method:'finance_record_department',args:expect.objectContaining({p_kind:'other_expense',p_details:expect.objectContaining({amount:25.5,confirmed:true,bill_number:'TEST-INV-1'})})}));
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
