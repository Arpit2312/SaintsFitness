import { describe, it, expect, vi, afterEach } from "vitest";
import { saveBatchAttendanceSchema, markStudentAttendanceSchema } from "@/lib/validations/attendance";

describe("saveBatchAttendanceSchema", () => {
  const valid = {
    batchId: "batch1",
    date: "2020-01-01",
    records: [{ studentId: "s1", status: "PRESENT" }],
  };

  it("accepts a valid payload", () => {
    expect(saveBatchAttendanceSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty records array", () => {
    expect(saveBatchAttendanceSchema.safeParse({ ...valid, records: [] }).success).toBe(false);
  });

  it("rejects a future date", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(
      saveBatchAttendanceSchema.safeParse({ ...valid, date: future.toISOString().slice(0, 10) }).success
    ).toBe(false);
  });

  it("rejects an invalid status", () => {
    expect(
      saveBatchAttendanceSchema.safeParse({ ...valid, records: [{ studentId: "s1", status: "MAYBE" }] }).success
    ).toBe(false);
  });
});

describe("markStudentAttendanceSchema", () => {
  const valid = { batchId: "batch1", date: "2020-01-01", status: "PRESENT" };

  it("accepts a valid payload", () => {
    expect(markStudentAttendanceSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a future date", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(
      markStudentAttendanceSchema.safeParse({ ...valid, date: future.toISOString().slice(0, 10) }).success
    ).toBe(false);
  });

  it("rejects a missing batchId", () => {
    expect(markStudentAttendanceSchema.safeParse({ ...valid, batchId: "" }).success).toBe(false);
  });
});

describe("notFutureDate IST boundary (regression)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts today's IST calendar date even during the 00:00-05:30 IST window where raw UTC 'now' lags behind", () => {
    // 2026-01-04T20:00:00Z = 2026-01-05 01:30 IST -- IST's calendar day is
    // already the 5th, but the UTC-midnight instant for "2026-01-05" (what
    // a naive `Date.now()` comparison would check against) is still ~4
    // hours in the future relative to raw UTC "now". A date-only compare
    // against todayInIST() must still accept this as "today", not "future".
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-04T20:00:00.000Z"));

    const valid = {
      batchId: "batch1",
      date: "2026-01-05",
      records: [{ studentId: "s1", status: "PRESENT" }],
    };
    expect(saveBatchAttendanceSchema.safeParse(valid).success).toBe(true);
  });

  it("still rejects a genuinely future IST calendar date during that same window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-04T20:00:00.000Z")); // IST "today" = Jan 5

    const future = {
      batchId: "batch1",
      date: "2026-01-06", // IST tomorrow
      records: [{ studentId: "s1", status: "PRESENT" }],
    };
    expect(saveBatchAttendanceSchema.safeParse(future).success).toBe(false);
  });
});
