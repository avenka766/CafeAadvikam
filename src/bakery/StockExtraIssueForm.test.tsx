import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import StockExtraIssueForm from './StockExtraIssueForm';

vi.mock('@/lib/supabase',()=>({supabase:{}}));
it('filters item lines, defaults units, and records multiple inventory lines with a custom reason',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('div');
  document.body.appendChild(host);
  const root=createRoot(host);
  const submit=vi.fn().mockResolvedValue(true);
  const materials=['Sugar','Milk','Flour'].map((name,i)=>({id:name,name,unit:i===1?'ltr':'kg',quantity:10,maximum:null,minimum:null}));
  async function enter(selector:string,value:string,index=0){
    const input=host.querySelectorAll(selector)[index] as HTMLInputElement;
    await act(async()=>{
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value')!.set!.call(input,value);
      input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));
    });
  }
  async function click(button:string){
    await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.includes(button))!.click());
  }
  try {
    await act(async()=>root.render(<StockExtraIssueForm cards={[{item:'sweet',name:'Sweet',card:'RC-1',ingredients:[{name:'Sugar',unit:'g'}]}]}
      materials={materials} recipeError={false} busy={false} submit={submit}/>));
    await enter('input[type=search]','RC-1');
    await click('Sweet');
    expect(Array.from(host.querySelectorAll('option'),o=>o.value)).toEqual(['','Sugar']);
    await enter('select','Sugar');await enter('input[type=number]','1');await enter('textarea','Extra batch');
    await click('Record deduction');
    expect(submit).toHaveBeenCalledWith('Item',expect.objectContaining({card:'RC-1',reason:'Extra batch',rows:[{stock_id:'Sugar',quantity:1,unit:'kg'}]}));
    await act(async()=>host.querySelectorAll<HTMLInputElement>('input[type=radio]')[1].click());
    await enter('select','Milk');await enter('input[type=number]','2');
    await click('Add material');await enter('select','Flour',1);await enter('input[type=number]','3',1);
    await enter('textarea','Kitchen use');await click('Record deduction');
    expect(submit).toHaveBeenCalledWith('Custom',expect.objectContaining({reason:'Kitchen use',rows:[
      {stock_id:'Milk',quantity:2,unit:'ltr'},{stock_id:'Flour',quantity:3,unit:'kg'},
    ]}));
  } finally { await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals(); }
});
