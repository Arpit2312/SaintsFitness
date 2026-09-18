// tests/unit/date-range.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveDateRange, generateBuckets, normalizeRangeParam } from "@/lib/reports/date-range";
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

  it("uses the IST date across the UTC day rollover", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T20:00:00.000Z")); // 01:30 IST on Sep 13
    const result = resolveDateRange({});
    expect(result.to.toISOString()).toBe("2026-09-13T23:59:59.999Z");
  });

  describe("bucket size thresholds (custom ranges)", () => {
    it("31 days inclusive => day", () => {
      expect(resolveDateRange({ range: "custom", from: "2026-01-01", to: "2026-01-31" }).bucketSize).toBe("day");
    });
    it("32 days inclusive => week", () => {
      expect(resolveDateRange({ range: "custom", from: "2026-01-01", to: "2026-02-01" }).bucketSize).toBe("week");
    });
    it("90 days inclusive => week", () => {
      expect(resolveDateRange({ range: "custom", from: "2026-01-01", to: "2026-03-31" }).bucketSize).toBe("week");
    });
    it("91 days inclusive => month", () => {
      expect(resolveDateRange({ range: "custom", from: "2026-01-01", to: "2026-04-01" }).bucketSize).toBe("month");
    });
    it("from == to => a single day bucket", () => {
      const r = resolveDateRange({ range: "custom", from: "2026-01-05", to: "2026-01-05" });
      expect(r.bucketSize).toBe("day");
      expect(generateBuckets(r.from, r.to, r.bucketSize)).toHaveLength(1);
    });
  });

  describe("invalid or huge custom input falls back to this-month", () => {
    const cases: Array<[string, { from: string; to: string }]> = [
      ["year 1 to year 9999", { from: "0001-01-01", to: "9999-12-31" }],
      ["max JS date", { from: "2026-01-01", to: "+275760-09-13" }],
      ["impossible calendar date", { from: "2026-02-31", to: "2026-03-01" }],
      ["non-ISO string", { from: "Jan 5 2026", to: "2026-01-10" }],
      ["span over 5 years", { from: "2020-01-01", to: "2026-01-01" }],
      ["year before 2000", { from: "1999-12-01", to: "2026-01-01" }],
      ["year after 2100", { from: "2026-01-01", to: "2101-01-01" }],
    ];
    for (const [name, input] of cases) {
      it(name, () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-13T10:00:00.000Z"));
        const result = resolveDateRange({ range: "custom", ...input });
        expect(result.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
        expect(result.to.toISOString()).toBe("2026-09-13T23:59:59.999Z");
      });
    }
  });
});

describe("normalizeRangeParam", () => {
  it("defaults undefined and unknown values to this-month", () => {
    expect(normalizeRangeParam(undefined)).toBe("this-month");
    expect(normalizeRangeParam("bogus")).toBe("this-month");
  });
  it("takes the first element of an array", () => {
    expect(normalizeRangeParam(["this-year", "custom"])).toBe("this-year");
    expect(normalizeRangeParam(["bogus", "custom"])).toBe("this-month");
    expect(normalizeRangeParam([])).toBe("this-month");
  });
  it("passes each valid preset through", () => {
    for (const p of ["this-month", "last-3-months", "this-year", "custom"]) {
      expect(normalizeRangeParam(p)).toBe(p);
    }
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
    expect(buckets[0].label).toMatch(/^01 Sep(t)? 2026$/);
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

  it("month buckets end at the end of their month", () => {
    const buckets = generateBuckets(
      new Date("2026-01-15T00:00:00.000Z"),
      new Date("2026-03-10T23:59:59.999Z"),
      "month",
    );
    expect(buckets.map((b) => b.end.toISOString())).toEqual([
      "2026-01-31T23:59:59.999Z",
      "2026-02-28T23:59:59.999Z",
      "2026-03-31T23:59:59.999Z",
    ]);
  });

  it("rolls over Dec to Jan for month buckets", () => {
    const buckets = generateBuckets(
      new Date("2025-12-15T00:00:00.000Z"),
      new Date("2026-02-10T23:59:59.999Z"),
      "month",
    );
    expect(buckets.map((b) => b.label)).toEqual(["Dec 2025", "Jan 2026", "Feb 2026"]);
  });

  it("splits a 14-day week range into exactly 2 buckets", () => {
    const buckets = generateBuckets(
      new Date("2026-09-01T00:00:00.000Z"),
      new Date("2026-09-14T23:59:59.999Z"),
      "week",
    );
    expect(buckets).toHaveLength(2);
    expect(buckets[1].end.toISOString()).toBe("2026-09-14T23:59:59.999Z");
  });
});
