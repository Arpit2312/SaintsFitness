import { Decimal } from "@prisma/client/runtime/library";
import type { PeriodWithStatus } from "@/lib/fees/fee-history";

export type DuesCategory = "OVERDUE" | "PARTIAL" | "DUE";

// A recurring plan's latest period always contains today and is due at
// month-end, so its own status can never read OVERDUE; classify off ALL periods
// instead so a student who is months behind is still counted as overdue.
export function classifyDues(
  periods: PeriodWithStatus[],
  today: Date
): { category: DuesCategory; pastDuePending: Decimal } {
  let pastDuePending = new Decimal(0);
  let hasPastDueBalance = false;

  for (const p of periods) {
    if (today.getTime() <= p.dueDate.getTime()) continue;
    const remaining = p.amountDue.minus(p.amountPaid);
    if (remaining.gt(0)) {
      hasPastDueBalance = true;
      pastDuePending = pastDuePending.plus(remaining);
    }
  }

  if (hasPastDueBalance) return { category: "OVERDUE", pastDuePending };

  const latest = periods[periods.length - 1];
  if (latest?.status === "PARTIAL") return { category: "PARTIAL", pastDuePending };
  return { category: "DUE", pastDuePending };
}

/**
 * The earliest due date, not yet past, of a period that still has an unpaid
 * balance (`null` if none). Periods are chronological; "not yet past due"
 * matches classifyDues (a period due exactly `now` is not past due).
 */
export function nextUnpaidDueDate(periods: PeriodWithStatus[], now: Date): Date | null {
  for (const p of periods) {
    if (p.dueDate.getTime() < now.getTime()) continue;
    if (p.amountDue.minus(p.amountPaid).gt(0)) return p.dueDate;
  }
  return null;
}
