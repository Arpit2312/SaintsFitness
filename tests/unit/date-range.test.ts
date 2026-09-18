// tests/unit/date-range.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveDateRange, generateBuckets } from "@/lib/reports/date-range";
import { formatDateUTC } from "@/lib/dates";

describe("resolveDateRange", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to this-month when no range is given", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T10:00:00.000Z"));
    const result = resolveDateRange({});
    expect(result.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(result.to.toISOString()).toBe("2026-09-13T23:59:59.999Z");
    expect(result.bucketSize).toBe("day");
  });

  it("resolves last-3-months to the start of the month two months back", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T10:00:00.000Z"));
    const result = resolveDateRange({ range: "last-3-months" });
    expect(result.from.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(result.to.toISOString()).toBe("2026-09-13T23:59:59.999Z");
  });

  it("resolves this-year to Jan 1st of the current year, bucketed by month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T10:00:00.000Z"));
    const result = resolveDateRange({ range: "this-year" });
    expect(result.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(result.bucketSize).toBe("month");
  });

  it("resolves a valid custom range", () => {
    const result = resolveDateRange({ range: "custom", from: "2026-01-01", to: "2026-01-10" });
    expect(result.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(result.to.toISOString()).toBe("2026-01-10T23:59:59.999Z");
    expect(result.bucketSize).toBe("day");
  });

  it("falls back to this-month when custom from is after to", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T10:00:00.000Z"));
    const result = resolveDateRange({ range: "custom", from: "2026-01-10", to: "2026-01-01" });
    expect(result.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("falls back to this-month when custom from/to are unparseable", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T10:00:00.000Z"));
    const result = resolveDateRange({ range: "custom", from: "not-a-date", to: "2026-01-01" });
    expect(result.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("generateBuckets", () => {
  it("creates one bucket per day for a short range", () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-03T23:59:59.999Z");
    const buckets = generateBuckets(from, to, "day");
    expect(buckets).toHaveLength(3);
    // Compare against formatDateUTC rather than a literal: newer ICU/CLDR
    // versions render September as "Sept" in en-GB, older ones as "Sep".
    expect(buckets[0].label).toBe(formatDateUTC(from));
    expect(buckets[0].label).toMatch(/^01 Sep\w* 2026$/);
    expect(buckets[0].start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(buckets[0].end.toISOString()).toBe("2026-09-01T23:59:59.999Z");
    expect(buckets[2].end.toISOString()).toBe(to.toISOString());
  });

  it("creates 7-day buckets aligned to `from`, clipping the final bucket to `to`", () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-10T23:59:59.999Z"); // 10 days
    const buckets = generateBuckets(from, to, "week");
    expect(buckets).toHaveLength(2);
    expect(buckets[0].start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(buckets[0].end.toISOString()).toBe("2026-09-07T23:59:59.999Z");
    expect(buckets[1].start.toISOString()).toBe("2026-09-08T00:00:00.000Z");
    expect(buckets[1].end.toISOString()).toBe(to.toISOString());
  });

  it("creates one bucket per calendar month, aligned to the 1st even if `from` isn't", () => {
    const from = new Date("2026-01-15T00:00:00.000Z");
    const to = new Date("2026-03-31T23:59:59.999Z");
    const buckets = generateBuckets(from, to, "month");
    expect(buckets.map((b) => b.label)).toEqual(["Jan 2026", "Feb 2026", "Mar 2026"]);
    expect(buckets[0].start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
