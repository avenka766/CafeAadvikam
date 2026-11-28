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
  const enterQuantity = async (amount: string, index = 0) => act(async () => {
    const input = host.querySelectorAll<HTMLInputElement>('input[type=number]')[index];
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,amount);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const material = { stock_id:'sugar', name:'Sugar', quantity:2, unit:'kg' };
  const plan = {materials:[material],issue:null,output_qty:4,output_unit:'kg'};
  const preview = vi.fn().mockResolvedValue(plan);
  const order = { id:'order', number:34, version:'v1', items:[
    { index:0,queue_key:'q-1',group_key:'group-pak',order_batches:3,yield_qty:2,yield_unit:'kg',itemId:'mysore-pak', name:'Mysore Pak', quantity:6, unit:'kg', recipe:'Mysore Pak',issue:null },
    { index:1,queue_key:'q-2',group_key:'group-cake',itemId:'custom',name:'Custom cake',quantity:3,unit:'kg',issue:'No matching recipe.' },
  ] };
  const click = async (label:string) => act(async () => host.querySelectorAll('button').forEach(button => {
    if (button.textContent === label) button.click();
  }));
  try {
    await act(async () => root.render(<StockProductionOrders orders={[order,{...order,id:'order-2',number:35,items:[{...order.items[0],queue_key:'q-3',quantity:4,order_batches:2}]}]} materials={[{ id:'sugar', name:'Sugar', unit:'kg',
      quantity:5, maximum:null,minimum:null }]} refresh={() => {}} busy={false} send={send} preview={preview}/>));
    expect(host.textContent).toContain('Mysore Pak · 10 kg');
    expect(host.textContent).not.toContain('Root Card');
    expect(host.textContent).toContain('Ordered batches 5');
    expect(host.querySelector('input')?.value).toBe('');
    await enterQuantity('2');
    await act(async () => new Promise(resolve => setTimeout(resolve,300)));
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({batches:2}));
    expect(host.textContent).not.toContain('Order #');
    expect(host.textContent).not.toContain('OC-34-1');
    expect(host.querySelector('tbody tr')?.textContent).toContain('Sugar2kg');
    expect(host.textContent).not.toContain('Custom cake');
    await click('Print materials');
    expect(printViaIframe).toHaveBeenCalledWith(expect.stringContaining('4 kg'));
    await click('Send to production');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({batches:2,plan,orders:[
      expect.objectContaining({order:'order',version:'v1',selected:[expect.objectContaining({index:0})]}),
      expect.objectContaining({order:'order-2'}),
    ]}));
    await click('Unmatched items');
    expect(host.textContent).toContain('Custom cake');
    expect(host.textContent).not.toContain('Root Card');
    expect(Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Send to production')?.disabled).toBe(true);
    await click('Add material');
    expect(host.textContent).toContain('Sugar (kg)');
    await act(async () => {
      const select = host.querySelector('select')!;
      select.value = 'sugar';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await enterQuantity('3');
    await enterQuantity('1',1);
    await click('Send to production');
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({quantity:3,rows:[{stock_id:'sugar',unit:'kg',quantity:1}]}));
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
