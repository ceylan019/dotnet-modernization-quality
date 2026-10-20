export const FIXED_TODAY = '2026-10-15';

// Mirrors legacy/db/04-reference-data.sql (Ontario, 2024 to 2027).
export const HOLIDAYS: readonly string[] = [
  '2024-01-01', '2024-02-19', '2024-03-29', '2024-05-20', '2024-07-01',
  '2024-08-05', '2024-09-02', '2024-10-14', '2024-12-25', '2024-12-26',
  '2025-01-01', '2025-02-17', '2025-04-18', '2025-05-19', '2025-07-01',
  '2025-08-04', '2025-09-01', '2025-10-13', '2025-12-25', '2025-12-26',
  '2026-01-01', '2026-02-16', '2026-04-03', '2026-05-18', '2026-07-01',
  '2026-08-03', '2026-09-07', '2026-10-12', '2026-12-25', '2026-12-28',
  '2027-01-01', '2027-02-15', '2027-03-26', '2027-05-24', '2027-07-01',
  '2027-08-02', '2027-09-06', '2027-10-11', '2027-12-27', '2027-12-28',
];

const HOLIDAY_SET = new Set(HOLIDAYS);
const DAY_MS = 86_400_000;

// Dates are 'YYYY-MM-DD' strings and timestamps 'YYYY-MM-DD HH:MM:SS'; all maths is UTC so the clock never matters.
function dateToMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

export function msToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return msToDate(dateToMs(date) + days * DAY_MS);
}

export function diffDays(from: string, to: string): number {
  return Math.round((dateToMs(to) - dateToMs(from)) / DAY_MS);
}

export function weekday(date: string): number {
  return new Date(dateToMs(date)).getUTCDay();
}

export function isHoliday(date: string): boolean {
  return HOLIDAY_SET.has(date);
}

// Same rule as dbo.fn_AddBusinessDays: the start day never counts.
export function addBusinessDays(start: string, days: number): string {
  let current = start;
  let counted = 0;
  while (counted < days) {
    current = addDays(current, 1);
    const day = weekday(current);
    if (day !== 0 && day !== 6 && !isHoliday(current)) {
      counted += 1;
    }
  }
  return current;
}

export function tsToMs(timestamp: string): number {
  return dateToMs(timestamp.slice(0, 10)) + secondsOfDay(timestamp) * 1000;
}

function secondsOfDay(timestamp: string): number {
  const [h, m, s] = timestamp.slice(11).split(':').map(Number) as [number, number, number];
  return h * 3600 + m * 60 + s;
}

export function msToTs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

export function addSeconds(timestamp: string, seconds: number): string {
  return msToTs(tsToMs(timestamp) + seconds * 1000);
}

// Mirrors dbo.fn_EffectiveStatus: DATEDIFF(day, ...) counts calendar day boundaries.
export function effectiveStatus(status: string, lastUpdatedAt: string, today: string): string {
  if ((status === 'Submitted' || status === 'InfoRequested') && diffDays(lastUpdatedAt.slice(0, 10), today) > 180) {
    return 'Expired';
  }
  return status;
}
