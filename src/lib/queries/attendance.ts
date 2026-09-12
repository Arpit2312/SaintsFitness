// Read-only queries, not mutations -- lives outside src/actions/ (which is
// "use server") so these can never be called as Server Actions from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { prisma } from "@/lib/db";
import { startOfUTCDay } from "@/lib/dates";
import { isBatchScheduledOn } from "@/lib/attendance/schedule";
import { computeAttendanceRate } from "@/lib/attendance/rate";

export async function getBatchRosterForDate(batchId: string, date: Date) {
  const normalizedDate = startOfUTCDay(date);

  const [batch, attendanceRecords] = await Promise.all([
    prisma.batch.findUnique({
      where: { id: batchId, deletedAt: null },
      include: {
        enrollments: {
          where: { student: { deletedAt: null } },
          include: { student: true },
          orderBy: { student: { name: "asc" } },
        },
      },
    }),
    prisma.attendance.findMany({ where: { batchId, date: normalizedDate } }),
  ]);
  if (!batch) return null;

  const statusByStudentId = new Map(attendanceRecords.map((a) => [a.studentId, a.status]));

  return {
    batchName: batch.name,
    // `status: null` means "not yet marked for this date" -- the UI defaults
    // these to PRESENT for display only, nothing is written until saved.
    roster: batch.enrollments.map((e) => ({
      studentId: e.student.id,
      name: e.student.name,
      studentCode: e.student.studentCode,
      status: statusByStudentId.get(e.student.id) ?? null,
    })),
  };
}

export async function getStudentAttendanceHistory(studentId: string) {
  const records = await prisma.attendance.findMany({
    where: { studentId, student: { deletedAt: null } },
    include: { batch: true },
    orderBy: { date: "desc" },
  });

  return {
    records: records.map((r) => ({
      id: r.id,
      date: r.date,
      batchName: r.batch.name,
      status: r.status,
    })),
    rate: computeAttendanceRate(records),
  };
}

export async function listBatchesForDate(date: Date) {
  const normalizedDate = startOfUTCDay(date);
  const batches = await prisma.batch.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, days: true },
    orderBy: { name: "asc" },
  });

  // Array.prototype.sort is a stable sort (guaranteed since ES2019), so this
  // preserves the name-ascending order fetched above within each group --
  // scheduled-today batches first, still alphabetical among themselves.
  return batches
    .map((b) => ({ id: b.id, name: b.name, scheduledToday: isBatchScheduledOn(b.days, normalizedDate) }))
    .sort((a, b) => Number(b.scheduledToday) - Number(a.scheduledToday));
}

export async function getStudentEnrolledBatches(studentId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, student: { deletedAt: null }, batch: { deletedAt: null } },
    include: { batch: true },
    orderBy: { batch: { name: "asc" } },
  });
  return enrollments.map((e) => ({ id: e.batch.id, name: e.batch.name }));
}
