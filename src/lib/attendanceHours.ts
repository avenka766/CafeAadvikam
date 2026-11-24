export type AttendanceTimes = { in_time?: string | null; out_time?: string | null };

// November 2026 payroll applies food deductions only to unpaid salaries.
export const foodOnlyPayroll = (year?: number, month?: number) => year === 2026 && month === 11;

export function shiftMinutes(inTime: string, outTime: string) {
  const minutes = (value: string) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(value)) return NaN;
    const [hours, mins] = value.split(':').map(Number);
    return hours * 60 + mins;
  };
  const duration = (minutes(outTime) - minutes(inTime) + 1440) % 1440;
  return duration > 0 ? duration : undefined;
}

export const formatWorkDuration = (duration: number) =>
  Math.floor(Math.round(duration) / 60) + 'h ' + (Math.round(duration) % 60) + 'm';

type WorkDay = AttendanceTimes & { present: boolean; half: boolean };
export function summarizeWorkHours(days: Array<WorkDay | undefined>) {
  let minutes = 0;
  let shifts = 0;
  let missing = 0;
  let longest = 0;
  for (const day of days) {
    if (!day) continue;
    const duration = day.in_time && day.out_time ? shiftMinutes(day.in_time, day.out_time) : undefined;
    if (duration !== undefined) {
      minutes += duration;
      shifts++;
      longest = Math.max(longest, duration);
    } else if (day.present || day.half || day.in_time || day.out_time) {
      missing++;
    }
  }
  return { minutes, shifts, missing, longest };
}
