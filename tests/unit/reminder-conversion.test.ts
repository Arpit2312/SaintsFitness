// tests/unit/reminder-conversion.test.ts
import { describe, it, expect } from "vitest";
import { computeReminderConversions } from "@/lib/reports/reminder-conversion";

describe("computeReminderConversions", () => {
  it("marks a reminder converted when a payment lands after it and before the next reminder", () => {
    const reminders = [
      { id: "r1", studentId: "s1", sentAt: new Date("2026-09-01T00:00:00Z") },
      { id: "r2", studentId: "s1", sentAt: new Date("2026-09-10T00:00:00Z") },
    ];
    const payments = [{ studentId: "s1", paymentDate: new Date("2026-09-05T00:00:00Z") }];
    const result = computeReminderConversions(reminders, payments, new Date("2026-09-20T00:00:00Z"));
    expect(result.get("r1")).toBe(true);
    expect(result.get("r2")).toBe(false);
  });

  it("uses `now` as the window end for a student's most recent reminder", () => {
    const reminders = [{ id: "r1", studentId: "s1", sentAt: new Date("2026-09-01T00:00:00Z") }];
    const payments = [{ studentId: "s1", paymentDate: new Date("2026-09-15T00:00:00Z") }];
    const result = computeReminderConversions(reminders, payments, new Date("2026-09-20T00:00:00Z"));
    expect(result.get("r1")).toBe(true);
  });

  it("does not count a payment made before the reminder was sent", () => {
    const reminders = [{ id: "r1", studentId: "s1", sentAt: new Date("2026-09-10T00:00:00Z") }];
    const payments = [{ studentId: "s1", paymentDate: new Date("2026-09-05T00:00:00Z") }];
    const result = computeReminderConversions(reminders, payments, new Date("2026-09-20T00:00:00Z"));
    expect(result.get("r1")).toBe(false);
  });

  it("returns false for a reminder with no matching payment at all", () => {
    const reminders = [{ id: "r1", studentId: "s1", sentAt: new Date("2026-09-01T00:00:00Z") }];
    const result = computeReminderConversions(reminders, [], new Date("2026-09-20T00:00:00Z"));
    expect(result.get("r1")).toBe(false);
  });

  it("keeps different students' reminders/payments independent", () => {
    const reminders = [
      { id: "r1", studentId: "s1", sentAt: new Date("2026-09-01T00:00:00Z") },
      { id: "r2", studentId: "s2", sentAt: new Date("2026-09-01T00:00:00Z") },
    ];
    const payments = [{ studentId: "s2", paymentDate: new Date("2026-09-05T00:00:00Z") }];
    const result = computeReminderConversions(reminders, payments, new Date("2026-09-20T00:00:00Z"));
    expect(result.get("r1")).toBe(false);
    expect(result.get("r2")).toBe(true);
  });

  it("sorts out-of-order input reminders by sentAt before pairing windows", () => {
    const reminders = [
      { id: "r2", studentId: "s1", sentAt: new Date("2026-09-10T00:00:00Z") },
      { id: "r1", studentId: "s1", sentAt: new Date("2026-09-01T00:00:00Z") },
    ];
    const payments = [{ studentId: "s1", paymentDate: new Date("2026-09-05T00:00:00Z") }];
    const result = computeReminderConversions(reminders, payments, new Date("2026-09-20T00:00:00Z"));
    expect(result.get("r1")).toBe(true);
    expect(result.get("r2")).toBe(false);
  });
});
