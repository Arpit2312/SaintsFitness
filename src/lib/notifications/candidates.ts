import { formatDateUTC, startOfUTCDay } from "@/lib/dates";

export const NOTIFICATION_TYPES = [
  "FEE_OVERDUE",
  "FEE_DUE_SOON",
  "LOW_ATTENDANCE",
  "NEW_ADMISSION",
  "PAYMENT_RECEIVED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationCandidate = {
  type: NotificationType;
  studentId: string | null;
  message: string;
  dedupeKey: string;
};

export const SYNC_INTERVAL_MS = 30 * 60 * 1000;
// The brief lists no setting for low attendance, so these are code constants.
export const LOW_ATTENDANCE_MIN_RECORDS = 5;
export const LOW_ATTENDANCE_WINDOW_DAYS = 30;
export const LOW_ATTENDANCE_RATE_BELOW = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function isSyncStale(lastSyncAt: Date | null, now: Date): boolean {
  return lastSyncAt === null || now.getTime() - lastSyncAt.getTime() >= SYNC_INTERVAL_MS;
}

/** Which `everyDays`-sized window (counted from the epoch) `today` falls in. */
export function overdueCycle(today: Date, everyDays: number): number {
  return Math.floor(Math.floor(today.getTime() / DAY_MS) / everyDays);
}

export function buildOverdueCandidates(
  rows: { studentId: string; name: string; pastDuePending: number }[],
  today: Date,
  everyDays: number
): NotificationCandidate[] {
  const cycle = overdueCycle(today, everyDays);
  return rows.map((r) => ({
    type: "FEE_OVERDUE",
    studentId: r.studentId,
    message: `${r.name} has ${formatInr(r.pastDuePending)} overdue.`,
    dedupeKey: `overdue:${r.studentId}:${cycle}`,
  }));
}

/**
 * `rows` must already exclude overdue students. A fee is "due soon" when its
 * next unpaid due date falls between the start of `today` and the end of the
 * day `withinDays` days ahead (due dates are month-end 23:59:59.999 UTC).
 */
export function buildDueSoonCandidates(
  rows: { studentId: string; name: string; totalPending: number; nextDueDate: Date | null }[],
  today: Date,
  withinDays: number
): NotificationCandidate[] {
  const start = startOfUTCDay(today).getTime();
  const endExclusive = start + (withinDays + 1) * DAY_MS;
  const result: NotificationCandidate[] = [];
  for (const r of rows) {
    if (r.nextDueDate === null) continue;
    const due = r.nextDueDate.getTime();
    if (due < start || due >= endExclusive) continue;
    result.push({
      type: "FEE_DUE_SOON",
      studentId: r.studentId,
      message: `${r.name}'s fee of ${formatInr(r.totalPending)} is due on ${formatDateUTC(r.nextDueDate)}.`,
      dedupeKey: `duesoon:${r.studentId}:${r.nextDueDate.toISOString().slice(0, 10)}`,
    });
  }
  return result;
}

export function buildLowAttendanceCandidates(
  rows: { studentId: string; name: string; markedCount: number; rate: number }[],
  today: Date
): NotificationCandidate[] {
  const month = today.toISOString().slice(0, 7);
  return rows
    .filter((r) => r.markedCount >= LOW_ATTENDANCE_MIN_RECORDS && r.rate < LOW_ATTENDANCE_RATE_BELOW)
    .map((r) => ({
      type: "LOW_ATTENDANCE",
      studentId: r.studentId,
      message: `${r.name}'s attendance is ${r.rate}% over the last ${LOW_ATTENDANCE_WINDOW_DAYS} days.`,
      dedupeKey: `lowatt:${r.studentId}:${month}`,
    }));
}

export function buildAdmissionMessage(name: string, academyName: string): string {
  return `${name} joined ${academyName}.`;
}

export function buildPaymentMessage(name: string, amount: number, modeLabel: string): string {
  return `${name} paid ${formatInr(amount)} via ${modeLabel}.`;
}

const PAYMENT_MODE_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  ONLINE: "Online Payment",
  BANK_TRANSFER: "Bank Transfer",
};

export function paymentModeLabel(mode: string): string {
  return Object.prototype.hasOwnProperty.call(PAYMENT_MODE_LABELS, mode) ? PAYMENT_MODE_LABELS[mode] : mode;
}
