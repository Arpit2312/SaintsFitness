import { describe, it, expect } from "vitest";
import { computeAttendanceRate } from "@/lib/attendance/rate";

describe("computeAttendanceRate", () => {
  it("returns 0 for no records", () => {
    expect(computeAttendanceRate([])).toBe(0);
  });

  it("counts PRESENT and LATE as attended; ABSENT and LEAVE count against the rate", () => {
    const records = [
      { status: "PRESENT" as const },
      { status: "LATE" as const },
      { status: "ABSENT" as const },
      { status: "LEAVE" as const },
    ];
    expect(computeAttendanceRate(records)).toBe(50); // 2 of 4
  });

  it("is 100 when every record is PRESENT or LATE", () => {
    expect(computeAttendanceRate([{ status: "PRESENT" as const }, { status: "LATE" as const }])).toBe(100);
  });

  it("is 0 when every record is ABSENT or LEAVE", () => {
    expect(computeAttendanceRate([{ status: "ABSENT" as const }, { status: "LEAVE" as const }])).toBe(0);
  });

  it("rounds to the nearest whole percent", () => {
    // 1 of 3 attended = 33.33...% -> rounds to 33
    const records = [{ status: "PRESENT" as const }, { status: "ABSENT" as const }, { status: "ABSENT" as const }];
    expect(computeAttendanceRate(records)).toBe(33);
  });
});
