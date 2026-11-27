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
    { index:0,itemId:'mysore-pak', name:'Mysore Pak', quantity:6, unit:'kg', recipe:'Mysore Pak',card:'RC-000001',materials:[material],issue:null },
    { index:1,itemId:'custom',name:'Custom cake',quantity:3,unit:'kg',issue:'No matching recipe or root card.' },
  ] };
  const click = async (label:string) => act(async () => host.querySelectorAll('button').forEach(button => {
    if (button.textContent === label) button.click();
  }));
  try {
    await act(async () => root.render(<StockProductionOrders orders={[order]} materials={[{ id:'sugar', name:'Sugar', unit:'kg',
      quantity:5, maximum:null,minimum:null }]} refresh={() => {}} busy={false} send={send}/>));
    expect(host.textContent).toContain('Mysore Pak');
    expect(host.textContent).not.toContain('Custom cake');
    await click('Print materials');
    expect(printViaIframe).toHaveBeenCalledWith(expect.stringContaining('RC-000001'));
    await act(async () => host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
    await click('Send to production (1)');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({order:'order',version:'v1',selected:[
      expect.objectContaining({index:0,plan:expect.objectContaining({materials:[material]})}),
    ]}));
    await click('Unmatched items');
    expect(host.textContent).toContain('Custom cake');
    expect(host.textContent).not.toContain('Send to production');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
