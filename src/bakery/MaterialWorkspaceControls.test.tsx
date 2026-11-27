import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { MaterialTable } from './MaterialWorkspaceControls';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

it('sorts the full result by quantity, price, date and reference before pagination', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const keys = Array.from({ length: 30 }, (_, index) => [`PO-${30-index}`, 30-index, index * 18, new Date(2026, 6, index + 1)]);
  const rows = keys.map(([ref, qty, price, date], index) => [ref as string, qty as number, <span key={index}>₹{price as number}</span>,
    (date as Date).toLocaleDateString('en-IN', { dateStyle: 'medium' })]);
  const first = () => host.querySelector('tbody tr')?.firstElementChild?.textContent;
  const click = (label: string) => act(async () => {
    Array.from(host.querySelectorAll('button')).find(button =>
      button.getAttribute('aria-label') === label || button.textContent === label)?.click();
  });
  try {
    await act(async () => root.render(<MaterialTable headings={['Reference', 'Qty', 'Price', 'Date']}
      rows={rows} sortValues={keys} empty="No results" label="Test report" />));
    await click('Next');
    expect(first()).toBe('PO-5');
    await click('Sort by Qty');
    expect(first()).toBe('PO-1');
    expect(host.querySelector('th[aria-sort]')?.getAttribute('aria-sort')).toBe('ascending');
    await click('Sort by Qty');
    expect(first()).toBe('PO-30');
    await click('Sort by Price');
    expect(first()).toBe('PO-30');
    await click('Sort by Price');
    expect(first()).toBe('PO-1');
    await click('Sort by Date');
    expect(first()).toBe('PO-30');
    await click('Sort by Reference');
    expect(first()).toBe('PO-1');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
