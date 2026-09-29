const DAY_MS = 86_400_000;

export interface CivilRange {
  end: Date;
  endDate: string;
  start: Date;
  startDate: string;
  startOrdinal: number;
}

export function assertValidTimezone(timezone: string): void {
  new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
}

export function formatLocalDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const result = `${read('year')}-${read('month')}-${read('day')}`;
  return result;
}

export function localMidnightToUtc(
  localOrdinal: number,
  timezone: string,
): Date {
  let candidate = localOrdinal;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      timeZone: timezone,
      year: 'numeric',
    }).formatToParts(new Date(candidate));
    const read = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    const represented = Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      read('hour'),
      read('minute'),
      read('second'),
    );
    candidate -= represented - localOrdinal;
  }
  const result = new Date(candidate);
  return result;
}

export function civilDateFromOrdinal(ordinal: number): string {
  const result = new Date(ordinal).toISOString().slice(0, 10);
  return result;
}

export function getCivilDayOrdinal(date: Date, timezone: string): number {
  const [year, month, day] = formatLocalDate(date, timezone)
    .split('-')
    .map(Number) as [number, number, number];
  const result = Date.UTC(year, month - 1, day);
  return result;
}

export function getWeekRange(date: Date, timezone: string): CivilRange {
  const ordinal = getCivilDayOrdinal(date, timezone);
  const weekday = new Date(ordinal).getUTCDay() || 7;
  const startOrdinal = ordinal - (weekday - 1) * DAY_MS;
  const endOrdinal = startOrdinal + 7 * DAY_MS;
  const result = {
    end: localMidnightToUtc(endOrdinal, timezone),
    endDate: civilDateFromOrdinal(endOrdinal - DAY_MS),
    start: localMidnightToUtc(startOrdinal, timezone),
    startDate: civilDateFromOrdinal(startOrdinal),
    startOrdinal,
  };
  return result;
}

export function getLast30DaysRange(date: Date, timezone: string): CivilRange {
  const todayOrdinal = getCivilDayOrdinal(date, timezone);
  const startOrdinal = todayOrdinal - 29 * DAY_MS;
  const endOrdinal = todayOrdinal + DAY_MS;
  const result = {
    end: localMidnightToUtc(endOrdinal, timezone),
    endDate: civilDateFromOrdinal(todayOrdinal),
    start: localMidnightToUtc(startOrdinal, timezone),
    startDate: civilDateFromOrdinal(startOrdinal),
    startOrdinal,
  };
  return result;
}

export function getEightWeekRange(date: Date, timezone: string): CivilRange {
  const current = getWeekRange(date, timezone);
  const startOrdinal = current.startOrdinal - 7 * 7 * DAY_MS;
  const result = {
    end: current.end,
    endDate: current.endDate,
    start: localMidnightToUtc(startOrdinal, timezone),
    startDate: civilDateFromOrdinal(startOrdinal),
    startOrdinal,
  };
  return result;
}

export const CIVIL_DAY_MS = DAY_MS;
