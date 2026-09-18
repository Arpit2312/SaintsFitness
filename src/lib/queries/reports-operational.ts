// Read-only queries, not mutations -- lives outside src/actions/ (which is
// "use server") so these can never be called as Server Actions from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { prisma } from "@/lib/db";
import { todayInIST } from "@/lib/dates";
import { listPendingStudentsWithDues } from "@/lib/queries/reports-dues";
import type { ResolvedRange } from "@/lib/reports/date-range";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getOverdueStudents() {
  const pending = await listPendingStudentsWithDues();
  return pending
    .filter((s) => s.category === "OVERDUE")
    .sort((a, b) => b.pastDuePending.comparedTo(a.pastDuePending));
}

export async function getAttendanceGaps(days: number) {
  // A student is flagged when their last attended (PRESENT/LATE) day is
  // strictly more than `days` days ago. ABSENT/LEAVE rows do not count as
  // attending (matches src/lib/attendance/rate.ts). Students who joined on or
  // after the cutoff cannot have a gap that long yet, so they are excluded
  // (equivalent to measuring from lastAttended ?? joiningDate).
  const cutoff = new Date(todayInIST().getTime() - days * DAY_MS);
  const students = await prisma.student.findMany({
    where: { deletedAt: null, status: "ACTIVE", joiningDate: { lt: cutoff } },
    select: {
      id: true,
      studentCode: true,
      name: true,
      mobile: true,
      attendance: {
        where: { status: { in: ["PRESENT", "LATE"] } },
        orderBy: { date: "desc" },
        take: 1,
        select: { date: true },
      },
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
      // oldest-last-attended first; ties broken by student code.
      if (!a.lastAttendedAt && !b.lastAttendedAt) return a.studentCode.localeCompare(b.studentCode);
      if (!a.lastAttendedAt) return -1;
      if (!b.lastAttendedAt) return 1;
      const diff = a.lastAttendedAt.getTime() - b.lastAttendedAt.getTime();
      return diff !== 0 ? diff : a.studentCode.localeCompare(b.studentCode);
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
