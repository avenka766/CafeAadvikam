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

type AttendanceLookup = (employeeId: string, day: number) => PayrollDay | undefined;

const gridSheets = [
  { name: 'Attendance', choices: attendanceStatuses },
  { name: 'Breakfast', choices: ['Yes', 'No'] },
  { name: 'Lunch', choices: ['Yes', 'No'] },
  { name: 'Dinner', choices: ['Yes', 'No'] },
];
const canteenChoices = ['No Meals', 'Breakfast', 'Lunch', 'Dinner', 'Breakfast + Lunch',
  'Breakfast + Dinner', 'Lunch + Dinner', 'Breakfast + Lunch + Dinner'];
const templateSheets = [gridSheets[0], { name: 'Canteen', choices: canteenChoices }];
const dateColumns = (period: string, daysInMonth: number) =>
  Array.from({ length: daysInMonth }, (_, index) => period + '-' + String(index + 1).padStart(2, '0'));
const gridHeaders = (period: string, daysInMonth: number) =>
  ['Employee ID', 'Employee Name', ...dateColumns(period, daysInMonth)];

function attendanceStatus(value?: PayrollDay) {
  if (value?.present) return 'Present';
  if (value?.half) return 'Half Day';
  if (value?.woff) return 'Week Off';
  if (value?.absent) return 'Absent';
  return 'Unmarked';
}

function canteenSelection(value?: PayrollDay) {
  const meals: string[] = [];
  if (value?.bf) meals.push('Breakfast');
  if (value?.lunch) meals.push('Lunch');
  if (value?.dinner) meals.push('Dinner');
  return meals.join(' + ') || 'No Meals';
}

export function sameAttendanceDay(saved: PayrollDay | undefined, incoming: PayrollDay) {
  return attendanceStatus(saved) === attendanceStatus(incoming) &&
    canteenSelection(saved) === canteenSelection(incoming);
}

export function buildAttendanceWorkbook(
  period: string,
  daysInMonth: number,
  employees: { id: string; name: string }[],
  current: AttendanceLookup = () => undefined,
) {
  const book = utils.book_new();
  const headers = gridHeaders(period, daysInMonth);
  for (const { name, choices } of templateSheets) {
    const sheet = utils.aoa_to_sheet([headers, ...employees.map(employee => [
      employee.id, employee.name, ...Array.from({ length: daysInMonth }, (_, index) => {
        const saved = current(employee.id, index + 1);
        if (!saved) return '';
        if (name === 'Canteen') return canteenSelection(saved);
        const status = attendanceStatus(saved);
        return status === 'Unmarked' ? '' : status;
      }),
    ])]);
    sheet['!bold'] = [0];
    sheet['!cols'] = headers.map((_, index) => ({ wch: index === 0 ? 24 : index === 1 ? 32 : 15 }));
    sheet['!autofilter'] = { startRow: 0, endRow: employees.length, endColumn: headers.length - 1 };
    sheet['!freeze'] = { rows: 1, columns: 2 };
    sheet['!dropdown'] = { values: choices, lastColumn: headers.length - 1, lastRow: employees.length + 1 };
    utils.book_append_sheet(book, sheet, name);
  }
  const guide = utils.aoa_to_sheet([
    ['Attendance & meals', period],
    ['Attendance', 'Select a date cell and use its dropdown or press Alt + Down Arrow.'],
    ['Canteen', 'Select the meals taken on each date. Each meal costs ₹10. Choose No Meals to clear all meals for the day.'],
    ['Blank cells', 'Leave blank to keep the existing attendance or meal value.'],
    ['Unmarked', 'Clears the attendance mark for that date.'],
    ['Sync', 'Keep employee IDs, date headings, and worksheet names. Save as .xlsx, choose the file in Attendance, and click Sync Attendance.'],
  ]);
  guide['!bold'] = [0];
  guide['!cols'] = [{ wch: 30 }, { wch: 105 }];
  utils.book_append_sheet(book, guide, 'Instructions');
  return book;
}

export function downloadAttendanceTemplate(
  period: string, daysInMonth: number, employees: { id: string; name: string }[], current: AttendanceLookup,
) {
  writeFile(buildAttendanceWorkbook(period, daysInMonth, employees, current), 'Attendance-Import-' + period + '.xlsx');
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

export function parseAttendanceGrid(
  sheets: Record<string, unknown[][]>, period: string, daysInMonth: number,
  current: AttendanceLookup,
) {
  const text = (value: unknown) => String(value ?? '').trim();
  const headers = gridHeaders(period, daysInMonth);
  const datedRows = new Map<string, string[]>();
  if (sheets.Canteen) {
    const rows = sheets.Canteen;
    if (!headers.every((header, index) => text(rows[0]?.[index]) === header)) {
      throw new Error('Canteen - Download a template for ' + period + ' and keep the date headings.');
    }
    sheets = { ...sheets };
    for (const meal of ['Breakfast', 'Lunch', 'Dinner']) {
      sheets[meal] = [rows[0], ...rows.slice(1).map((row, index) => [
        ...row.slice(0, 2),
        ...row.slice(2).map((cell, dateIndex) => {
          const input = text(cell);
          if (!input) return '';
          const choice = canteenChoices.find(value => value.toLowerCase() === input.toLowerCase());
          if (!choice || !headers[dateIndex + 2]) {
            throw new Error('Canteen - Invalid meal selection on row ' + (index + 2) + '.');
          }
          return choice.split(' + ').includes(meal) ? 'Yes' : 'No';
        }),
      ])];
    }
  }
  gridSheets.forEach(({ name, choices }, sheetIndex) => {
    const rows = sheets[name];
    if (!rows || !headers.every((header, index) => text(rows[0]?.[index]) === header)) {
      throw new Error(name + ' — Download a template for ' + period + ' and keep the date headings.');
    }
    const employees = new Set<string>();
    rows.slice(1).forEach((row, rowIndex) => {
      const employeeId = text(row[0]);
      const inputs = row.slice(2).map(text);
      if (!employeeId && !inputs.some(Boolean)) return;
      if (!employeeId || employees.has(employeeId)) throw new Error(name + ' — Missing or duplicate employee ID on row ' + (rowIndex + 2) + '.');
      employees.add(employeeId);
      inputs.forEach((input, dateIndex) => {
        if (!input) return;
        const date = headers[dateIndex + 2];
        const value = choices.find(choice => choice.toLowerCase() === input.toLowerCase());
        if (!date || !value) throw new Error(name + ' — Invalid selection on row ' + (rowIndex + 2) + ', ' + (date ?? 'outside the selected month') + '.');
        const day = dateIndex + 1;
        const key = employeeId + ':' + date;
        let result = datedRows.get(key);
        if (!result) {
          const saved = current(employeeId, day);
          result = [employeeId, text(row[1]), date, attendanceStatus(saved),
            ...[saved?.bf, saved?.lunch, saved?.dinner].map(flag => flag ? 'Yes' : 'No')];
          datedRows.set(key, result);
        }
        result[3 + sheetIndex] = value;
      });
    });
  });
  return parseAttendanceRows([attendanceColumns, ...datedRows.values()], period, daysInMonth);
}

export async function readAttendanceTemplate(file: File, period: string, daysInMonth: number, current: AttendanceLookup) {
  if (!/\.xlsx$/i.test(file.name) || file.size > 8 * 1024 * 1024) throw new Error('Choose an .xlsx workbook smaller than 8 MB.');
  const { read, utils: excel } = await import('xlsx');
  const book = read(await file.arrayBuffer(), { type: 'array', sheetRows: MAX_ROWS + 2 });
  const readSheet = (name: string) => {
    const sheet = book.Sheets[name];
    return sheet ? excel.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false }) : [];
  };
  if (book.Sheets['Attendance Import']) return parseAttendanceRows(readSheet('Attendance Import'), period, daysInMonth);
  return parseAttendanceGrid(Object.fromEntries((book.Sheets.Canteen ? templateSheets : gridSheets).map(({ name }) => [name, readSheet(name)])), period, daysInMonth, current);
}
