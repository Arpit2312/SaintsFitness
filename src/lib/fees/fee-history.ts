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

  const sortedPayments = [...payments].sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime());
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
