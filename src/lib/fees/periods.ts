import type { FeeFrequency } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * UTC-based month arithmetic.
 *
 * Plan/period boundaries are calendar dates (e.g. "2026-06-01") which, per
 * the `Date` spec, parse as UTC instants. date-fns's `addMonths` /
 * `startOfMonth` / `endOfMonth` operate on the *local* calendar though, so
 * combining them with UTC-instant inputs silently shifts results by a day
 * whenever the host runs outside UTC -- verified in this environment
 * (Asia/Calcutta, UTC+5:30): `startOfMonth(addMonths(new
 * Date("2026-06-01"), 1))` comes back as `2026-06-30T18:30:00.000Z`
 * instead of `2026-07-01`. Doing the month math in UTC directly keeps
 * period boundaries stable regardless of server timezone.
 *
 * Invariant: `date` must already be a start-of-month date. Unlike date-fns's
 * real `addMonths`, this does not clamp day-of-month overflow to the last day
 * of the target month -- it's only exercised here against day-1 inputs, so
 * that clamping behavior was never needed.
 */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

/**
 * Formats a UTC-anchored date as "MMM yyyy" (e.g. "Sep 2026") without going
 * through the host's local timezone -- date-fns's `format` reads local wall-
 * clock time, so a period boundary like `Date.UTC(2026, 6, 1)` would render
 * as "Jun 2026" instead of "Jul 2026" in a negative-UTC-offset timezone.
 */
export function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export type PeriodStatus = "PAID" | "PARTIAL" | "DUE" | "OVERDUE";

export type Period = {
  index: number;
  start: Date;
  end: Date;
  dueDate: Date;
  amountDue: Decimal;
};

/** Calendar months per period. CUSTOM has no recurring cycle (0 = "not applicable"). */
export function periodLengthInMonths(frequency: FeeFrequency): number {
  switch (frequency) {
    case "MONTHLY":
      return 1;
    case "QUARTERLY":
      return 3;
    case "YEARLY":
      return 12;
    case "CUSTOM":
      return 0;
  }
}

/** Start of the next period after `date` (which must itself be a period start). Throws for CUSTOM. */
export function advancePeriodStart(date: Date, frequency: FeeFrequency): Date {
  const months = periodLengthInMonths(frequency);
  if (months === 0) {
    throw new Error("CUSTOM frequency has no recurring periods to advance through");
  }
  return startOfMonth(addMonths(date, months));
}

/**
 * Periods from the plan's start date through (and including) the period
 * containing `asOf` -- never future periods beyond that. CUSTOM yields at
 * most one period (Decision 3a in the Phase 2 spec): the whole finalAmount,
 * due once, with no recurring cycle.
 */
export function enumeratePeriods(
  planStartDate: Date,
  frequency: FeeFrequency,
  amountPerPeriod: Decimal,
  asOf: Date
): Period[] {
  if (frequency === "CUSTOM") {
    if (planStartDate > asOf) return [];
    return [
      { index: 0, start: planStartDate, end: planStartDate, dueDate: planStartDate, amountDue: amountPerPeriod },
    ];
  }

  const periods: Period[] = [];
  let start = startOfMonth(planStartDate);
  let index = 0;
  const months = periodLengthInMonths(frequency);
  while (start <= asOf) {
    const end = endOfMonth(addMonths(start, months - 1));
    periods.push({ index, start, end, dueDate: end, amountDue: amountPerPeriod });
    start = advancePeriodStart(start, frequency);
    index++;
  }
  return periods;
}

/**
 * PARTIAL takes precedence over OVERDUE: once any payment has landed on a
 * period, it reads as "Partial" regardless of whether its due date has since
 * passed (matches the master spec's Fee History example, where a partially
 * paid past month shows "Partial", not "Overdue").
 */
export function calculatePeriodStatus(
  amountDue: Decimal,
  amountPaid: Decimal,
  dueDate: Date,
  today: Date
): PeriodStatus {
  if (amountPaid.gte(amountDue)) return "PAID";
  if (amountPaid.gt(0)) return "PARTIAL";
  if (today > dueDate) return "OVERDUE";
  return "DUE";
}

/**
 * The coverage range a new payment of `periodsCovered` periods would span,
 * starting at `coverageStart`. Invariant: `coverageStart` must be a
 * start-of-month date -- every current call site already passes one.
 */
export function computeCoverageRange(
  coverageStart: Date,
  periodsCovered: number,
  frequency: FeeFrequency
): { coverageStart: Date; coverageEnd: Date } {
  if (frequency === "CUSTOM") {
    return { coverageStart, coverageEnd: coverageStart };
  }
  const months = periodLengthInMonths(frequency) * periodsCovered;
  const coverageEnd = endOfMonth(addMonths(coverageStart, months - 1));
  return { coverageStart, coverageEnd };
}
