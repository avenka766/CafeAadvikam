import { describe, expect, it } from 'vitest';
import { attendanceColumns, buildAttendanceWorkbook, parseAttendanceGrid, parseAttendanceRows } from './attendanceWorkbook';

const row = ['emp_1', 'Employee', '2026-11-08', 'Half Day', 'Yes', 'No', 'Yes'];

describe('attendance workbook import', () => {
  it('skips blank template rows and maps status and meal selections', () => {
    expect(parseAttendanceRows([attendanceColumns, ['emp_2', 'Employee', '2026-11-01'], row], '2026-11', 30)).toEqual([
      { employeeId: 'emp_1', date: '2026-11-08', day: 8,
        value: { present: false, half: true, woff: false, absent: false, bf: true, lunch: false, dinner: true } },
    ]);
  });

  it('rejects duplicate days, invalid periods and incomplete meal entries', () => {
    expect(() => parseAttendanceRows([attendanceColumns, row, row], '2026-11', 30)).toThrow('Row 3');
    expect(() => parseAttendanceRows([attendanceColumns, row], '2026-12', 31)).toThrow('valid date');
    expect(() => parseAttendanceRows([attendanceColumns, row.slice(0, 6)], '2026-11', 30)).toThrow('Yes or No for Dinner');
  });
});


it('builds a month grid with frozen employee columns and dropdowns', () => {
  const workbook = buildAttendanceWorkbook('2026-02', 28, [{ id: 'emp_1', name: 'Employee' }]);
  expect(workbook.SheetNames).toEqual(['Attendance', 'Canteen', 'Instructions']);
  expect(workbook.Sheets.Attendance.rows[0].slice(2)).toHaveLength(28);
  expect(workbook.Sheets.Attendance.rows[0].at(-1)).toBe('2026-02-28');
  expect(workbook.Sheets.Attendance['!freeze']).toEqual({ rows: 1, columns: 2 });
  expect(workbook.Sheets.Attendance['!dropdown']?.values).toContain('Week Off');
  expect(workbook.Sheets.Canteen['!dropdown']?.values).toContain('No Meals');
});

it('merges dropdown edits across sheets and preserves blank cells', () => {
  const workbook = buildAttendanceWorkbook('2026-02', 28, [{ id: 'emp_1', name: 'Employee' }]);
  workbook.Sheets.Attendance.rows[1][2] = 'Half Day';
  workbook.Sheets.Canteen.rows[1][2] = 'Breakfast';
  const sheets = Object.fromEntries(Object.entries(workbook.Sheets).map(([name, sheet]) => [name, sheet.rows]));
  expect(parseAttendanceGrid(sheets, '2026-02', 28, () => ({
    present: true, half: false, woff: false, absent: false, bf: true, lunch: false, dinner: true,
  }))).toEqual([{ employeeId: 'emp_1', date: '2026-02-01', day: 1,
    value: { present: false, half: true, woff: false, absent: false, bf: true, lunch: false, dinner: false } }]);
  expect(() => parseAttendanceGrid(sheets, '2026-03', 31, () => undefined)).toThrow('template for 2026-03');
});
