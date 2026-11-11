import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import type {BranchBillRecord} from './branchOpsStore';

const mocks = vi.hoisted(() => ({rpc: vi.fn(), allocate: vi.fn(), submit: vi.fn()}));
vi.mock('@/lib/supabase', () => ({supabase: {rpc: mocks.rpc}}));
vi.mock('@/lib/appPrinting', () => ({submitAppPrint: mocks.submit}));
import {BRANCH_PRINT_COMPLETE_EVENT, printCounterBill} from './printUtils';

const bill = {
  id: 'bill-1', billNo: 'SNB-101', branch: 'SNB', createdAt: '2026-11-11T05:00:00Z',
  items: [{itemName: 'Bun', quantity: 1, unit: 'pcs', price: 20, lineTotal: 20}],
  invoiceNo: 101, subtotal: 20, total: 20, tax: 0, discount: 0, paymentMode: 'cash',
} as BranchBillRecord;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  mocks.rpc.mockReturnValue({abortSignal: mocks.allocate});
  mocks.allocate.mockResolvedValue({data: {copy_type: 'original'}, error: null});
  mocks.submit.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('hands SNB receipt HTML to the app printer and surfaces a rejected job', async () => {
  mocks.submit.mockRejectedValue(new Error('Printer unavailable'));
  const complete = vi.fn();
  window.addEventListener(BRANCH_PRINT_COMPLETE_EVENT, complete);
  try {
    await expect(printCounterBill(bill, true)).rejects.toThrow('Printer unavailable');
    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(mocks.submit.mock.calls[0][0]).toContain('DUPLICATE BILL');
    expect(document.querySelector('iframe')).toBeNull();
    expect(complete).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener(BRANCH_PRINT_COMPLETE_EVENT, complete);
  }
});

it('prints after 600 ms while the audit can still finish in the background', async () => {
  vi.useFakeTimers();
  mocks.allocate.mockImplementation((signal: AbortSignal) => new Promise(resolve => {
    signal.addEventListener('abort', () => resolve({error: {message: 'Timeout'}}), {once: true});
  }));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const print = printCounterBill(bill);
  await vi.advanceTimersByTimeAsync(600);
  await print;
  expect(mocks.submit).toHaveBeenCalledOnce();
  const auditSignal = mocks.allocate.mock.calls[0][0] as AbortSignal;
  expect(auditSignal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(4400);
  expect(auditSignal.aborted).toBe(true);
  expect(warning).toHaveBeenCalledOnce();
});

it('submits a marked duplicate immediately while its audit is pending', async () => {
  vi.useFakeTimers();
  mocks.allocate.mockImplementation(() => new Promise(() => {}));
  await printCounterBill(bill, true);
  expect(mocks.submit).toHaveBeenCalledOnce();
  expect(mocks.submit.mock.calls[0][0]).toContain('DUPLICATE BILL');
});

it('prints a provisional receipt without looking up a server document', async () => {
  await printCounterBill({...bill, pendingSync: true});
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.submit.mock.calls[0][0]).toContain('PROVISIONAL - OFFLINE');
});
