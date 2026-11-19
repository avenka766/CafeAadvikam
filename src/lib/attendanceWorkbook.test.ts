import { describe, expect, it } from 'vitest';
import { attendanceColumns, parseAttendanceRows } from './attendanceWorkbook';

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

