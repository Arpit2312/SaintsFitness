// Read-only queries, not mutations -- lives outside src/actions/ (which is
// "use server") so these can never be called as Server Actions from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/db";
import { generateBuckets, type ResolvedRange } from "@/lib/reports/date-range";
import { computeReminderConversions } from "@/lib/reports/reminder-conversion";
import { listStudentFeeStatuses } from "@/lib/queries/fees";
import { computeAttendanceRate } from "@/lib/attendance/rate";

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
  const statuses = await listStudentFeeStatuses();
  const pending = statuses.filter(
    (s): s is Extract<(typeof statuses)[number], { hasPlan: true }> => s.hasPlan && s.totalPending.gt(0)
  );

  let totalPending = new Decimal(0);
  let overdueCount = 0;
  let partialCount = 0;
  let dueCount = 0;
  for (const s of pending) {
    totalPending = totalPending.plus(s.totalPending);
    if (s.status === "OVERDUE") overdueCount += 1;
    else if (s.status === "PARTIAL") partialCount += 1;
    else if (s.status === "DUE") dueCount += 1;
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
    return { label: b.label, rate: computeAttendanceRate(inBucket) };
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
  // payment outside the selected range, so this fetches ALL of the
  // relevant students' reminders/payments (not just those inside [from,
  // to]) rather than restricting the conversion computation to the range.
  const studentIds = [...new Set(remindersInRange.map((r) => r.studentId))];
  const [allReminders, allPayments] = await Promise.all([
    prisma.feeReminder.findMany({
      where: { studentId: { in: studentIds } },
      select: { id: true, studentId: true, sentAt: true },
    }),
    prisma.payment.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, paymentDate: true },
    }),
  ]);
  const conversions = computeReminderConversions(allReminders, allPayments, new Date());

  return buckets.map((b) => {
    const inBucket = remindersInRange.filter(
      (r) => r.sentAt.getTime() >= b.start.getTime() && r.sentAt.getTime() <= b.end.getTime()
    );
    const converted = inBucket.filter((r) => conversions.get(r.id)).length;
    return { label: b.label, sent: inBucket.length, converted };
  });
}
