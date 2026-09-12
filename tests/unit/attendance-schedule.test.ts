import { describe, it, expect } from "vitest";
import { isBatchScheduledOn } from "@/lib/attendance/schedule";

describe("isBatchScheduledOn", () => {
  it("returns true when the date's UTC weekday is in batchDays", () => {
    expect(isBatchScheduledOn(["Mon", "Wed", "Fri"], new Date(Date.UTC(2026, 0, 5)))).toBe(true); // Monday
  });

  it("returns false when the date's UTC weekday is not in batchDays", () => {
    expect(isBatchScheduledOn(["Mon", "Wed", "Fri"], new Date(Date.UTC(2026, 0, 6)))).toBe(false); // Tuesday
  });

  it("returns false for an empty schedule", () => {
    expect(isBatchScheduledOn([], new Date(Date.UTC(2026, 0, 5)))).toBe(false);
  });

  it("matches on any of multiple scheduled days", () => {
    expect(isBatchScheduledOn(["Tue", "Thu", "Sat"], new Date(Date.UTC(2026, 0, 6)))).toBe(true); // Tuesday
  });
});
