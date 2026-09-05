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

export function computeFeeHistory(
  planStartDate: Date,
  frequency: FeeFrequency,
  amountPerPeriod: Decimal,
  payments: PaymentForAllocation[],
  today: Date
): { periods: PeriodWithStatus[]; totalPaid: Decimal; totalPending: Decimal } {
  const periods = enumeratePeriods(planStartDate, frequency, amountPerPeriod, today);
  const paidPerPeriod = periods.map(() => new Decimal(0));

  // Sort by coverageStart (then range-length ascending, then paymentDate as a
  // final tiebreak) -- NOT by paymentDate alone. A payment's coverage range
  // determines which periods it can settle, so processing order must be tied
  // to which period a payment is fundamentally FOR, not to when it was typed
  // into the system. Consider a plan with Sep/Oct/Nov each due 1500: a narrow
  // payment (800, Sep only) and a wide payment (3000, Sep-Nov). If the wide
  // payment is logged with an earlier paymentDate than the narrow one (e.g.
  // an admin backdates a delayed cash payment to when it was actually
  // received, and that backdated date lands earlier than a payment already
  // logged in the interim), sorting by paymentDate would process the wide
  // payment first -- it would fully consume Sep/Oct/Nov's dues with its own
  // 3000, leaving the narrow payment's 800 with nowhere left to go within its
  // own range, silently dropping it from totalPaid (3000 instead of the
  // correct 3800). Sorting by coverageStart/range-length first means the
  // narrow, Sep-only payment always claims Sep before the wider payment can
  // spill into it, regardless of data-entry order. Do not "simplify" this
  // back to a plain paymentDate sort.
  const sortedPayments = [...payments].sort((a, b) => {
    const startDiff = a.coverageStart.getTime() - b.coverageStart.getTime();
    if (startDiff !== 0) return startDiff;
    const aLength = a.coverageEnd.getTime() - a.coverageStart.getTime();
    const bLength = b.coverageEnd.getTime() - b.coverageStart.getTime();
    const lengthDiff = aLength - bLength;
    if (lengthDiff !== 0) return lengthDiff;
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

  const firstUnpaid = periods.find((p) => p.status !== "PAID");
  if (firstUnpaid) return firstUnpaid.start;

  if (periods.length === 0) {
    return frequency === "CUSTOM" ? planStartDate : startOfMonth(planStartDate);
  }

  const last = periods[periods.length - 1];
  if (frequency === "CUSTOM") return last.start; // one-time fee, already paid -- no further periods
  return advancePeriodStart(last.start, frequency);
}
