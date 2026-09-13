import { listStudentsWithPendingFees } from "@/lib/queries/reminders";
import { RemindersList, type PendingFeeStudent } from "@/components/reminders/reminders-list";

export default async function RemindersPage() {
  const students = await listStudentsWithPendingFees();

  // Convert each Decimal totalPending to a plain number before crossing the
  // Server -> Client Component boundary (Decimal instances can't cross RSC
  // serialization -- see Phase 2/3's identical fix on this same boundary).
  const serialized: PendingFeeStudent[] = students.map((s) => ({
    ...s,
    totalPending: s.totalPending.toNumber(),
  }));

  return <RemindersList students={serialized} />;
}
