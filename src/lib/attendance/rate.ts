import type { AttendanceStatus } from "@prisma/client";

/**
 * (PRESENT + LATE) / total marked records, as a 0-100 rounded percentage.
 * LEAVE and ABSENT both count against the rate; LATE still counts as
 * attended (just marked separately for visibility elsewhere). Returns 0 for
 * an empty record set rather than dividing by zero.
 */
export function computeAttendanceRate(records: { status: AttendanceStatus }[]): number {
  if (records.length === 0) return 0;
  const attended = records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
  return Math.round((attended / records.length) * 100);
}
