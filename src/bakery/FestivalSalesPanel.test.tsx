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
