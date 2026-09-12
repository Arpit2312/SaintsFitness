import { weekdayAbbrevUTC } from "@/lib/dates";

/**
 * Whether `date`'s UTC weekday appears in `batchDays` (Batch.days, e.g.
 * ["Mon","Wed","Fri"] -- see src/lib/validations/batch.ts's DAYS list for
 * the exact 3-letter format these values always take). Used as a SOFT
 * default only (sorting/highlighting "scheduled today" batches) -- never a
 * hard restriction on which batch can be marked on which date.
 */
export function isBatchScheduledOn(batchDays: string[], date: Date): boolean {
  return batchDays.includes(weekdayAbbrevUTC(date));
}
