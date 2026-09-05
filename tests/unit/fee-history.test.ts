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

  it("doesn't lose money when a narrow payment is nested inside a wide payment's range that starts earlier (coverageStart-ascending is not enough)", () => {
    // June-August, wide -- coverageStart is EARLIER than the narrow payment's,
    // so a coverageStart-ascending sort would still process this one first.
    // Sized (3700) so that together with the narrow payment's 800 it exactly
    // fills June+July+August's combined due (4500), leaving no overpayment
    // residue to muddy the order-independence check.
    const widePayment = payment({
      amount: new Decimal(3700),
      coverageStart: new Date("2026-06-01"),
      coverageEnd: new Date("2026-08-31"),
    });
    // July only, nested inside the wide payment's range starting at the
    // SECOND period (not the first) -- this is the newly-found adversarial
    // case: coverageEnd (end of July) is earlier than the wide payment's
    // (end of August), so it must still be processed first despite its
    // coverageStart being later.
    const narrowPayment = payment({
      amount: new Decimal(800),
      coverageStart: new Date("2026-07-01"),
      coverageEnd: new Date("2026-07-31"),
    });
    const expectedTotalPaid = "4500"; // 3700 + 800, regardless of ordering

    const wideLoggedFirst = [
      { ...widePayment, paymentDate: new Date("2026-06-05") },
      { ...narrowPayment, paymentDate: new Date("2026-07-10") },
    ];
    const narrowLoggedFirst = [
      { ...narrowPayment, paymentDate: new Date("2026-06-05") },
      { ...widePayment, paymentDate: new Date("2026-07-10") },
    ];

    const resultA = computeFeeHistory(PLAN_START, "MONTHLY", new Decimal(1500), wideLoggedFirst, TODAY);
    const resultB = computeFeeHistory(PLAN_START, "MONTHLY", new Decimal(1500), narrowLoggedFirst, TODAY);

    for (const result of [resultA, resultB]) {
      expect(result.totalPaid.toString()).toBe(expectedTotalPaid);
      // June: fully paid (1500) out of the wide payment's 3700.
      expect(result.periods[0].amountPaid.toString()).toBe("1500");
      expect(result.periods[0].status).toBe("PAID");
      // July: the narrow payment claims it first (800), then the wide
      // payment's spillover (700 of its remaining 2200) tops it up to fully
      // paid (1500) -- if the wide payment had been processed first instead,
      // it would have consumed July's whole 1500 due itself, leaving nothing
      // for the narrow payment's 800 to apply to (the bug this test guards
      // against).
      expect(result.periods[1].amountPaid.toString()).toBe("1500");
      expect(result.periods[1].status).toBe("PAID");
      // August: fully paid (1500) by the wide payment's remaining spillover.
      expect(result.periods[2].amountPaid.toString()).toBe("1500");
      expect(result.periods[2].status).toBe("PAID");
    }
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
