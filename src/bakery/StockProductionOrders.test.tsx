import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { StockProductionOrders } from './StockProductionOrders';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/printViaIframe', () => ({ printViaIframe: vi.fn() }));
import { printViaIframe } from '@/lib/printViaIframe';

it('prints one item, separates unmatched items and sends only the selected recipe', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host = document.createElement('div');
  const root = createRoot(host);
  const send = vi.fn().mockResolvedValue(true);
  const material = { stock_id:'sugar', name:'Sugar', quantity:2, unit:'kg' };
  const order = { id:'order', number:34, version:'v1', items:[
    { index:0,card:'OC-34-1',combined_card:'MC-PAK',itemId:'mysore-pak', name:'Mysore Pak', quantity:6, unit:'kg', recipe:'Mysore Pak',materials:[material],issue:null },
    { index:1,card:'OC-34-2',combined_card:'MC-CAKE',itemId:'custom',name:'Custom cake',quantity:3,unit:'kg',issue:'No matching recipe.' },
  ] };
  const click = async (label:string) => act(async () => host.querySelectorAll('button').forEach(button => {
    if (button.textContent === label) button.click();
  }));
  try {
    await act(async () => root.render(<StockProductionOrders orders={[order,{...order,id:'order-2',number:35,items:[{...order.items[0],card:'OC-35-1',quantity:4}]}]} materials={[{ id:'sugar', name:'Sugar', unit:'kg',
      quantity:5, maximum:null,minimum:null }]} refresh={() => {}} busy={false} send={send}/>));
    expect(host.textContent).toContain('Mysore Pak · 10 kg');
    expect(host.textContent).toContain('Root Card MC-PAK');
    expect(host.textContent).not.toContain('Order #');
    expect(host.textContent).not.toContain('OC-34-1');
    expect(host.querySelector('tbody tr')?.textContent).toContain('Sugar4kg');
    expect(host.textContent).not.toContain('Custom cake');
    await click('Print materials');
    expect(printViaIframe).toHaveBeenCalledWith(expect.stringContaining('MC-PAK'));
    await click('Send to production');
    expect(send).toHaveBeenCalledWith([expect.objectContaining({order:'order',version:'v1',selected:[
      expect.objectContaining({index:0,plan:expect.objectContaining({materials:[material]})}),
    ]}),expect.objectContaining({order:'order-2'})]);
    await click('Unmatched items');
    expect(host.textContent).toContain('Custom cake');
    expect(host.textContent).toContain('Root Card MC-CAKE');
    expect(Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Send to production')?.disabled).toBe(true);
    await click('Add material');
    expect(host.textContent).toContain('Sugar (kg)');
    await act(async () => {
      const select = host.querySelector('select')!;
      select.value = 'sugar';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      const quantity = host.querySelector<HTMLInputElement>('input[type=number]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(quantity,'1');
      quantity.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('Send to production');
    expect(send).toHaveBeenLastCalledWith([expect.objectContaining({ selected: [
      expect.objectContaining({ index:1, rows:[{ stock_id:'sugar',unit:'kg',quantity:1 }] }),
    ] })]);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
