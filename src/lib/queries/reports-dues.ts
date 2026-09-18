// Read-only query, not a mutation -- lives outside src/actions/ (which is
// "use server") so it can never be called as a Server Action from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import type { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/db";
import { computeFeeHistory } from "@/lib/fees/fee-history";
import { classifyDues, type DuesCategory } from "@/lib/reports/dues";

export type PendingStudentWithDues = {
  studentId: string;
  studentCode: string;
  name: string;
  mobile: string;
  totalPending: Decimal;
  pastDuePending: Decimal;
  category: DuesCategory;
};

export async function listPendingStudentsWithDues(): Promise<PendingStudentWithDues[]> {
  const students = await prisma.student.findMany({
    where: { deletedAt: null },
    include: { feePlan: { include: { payments: true } } },
    orderBy: { name: "asc" },
  });

  const today = new Date();
  const rows: PendingStudentWithDues[] = [];
  for (const student of students) {
    const plan = student.feePlan;
    if (!plan) continue;

    const { periods, totalPending } = computeFeeHistory(
      plan.dueDate,
      plan.frequency,
      plan.finalAmount,
      plan.payments,
      today
    );
    if (!totalPending.gt(0)) continue;

    const { category, pastDuePending } = classifyDues(periods, today);
    rows.push({
      studentId: student.id,
      studentCode: student.studentCode,
      name: student.name,
      mobile: student.mobile,
      totalPending,
      pastDuePending,
      category,
    });
  }
  return rows;
}
