export type ActivityEvent = { at: Date; text: string };

/** Newest first, capped at `limit`. Does not mutate its input. */
export function mergeActivity(events: ActivityEvent[], limit: number): ActivityEvent[] {
  return [...events].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/**
 * One roll call saves a row per student; collapse rows for the same batch and
 * calendar date into a single event ("Morning Zumba attendance marked: 12 of
 * 15 present."). PRESENT and LATE count as present (same as the attendance
 * rate); the event time is the latest row's `createdAt`.
 */
export function summarizeAttendance(
  rows: { batchId: string; batchName: string; date: Date; status: string; createdAt: Date }[]
): ActivityEvent[] {
  const groups = new Map<string, { batchName: string; present: number; total: number; latest: Date }>();
  for (const row of rows) {
    const key = `${row.batchId}|${row.date.toISOString().slice(0, 10)}`;
    const group = groups.get(key) ?? { batchName: row.batchName, present: 0, total: 0, latest: row.createdAt };
    group.total += 1;
    if (row.status === "PRESENT" || row.status === "LATE") group.present += 1;
    if (row.createdAt.getTime() > group.latest.getTime()) group.latest = row.createdAt;
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => ({
    at: g.latest,
    text: `${g.batchName} attendance marked: ${g.present} of ${g.total} present.`,
  }));
}
