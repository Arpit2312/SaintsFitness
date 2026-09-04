import { listInstructors } from "@/lib/queries/instructors";
import { InstructorsList } from "@/components/classes/instructors-list";

export default async function InstructorsPage() {
  const instructors = await listInstructors();
  return <InstructorsList instructors={instructors} />;
}
