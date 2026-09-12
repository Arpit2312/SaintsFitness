import { describe, it, expect } from "vitest";
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
