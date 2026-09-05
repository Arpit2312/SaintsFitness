import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  enumeratePeriods,
  calculatePeriodStatus,
  advancePeriodStart,
  computeCoverageRange,
} from "@/lib/fees/periods";

describe("enumeratePeriods", () => {
  it("enumerates monthly periods from plan start through the current period, inclusive", () => {
    const start = new Date("2026-06-15"); // mid-June
    const asOf = new Date("2026-09-04");
    const periods = enumeratePeriods(start, "MONTHLY", new Decimal(1500), asOf);
    expect(periods).toHaveLength(4); // June, July, August, September
    expect(periods[0].start.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(periods[0].end.toISOString().slice(0, 10)).toBe("2026-06-30");
    expect(periods[3].start.toISOString().slice(0, 10)).toBe("2026-09-01");
    periods.forEach((p) => expect(p.amountDue.toString()).toBe("1500"));
  });

  it("does not include future periods beyond asOf", () => {
    const start = new Date("2026-09-01");
    const asOf = new Date("2026-09-04");
    const periods = enumeratePeriods(start, "MONTHLY", new Decimal(1500), asOf);
    expect(periods).toHaveLength(1);
  });

  it("enumerates quarterly periods as 3-month blocks", () => {
    const start = new Date("2026-01-01");
    const asOf = new Date("2026-07-15");
    const periods = enumeratePeriods(start, "QUARTERLY", new Decimal(4500), asOf);
    expect(periods).toHaveLength(3); // Jan-Mar, Apr-Jun, Jul-Sep
    expect(periods[0].end.toISOString().slice(0, 10)).toBe("2026-03-31");
    expect(periods[2].start.toISOString().slice(0, 10)).toBe("2026-07-01");
  });

  it("CUSTOM frequency yields exactly one period once the start date has passed", () => {
    const start = new Date("2026-08-01");
    const asOf = new Date("2026-09-04");
    const periods = enumeratePeriods(start, "CUSTOM", new Decimal(5000), asOf);
    expect(periods).toHaveLength(1);
    expect(periods[0].start).toEqual(start);
    expect(periods[0].dueDate).toEqual(start);
  });

  it("CUSTOM frequency yields no periods before the start date", () => {
    const start = new Date("2026-12-01");
    const asOf = new Date("2026-09-04");
    expect(enumeratePeriods(start, "CUSTOM", new Decimal(5000), asOf)).toHaveLength(0);
  });

  it("yields no periods when the plan hasn't started yet", () => {
    const start = new Date("2026-12-01");
    const asOf = new Date("2026-09-04");
    expect(enumeratePeriods(start, "MONTHLY", new Decimal(1500), asOf)).toHaveLength(0);
  });
});

describe("calculatePeriodStatus", () => {
  const dueDate = new Date("2026-08-31");

  it("is PAID when amountPaid >= amountDue", () => {
    expect(
      calculatePeriodStatus(new Decimal(1500), new Decimal(1500), dueDate, new Date("2026-08-15"))
    ).toBe("PAID");
    expect(
      calculatePeriodStatus(new Decimal(1500), new Decimal(1600), dueDate, new Date("2026-08-15"))
    ).toBe("PAID");
  });

  it("is PARTIAL whenever something (but not enough) has been paid, regardless of due date", () => {
    expect(
      calculatePeriodStatus(new Decimal(1500), new Decimal(1000), dueDate, new Date("2026-09-04"))
    ).toBe("PARTIAL");
  });

  it("is DUE when nothing has been paid and the due date hasn't passed", () => {
    expect(
      calculatePeriodStatus(new Decimal(1500), new Decimal(0), dueDate, new Date("2026-08-15"))
    ).toBe("DUE");
  });

  it("is OVERDUE when nothing has been paid and the due date has passed", () => {
    expect(
      calculatePeriodStatus(new Decimal(1500), new Decimal(0), dueDate, new Date("2026-09-04"))
    ).toBe("OVERDUE");
  });
});

describe("advancePeriodStart", () => {
  it("advances a monthly period by one month", () => {
    const next = advancePeriodStart(new Date("2026-06-01"), "MONTHLY");
    expect(next.toISOString().slice(0, 10)).toBe("2026-07-01");
  });

  it("advances a quarterly period by three months", () => {
    const next = advancePeriodStart(new Date("2026-01-01"), "QUARTERLY");
    expect(next.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("throws for CUSTOM, which has no recurring periods", () => {
    expect(() => advancePeriodStart(new Date("2026-01-01"), "CUSTOM")).toThrow();
  });
});

describe("computeCoverageRange", () => {
  it("computes a 3-month monthly range", () => {
    const { coverageStart, coverageEnd } = computeCoverageRange(new Date("2026-09-01"), 3, "MONTHLY");
    expect(coverageStart.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(coverageEnd.toISOString().slice(0, 10)).toBe("2026-11-30");
  });

  it("computes a single-quarter range for a quarterly plan", () => {
    const { coverageStart, coverageEnd } = computeCoverageRange(new Date("2026-01-01"), 1, "QUARTERLY");
    expect(coverageEnd.toISOString().slice(0, 10)).toBe("2026-03-31");
  });

  it("collapses to a single day for CUSTOM regardless of periodsCovered", () => {
    const { coverageStart, coverageEnd } = computeCoverageRange(new Date("2026-09-01"), 1, "CUSTOM");
    expect(coverageStart).toEqual(coverageEnd);
  });
});
