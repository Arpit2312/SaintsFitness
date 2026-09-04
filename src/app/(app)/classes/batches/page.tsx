import { listBatches } from "@/lib/queries/batches";
import { listCourses } from "@/lib/queries/courses";
import { listInstructors } from "@/lib/queries/instructors";
import { BatchesList } from "@/components/classes/batches-list";

export default async function BatchesPage() {
  const [batches, courses, instructors] = await Promise.all([
    listBatches(),
    listCourses(),
    listInstructors(),
  ]);

  return (
    <BatchesList
      batches={batches}
      courseOptions={courses.map((c) => ({ id: c.id, name: c.name }))}
      instructorOptions={instructors.map((i) => ({ id: i.id, name: i.name }))}
    />
  );
}
