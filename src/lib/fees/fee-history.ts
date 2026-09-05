import { Decimal } from "@prisma/client/runtime/library";
import type { FeeFrequency } from "@prisma/client";
import {
  enumeratePeriods,
  calculatePeriodStatus,
  advancePeriodStart,
  startOfMonth,
  type Period,
  type PeriodStatus,
} from "./periods";
import { waterfallAllocate } from "./allocation";

// Re-exported so consumers (fee-history-table.tsx, fees-list.tsx) can import
// both the composed types and the base PeriodStatus from this one module.
export type { PeriodStatus } from "./periods";

export type PeriodWithStatus = Period & {
  amountPaid: Decimal;
  status: PeriodStatus;
};

export type PaymentForAllocation = {
  amount: Decimal;
  paymentDate: Date;
  coverageStart: Date;
  coverageEnd: Date;
};

/**
 * Scoping note on the allocation order below: it is proven correct (money-
 * conserving and order-independent) for nested ranges and for ranges that
 * share a coverageStart or coverageEnd -- which is all that this app's
 * `createPayment` action is *planned* to ever produce, per Task 7's current
 * design (Task 7 is not yet implemented as of this writing -- it exists only
 * as a draft in the Phase 2 plan doc). That plan has payments always derive
 * their coverageStart from `getCoverageStartForNewPayment` below rather than
 * letting an admin type in an arbitrary range, which is what bounds the
 * ranges to nested/same-start/same-end in the first place. Since this
 * project's own history shows plan drafts sometimes change during actual
 * implementation, treat that bound as provisional: once Task 7 actually
 * lands, revisit this comment to confirm the real implementation still only
 * ever produces ranges of those shapes -- if it doesn't, the scoping claim
 * below needs to be re-derived against whatever it actually does. It also
 * happens to handle genuinely crossing ranges (e.g. one payment covering
 * Jun-Aug and another covering Jul-Sep, neither a subset of the other)
 * correctly in every scenario tested, but that has NOT been formally proven
 * optimal for arbitrary adversarial crossing-range configurations in general
 * -- doing so would require a max-flow-style allocation algorithm, which
 * isn't warranted given the bounded way payments are actually created in
 * this app.
 */
export function computeFeeHistory(
  planStartDate: Date,
  frequency: FeeFrequency,
  amountPerPeriod: Decimal,
  payments: PaymentForAllocation[],
  today: Date
): { periods: PeriodWithStatus[]; totalPaid: Decimal; totalPending: Decimal } {
  const periods = enumeratePeriods(planStartDate, frequency, amountPerPeriod, today);
  const paidPerPeriod = periods.map(() => new Decimal(0));

  // Sort by coverageEnd ascending (then coverageStart DESCENDING, then
  // paymentDate as a final tiebreak) -- NOT by paymentDate, and NOT by
  // coverageStart ascending either. A payment's coverage range determines
  // which periods it can settle, so processing order must be tied to which
  // period a payment is fundamentally FOR, not to when it was typed into the
  // system. The key idea is "least flexibility first": a payment whose
  // coverage runs out soonest (earliest coverageEnd) has the fewest periods
  // it could possibly apply to, so it should get first claim on those
  // periods before a payment with a later coverageEnd -- which has more
  // remaining periods to potentially spill into -- gets a chance to consume
  // them. When two payments share the same coverageEnd, the one with the
  // LATER coverageStart is a strict subset (nested, sharing the right edge)
  // of the one with the earlier coverageStart, so it is even less flexible
  // and should still be processed first; hence coverageStart descending as
  // the secondary key.
  //
  // coverageStart ascending (what an earlier fix used) is NOT sufficient: it
  // fixes the case where two payments share the same coverageStart, but it
  // does nothing when a wide payment's coverageStart is EARLIER than a
  // narrower payment nested later inside its range -- the primary sort key
  // already differs there, so the tiebreakers never engage, and the wide
  // payment still gets processed first, silently dropping the narrow
  // payment's money. coverageEnd ascending fixes both cases uniformly.
  //
  // Concrete example (originally-reported bug, still fixed by this ordering):
  // a plan with Sep/Oct/Nov each due 1500, a narrow payment (800, Sep only)
  // and a wide payment (3000, Sep-Nov). If the wide payment is logged with an
  // earlier paymentDate than the narrow one (e.g. an admin backdates a
  // delayed cash payment to when it was actually received, landing earlier
  // than a payment already logged in the interim), sorting by paymentDate
  // would process the wide payment first -- it would fully consume
  // Sep/Oct/Nov's dues with its own 3000, leaving the narrow payment's 800
  // with nowhere left to go within its own range, silently dropping it from
  // totalPaid (3000 instead of the correct 3800). Sorting by coverageEnd
  // means the narrow, Sep-only payment (coverageEnd = end of Sep) always
  // claims Sep before the wider payment (coverageEnd = end of Nov) can spill
  // into it, regardless of data-entry order or where each payment's range
  // starts. Do not "simplify" this back to a plain paymentDate or
  // coverageStart-ascending sort.
  const sortedPayments = [...payments].sort((a, b) => {
    const endDiff = a.coverageEnd.getTime() - b.coverageEnd.getTime();
    if (endDiff !== 0) return endDiff;
    const startDiff = b.coverageStart.getTime() - a.coverageStart.getTime(); // descending
    if (startDiff !== 0) return startDiff;
    return a.paymentDate.getTime() - b.paymentDate.getTime();
  });
  for (const pay of sortedPayments) {
    const coveredIndices = periods
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.start <= pay.coverageEnd && p.end >= pay.coverageStart)
      .map(({ i }) => i);

    if (coveredIndices.length === 0) continue;

    const remainingDues = coveredIndices.map((i) => periods[i].amountDue.minus(paidPerPeriod[i]));
    const allocations = waterfallAllocate(pay.amount, remainingDues);
    coveredIndices.forEach((i, k) => {
      paidPerPeriod[i] = paidPerPeriod[i].plus(allocations[k]);
    });
  }

  const withStatus: PeriodWithStatus[] = periods.map((p, i) => ({
    ...p,
    amountPaid: paidPerPeriod[i],
    status: calculatePeriodStatus(p.amountDue, paidPerPeriod[i], p.dueDate, today),
  }));

  const totalPaid = paidPerPeriod.reduce((sum, p) => sum.plus(p), new Decimal(0));
  const totalDue = periods.reduce((sum, p) => sum.plus(p.amountDue), new Decimal(0));
  const totalPending = Decimal.max(totalDue.minus(totalPaid), 0);

  return { periods: withStatus, totalPaid, totalPending };
}

/**
 * Where a new payment should start covering from, given periods already
 * computed by `computeFeeHistory`: the first period that isn't fully PAID
 * yet, or -- if every enumerated period is fully paid -- one period past the
 * last enumerated period (paying ahead of schedule).
 *
 * Split out from `getCoverageStartForNewPayment` so callers that already
 * have `periods` from a `computeFeeHistory` call (e.g.
 * `getStudentFeeHistory`) don't have to pay for a second, redundant
 * sort + waterfall-allocation pass just to get this.
 */
export function nextCoverageStartFromPeriods(
  periods: PeriodWithStatus[],
  planStartDate: Date,
  frequency: FeeFrequency
): Date {
  const firstUnpaid = periods.find((p) => p.status !== "PAID");
  if (firstUnpaid) return firstUnpaid.start;

  if (periods.length === 0) {
    return frequency === "CUSTOM" ? planStartDate : startOfMonth(planStartDate);
  }

  const last = periods[periods.length - 1];
  if (frequency === "CUSTOM") return last.start; // one-time fee, already paid -- no further periods
  return advancePeriodStart(last.start, frequency);
}

/**
 * How many periods (starting at coverageStartBase) a payment of `amount`
 * actually reaches, given the plan's current unpaid state. Never returns
 * fewer than `minPeriodsCovered` (the admin's stated minimum intent -- what
 * they typed into "Periods Covered"), but extends further if the amount has
 * money left over after settling that many periods in full -- so a
 * payment's recorded coverage range always accounts for every rupee
 * collected, and waterfallAllocate (which only ever allocates within a
 * payment's own declared range) never has leftover money silently fall
 * outside it.
 *
 * This is the write-side fix for a real money-tracking bug: `createPayment`
 * used to pass the admin-typed periodsCovered straight into
 * computeCoverageRange, independent of `amount`. If `amount` happened to
 * exceed what those periods needed (e.g. admin rounds up, or periods and
 * amount just don't line up), the leftover had no period left inside the
 * payment's own declared range to land on, and waterfallAllocate silently
 * discards anything that doesn't fit within that range -- so totalPaid came
 * out lower than the true sum of every payment's amount. Extending
 * coverageEnd here (rather than changing the read-side allocation itself)
 * keeps the already-hardened, heavily-verified computeFeeHistory/
 * waterfallAllocate pair untouched.
 *
 * Capped at MAX_PERIODS as a fat-finger guard (an accidental extra digit on
 * `amount` shouldn't produce a coverage range decades into the future).
 */
export function resolveActualPeriodsCovered(
  planStartDate: Date,
  frequency: FeeFrequency,
  amountPerPeriod: Decimal,
  existingPayments: PaymentForAllocation[],
  today: Date,
  coverageStartBase: Date,
  amount: Decimal,
  minPeriodsCovered: number
): number {
  // CUSTOM frequency is a one-time fee -- no further periods exist to extend into.
  if (frequency === "CUSTOM") return 1;

  const MAX_PERIODS = 120; // ~10 years monthly; generous fat-finger ceiling, distinct from the UI's own 60-period input cap since this can legitimately need to extend further than what was typed

  const { periods } = computeFeeHistory(planStartDate, frequency, amountPerPeriod, existingPayments, today);
  const remainingByStartTime = new Map(periods.map((p) => [p.start.getTime(), p.amountDue.minus(p.amountPaid)]));

  let remainingAmount = amount;
  let periodStart = coverageStartBase;
  let count = 0;

  while (count < minPeriodsCovered || (remainingAmount.gt(0) && count < MAX_PERIODS)) {
    if (count >= MAX_PERIODS) break;
    // A period beyond what enumeratePeriods has generated so far (i.e. in
    // the future relative to `today`) is necessarily fully unpaid -- its
    // remaining due is simply the plan's full per-period amount.
    const due = remainingByStartTime.get(periodStart.getTime()) ?? amountPerPeriod;
    remainingAmount = remainingAmount.minus(Decimal.max(due, 0));
    count += 1;
    periodStart = advancePeriodStart(periodStart, frequency);
  }
  return count;
}

/**
 * Where a new payment should start covering from: the first period that
 * isn't fully PAID yet, or -- if every enumerated period is fully paid --
 * one period past the last enumerated period (paying ahead of schedule).
 */
export function getCoverageStartForNewPayment(
  planStartDate: Date,
  frequency: FeeFrequency,
  amountPerPeriod: Decimal,
  payments: PaymentForAllocation[],
  today: Date
): Date {
  const { periods } = computeFeeHistory(planStartDate, frequency, amountPerPeriod, payments, today);
  return nextCoverageStartFromPeriods(periods, planStartDate, frequency);
}
