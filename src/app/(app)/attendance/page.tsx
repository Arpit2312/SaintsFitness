import { listBatchesForDate, getBatchRosterForDate } from "@/lib/queries/attendance";
import { AttendanceRoster } from "@/components/attendance/attendance-roster";
import { todayInIST } from "@/lib/dates";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; batchId?: string }>;
}) {
  const params = await searchParams;
  const date = params.date ? new Date(params.date) : todayInIST();
  const batches = await listBatchesForDate(date);
  const selectedBatchId = params.batchId ?? batches.find((b) => b.scheduledToday)?.id ?? batches[0]?.id ?? null;
  const roster = selectedBatchId ? await getBatchRosterForDate(selectedBatchId, date) : null;

  // Keyed by date+batch so React remounts AttendanceRoster on navigation
  // instead of patching new props into the same instance -- a Next.js
  // searchParams-only navigation does NOT remount by default, which left
  // its local `statuses` state stale until Task 6's review caught it. A
  // fresh mount naturally re-runs the component's useState initializer with
  // the new roster, which is simpler and lint-clean compared to an effect
  // that calls setState to resync (react-hooks/set-state-in-effect).
  return (
    <AttendanceRoster
      key={`${selectedBatchId ?? "none"}-${date.toISOString().slice(0, 10)}`}
      date={date}
      batches={batches}
      selectedBatchId={selectedBatchId}
      roster={roster}
    />
  );
}
