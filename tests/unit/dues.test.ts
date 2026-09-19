import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { classifyDues, nextUnpaidDueDate } from "@/lib/reports/dues";
import type { PeriodWithStatus, PeriodStatus } from "@/lib/fees/fee-history";

const TODAY = new Date(Date.UTC(2026, 8, 19, 10, 0, 0)); // 19 Sep 2026

function period(
  index: number,
  dueDate: Date,
  amountDue: number,
  amountPaid: number,
  status: PeriodStatus
): PeriodWithStatus {
  return {
    index,
    start: dueDate,
    end: dueDate,
    dueDate,
    amountDue: new Decimal(amountDue),
    amountPaid: new Decimal(amountPaid),
    status,
  };
}

const AUG_END = new Date(Date.UTC(2026, 7, 31, 23, 59, 59, 999));
const SEP_END = new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999));
const OCT_END = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));

describe("classifyDues", () => {
  it("is OVERDUE when a past period is fully unpaid, even if the current period is DUE", () => {
    const result = classifyDues(
      [period(0, AUG_END, 1500, 0, "OVERDUE"), period(1, SEP_END, 1500, 0, "DUE")],
      TODAY
    );
    expect(result.category).toBe("OVERDUE");
    expect(result.pastDuePending.toNumber()).toBe(1500);
  });

  it("is PARTIAL when past periods are paid and the current period is PARTIAL", () => {
    const result = classifyDues(
      [period(0, AUG_END, 1500, 1500, "PAID"), period(1, SEP_END, 1500, 500, "PARTIAL")],
      TODAY
    );
    expect(result.category).toBe("PARTIAL");
    expect(result.pastDuePending.toNumber()).toBe(0);
  });

  it("is DUE when past periods are paid and the current period is DUE", () => {
    const result = classifyDues(
      [period(0, AUG_END, 1500, 1500, "PAID"), period(1, SEP_END, 1500, 0, "DUE")],
      TODAY
    );
    expect(result.category).toBe("DUE");
    expect(result.pastDuePending.toNumber()).toBe(0);
  });

  it("is OVERDUE when a past period is only partly paid, with pastDuePending = its remaining balance", () => {
    const result = classifyDues(
      [period(0, AUG_END, 1500, 600, "PARTIAL"), period(1, SEP_END, 1500, 0, "DUE")],
      TODAY
    );
    expect(result.category).toBe("OVERDUE");
    expect(result.pastDuePending.toNumber()).toBe(900);
  });

  it("sums the remaining balance across all past-due periods", () => {
    const JUL_END = new Date(Date.UTC(2026, 6, 31, 23, 59, 59, 999));
    const result = classifyDues(
      [
        period(0, JUL_END, 1000, 0, "OVERDUE"),
        period(1, AUG_END, 1000, 400, "PARTIAL"),
        period(2, SEP_END, 1000, 0, "DUE"),
      ],
      TODAY
    );
    expect(result.category).toBe("OVERDUE");
    expect(result.pastDuePending.toNumber()).toBe(1600);
  });

  it("is OVERDUE for a single CUSTOM-style past-due unpaid period", () => {
    const start = new Date(Date.UTC(2026, 5, 1));
    const result = classifyDues([period(0, start, 5000, 0, "OVERDUE")], TODAY);
    expect(result.category).toBe("OVERDUE");
    expect(result.pastDuePending.toNumber()).toBe(5000);
  });

  it("defaults to DUE with zero pastDuePending for an empty periods array", () => {
    const result = classifyDues([], TODAY);
    expect(result.category).toBe("DUE");
    expect(result.pastDuePending.toNumber()).toBe(0);
  });

  it("does not treat a period whose dueDate equals today exactly as past due", () => {
    const result = classifyDues([period(0, new Date(TODAY.getTime()), 1500, 0, "DUE")], TODAY);
    expect(result.category).toBe("DUE");
    expect(result.pastDuePending.toNumber()).toBe(0);
  });

  it("does not count an overpaid past period as pending", () => {
    const result = classifyDues(
      [period(0, AUG_END, 1500, 1600, "PAID"), period(1, SEP_END, 1500, 0, "DUE")],
      TODAY
    );
    expect(result.category).toBe("DUE");
    expect(result.pastDuePending.toNumber()).toBe(0);
  });
});

describe("nextUnpaidDueDate", () => {
  it("returns the current period's due date when it is unpaid", () => {
    expect(
      nextUnpaidDueDate([period(0, AUG_END, 1500, 1500, "PAID"), period(1, SEP_END, 1500, 0, "DUE")], TODAY)
    ).toEqual(SEP_END);
  });

  it("returns the due date of a partly paid current period", () => {
    expect(nextUnpaidDueDate([period(0, SEP_END, 1500, 500, "PARTIAL")], TODAY)).toEqual(SEP_END);
  });

  it("returns null when the current period is fully paid", () => {
    expect(nextUnpaidDueDate([period(0, SEP_END, 1500, 1500, "PAID")], TODAY)).toBeNull();
  });

  it("ignores past-due periods", () => {
    expect(
      nextUnpaidDueDate([period(0, AUG_END, 1500, 0, "OVERDUE"), period(1, SEP_END, 1500, 1500, "PAID")], TODAY)
    ).toBeNull();
  });

  it("returns the earliest not-yet-due unpaid period", () => {
    expect(
      nextUnpaidDueDate([period(0, SEP_END, 1500, 0, "DUE"), period(1, OCT_END, 1500, 0, "DUE")], TODAY)
    ).toEqual(SEP_END);
  });

  it("treats a period due exactly now as not yet past due", () => {
    expect(nextUnpaidDueDate([period(0, TODAY, 1500, 0, "DUE")], TODAY)).toEqual(TODAY);
  });

  it("returns null for an empty list", () => {
    expect(nextUnpaidDueDate([], TODAY)).toBeNull();
  });
});
