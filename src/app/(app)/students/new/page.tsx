import { listBatchOptions } from "@/lib/queries/batches";
import { StudentForm } from "@/components/students/student-form";

export default async function NewStudentPage() {
  const batches = await listBatchOptions();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Add Student</h1>
      <StudentForm batches={batches} />
    </div>
  );
}
