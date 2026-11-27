import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import GrnWorkspace from './GrnWorkspace';
import { dateKey, type PurchaseOrder } from './materialWorkspace';

const mocks = vi.hoisted(() => ({ role: 'grn', rpc: vi.fn() }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { currentUser: { role: string } }) => unknown) =>
    selector({ currentUser: { role: mocks.role } }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

it('shows a submitted PO in both dashboards and enables conversion only after Owner approval', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let order: PurchaseOrder = {
    id: 'po', number: 7, supplier_id: 'supplier', supplier: 'Supplier A', status: 'submitted',
    lines: [{ stock_id: 'sugar', name: 'Sugar', quantity: 10, unit: 'kg', price: 45 }],
    automatic: false, expected_date: dateKey(), notes: '', created_at: '2025-02-10T07:30:00Z',
    created_by: 'GRN', reviewed_at: null, reviewed_by: null, review_note: null, version: 1,
  };
  mocks.rpc.mockImplementation(async (_name, { p_action, p_payload }) => {
    if (p_action === 'review') {
      expect(mocks.role).toBe('owner');
      expect(p_payload).toMatchObject({ id: 'po', version: 1, status: 'approved' });
      order = { ...order, status: 'approved', version: 2, reviewed_by: 'Owner' };
      return { data: order, error: null };
    }
    return { data: { orders: [order], receipts: [], materials: [], suppliers: [], catalogue: [] }, error: null };
  });

  async function show(path: string, role: string, ownerApprovals = false) {
    mocks.role = role;
    await act(async () => root.render(<MemoryRouter key={path} initialEntries={[path]}>
      <GrnWorkspace ownerApprovals={ownerApprovals} />
    </MemoryRouter>));
  }
  const button = (name: string) => Array.from(host.querySelectorAll('button')).find(item => item.textContent?.trim() === name);
  const click = (name: string) => act(async () => { expect(button(name)).toBeDefined(); button(name)?.click(); });

  try {
    await show('/bakery/grn', 'grn');
    expect(button('New PO')).toBeDefined();
    expect(host.textContent).toContain('PO-000007');
    expect(host.textContent).toContain('Sugar');
    expect(host.textContent).toContain('Awaiting Owner');
    expect(button('Convert to GRN')).toBeUndefined();

    await show('/bakery/grn?tab=GRN+Report', 'grn');
    expect(button('New PO')).toBeUndefined();
    expect(button('Convert to GRN')).toBeUndefined();

    await show('/owner?tab=poApprovals', 'owner', true);
    const pendingCard = button('Review')?.closest('li');
    expect(pendingCard?.textContent).toContain('PO-000007');
    expect(pendingCard?.closest('table')).toBeNull();
    expect(host.textContent).toContain('PO-000007');
    await click('Review');
    expect(pendingCard?.querySelector('form')?.textContent).toContain('Approve PO');
    await click('Approve PO');
    expect(host.textContent).toContain('Ready to receive');
    expect(button('Convert to GRN')).toBeUndefined();

    await show('/bakery/grn?tab=Approved+Status', 'grn');
    expect(button('New PO')).toBeUndefined();
    await click('Convert to GRN');
    expect(host.textContent).toContain('Receive PO-000007');
    expect(host.textContent).toContain('Record GRN and update stock');

    await show('/bakery/grn?tab=Suppliers', 'grn');
    expect(button('New PO')).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
