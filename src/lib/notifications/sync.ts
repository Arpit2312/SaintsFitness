import "server-only";

import { prisma } from "@/lib/db";
import { computeAttendanceRate } from "@/lib/attendance/rate";
import { startOfUTCDay, todayInIST } from "@/lib/dates";
import { getSettings } from "@/lib/queries/settings";
import { listPendingStudentsWithDues } from "@/lib/queries/reports-dues";
import { SETTINGS_ID } from "@/lib/settings/defaults";
import {
  LOW_ATTENDANCE_WINDOW_DAYS,
  SYNC_INTERVAL_MS,
  buildDueSoonCandidates,
  buildLowAttendanceCandidates,
  buildOverdueCandidates,
  isSyncStale,
} from "@/lib/notifications/candidates";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True for exactly one caller per throttle window. The cheap read is a fast
 * path (most page loads stop here); the conditional `updateMany` is the real
 * atomic claim, so two concurrent stale callers can never both proceed.
 */
export async function claimNotificationSync(now: Date): Promise<boolean> {
  const row = await prisma.academySettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { lastNotificationSyncAt: true },
  });
  if (row && !isSyncStale(row.lastNotificationSyncAt, now)) return false;

  // Make sure the singleton row exists so the conditional update has a row
  // to claim (all other columns take their schema defaults).
  await prisma.academySettings.createMany({ data: [{ id: SETTINGS_ID }], skipDuplicates: true });

  const staleBefore = new Date(now.getTime() - SYNC_INTERVAL_MS);
  const result = await prisma.academySettings.updateMany({
    where: {
      id: SETTINGS_ID,
      OR: [{ lastNotificationSyncAt: null }, { lastNotificationSyncAt: { lte: staleBefore } }],
    },
    data: { lastNotificationSyncAt: now },
  });
  return result.count === 1;
}

async function lowAttendanceInputs(today: Date, studentIds?: string[]) {
  const since = new Date(today.getTime() - LOW_ATTENDANCE_WINDOW_DAYS * DAY_MS);
  const students = await prisma.student.findMany({
    where: { deletedAt: null, status: "ACTIVE", ...(studentIds ? { id: { in: studentIds } } : {}) },
    select: {
      id: true,
      name: true,
      attendance: { where: { date: { gte: since } }, select: { status: true } },
    },
  });
  return students.map((s) => ({
    studentId: s.id,
    name: s.name,
    markedCount: s.attendance.length,
    rate: computeAttendanceRate(s.attendance),
  }));
}

export async function syncTimeBasedNotifications(
  options: { now?: Date; studentIds?: string[] } = {}
): Promise<{ created: number } | null> {
  const now = options.now ?? new Date();
  const { studentIds } = options;

  if (!studentIds) {
    const claimed = await claimNotificationSync(now);
    if (!claimed) return null;
  }

  const settings = await getSettings();
  const today = startOfUTCDay(todayInIST());

  const inScope = <T extends { studentId: string }>(rows: T[]) =>
    studentIds ? rows.filter((r) => studentIds.includes(r.studentId)) : rows;
  const dues = inScope(await listPendingStudentsWithDues());

  const overdue = dues
    .filter((d) => d.category === "OVERDUE")
    .map((d) => ({ studentId: d.studentId, name: d.name, pastDuePending: d.pastDuePending.toNumber() }));
  const dueSoon = dues
    .filter((d) => d.category !== "OVERDUE")
    .map((d) => ({
      studentId: d.studentId,
      name: d.name,
      totalPending: d.totalPending.toNumber(),
      nextDueDate: d.nextDueDate,
    }));

  const candidates = [
    ...buildOverdueCandidates(overdue, today, settings.overdueReminderDays),
    ...buildDueSoonCandidates(dueSoon, today, settings.dueSoonDays),
    ...buildLowAttendanceCandidates(await lowAttendanceInputs(today, studentIds), today),
  ];
  if (candidates.length === 0) return { created: 0 };

  const result = await prisma.notification.createMany({ data: candidates, skipDuplicates: true });
  return { created: result.count };
}
