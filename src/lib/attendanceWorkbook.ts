import type { PayrollDay } from './payrollPersistence';
import { utils, writeFile } from './safeSpreadsheet';

export const attendanceColumns = ['Employee ID', 'Employee Name', 'Date', 'Attendance', 'Breakfast', 'Lunch', 'Dinner'];
export const attendanceStatuses = ['Present', 'Half Day', 'Week Off', 'Absent', 'Unmarked'];
const MAX_ROWS = 10000;

export interface AttendanceImportRow {
  employeeId: string;
  date: string;
  day: number;
  value: PayrollDay;
}

export function downloadAttendanceTemplate(period: string, rows: string[][]) {
  const book = utils.book_new();
  const sheet = utils.aoa_to_sheet([attendanceColumns, ...rows]);
  sheet['!bold'] = [0];
  sheet['!cols'] = [25, 34, 15, 18, 14, 14, 14].map(wch => ({ wch }));
  sheet['!autofilter'] = { startRow: 0, endRow: rows.length, endColumn: 6 };
  utils.book_append_sheet(book, sheet, 'Attendance Import');
  utils.book_append_sheet(book, utils.aoa_to_sheet([
    ['How to fill in this workbook'],
    ['Keep the employee IDs, dates and column headings.'],
    ['Fill all four input columns on each row you want to save. Leave the four inputs blank to skip a row.'],
    ['Attendance values', attendanceStatuses.join(', ')],
    ['Meal values', 'Yes or No for each meal. Payroll deducts ₹10 per Yes.'],
    ['An uploaded row replaces the saved attendance and meal selections for that employee and day.'],
  ]), 'Instructions');
  writeFile(book, 'Attendance-Import-' + period + '.xlsx');
}

export function parseAttendanceRows(rows: unknown[][], period: string, daysInMonth: number): AttendanceImportRow[] {
  const cell = (value: unknown) => String(value ?? '').trim();
  if (!attendanceColumns.every((heading, index) => cell(rows[0]?.[index]) === heading)) {
    throw new Error('Use the Attendance Import template and keep its column headings.');
  }
  if (rows.length > MAX_ROWS + 1) throw new Error('A workbook can contain at most 10,000 attendance rows.');
  const seen = new Set<string>();
  const imported: AttendanceImportRow[] = [];
  rows.slice(1).forEach((row, index) => {
    const [employeeId, , date, attendance, breakfast, lunch, dinner] = attendanceColumns.map((_, column) => cell(row[column]));
    if (![attendance, breakfast, lunch, dinner].some(Boolean)) return;
    const fail = (message: string): never => { throw new Error('Row ' + (index + 2) + ' — ' + message); };
    const day = Number(date.slice(-2));
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 7) !== period || day < 1 || day > daysInMonth) {
      fail('Enter an employee ID and a valid date in ' + period + ' (YYYY-MM-DD).');
    }
    const key = employeeId + ':' + date;
    if (seen.has(key)) fail('This employee and date appear more than once.');
    seen.add(key);
    const status = attendance.toLowerCase();
    if (!attendanceStatuses.some(choice => choice.toLowerCase() === status)) fail('Choose Present, Half Day, Week Off, Absent or Unmarked.');
    const meal = (value: string, name: string) => {
      if (!/^(yes|no)$/i.test(value)) fail('Enter Yes or No for ' + name + '.');
      return value.toLowerCase() === 'yes';
    };
    imported.push({ employeeId, date, day, value: {
      present: status === 'present', half: status === 'half day', woff: status === 'week off', absent: status === 'absent',
      bf: meal(breakfast, 'Breakfast'), lunch: meal(lunch, 'Lunch'), dinner: meal(dinner, 'Dinner'),
    } });
  });
  if (!imported.length) throw new Error('Fill in at least one attendance row before uploading.');
  return imported;
}

export async function readAttendanceTemplate(file: File, period: string, daysInMonth: number) {
  if (!/\.xlsx$/i.test(file.name) || file.size > 8 * 1024 * 1024) throw new Error('Choose an .xlsx workbook smaller than 8 MB.');
  const { read, utils: excel } = await import('xlsx');
  const book = read(await file.arrayBuffer(), { type: 'array', sheetRows: MAX_ROWS + 2 });
  const sheet = book.Sheets['Attendance Import'];
  if (!sheet) throw new Error('The workbook is missing the Attendance Import sheet.');
  const rows = excel.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
  return parseAttendanceRows(rows, period, daysInMonth);
}

