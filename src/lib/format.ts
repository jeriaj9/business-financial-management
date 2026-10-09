import { brand } from "@/config/brand";

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(value: number | null | undefined, currency: string = brand.defaultCurrency, options?: { decimals?: number; signed?: boolean }): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const decimals = options?.decimals ?? 2;
  const key = `${currency}|${decimals}`;
  let formatter = moneyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(brand.locale, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    moneyFormatters.set(key, formatter);
  }
  const text = formatter.format(Math.abs(value) < 0.005 && decimals >= 2 ? 0 : value).replace(/^-/, "\u2212");
  return options?.signed && value > 0 ? `+${text}` : text;
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(brand.locale, { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(value);
}

/** Formats a fraction (0.1234) as a percentage ("12.3 %"). */
export function formatPercent(value: number | null | undefined, decimals = 1, options?: { signed?: boolean }): string {
  if (value === null || value === undefined || Number.isNaN(value) || !Number.isFinite(value)) return "—";
  const text = new Intl.NumberFormat(brand.locale, {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value).replace(/^-/, "\u2212");
  return options?.signed && value > 0 ? `+${text}` : text;
}

/** Percentage points, e.g. "+2.4 pts". */
export function formatPoints(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "\u2212" : "";
  return `${sign}${Math.abs(value).toFixed(decimals)} pts`;
}

export function formatDate(value: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return "—";
  const date = value.length <= 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat(brand.locale, options ?? { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function formatMonth(value: string): string {
  const date = new Date(`${value.slice(0, 7)}-15T12:00:00`);
  const text = new Intl.DateTimeFormat(brand.locale, { month: "long", year: "numeric" }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Parses a user-typed number accepting comma or dot decimals. */
export function parseInput(value: string): number | null {
  const cleaned = value.trim().replace(/\s/g, "");
  if (cleaned === "") return null;
  const normalized = cleaned.includes(",") && !cleaned.includes(".") ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
