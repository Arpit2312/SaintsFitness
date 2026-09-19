// Read-only query, not a mutation. "server-only" makes any client-side value
// import a build error.
import "server-only";

import { prisma } from "@/lib/db";
import { mergeActivity, summarizeAttendance, type ActivityEvent } from "@/lib/notifications/activity";
import { buildPaymentMessage, paymentModeLabel } from "@/lib/notifications/candidates";

const PER_SOURCE = 10;
const ATTENDANCE_ROWS = 60;
const LIMIT = 10;
// A brand-new student's enrollment is created within moments of the student
// itself; only report a batch join if it happened clearly after admission.
const JOIN_AFTER_ADMISSION_MS = 60 * 1000;

export async function getRecentActivity(): Promise<ActivityEvent[]> {
  const [payments, students, enrollments, reminders, attendance] = await Promise.all([
    prisma.payment.findMany({
      where: { student: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { amount: true, mode: true, createdAt: true, student: { select: { name: true } } },
    }),
    prisma.student.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { name: true, createdAt: true },
    }),
    prisma.enrollment.findMany({
      where: { student: { deletedAt: null }, batch: { deletedAt: null } },
      orderBy: { joiningBatchDate: "desc" },
      take: PER_SOURCE,
      select: {
        joiningBatchDate: true,
        student: { select: { name: true, createdAt: true } },
        batch: { select: { name: true } },
      },
    }),
    prisma.feeReminder.findMany({
      where: { student: { deletedAt: null } },
      orderBy: { sentAt: "desc" },
      take: PER_SOURCE,
      select: { sentAt: true, student: { select: { name: true } } },
    }),
    prisma.attendance.findMany({
      where: { student: { deletedAt: null }, batch: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: ATTENDANCE_ROWS,
      select: { batchId: true, date: true, status: true, createdAt: true, batch: { select: { name: true } } },
    }),
  ]);

  const events: ActivityEvent[] = [
    ...payments.map((p) => ({
      at: p.createdAt,
      text: buildPaymentMessage(p.student.name, p.amount.toNumber(), paymentModeLabel(p.mode)),
    })),
    ...students.map((s) => ({ at: s.createdAt, text: `${s.name} joined.` })),
    ...enrollments
      .filter((e) => e.joiningBatchDate.getTime() - e.student.createdAt.getTime() > JOIN_AFTER_ADMISSION_MS)
      .map((e) => ({ at: e.joiningBatchDate, text: `${e.student.name} joined ${e.batch.name}.` })),
    ...reminders.map((r) => ({ at: r.sentAt, text: `Fee reminder sent to ${r.student.name}.` })),
    ...summarizeAttendance(
      attendance.map((a) => ({
        batchId: a.batchId,
        batchName: a.batch.name,
        date: a.date,
        status: a.status,
        createdAt: a.createdAt,
      }))
    ),
  ];

  return mergeActivity(events, LIMIT);
}
