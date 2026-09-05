import { notFound } from "next/navigation";
import { getStudent } from "@/lib/queries/students";
import { listBatchOptions } from "@/lib/queries/batches";
import { StudentForm } from "@/components/students/student-form";

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [student, batches] = await Promise.all([getStudent(id), listBatchOptions()]);
  if (!student) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Edit Student</h1>
      <StudentForm
        batches={batches}
        existing={{
          id: student.id,
          photoUrl: student.photoUrl,
          name: student.name,
          mobile: student.mobile,
          dob: student.dob,
          gender: student.gender,
          joiningDate: student.joiningDate,
          status: student.status,
          batchId: student.enrollments[0]?.batchId ?? "",
          houseStreet: student.address?.houseStreet ?? "",
          area: student.address?.area ?? "",
          city: student.address?.city ?? "",
          state: student.address?.state ?? "",
          pinCode: student.address?.pinCode ?? "",
          emergencyContactName: student.emergencyContact?.name ?? "",
          emergencyContactRelationship: student.emergencyContact?.relationship ?? "",
          emergencyContactMobile: student.emergencyContact?.mobile ?? "",
          fatherName: student.parentDetails?.fatherName ?? "",
          motherName: student.parentDetails?.motherName ?? "",
          guardianName: student.parentDetails?.guardianName ?? "",
          parentMobile: student.parentDetails?.parentMobile ?? "",
        }}
      />
    </div>
  );
}
