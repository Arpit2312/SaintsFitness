// Read-only queries, not mutations -- lives outside src/actions/ (which is
// "use server") so these can never be called as Server Actions from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { prisma } from "@/lib/db";
import { computeAttendanceRate } from "@/lib/attendance/rate";
import { startOfUTCDay, todayInIST } from "@/lib/dates";
import type { JourneyNote, JourneyProgressValues } from "@/lib/journey/types";

export const ATTENDANCE_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function windowStart(): Date {
  return new Date(startOfUTCDay(todayInIST()).getTime() - ATTENDANCE_WINDOW_DAYS * DAY_MS);
}

function toProgressValues(row: {
  danceLevel: string | null;
  fitnessScore: number | null;
  consistencyScore: number | null;
  awarenessScore: number | null;
  growthScore: number | null;
}): JourneyProgressValues {
  return {
    danceLevel: row.danceLevel,
    fitnessScore: row.fitnessScore,
    consistencyScore: row.consistencyScore,
    awarenessScore: row.awarenessScore,
    growthScore: row.growthScore,
  };
}

function toNote(row: { id: string; note: string; createdAt: Date; instructor: { name: string } }): JourneyNote {
  return { id: row.id, note: row.note, createdAt: row.createdAt, instructorName: row.instructor.name };
}

export async function getStudentJourney(studentId: string) {
  const since = windowStart();
  const [progress, attendance, notes] = await Promise.all([
    prisma.journeyProgress.findUnique({ where: { studentId, student: { deletedAt: null } } }),
    prisma.attendance.findMany({
      where: { studentId, student: { deletedAt: null }, date: { gte: since } },
      select: { status: true },
    }),
    prisma.instructorNote.findMany({
      where: { studentId, student: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { instructor: { select: { name: true } } },
    }),
  ]);

  return {
    progress: progress ? toProgressValues(progress) : null,
    // No marked records in the window means "unrated", not 0%.
    attendanceRate: attendance.length === 0 ? null : computeAttendanceRate(attendance),
    recentNotes: notes.map(toNote),
  };
}

export async function listStudentNotes(studentId: string): Promise<JourneyNote[]> {
  const notes = await prisma.instructorNote.findMany({
    where: { studentId, student: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    include: { instructor: { select: { name: true } } },
  });
  return notes.map(toNote);
}

export async function getNoteInstructorOptions(studentId: string) {
  const [instructors, enrollments] = await Promise.all([
    prisma.instructor.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.enrollment.findMany({
      where: { studentId, student: { deletedAt: null }, batch: { deletedAt: null } },
      select: { batch: { select: { instructorId: true } } },
    }),
  ]);

  // Pre-select an instructor only when every enrolled batch shares exactly
  // one; otherwise the admin has to choose.
  const batchInstructorIds = new Set(
    enrollments.map((e) => e.batch.instructorId).filter((id): id is string => id !== null)
  );
  const onlyId = batchInstructorIds.size === 1 ? [...batchInstructorIds][0] : null;
  const defaultInstructorId = onlyId !== null && instructors.some((i) => i.id === onlyId) ? onlyId : null;

  return { instructors, defaultInstructorId };
}

export async function listJourneyOverview() {
  const students = await prisma.student.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      studentCode: true,
      name: true,
      journeyProgress: {
        select: {
          danceLevel: true,
          fitnessScore: true,
          consistencyScore: true,
          awarenessScore: true,
          growthScore: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });
  if (students.length === 0) return [];

  const studentIds = students.map((s) => s.id);
  const [notes, attendance] = await Promise.all([
    prisma.instructorNote.findMany({
      where: { studentId: { in: studentIds } },
      orderBy: { createdAt: "desc" },
      select: { studentId: true, note: true, createdAt: true },
    }),
    prisma.attendance.findMany({
      where: { studentId: { in: studentIds }, date: { gte: windowStart() } },
      select: { studentId: true, status: true },
    }),
  ]);

  // notes is sorted newest-first, so the first one seen per student is the latest.
  const latestNoteByStudent = new Map<string, { note: string; createdAt: Date }>();
  for (const n of notes) {
    if (!latestNoteByStudent.has(n.studentId)) latestNoteByStudent.set(n.studentId, { note: n.note, createdAt: n.createdAt });
  }

  const attendanceByStudent = new Map<string, { status: (typeof attendance)[number]["status"] }[]>();
  for (const a of attendance) {
    const list = attendanceByStudent.get(a.studentId) ?? [];
    list.push({ status: a.status });
    attendanceByStudent.set(a.studentId, list);
  }

  return students.map((s) => {
    const records = attendanceByStudent.get(s.id) ?? [];
    return {
      studentId: s.id,
      studentCode: s.studentCode,
      name: s.name,
      progress: s.journeyProgress ? toProgressValues(s.journeyProgress) : null,
      attendanceRate: records.length === 0 ? null : computeAttendanceRate(records),
      latestNote: latestNoteByStudent.get(s.id) ?? null,
    };
  });
}
