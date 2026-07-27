// src/bakery/__tests__/hosurBillingBridge.test.ts
import { describe, it, expect } from 'vitest';
import { computePaymentSplit } from '../hosurBillingBridge';

describe('computePaymentSplit', () => {
  it('full payment: paid = total, credit = 0, status paid', () => {
    const result = computePaymentSplit(1000, { paymentType: 'full' });
    expect(result).toEqual({ paid: 1000, credit: 0, status: 'paid' });
  });

  it('credit: paid = 0, credit = total, status credit_open', () => {
    const result = computePaymentSplit(1000, { paymentType: 'credit', dueDate: '2026-08-01' });
    expect(result).toEqual({ paid: 0, credit: 1000, status: 'credit_open' });
  });

  it('partial: splits paid/credit correctly, status partial_credit', () => {
    const result = computePaymentSplit(1000, { paymentType: 'partial', paidAmount: 400, dueDate: '2026-08-01' });
    expect(result).toEqual({ paid: 400, credit: 600, status: 'partial_credit' });
  });

  it('partial payment covering the full amount becomes status paid', () => {
    const result = computePaymentSplit(1000, { paymentType: 'partial', paidAmount: 1000 });
    expect(result.credit).toBe(0);
    expect(result.status).toBe('paid');
  });

  it('clamps a negative or missing paidAmount to 0', () => {
    const result = computePaymentSplit(1000, { paymentType: 'partial', paidAmount: -50 });
    expect(result.paid).toBe(0);
    expect(result.credit).toBe(1000);
  });

  it('clamps an overpaid amount to the total (never negative credit)', () => {
    const result = computePaymentSplit(1000, { paymentType: 'partial', paidAmount: 5000 });
    expect(result.paid).toBe(1000);
    expect(result.credit).toBe(0);
  });
});
