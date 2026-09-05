// Read-only query, not a mutation — lives outside src/actions/ (which is
// "use server") so it can never be called as a Server Action from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { prisma } from "@/lib/db";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";

export async function getDashboardStats() {
  const [totalStudents, activeStudents, todaysBatchCount] = await Promise.all([
    prisma.student.count({ where: { deletedAt: null } }),
    prisma.student.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.batch.count({ where: { deletedAt: null } }),
  ]);

  // Fee/attendance data doesn't exist until Phase 2/3 — these are real
  // queries against real (currently empty) tables, not hardcoded numbers.
  const [monthCollection, pendingFees, todaysAttendanceCount] = await Promise.all([
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        paymentDate: { gte: startOfMonth(new Date()), lte: endOfMonth(new Date()) },
      },
    }),
    prisma.feePlan.aggregate({ _sum: { finalAmount: true } }),
    prisma.attendance.count({
      where: { date: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) } },
    }),
  ]);

  return {
    totalStudents,
    activeStudents,
    monthCollection: Number(monthCollection._sum.amount ?? 0),
    pendingFees: Number(pendingFees._sum.finalAmount ?? 0),
    todaysClasses: todaysBatchCount,
    todaysAttendanceCount,
  };
}
