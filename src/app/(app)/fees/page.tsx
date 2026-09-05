import { listStudentFeeStatuses } from "@/lib/queries/fees";
import { FeesList, type SerializedStudentFeeStatus } from "@/components/fees/fees-list";

export default async function FeesPage() {
  const students = await listStudentFeeStatuses();

  // Convert each Decimal `totalPending` to a plain number before crossing
  // the Server -> Client Component boundary (see fees-list.tsx's doc
  // comment / Task 10's StudentFeesTab for why this is required).
  const serialized: SerializedStudentFeeStatus[] = students.map((student) =>
    student.hasPlan
      ? { ...student, totalPending: student.totalPending.toNumber() }
      : student
  );

  return <FeesList students={serialized} />;
}
