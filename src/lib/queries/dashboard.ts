// Read-only query, not a mutation — lives outside src/actions/ (which is
// "use server") so it can never be called as a Server Action from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { prisma } from "@/lib/db";
import { startOfMonth, endOfMonth } from "@/lib/fees/periods";
import { todayInIST, startOfUTCDay } from "@/lib/dates";
import { isBatchScheduledOn } from "@/lib/attendance/schedule";

export async function getDashboardStats() {
  const today = todayInIST();
  const dayStart = startOfUTCDay(today); // todayInIST() is already UTC-midnight; this is a defensive no-op

  const [totalStudents, activeStudents, batchesWithEnrollments] = await Promise.all([
    prisma.student.count({ where: { deletedAt: null } }),
    prisma.student.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.batch.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        days: true,
        enrollments: { where: { student: { deletedAt: null } }, select: { studentId: true } },
      },
    }),
  ]);

  // "Today's Classes" now means batches actually scheduled today (via
  // Batch.days), not every active batch regardless of schedule -- a Phase 1
  // follow-up this file's own comment already flagged as overpromising.
  const todaysBatches = batchesWithEnrollments.filter((b) => isBatchScheduledOn(b.days, dayStart));
  // Expected attendance today is counted per enrollment, not per unique
  // student -- a student in two batches that both meet today is expected
  // twice, once per session (matches the design spec's explicit call-out).
  const expectedToday = todaysBatches.reduce((sum, b) => sum + b.enrollments.length, 0);

  const [monthCollection, pendingFees, presentToday] = await Promise.all([
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { paymentDate: { gte: startOfMonth(today), lte: endOfMonth(today) } },
    }),
    prisma.feePlan.aggregate({ _sum: { finalAmount: true } }),
    prisma.attendance.count({
      where: {
        date: dayStart,
        batchId: { in: todaysBatches.map((b) => b.id) },
        status: { in: ["PRESENT", "LATE"] },
      },
    }),
  ]);

  return {
    totalStudents,
    activeStudents,
    monthCollection: Number(monthCollection._sum.amount ?? 0),
    pendingFees: Number(pendingFees._sum.finalAmount ?? 0),
    todaysClasses: todaysBatches.length,
    presentToday,
    expectedToday,
  };
}
