import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { CafeGstControl } from './CafeGstControl';
import Receipt from './Receipt';
import { calculateCafeGst } from '@/lib/cafeGst';
import type { Order } from '@/types';

describe('Cafe GST display and receipts', () => {
  it('shows an enabled switch and recalculates the payable when switched off and on', async () => {
    function Checkout() {
      const [enabled, setEnabled] = useState(true);
      const tax = calculateCafeGst(100, 0, 0, enabled);
      return <><CafeGstControl enabled={enabled} onChange={setEnabled} tax={tax} /><output>{tax.total}</output></>;
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    try {
      await act(async () => root.render(<Checkout />));
      const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
      expect(toggle.getAttribute('aria-checked')).toBe('true');
      expect(host.querySelector('output')?.textContent).toBe('105');
      expect(host.textContent).toContain('CGST (2.5%)₹2.50');
      await act(async () => toggle.click());
      expect(toggle.getAttribute('aria-checked')).toBe('false');
      expect(host.querySelector('output')?.textContent).toBe('100');
      expect(host.textContent).toContain('GST is off for this bill.');
      await act(async () => toggle.click());
      expect(host.querySelector('output')?.textContent).toBe('105');
    } finally {
      await act(async () => root.unmount());
      host.remove();
      (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = false;
    }
  });
  const order: Order = {
    id: 'bill', orderNumber: 123, orderType: 'takeaway',
    items: [{ menuItem: { id: 'food', name: 'Test food', price: 100, category: 'food', timing: 'all', enabled: true }, quantity: 1 }],
    subtotal: 100, discount: 0, discountType: 'flat', discountValue: 0,
    status: 'served', paymentType: 'cash', createdBy: 'Biller',
    createdAt: '2026-10-04T06:00:00Z', updatedAt: '2026-10-04T06:00:00Z',
    ...calculateCafeGst(100),
  };
  it('prints the saved 5% split and total without dividing the item price by 1.05', () => {
    const html = renderToStaticMarkup(<Receipt order={order} onClose={() => {}} />);
    expect(html).toContain('CGST (2.5%)');
    expect(html).toContain('SGST (2.5%)');
    expect(html).toContain('Additional GST (5%)');
    expect(html).toContain('>5.00<');
    expect(html).toContain('>2.50<');
    expect(html).toContain('₹105');
    expect(html).not.toContain('>95<');
  });
  it('prints parcel charges separately without adding GST to them', () => {
    const html = renderToStaticMarkup(<Receipt order={{ ...order, parcelCharges: 10, ...calculateCafeGst(100, 0, 10) }} onClose={() => {}} />);
    expect(html).toContain('₹115');
    expect(html).toContain('>5.00<');
    expect(html).toContain('>2.50<');
    expect(html).not.toContain('>5.50<');
  });
  it('does not print tax on disabled or historical bills', () => {
    const off = renderToStaticMarkup(<Receipt order={{ ...order, ...calculateCafeGst(100, 0, 0, false) }} onClose={() => {}} />);
    expect(off).not.toContain('CGST (2.5%)');
    expect(off).toContain('>Off<');
    expect(off).toContain('₹100');
    const old = renderToStaticMarkup(<Receipt order={{ ...order, total: 100, gstEnabled: undefined, gstRate: undefined, gstAmount: undefined, cgstAmount: undefined, sgstAmount: undefined }} onClose={() => {}} />);
    expect(old).not.toContain('CGST (2.5%)');
    expect(old).toContain('₹100');
  });
});

