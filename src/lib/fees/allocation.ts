import { Decimal } from "@prisma/client/runtime/library";

/**
 * Waterfall-allocates a single payment across an ordered list of periods'
 * remaining due amounts: the first period is filled up to its remaining due
 * first, with any leftover spilling into the next, and so on. Amounts
 * already fully paid should be passed in as 0 (or negative, from an
 * overpayment elsewhere) -- either way this function only ever allocates
 * min(remaining payment, remaining due) to each period, never negative.
 */
export function waterfallAllocate(paymentAmount: Decimal, remainingDues: Decimal[]): Decimal[] {
  let remaining = paymentAmount;
  const allocations: Decimal[] = [];
  for (const due of remainingDues) {
    const dueClamped = Decimal.max(due, 0);
    const alloc = Decimal.max(Decimal.min(remaining, dueClamped), 0);
    allocations.push(alloc);
    remaining = remaining.minus(alloc);
  }
  return allocations;
}
