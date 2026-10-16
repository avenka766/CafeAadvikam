import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import FestivalSalesPanel from './FestivalSalesPanel';
import { createFestivalSaleDrafts, festivalSaleCart } from './festivalSales';

it('updates the cart immediately and carries pack quantities, custom names and discount into the preview', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  function Form(){const [rows,setRows]=useState(createFestivalSaleDrafts);const {lines}=festivalSaleCart(rows);const subtotal=lines.reduce((sum,line)=>sum+line.quantity*line.price,0);return <><FestivalSalesPanel rows={rows} onChange={setRows}/><section aria-label="Festival cart">{lines.map((line,index)=><p key={index}>{line.itemName} {line.quantity} pcs ₹{line.price}</p>)}<b>Total {Math.max(0,subtotal-50)}</b></section></>;}
  const input=async(label:string,value:string)=>{await act(async()=>{const field=container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));});};
  try {
    await act(async()=>root.render(<Form/>));expect(container.querySelectorAll('input[type="number"]')).toHaveLength(26);
    expect(Array.from(container.querySelectorAll<HTMLInputElement>('input[type="number"]')).every(field=>field.value==='')).toBe(true);
    await input('SPL SWEET MIX 1KG quantity','2');let preview=container.querySelector('[aria-label="Festival cart"]')!.textContent!;expect(preview).toContain('SPL SWEET MIX 1KG');
    await input('SPL SWEET MIX 1KG price','500');await input('Festival custom item name','Gift hamper');await input('Custom item quantity','3');await input('Custom item price','100');
    preview=container.querySelector('[aria-label="Festival cart"]')!.textContent!;expect(preview).toContain('Gift hamper');expect(preview).toContain('1250');expect(preview).toContain('pcs');
  } finally {await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
});

it('keeps multiple custom items independent when adding, editing and removing them', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
  function Form(){const [rows,setRows]=useState(createFestivalSaleDrafts);const cart=festivalSaleCart(rows);return <><FestivalSalesPanel rows={rows} onChange={setRows}/><output>{JSON.stringify(cart)}</output></>;}
  const input=async(fieldset:Element,label:string,value:string)=>{await act(async()=>{const field=fieldset.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));});};
  try{
    await act(async()=>root.render(<Form/>));
    const add=()=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.includes('Add another custom item'))!;
    const fill=async(index:number,name:string,qty:string,price:string)=>{const field=container.querySelectorAll('fieldset')[12+index];await input(field,'Festival custom item name',name);await input(field,'Custom item quantity',qty);await input(field,'Custom item price',price);};
    await fill(0,'Gift hamper','2','100');await act(async()=>add().click());await fill(1,'Dry fruit box','3','200');await act(async()=>add().click());await fill(2,'Chocolate box','1','150');
    let cart=JSON.parse(container.querySelector('output')!.textContent!);expect(cart.error).toBe('');expect(cart.lines.map((l:any)=>l.itemName)).toEqual(['Gift hamper','Dry fruit box','Chocolate box']);expect(cart.lines.reduce((sum:number,l:any)=>sum+l.quantity*l.price,0)).toBe(950);
    await input(container.querySelectorAll('fieldset')[13],'Custom item price','250');
    await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Remove custom item 1"]')!.click());
    cart=JSON.parse(container.querySelector('output')!.textContent!);expect(cart.error).toBe('');expect(cart.lines).toEqual([{itemName:'Dry fruit box',quantity:3,price:250,unit:'pcs'},{itemName:'Chocolate box',quantity:1,price:150,unit:'pcs'}]);
  }finally{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();}
});

it('changes a custom item to kilograms and keeps its unit and decimal quantity in the cart',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
 function Form(){const[rows,setRows]=useState(createFestivalSaleDrafts);return <><FestivalSalesPanel rows={rows} onChange={setRows}/><output>{JSON.stringify(festivalSaleCart(rows))}</output></>;}
 try{
  await act(async()=>root.render(<Form/>));await act(async()=>{const unit=host.querySelector<HTMLSelectElement>('[aria-label="Custom item unit"]')!;unit.value='kg';unit.dispatchEvent(new Event('change',{bubbles:true}));});
  for(const [label,value] of [['Festival custom item name','Cashew sweets'],['Custom item quantity','1.25'],['Custom item price','800']])await act(async()=>{const field=host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(host.querySelector('[aria-label="Custom item quantity"]')!.getAttribute('step')).toBe('0.001');expect(host.textContent).toContain('Price / kg');expect(JSON.parse(host.querySelector('output')!.textContent!)).toEqual({error:'',lines:[{itemName:'Cashew sweets',quantity:1.25,price:800,unit:'kg'}]});
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});

it('removes focus on wheel so quantities and prices cannot be changed by scrolling',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
 function Form(){const[rows,setRows]=useState(createFestivalSaleDrafts);return <FestivalSalesPanel rows={rows} onChange={setRows}/>;}
 try{await act(async()=>root.render(<Form/>));for(const field of host.querySelectorAll<HTMLInputElement>('input[type="number"]')){field.focus();expect(document.activeElement).toBe(field);await act(async()=>field.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:100})));expect(document.activeElement).not.toBe(field);expect(field.value).toBe('');}}finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
