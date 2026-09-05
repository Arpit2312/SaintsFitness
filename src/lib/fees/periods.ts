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
 * that clamping behavior was never needed. Enforced at runtime (see below)
 * since this function is a public export: every current call path already
 * floors its input via `startOfMonth` first (e.g. `enumeratePeriods`'s
 * `planStartDate`, however the admin entered it, is floored before it ever
 * reaches here), so this guard should never fire for legitimate usage --
 * it exists to catch a future caller that bypasses that flooring.
 */
export function addMonths(date: Date, months: number): Date {
  if (date.getUTCDate() !== 1) {
    throw new Error(
      `addMonths expects a start-of-month date, got ${date.toISOString()} -- call startOfMonth() first`
    );
  }
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
 * Client-safe, plain-number preview of `resolveActualPeriodsCovered`
 * (src/lib/fees/fee-history.ts) for the AddPaymentDialog's live coverage
 * preview. That function's real, authoritative counterpart runs server-side
 * in Decimal against the plan's actual payment rows; this mirrors its exact
 * loop against the already-serialized `periods` (amountDue/amountPaid as
 * plain numbers, per SerializedPeriod) the client already has on hand, so
 * the dialog doesn't have to ship raw payment rows down to render a
 * preview. Never authoritative -- createPayment always recomputes for real
 * before writing coverageEnd -- so plain-number rounding here is harmless.
 *
 * Kept in this client-safe module (rather than fee-history.ts, which is
 * fine to import client-side too but is Decimal-typed throughout) so the
 * numeric-only contract is obvious at the import site.
 */
export function previewActualPeriodsCovered(
  periods: { start: Date; amountDue: number; amountPaid: number }[],
  amountPerPeriod: number,
  frequency: FeeFrequency,
  coverageStartBase: Date,
  amount: number,
  minPeriodsCovered: number
): number {
  if (frequency === "CUSTOM") return 1;

  const MAX_PERIODS = 120; // mirrors resolveActualPeriodsCovered's fat-finger ceiling

  const remainingByStartTime = new Map(periods.map((p) => [p.start.getTime(), p.amountDue - p.amountPaid]));

  let remainingAmount = amount;
  let periodStart = coverageStartBase;
  let count = 0;

  while (count < minPeriodsCovered || (remainingAmount > 0 && count < MAX_PERIODS)) {
    if (count >= MAX_PERIODS) break;
    const due = remainingByStartTime.get(periodStart.getTime()) ?? amountPerPeriod;
    remainingAmount -= Math.max(due, 0);
    count += 1;
    periodStart = advancePeriodStart(periodStart, frequency);
  }
  return count;
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
