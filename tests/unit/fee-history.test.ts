import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  computeFeeHistory,
  getCoverageStartForNewPayment,
  resolveActualPeriodsCovered,
  type PaymentForAllocation,
} from "@/lib/fees/fee-history";
import { computeCoverageRange } from "@/lib/fees/periods";

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

  it("keeps totalPaid identical across differently-ordered permutations of the same overlapping payments (order-independence invariant)", () => {
    // This is the exact invariant that the two bugs above both violated:
    // computeFeeHistory sorts its own `payments` argument internally (by
    // coverageEnd, not by array position or paymentDate), so feeding it the
    // very same set of payments in a different array order must never change
    // totalPaid. A fixed, hand-built set of 6 payments over a 6-period plan
    // (June-Nov), deliberately mixing every overlap shape found adversarial
    // in review: same coverageStart, same coverageEnd (nested, sharing the
    // right edge), a payment strictly interior to another sharing NEITHER
    // edge (the exact shape that broke the first, coverageStart-ascending
    // fix attempt), and two genuinely-crossing pairs where neither range is
    // a subset of the other.
    const PERM_TODAY = new Date("2026-11-04"); // periods: Jun, Jul, Aug, Sep, Oct, Nov

    // Same coverageStart as `wide`, and nested inside it.
    const narrowJune = payment({
      amount: new Decimal(800),
      coverageStart: new Date("2026-06-01"),
      coverageEnd: new Date("2026-06-30"),
      paymentDate: new Date("2026-06-20"),
    });
    // Strictly interior to `wide` -- shares NEITHER coverageStart nor
    // coverageEnd with it. This is the shape that defeated the first
    // (coverageStart-ascending) fix attempt: a wide payment starting
    // earlier than a narrow payment nested later inside it.
    const narrowJulyOnly = payment({
      amount: new Decimal(400),
      coverageStart: new Date("2026-07-01"),
      coverageEnd: new Date("2026-07-31"),
      paymentDate: new Date("2026-07-10"),
    });
    // Same coverageEnd as `wide` (nested, sharing the right edge).
    const narrowJulAug = payment({
      amount: new Decimal(800),
      coverageStart: new Date("2026-07-01"),
      coverageEnd: new Date("2026-08-31"),
      paymentDate: new Date("2026-07-15"),
    });
    // Wide range containing all three narrow payments above.
    const wide = payment({
      amount: new Decimal(3300),
      coverageStart: new Date("2026-06-01"),
      coverageEnd: new Date("2026-08-31"),
      paymentDate: new Date("2026-06-01"),
    });
    // Crosses `wide` (overlaps only at August; neither is a subset of the other).
    const crossMid = payment({
      amount: new Decimal(3000),
      coverageStart: new Date("2026-08-01"),
      coverageEnd: new Date("2026-10-31"),
      paymentDate: new Date("2026-08-05"),
    });
    // Crosses `crossMid` (overlaps at Sep-Oct; neither is a subset of the other).
    const crossLate = payment({
      amount: new Decimal(2500),
      coverageStart: new Date("2026-09-01"),
      coverageEnd: new Date("2026-11-30"),
      paymentDate: new Date("2026-09-10"),
    });

    const original = [narrowJune, narrowJulyOnly, narrowJulAug, wide, crossMid, crossLate];
    const reversed = [crossLate, crossMid, wide, narrowJulAug, narrowJulyOnly, narrowJune];
    const shuffle1 = [wide, crossLate, narrowJune, crossMid, narrowJulAug, narrowJulyOnly];
    const shuffle2 = [crossMid, narrowJulyOnly, narrowJulAug, crossLate, wide, narrowJune];

    const results = [original, reversed, shuffle1, shuffle2].map((ordering) =>
      computeFeeHistory(PLAN_START, "MONTHLY", new Decimal(1500), ordering, PERM_TODAY)
    );
    const totals = results.map((r) => r.totalPaid);

    // Every ordering of the identical set of payments must land on the same
    // totalPaid -- 9000, all six periods (6 x 1500) fully paid. If a future
    // refactor drops the internal sort (or keys it off paymentDate / array
    // position instead of coverageEnd), some of these orderings would
    // silently lose money and this assertion would catch it.
    //
    // totalPaid alone would pass even if a bug redistributed the SAME total
    // across the wrong periods (e.g. via a broken tiebreak) as long as the
    // grand total still hit 9000 -- since every period here fully saturates
    // (money paid across all payments exceeds every period's due amount),
    // that can't actually happen for THIS fixture: waterfallAllocate caps
    // each period at its own amountDue, so total=9000 is only reachable if
    // every one of the 6 periods individually received its full 1500. The
    // explicit per-period check below makes that guarantee an assertion
    // instead of an unstated property of the fixture's numbers.
    for (const result of results) {
      for (const period of result.periods) {
        expect(period.amountPaid.toString()).toBe("1500");
        expect(period.status).toBe("PAID");
      }
    }
    for (const total of totals) {
      expect(total.toString()).toBe("9000");
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

describe("resolveActualPeriodsCovered", () => {
  // Reproduction constants matching the bug description: Plan ₹1,500/month
  // from June, June already ₹800-paid (PARTIAL, ₹700 remaining), TODAY is
  // September 4th so periods June/July/August/September are enumerated.
  const AMOUNT_PER_PERIOD = new Decimal(1500);
  const JUNE_PARTIAL = [payment({ amount: new Decimal(800) })]; // June only, 800 of 1500

  it("returns exactly minPeriodsCovered when the amount leaves no leftover (no change from current behavior)", () => {
    // No existing payments -- June, July, August each fully due (1500 each).
    // 4500 exactly settles 3 periods with nothing left over.
    const count = resolveActualPeriodsCovered(
      PLAN_START,
      "MONTHLY",
      AMOUNT_PER_PERIOD,
      [],
      TODAY,
      new Date("2026-06-01"),
      new Decimal(4500),
      3
    );
    expect(count).toBe(3);
  });

  it("extends past minPeriodsCovered to consume leftover money (the bug reproduction)", () => {
    // June already has 800/1500 paid (700 remaining). Admin types amount=4000
    // and periodsCovered=3, intending June-August. 700 (June) + 1500 (July) +
    // 1500 (August) = 3700, leaving 300 leftover that must spill into
    // September rather than vanish -- so this must return 4, not 3.
    const count = resolveActualPeriodsCovered(
      PLAN_START,
      "MONTHLY",
      AMOUNT_PER_PERIOD,
      JUNE_PARTIAL,
      TODAY,
      new Date("2026-06-01"), // coverageStartBase: June, still PARTIAL
      new Decimal(4000),
      3
    );
    expect(count).toBe(4);
  });

  it("extends into periods enumeratePeriods hasn't generated yet (paying ahead of schedule)", () => {
    // TODAY is early August, so only June/July/August are enumerated so far.
    // An amount large enough to fully settle all three AND reach two more
    // (unenumerated) periods must extend the count past what's currently known.
    const earlyToday = new Date("2026-08-04"); // periods: June, July, August only
    const count = resolveActualPeriodsCovered(
      PLAN_START,
      "MONTHLY",
      AMOUNT_PER_PERIOD,
      [],
      earlyToday,
      new Date("2026-06-01"),
      new Decimal(7500), // exactly 5 periods' worth: June-October
      1
    );
    expect(count).toBe(5);
  });

  it("always returns 1 for CUSTOM frequency regardless of amount (one-time fee, no further periods)", () => {
    const count = resolveActualPeriodsCovered(
      new Date("2026-06-01"),
      "CUSTOM",
      new Decimal(5000),
      [],
      TODAY,
      new Date("2026-06-01"),
      new Decimal(999999),
      1
    );
    expect(count).toBe(1);
  });

  it("caps at MAX_PERIODS as a fat-finger guard for an absurdly large amount", () => {
    const count = resolveActualPeriodsCovered(
      PLAN_START,
      "MONTHLY",
      AMOUNT_PER_PERIOD,
      [],
      TODAY,
      new Date("2026-06-01"),
      new Decimal(1_000_000_000), // an admin accidentally adding several zeros
      1
    );
    expect(count).toBe(120);
    expect(count).toBeLessThan(1_000_000_000 / 1500); // sane relative to the raw amount too
  });

  it("end-to-end: the resolved range makes computeFeeHistory's totalPaid equal the TRUE sum of every payment (no leftover silently discarded)", () => {
    // Same bug reproduction as above, carried all the way through
    // computeCoverageRange + computeFeeHistory, mirroring what createPayment
    // now does. Before the fix, totalPaid would be 4500 (800 + 3700 that fits
    // within the under-declared Jun-Aug range) with 300 dropped; after the
    // fix it must be 4800 (800 + the full 4000), and September must show as
    // PARTIAL with 300 paid instead of DUE with 0 paid.
    const coverageStartBase = new Date("2026-06-01");
    const newPaymentAmount = new Decimal(4000);
    const actualPeriods = resolveActualPeriodsCovered(
      PLAN_START,
      "MONTHLY",
      AMOUNT_PER_PERIOD,
      JUNE_PARTIAL,
      TODAY,
      coverageStartBase,
      newPaymentAmount,
      3
    );
    const { coverageStart, coverageEnd } = computeCoverageRange(coverageStartBase, actualPeriods, "MONTHLY");

    const allPayments: PaymentForAllocation[] = [
      ...JUNE_PARTIAL,
      { amount: newPaymentAmount, paymentDate: new Date("2026-09-01"), coverageStart, coverageEnd },
    ];
    const { periods, totalPaid } = computeFeeHistory(PLAN_START, "MONTHLY", AMOUNT_PER_PERIOD, allPayments, TODAY);

    const trueSum = allPayments.reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
    expect(trueSum.toString()).toBe("4800"); // 800 + 4000
    expect(totalPaid.toString()).toBe("4800");

    expect(periods[3].status).toBe("PARTIAL"); // September
    expect(periods[3].amountPaid.toString()).toBe("300");
  });
});
