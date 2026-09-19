import { describe, it, expect } from "vitest";
import {
  formatInr,
  isSyncStale,
  overdueCycle,
  buildOverdueCandidates,
  buildDueSoonCandidates,
  buildLowAttendanceCandidates,
  buildAdmissionMessage,
  buildPaymentMessage,
  paymentModeLabel,
  SYNC_INTERVAL_MS,
} from "@/lib/notifications/candidates";
import { formatDateUTC } from "@/lib/dates";

const day = (n: number) => new Date(n * 86_400_000);

describe("formatInr", () => {
  it("formats with the rupee sign and Indian grouping", () => {
    expect(formatInr(1500)).toBe("₹1,500");
    expect(formatInr(123456)).toBe("₹1,23,456");
  });
});

describe("isSyncStale", () => {
  const now = new Date("2026-09-19T10:00:00Z");

  it("is stale when there has never been a sync", () => {
    expect(isSyncStale(null, now)).toBe(true);
  });

  it("is fresh just inside the interval", () => {
    expect(isSyncStale(new Date(now.getTime() - SYNC_INTERVAL_MS + 1), now)).toBe(false);
  });

  it("is stale exactly at the interval", () => {
    expect(isSyncStale(new Date(now.getTime() - SYNC_INTERVAL_MS), now)).toBe(true);
  });
});

describe("overdueCycle", () => {
  it("stays constant within a window and changes at the boundary", () => {
    expect(overdueCycle(day(0), 7)).toBe(0);
    expect(overdueCycle(day(6), 7)).toBe(0);
    expect(overdueCycle(day(7), 7)).toBe(1);
    expect(overdueCycle(day(13), 7)).toBe(1);
    expect(overdueCycle(day(14), 7)).toBe(2);
  });

  it("gives one cycle per day when the frequency is 1", () => {
    expect(overdueCycle(day(5), 1)).toBe(5);
    expect(overdueCycle(day(6), 1)).toBe(6);
  });
});

describe("buildOverdueCandidates", () => {
  it("builds a message and a cycle-scoped dedupe key", () => {
    const [c] = buildOverdueCandidates([{ studentId: "s1", name: "Rahul Sharma", pastDuePending: 1500 }], day(14), 7);
    expect(c).toEqual({
      type: "FEE_OVERDUE",
      studentId: "s1",
      message: "Rahul Sharma has ₹1,500 overdue.",
      dedupeKey: "overdue:s1:2",
    });
  });

  it("returns nothing for no rows", () => {
    expect(buildOverdueCandidates([], day(14), 7)).toEqual([]);
  });

  it("re-notifies in the next cycle with a different key", () => {
    const row = { studentId: "s1", name: "A", pastDuePending: 10 };
    expect(buildOverdueCandidates([row], day(6), 7)[0].dedupeKey).not.toBe(
      buildOverdueCandidates([row], day(7), 7)[0].dedupeKey
    );
  });
});

describe("buildDueSoonCandidates", () => {
  const today = new Date(Date.UTC(2026, 8, 13)); // 13 Sep 2026, UTC midnight
  const row = (nextDueDate: Date | null) => ({ studentId: "s1", name: "Priya Singh", totalPending: 1000, nextDueDate });

  it("includes a fee due today", () => {
    expect(buildDueSoonCandidates([row(new Date(Date.UTC(2026, 8, 13, 23, 59, 59, 999)))], today, 3)).toHaveLength(1);
  });

  it("includes a fee due on the last day of the window", () => {
    expect(buildDueSoonCandidates([row(new Date(Date.UTC(2026, 8, 16, 23, 59, 59, 999)))], today, 3)).toHaveLength(1);
  });

  it("excludes a fee due one day after the window", () => {
    expect(buildDueSoonCandidates([row(new Date(Date.UTC(2026, 8, 17, 0, 0, 0, 0)))], today, 3)).toHaveLength(0);
  });

  it("excludes a fee that is already past due", () => {
    expect(buildDueSoonCandidates([row(new Date(Date.UTC(2026, 8, 12, 23, 59, 59, 999)))], today, 3)).toHaveLength(0);
  });

  it("excludes students with no upcoming due date", () => {
    expect(buildDueSoonCandidates([row(null)], today, 3)).toHaveLength(0);
  });

  it("keys on the due date and words the message with the amount and date", () => {
    const due = new Date(Date.UTC(2026, 8, 16, 23, 59, 59, 999));
    const [c] = buildDueSoonCandidates([row(due)], today, 3);
    expect(c.type).toBe("FEE_DUE_SOON");
    expect(c.dedupeKey).toBe("duesoon:s1:2026-09-16");
    expect(c.message).toBe(`Priya Singh's fee of ₹1,000 is due on ${formatDateUTC(due)}.`);
  });
});

describe("buildLowAttendanceCandidates", () => {
  const today = new Date(Date.UTC(2026, 8, 13));
  const row = (markedCount: number, rate: number) => ({ studentId: "s1", name: "Asha", markedCount, rate });

  it("includes 5 marked classes with a rate just under the threshold", () => {
    expect(buildLowAttendanceCandidates([row(5, 59)], today)).toHaveLength(1);
  });

  it("excludes a student with too few marked classes", () => {
    expect(buildLowAttendanceCandidates([row(4, 10)], today)).toHaveLength(0);
  });

  it("excludes a rate at the threshold", () => {
    expect(buildLowAttendanceCandidates([row(10, 60)], today)).toHaveLength(0);
  });

  it("keys once per calendar month and words the message", () => {
    const [c] = buildLowAttendanceCandidates([row(8, 40)], today);
    expect(c).toEqual({
      type: "LOW_ATTENDANCE",
      studentId: "s1",
      message: "Asha's attendance is 40% over the last 30 days.",
      dedupeKey: "lowatt:s1:2026-09",
    });
  });
});

describe("event message builders", () => {
  it("words an admission", () => {
    expect(buildAdmissionMessage("Priya Singh", "SAINTS")).toBe("Priya Singh joined SAINTS.");
  });

  it("words a payment", () => {
    expect(buildPaymentMessage("Rahul Sharma", 1500, "UPI")).toBe("Rahul Sharma paid ₹1,500 via UPI.");
  });

  it("maps payment modes to labels and passes unknown ones through", () => {
    expect(paymentModeLabel("CASH")).toBe("Cash");
    expect(paymentModeLabel("UPI")).toBe("UPI");
    expect(paymentModeLabel("ONLINE")).toBe("Online Payment");
    expect(paymentModeLabel("BANK_TRANSFER")).toBe("Bank Transfer");
    expect(paymentModeLabel("CHEQUE")).toBe("CHEQUE");
  });
});
