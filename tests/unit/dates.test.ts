import { describe, it, expect } from "vitest";
import { startOfUTCDay, endOfUTCDay, weekdayAbbrevUTC, formatDateUTC } from "@/lib/dates";

describe("startOfUTCDay", () => {
  it("floors a UTC instant to that day's midnight", () => {
    expect(startOfUTCDay(new Date("2026-09-12T18:45:30.000Z")).toISOString()).toBe("2026-09-12T00:00:00.000Z");
  });

  it("is idempotent on an already-midnight instant", () => {
    expect(startOfUTCDay(new Date("2026-09-12T00:00:00.000Z")).toISOString()).toBe("2026-09-12T00:00:00.000Z");
  });
});

describe("endOfUTCDay", () => {
  it("returns 23:59:59.999 UTC for the given day", () => {
    expect(endOfUTCDay(new Date("2026-09-12T03:00:00.000Z")).toISOString()).toBe("2026-09-12T23:59:59.999Z");
  });
});

describe("weekdayAbbrevUTC", () => {
  it("reads Monday from a known UTC Monday instant", () => {
    // 2026-01-01 is a Thursday (verified: Jan 1 2024 was a Monday [366-day
    // leap year to 2025 -> +2 -> Wednesday; 365-day 2025 to 2026 -> +1 ->
    // Thursday]), so 2026-01-05 is the following Monday.
    expect(weekdayAbbrevUTC(new Date(Date.UTC(2026, 0, 5)))).toBe("Mon");
  });

  it("reads Tuesday from the next day", () => {
    expect(weekdayAbbrevUTC(new Date(Date.UTC(2026, 0, 6)))).toBe("Tue");
  });

  it("does not shift across a UTC day boundary", () => {
    expect(weekdayAbbrevUTC(new Date("2026-01-05T23:59:00.000Z"))).toBe("Mon");
    expect(weekdayAbbrevUTC(new Date("2026-01-06T00:01:00.000Z"))).toBe("Tue");
  });
});

describe("formatDateUTC", () => {
  it("formats a UTC-midnight date as dd MMM yyyy, reading the UTC instant not local time", () => {
    expect(formatDateUTC(new Date(Date.UTC(2026, 5, 5)))).toBe("05 Jun 2026");
  });
});
