const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

export function businessDate(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

export function isBusinessDate(value: Date | string | number, dateKey = businessDate()): boolean {
  return businessDate(value) === dateKey;
}

// EGRESS FIX: shared helper so every "today only" query across the app uses the
// exact same IST business-day boundary instead of each file re-deriving its own
// (buggy/UTC-based) midnight, which used to cause over-fetching of prior-day rows.
export function startOfBusinessDayISO(value: Date | string | number = new Date()): string {
  const dateKey = businessDate(value);
  return new Date(`${dateKey}T00:00:00+05:30`).toISOString();
}

export function businessDateTime(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

export { BUSINESS_TIME_ZONE };
