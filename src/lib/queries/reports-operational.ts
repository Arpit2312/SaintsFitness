// Read-only queries, not mutations -- lives outside src/actions/ (which is
// "use server") so these can never be called as Server Actions from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { prisma } from "@/lib/db";
import { todayInIST } from "@/lib/dates";
import { listStudentsWithPendingFees } from "@/lib/queries/reminders";
import type { ResolvedRange } from "@/lib/reports/date-range";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getOverdueStudents() {
  const pending = await listStudentsWithPendingFees();
  return pending.filter((s) => s.status === "OVERDUE");
}

export async function getAttendanceGaps(days: number) {
  const cutoff = new Date(todayInIST().getTime() - days * DAY_MS);
  const students = await prisma.student.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      studentCode: true,
      name: true,
      mobile: true,
      attendance: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
    },
  });

  return students
    .map((s) => ({
      studentId: s.id,
      studentCode: s.studentCode,
      name: s.name,
      mobile: s.mobile,
      lastAttendedAt: s.attendance[0]?.date ?? null,
    }))
    .filter((s) => !s.lastAttendedAt || s.lastAttendedAt.getTime() < cutoff.getTime())
    .sort((a, b) => {
      // Students who never attended sort first (most urgent), then
      // oldest-last-attended first.
      if (!a.lastAttendedAt && !b.lastAttendedAt) return 0;
      if (!a.lastAttendedAt) return -1;
      if (!b.lastAttendedAt) return 1;
      return a.lastAttendedAt.getTime() - b.lastAttendedAt.getTime();
    });
}

export async function getRecentJoinsAndLeaves(range: ResolvedRange) {
  const [joined, left] = await Promise.all([
    prisma.student.findMany({
      where: { deletedAt: null, joiningDate: { gte: range.from, lte: range.to } },
      select: { id: true, studentCode: true, name: true, mobile: true, joiningDate: true },
      orderBy: { joiningDate: "desc" },
    }),
    prisma.student.findMany({
      where: { deletedAt: null, status: "LEFT", updatedAt: { gte: range.from, lte: range.to } },
      select: { id: true, studentCode: true, name: true, mobile: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    joined: joined.map((s) => ({
      studentId: s.id,
      studentCode: s.studentCode,
      name: s.name,
      mobile: s.mobile,
      joiningDate: s.joiningDate,
    })),
    left: left.map((s) => ({
      studentId: s.id,
      studentCode: s.studentCode,
      name: s.name,
      mobile: s.mobile,
      leftAt: s.updatedAt,
    })),
  };
}
