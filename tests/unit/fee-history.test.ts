import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeFeeHistory, getCoverageStartForNewPayment, type PaymentForAllocation } from "@/lib/fees/fee-history";

const PLAN_START = new Date("2026-06-01");
const TODAY = new Date("2026-09-04"); // periods: June, July, August, September

function payment(overrides: Partial<PaymentForAllocation>): PaymentForAllocation {
  return {
    amount: new Decimal(1500),
    paymentDate: new Date("2026-06-05"),
    coverageStart: new Date("2026-06-01"),
    coverageEnd: new Date("2026-06-30"),
    ...overrides,
  };
}

describe("computeFeeHistory", () => {
  it("marks fully-paid periods as PAID and totals correctly with no payments at all", () => {
    const { periods, totalPaid, totalPending } = computeFeeHistory(
      PLAN_START,
      "MONTHLY",
      new Decimal(1500),
      [],
      TODAY
    );
    expect(periods).toHaveLength(4);
    periods.forEach((p) => expect(p.status).toBe(p.dueDate < TODAY ? "OVERDUE" : "DUE"));
    expect(totalPaid.toString()).toBe("0");
    expect(totalPending.toString()).toBe("6000"); // 4 x 1500
  });

  it("applies a single-period payment to just that period", () => {
    const payments = [payment({})]; // June only
    const { periods, totalPaid } = computeFeeHistory(PLAN_START, "MONTHLY", new Decimal(1500), payments, TODAY);
    expect(periods[0].status).toBe("PAID");
    expect(periods[0].amountPaid.toString()).toBe("1500");
    expect(periods[1].status).toBe("OVERDUE"); // July, unpaid, past due
    expect(totalPaid.toString()).toBe("1500");
  });

  it("waterfall-applies a multi-period payment across the periods it covers", () => {
    const payments = [
      payment({
        amount: new Decimal(4000),
        coverageStart: new Date("2026-06-01"),
        coverageEnd: new Date("2026-08-31"), // June, July, August
      }),
    ];
    const { periods, totalPaid, totalPending } = computeFeeHistory(
      PLAN_START,
      "MONTHLY",
      new Decimal(1500),
      payments,
      TODAY
    );
    expect(periods[0].status).toBe("PAID"); // June: 1500 of 1500
    expect(periods[1].status).toBe("PAID"); // July: 1500 of 1500
    expect(periods[2].status).toBe("PARTIAL"); // August: 1000 of 1500
    expect(periods[2].amountPaid.toString()).toBe("1000");
    expect(periods[3].status).toBe("DUE"); // September: untouched, not yet overdue since it's the current period
    expect(totalPaid.toString()).toBe("4000");
    expect(totalPending.toString()).toBe("2000"); // 500 (Aug) + 1500 (Sep)
  });

  it("combines two payments landing on the same period (a partial top-up)", () => {
    const payments = [
      payment({ amount: new Decimal(1000) }), // June, partial
      payment({ amount: new Decimal(500), paymentDate: new Date("2026-06-20") }), // June, top-up
    ];
    const { periods } = computeFeeHistory(PLAN_START, "MONTHLY", new Decimal(1500), payments, TODAY);
    expect(periods[0].status).toBe("PAID");
    expect(periods[0].amountPaid.toString()).toBe("1500");
  });

  it("ignores a payment whose coverage range doesn't overlap any enumerated period", () => {
    const payments = [payment({ coverageStart: new Date("2027-01-01"), coverageEnd: new Date("2027-01-31") })];
    const { periods, totalPaid } = computeFeeHistory(PLAN_START, "MONTHLY", new Decimal(1500), payments, TODAY);
    periods.forEach((p) => expect(p.amountPaid.toString()).toBe("0"));
    expect(totalPaid.toString()).toBe("0");
  });

  it("doesn't lose money when a wide payment is logged with an earlier paymentDate than a narrow payment covering the same period (order-independence)", () => {
    // June only, partial -- e.g. a delayed cash payment backdated to when it was actually received.
    const narrowPayment = payment({
      amount: new Decimal(800),
      coverageStart: new Date("2026-06-01"),
      coverageEnd: new Date("2026-06-30"),
    });
    // June-August, enough to cover the rest -- logged after the narrow payment but with an earlier paymentDate.
    const widePayment = payment({
      amount: new Decimal(3000),
      coverageStart: new Date("2026-06-01"),
      coverageEnd: new Date("2026-08-31"),
    });
    const expectedTotalPaid = "3800"; // 800 + 3000, regardless of ordering

    const wideLoggedFirstButDatedEarlier = [
      { ...widePayment, paymentDate: new Date("2026-06-01") },
      { ...narrowPayment, paymentDate: new Date("2026-06-10") },
    ];
    const narrowLoggedFirstAndDatedEarlier = [
      { ...narrowPayment, paymentDate: new Date("2026-06-01") },
      { ...widePayment, paymentDate: new Date("2026-06-10") },
    ];

    const resultA = computeFeeHistory(PLAN_START, "MONTHLY", new Decimal(1500), wideLoggedFirstButDatedEarlier, TODAY);
    const resultB = computeFeeHistory(PLAN_START, "MONTHLY", new Decimal(1500), narrowLoggedFirstAndDatedEarlier, TODAY);

    expect(resultA.totalPaid.toString()).toBe(expectedTotalPaid);
    expect(resultB.totalPaid.toString()).toBe(expectedTotalPaid);
  });
});

describe("getCoverageStartForNewPayment", () => {
  it("starts at the first unpaid (partial or untouched) period", () => {
    const payments = [payment({})]; // June fully paid
    const start = getCoverageStartForNewPayment(PLAN_START, "MONTHLY", new Decimal(1500), payments, TODAY);
    expect(start.toISOString().slice(0, 10)).toBe("2026-07-01"); // July, first unpaid
  });

  it("starts at the current period when nothing has been paid yet", () => {
    const start = getCoverageStartForNewPayment(PLAN_START, "MONTHLY", new Decimal(1500), [], TODAY);
    expect(start.toISOString().slice(0, 10)).toBe("2026-06-01");
  });

  it("advances past all enumerated periods (pays ahead) once everything up to today is fully paid", () => {
    const payments = [
      payment({ coverageStart: new Date("2026-06-01"), coverageEnd: new Date("2026-09-30"), amount: new Decimal(6000) }),
    ];
    const start = getCoverageStartForNewPayment(PLAN_START, "MONTHLY", new Decimal(1500), payments, TODAY);
    expect(start.toISOString().slice(0, 10)).toBe("2026-10-01"); // October, one past the last enumerated (September)
  });

  it("starts at the plan's own start date for a CUSTOM plan with no payments yet", () => {
    const customStart = new Date("2026-09-01");
    const start = getCoverageStartForNewPayment(customStart, "CUSTOM", new Decimal(5000), [], TODAY);
    expect(start).toEqual(customStart);
  });
});
