import { listCourses } from "@/actions/courses";
import { CoursesList } from "@/components/classes/courses-list";

export default async function CoursesPage() {
  const courses = await listCourses();
  return <CoursesList courses={courses} />;
}
