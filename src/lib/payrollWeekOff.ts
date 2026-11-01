export function payrollWeekOffLimit(employee: {department: string; weekOffOverrides?: Record<string, number>}, year: number, month: number): number {
  const override = employee.weekOffOverrides?.[`${year}-${String(month).padStart(2, '0')}`];
  if (Number.isInteger(override) && override! >= 0 && override! <= 31) return override!;
  if (!employee.department.trim().toLowerCase().startsWith('admin')) return 4;
  let sundays = 0;
  for (let day = 1; day <= new Date(year, month, 0).getDate(); day++) {
    if (new Date(year, month - 1, day).getDay() === 0) sundays++;
  }
  return sundays >= 5 ? 5 : 4;
}
