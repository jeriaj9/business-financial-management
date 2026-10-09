// Date helpers that work on ISO calendar dates ("YYYY-MM-DD") to avoid timezone drift.

export type ISODate = string;

const DAY_MS = 86_400_000;

export function toISODate(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function today(): ISODate {
  return toISODate(new Date());
}

/** Parses a calendar date or timestamp into a UTC-midnight epoch for day arithmetic. */
export function dayNumber(value: ISODate | string): number {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNumber(n: number): ISODate {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(dayNumber(date) + days);
}

export function diffDays(later: ISODate | string, earlier: ISODate | string): number {
  return dayNumber(later) - dayNumber(earlier);
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: ISODate): ISODate {
  const [y, m] = date.slice(0, 7).split("-").map(Number);
  return fromDayNumber(Math.floor(Date.UTC(y, m, 0) / DAY_MS));
}

export function addMonths(date: ISODate, months: number): ISODate {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: ISODate): ISODate {
  const n = dayNumber(date);
  const weekday = (new Date(n * DAY_MS).getUTCDay() + 6) % 7; // 0 = Monday
  return fromDayNumber(n - weekday);
}

export function isWithin(date: ISODate | string, from: ISODate, to: ISODate): boolean {
  const n = dayNumber(date);
  return n >= dayNumber(from) && n <= dayNumber(to);
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return dayNumber(a) >= dayNumber(b) ? a : b;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return dayNumber(a) <= dayNumber(b) ? a : b;
}
