import { listStudents } from "@/lib/queries/students";
import { listBatchOptions } from "@/lib/queries/batches";
import { StudentsList } from "@/components/students/students-list";

export default async function StudentsPage() {
  const [students, batches] = await Promise.all([listStudents(), listBatchOptions()]);

  return <StudentsList students={students} batches={batches} />;
}
