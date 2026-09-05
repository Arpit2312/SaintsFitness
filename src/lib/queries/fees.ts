// Read-only queries, not mutations -- lives outside src/actions/ (which is
// "use server") so these can never be called as Server Actions from client
// code. "server-only" makes any client-side value import a build error;
// client components that need a return type should use `import type`
// instead (see src/components/classes/courses-list.tsx for the pattern).
import "server-only";

import { prisma } from "@/lib/db";
import { computeFeeHistory, nextCoverageStartFromPeriods } from "@/lib/fees/fee-history";

export async function getStudentFeeHistory(studentId: string) {
  const plan = await prisma.feePlan.findUnique({
    where: { studentId, student: { deletedAt: null } },
    include: { payments: true },
  });
  if (!plan) return null;

  const today = new Date();
  const { periods, totalPaid, totalPending } = computeFeeHistory(
    plan.dueDate,
    plan.frequency,
    plan.finalAmount,
    plan.payments,
    today
  );
  const nextCoverageStart = nextCoverageStartFromPeriods(periods, plan.dueDate, plan.frequency);

  return { plan, periods, totalPaid, totalPending, nextCoverageStart };
}

export async function getFeePlan(studentId: string) {
  return prisma.feePlan.findUnique({ where: { studentId, student: { deletedAt: null } } });
}

export async function listStudentFeeStatuses() {
  const students = await prisma.student.findMany({
    where: { deletedAt: null },
    include: { feePlan: { include: { payments: true } } },
    orderBy: { name: "asc" },
  });

  const today = new Date();
  return students.map((student) => {
    if (!student.feePlan) {
      return {
        studentId: student.id,
        studentCode: student.studentCode,
        name: student.name,
        hasPlan: false as const,
      };
    }

    const { periods, totalPending } = computeFeeHistory(
      student.feePlan.dueDate,
      student.feePlan.frequency,
      student.feePlan.finalAmount,
      student.feePlan.payments,
      today
    );
    const currentPeriod = periods[periods.length - 1];

    return {
      studentId: student.id,
      studentCode: student.studentCode,
      name: student.name,
      hasPlan: true as const,
      status: currentPeriod?.status ?? ("NOT_STARTED" as const),
      totalPending,
    };
  });
}

export async function getPayment(paymentId: string) {
  return prisma.payment.findUnique({
    where: { id: paymentId },
    include: { student: true, receipt: true, feePlan: true },
  });
}
