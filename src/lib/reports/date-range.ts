// src/lib/reports/date-range.ts
import { startOfUTCDay, endOfUTCDay, todayInIST, formatDateUTC } from "@/lib/dates";
import { startOfMonth, endOfMonth, addMonths, formatMonthYear } from "@/lib/fees/periods";

export type RangeParams = {
  range?: string;
  from?: string;
  to?: string;
};

export type BucketSize = "day" | "week" | "month";

export type ResolvedRange = {
  from: Date;
  to: Date;
  bucketSize: BucketSize;
};

export type Bucket = { start: Date; end: Date; label: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateParam(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function bucketSizeFor(from: Date, to: Date): BucketSize {
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
  if (days <= 31) return "day";
  if (days <= 90) return "week";
  return "month";
}

/**
 * Resolves the searchParams-encoded range into concrete UTC boundaries plus
 * the bucket size every chart/query should use for this range. An invalid
 * or backwards custom range (unparseable from/to, or from after to) falls
 * back to the default preset rather than throwing -- a hand-edited or
 * stale URL shouldn't crash the page.
 */
export function resolveDateRange(params: RangeParams): ResolvedRange {
  const today = todayInIST();

  if (params.range === "custom") {
    const from = parseDateParam(params.from);
    const to = parseDateParam(params.to);
    if (from && to && from.getTime() <= to.getTime()) {
      const resolvedFrom = startOfUTCDay(from);
      const resolvedTo = endOfUTCDay(to);
      return { from: resolvedFrom, to: resolvedTo, bucketSize: bucketSizeFor(resolvedFrom, resolvedTo) };
    }
  } else if (params.range === "last-3-months") {
    const from = addMonths(startOfMonth(today), -2);
    const to = endOfUTCDay(today);
    return { from, to, bucketSize: bucketSizeFor(from, to) };
  } else if (params.range === "this-year") {
    const from = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    const to = endOfUTCDay(today);
    return { from, to, bucketSize: bucketSizeFor(from, to) };
  }

  // Default / "this-month" / any unrecognized or invalid value.
  const from = startOfMonth(today);
  const to = endOfUTCDay(today);
  return { from, to, bucketSize: bucketSizeFor(from, to) };
}

/**
 * Splits [from, to] into contiguous, non-overlapping buckets sized by
 * `bucketSize`. Month buckets align to calendar months (the first bucket
 * starts at startOfMonth(from), even if `from` isn't the 1st); day/week
 * buckets align to `from` itself rather than the calendar week, which is
 * simpler and fully deterministic. The final bucket is clipped to `to`.
 */
export function generateBuckets(from: Date, to: Date, bucketSize: BucketSize): Bucket[] {
  const buckets: Bucket[] = [];

  if (bucketSize === "month") {
    let cursor = startOfMonth(from);
    while (cursor.getTime() <= to.getTime()) {
      buckets.push({ start: cursor, end: endOfMonth(cursor), label: formatMonthYear(cursor) });
      cursor = addMonths(cursor, 1);
    }
    return buckets;
  }

  const stepMs = bucketSize === "week" ? 7 * DAY_MS : DAY_MS;
  let cursor = startOfUTCDay(from);
  while (cursor.getTime() <= to.getTime()) {
    const end = new Date(Math.min(cursor.getTime() + stepMs - 1, to.getTime()));
    buckets.push({ start: cursor, end, label: formatDateUTC(cursor) });
    cursor = new Date(cursor.getTime() + stepMs);
  }
  return buckets;
}
