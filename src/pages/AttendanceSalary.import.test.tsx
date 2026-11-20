import type { PropsWithChildren } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { utils, write } from 'xlsx';
import type { WorkBook } from '@/lib/safeSpreadsheet';
import AttendanceSalary from './AttendanceSalary';

const mocks = vi.hoisted(() => ({
  saved: { present: true, half: false, woff: false, absent: false, bf: true, lunch: false, dinner: false },
  upsert: vi.fn(),
  download: vi.fn(),
}));

vi.mock('@/components/admin/AdminPayrollGate', () => ({ default: ({ children }: PropsWithChildren) => children }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: () => 'admin' }));
vi.mock('@/lib/safeSpreadsheet', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/safeSpreadsheet')>(),
  writeFile: mocks.download,
}));
vi.mock('@/lib/supabase', () => ({
  fetchAllRows: async (table: string) => ({
    data: table === 'employees' ? [
      { id: 'employee-1', name: 'Example Staff', branch: 'SNB', department: 'Packing', is_active: true },
      { id: 'employee-2', name: 'Second Staff', branch: 'SNB', department: 'Packing', is_active: true },
    ] : table === 'attendance' ? [{ employee_id: 'employee-1', day: 1, ...mocks.saved }] : [],
  }),
  supabase: {
    from: () => ({
      select: () => ({ order: async () => ({ data: [] }), eq: () => ({ eq: async () => ({ data: [] }) }) }),
      upsert: mocks.upsert,
    }),
    rpc: async (name: string) => ({ data: name === 'admin_paid_payroll_snapshots_v1' ? [] : {} }),
  },
}));

function toFile(workbook: WorkBook) {
  const xlsx = utils.book_new();
  for (const name of workbook.SheetNames) utils.book_append_sheet(xlsx, utils.aoa_to_sheet(workbook.Sheets[name].rows), name);
  const bytes: ArrayBuffer = write(xlsx, { type: 'array', bookType: 'xlsx' });
  const file = new File([bytes], 'attendance.xlsx');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes });
  return file;
}

it('syncs a selected workbook on demand and includes the changes on the next download', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const button = (label: string) => Array.from(host.querySelectorAll('button')).find(el => el.textContent === label)!;
  const download = async (): Promise<WorkBook> => {
    await act(async () => button('Download Attendance Template').click());
    return mocks.download.mock.lastCall![0];
  };
  const selectFile = async (workbook: WorkBook) => {
    const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [toFile(workbook)] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  };

  try {
    mocks.upsert.mockResolvedValue({ error: null });
    await act(async () => root.render(<AttendanceSalary />));
    const first = await download();
    expect(first.Sheets.Attendance.rows[1].slice(2, 5)).toEqual(['Present', '', '']);
    expect(first.Sheets.Canteen.rows[1].slice(2, 5)).toEqual(['Breakfast', '', '']);
    expect(button('Sync Attendance').disabled).toBe(true);

    first.Sheets.Attendance.rows[1][2] = '';
    first.Sheets.Attendance.rows[1][3] = 'Absent';
    first.Sheets.Attendance.rows[2][3] = 'Present';
    first.Sheets.Canteen.rows[1][3] = 'Lunch + Dinner';
    await selectFile(first);
    expect(mocks.upsert).not.toHaveBeenCalled();
    mocks.upsert.mockResolvedValueOnce({ error: { message: 'Connection lost' } });
    await act(async () => button('Sync Attendance').click());
    expect(host.querySelector('[role=alert]')?.textContent).toBe('Connection lost');
    expect((await download()).Sheets.Attendance.rows[1][3]).toBe('');

    await act(async () => button('Sync Attendance').click());
    expect(mocks.upsert.mock.lastCall![0]).toEqual([
      expect.objectContaining({ employee_id: 'employee-1', day: 2, absent: true, lunch: true, dinner: true }),
      expect.objectContaining({ employee_id: 'employee-2', day: 2, present: true }),
    ]);
    expect(host.textContent).toContain('Synced 2 attendance days');
    expect(button('Sync Attendance').disabled).toBe(true);
    const second = await download();
    expect(second.Sheets.Attendance.rows[1].slice(2, 5)).toEqual(['Present', 'Absent', '']);
    expect(second.Sheets.Attendance.rows[2][3]).toBe('Present');
    expect(second.Sheets.Canteen.rows[1].slice(2, 5)).toEqual(['Breakfast', 'Lunch + Dinner', '']);

    second.Sheets.Attendance.rows[1][4] = 'Half Day';
    await selectFile(second);
    await act(async () => button('Sync Attendance').click());
    expect(mocks.upsert.mock.lastCall![0]).toEqual([
      expect.objectContaining({ employee_id: 'employee-1', day: 3, half: true }),
    ]);
    const updated = await download();
    expect(updated.Sheets.Attendance.rows[1].slice(2, 5)).toEqual(['Present', 'Absent', 'Half Day']);

    mocks.upsert.mockClear();
    await selectFile(updated);
    await act(async () => button('Sync Attendance').click());
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(host.textContent).toContain('The workbook already matches the saved attendance.');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
