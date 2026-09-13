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

  return (
    <AttendanceRoster date={date} batches={batches} selectedBatchId={selectedBatchId} roster={roster} />
  );
}
