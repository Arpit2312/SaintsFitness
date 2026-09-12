/**
 * Shared UTC-anchored date helpers. Calendar-date fields throughout this
 * system (FeePlan.dueDate, Payment.coverageStart/coverageEnd,
 * Attendance.date, etc.) are stored and compared as UTC-midnight instants
 * standing in for a plain calendar day -- date-fns's local-time equivalents
 * (startOfMonth/startOfDay/format/etc.) silently corrupt these boundaries
 * whenever the host runs outside UTC (see src/lib/fees/periods.ts's
 * addMonths comment for the original, verified repro of this bug class).
 * This module extends that same UTC-anchoring convention from month
 * boundaries to day boundaries and weekday reads, needed by Attendance and
 * by a Phase 1 Dashboard follow-up fix.
 */

export function startOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function endOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

/** e.g. "Mon", matching Batch.days' exact 3-letter format (src/lib/validations/batch.ts's DAYS list). */
export function weekdayAbbrevUTC(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(date);
}

/**
 * Today's calendar date in IST (Asia/Kolkata), as a UTC-midnight instant --
 * mirrors the IST-pinning pattern already established in
 * src/components/layout/header.tsx's currentHourInIST, extended from "hour"
 * to "calendar date". `en-CA` is a locale-formatting trick, not a Canada
 * reference: its default date format is exactly "YYYY-MM-DD", which a plain
 * `new Date(...)` then parses as UTC midnight per the Date spec's
 * date-only-string handling.
 */
export function todayInIST(): Date {
  const isoDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Date(isoDate);
}

/** Formats a UTC-anchored date as "dd MMM yyyy" (e.g. "05 Jun 2026") without reading local time. */
export function formatDateUTC(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
