// Read-only query, not a mutation — lives outside src/actions/ (which is
// "use server") so it can never be called as a Server Action from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { prisma } from "@/lib/db";
import { listStudentFeeStatuses } from "@/lib/queries/fees";

type StudentFeeStatus = Awaited<ReturnType<typeof listStudentFeeStatuses>>[number];
type PendingStudentFeeStatus = Extract<StudentFeeStatus, { hasPlan: true }>;

// Worst-first: OVERDUE surfaces before PARTIAL before DUE. Any other status
// (NOT_STARTED, PAID) can never actually appear here -- this function only
// ever keeps rows with totalPending > 0 -- but the fallback keeps the sort
// total instead of partial if that invariant is ever loosened.
const STATUS_PRIORITY: Record<string, number> = { OVERDUE: 0, PARTIAL: 1, DUE: 2 };

export async function listStudentsWithPendingFees() {
  const statuses = await listStudentFeeStatuses();
  const pending = statuses.filter(
    (s): s is PendingStudentFeeStatus => s.hasPlan && s.totalPending.gt(0)
  );

  if (pending.length === 0) return [];

  const studentIds = pending.map((s) => s.studentId);
  const [students, reminders] = await Promise.all([
    prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, mobile: true } }),
    prisma.feeReminder.findMany({
      where: { studentId: { in: studentIds } },
      orderBy: { sentAt: "desc" },
      select: { studentId: true, sentAt: true },
    }),
  ]);

  const mobileByStudentId = new Map(students.map((s) => [s.id, s.mobile]));
  // reminders is already sorted sentAt desc, so the first entry seen per
  // studentId is that student's most recent reminder.
  const lastReminderByStudentId = new Map<string, Date>();
  for (const r of reminders) {
    if (!lastReminderByStudentId.has(r.studentId)) lastReminderByStudentId.set(r.studentId, r.sentAt);
  }

  return pending
    .map((s) => ({
      studentId: s.studentId,
      studentCode: s.studentCode,
      name: s.name,
      mobile: mobileByStudentId.get(s.studentId) ?? "",
      status: s.status,
      totalPending: s.totalPending,
      lastRemindedAt: lastReminderByStudentId.get(s.studentId) ?? null,
    }))
    .sort((a, b) => (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99));
}
