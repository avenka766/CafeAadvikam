import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it,vi } from 'vitest';
import StockExtraIssueForm, { type StockDeductionTab } from './StockExtraIssueForm';

vi.mock('@/lib/supabase',()=>({supabase:{}}));
it('filters recipe materials and submits a separate custom issue without a root card',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('div');
  document.body.appendChild(host);
  const root=createRoot(host);
  const submitRecipe=vi.fn().mockResolvedValue(true);
  const submitCustom=vi.fn().mockResolvedValue(true);
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
    function Fixture() {
      const [tab,changeTab]=useState<StockDeductionTab>('Recipe Materials');
      return <StockExtraIssueForm cards={[{id:'order-1',number:1,items:[{index:0,card:'OC-1-1',combined_card:'MC-SWEET',recipe_materials:['sugar'],name:'Sweet',quantity:2,unit:'kg'}]},{id:'order-2',number:2,items:[{index:0,card:'OC-2-1',combined_card:'MC-SWEET',recipe_materials:['sugar'],name:'Sweet',quantity:3,unit:'kg'}]}]}
      materials={materials} busy={false} tab={tab} changeTab={changeTab} submitRecipe={submitRecipe} submitCustom={submitCustom}/>;
    }
    await act(async()=>root.render(<Fixture/>));
    await enter('input[type=search]','Sweet');
    expect(host.querySelectorAll('ul button')).toHaveLength(1);
    expect(host.textContent).toContain('Sweet · 5 kg');
    expect(host.textContent).not.toContain('Order #');
    await click('Sweet');
    expect(host.textContent).toContain('Root Card MC-SWEET');
    expect(Array.from(host.querySelectorAll('option'), option => option.value)).toEqual(['','Sugar']);
    await click('Custom Items');
    expect(host.querySelector('input[type=search]')).toBeNull();
    expect(host.textContent).not.toContain('Root Card');
    expect(Array.from(host.querySelectorAll('option'), option => option.value)).toEqual(['','Sugar','Milk','Flour']);
    await enter('select','Milk');await enter('input[type=number]','2');
    await click('Add material');await enter('select','Flour',1);await enter('input[type=number]','3',1);
    await enter('textarea','Kitchen use');await click('Record deduction');
    expect(submitRecipe).not.toHaveBeenCalled();
    expect(submitCustom).toHaveBeenCalledWith({reason:'Kitchen use',rows:[
      {stock_id:'Milk',quantity:2,unit:'ltr'},{stock_id:'Flour',quantity:3,unit:'kg'},
    ]});
  } finally { await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals(); }
});
