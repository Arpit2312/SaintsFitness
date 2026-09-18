// Read-only queries, not mutations -- lives outside src/actions/ (which is
// "use server") so these can never be called as Server Actions from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/db";
import { generateBuckets, type ResolvedRange } from "@/lib/reports/date-range";
import { computeReminderConversions } from "@/lib/reports/reminder-conversion";
import { listPendingStudentsWithDues } from "@/lib/queries/reports-dues";
import { computeAttendanceRate } from "@/lib/attendance/rate";
import { startOfUTCDay, endOfUTCDay } from "@/lib/dates";

export async function getRevenueOverTime(range: ResolvedRange) {
  const payments = await prisma.payment.findMany({
    where: { paymentDate: { gte: range.from, lte: range.to } },
    select: { amount: true, paymentDate: true },
  });
  const buckets = generateBuckets(range.from, range.to, range.bucketSize);
  return buckets.map((b) => {
    const total = payments
      .filter((p) => p.paymentDate.getTime() >= b.start.getTime() && p.paymentDate.getTime() <= b.end.getTime())
      .reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
    return { label: b.label, total: total.toNumber() };
  });
}

export async function getOutstandingDuesSummary() {
  const pending = await listPendingStudentsWithDues();

  let totalPending = new Decimal(0);
  let overdueCount = 0;
  let partialCount = 0;
  let dueCount = 0;
  for (const s of pending) {
    totalPending = totalPending.plus(s.totalPending);
    if (s.category === "OVERDUE") overdueCount += 1;
    else if (s.category === "PARTIAL") partialCount += 1;
    else dueCount += 1;
  }

  return { totalPending: totalPending.toNumber(), overdueCount, partialCount, dueCount };
}

export async function getAttendanceRateOverTime(range: ResolvedRange) {
  const records = await prisma.attendance.findMany({
    where: { date: { gte: range.from, lte: range.to } },
    select: { date: true, status: true },
  });
  const buckets = generateBuckets(range.from, range.to, range.bucketSize);
  return buckets.map((b) => {
    const inBucket = records.filter(
      (r) => r.date.getTime() >= b.start.getTime() && r.date.getTime() <= b.end.getTime()
    );
    // null (not 0) for buckets with no marked records, so the chart shows a
    // gap instead of a misleading 0% on non-class days.
    return { label: b.label, rate: inBucket.length === 0 ? null : computeAttendanceRate(inBucket) };
  });
}

export async function getReminderActivity(range: ResolvedRange) {
  const buckets = generateBuckets(range.from, range.to, range.bucketSize);

  const remindersInRange = await prisma.feeReminder.findMany({
    where: { sentAt: { gte: range.from, lte: range.to } },
    select: { id: true, studentId: true, sentAt: true },
  });
  if (remindersInRange.length === 0) {
    return buckets.map((b) => ({ label: b.label, sent: 0, converted: 0 }));
  }

  // Conversion for a reminder can depend on its next reminder or on a
  // payment outside the selected range, so this fetches the relevant
  // students' reminders/payments beyond [from, to] rather than restricting
  // the conversion computation to the range. Only the lower bounds can be
  // narrowed: every in-range reminder's "next reminder" is at or after
  // `from`, and only payments from the earliest in-range reminder's day on
  // can convert anything.
  const studentIds = [...new Set(remindersInRange.map((r) => r.studentId))];
  const earliestSentAt = new Date(Math.min(...remindersInRange.map((r) => r.sentAt.getTime())));
  const [allReminders, allPayments] = await Promise.all([
    prisma.feeReminder.findMany({
      where: { studentId: { in: studentIds }, sentAt: { gte: range.from } },
      select: { id: true, studentId: true, sentAt: true },
    }),
    prisma.payment.findMany({
      where: { studentId: { in: studentIds }, paymentDate: { gte: startOfUTCDay(earliestSentAt) } },
      select: { studentId: true, paymentDate: true },
    }),
  ]);
  // Payment.paymentDate is usually a date-only (UTC-midnight) value from the
  // date picker while sentAt is a real timestamp; treat a date-only payment
  // as happening at the end of its day so a same-day payment counts as after
  // a reminder sent earlier that day.
  const adjustedPayments = allPayments.map((p) => ({
    studentId: p.studentId,
    paymentDate:
      p.paymentDate.getTime() === startOfUTCDay(p.paymentDate).getTime()
        ? endOfUTCDay(p.paymentDate)
        : p.paymentDate,
  }));
  const conversions = computeReminderConversions(allReminders, adjustedPayments, new Date());

  return buckets.map((b) => {
    const inBucket = remindersInRange.filter(
      (r) => r.sentAt.getTime() >= b.start.getTime() && r.sentAt.getTime() <= b.end.getTime()
    );
    const converted = inBucket.filter((r) => conversions.get(r.id)).length;
    return { label: b.label, sent: inBucket.length, converted };
  });
}
