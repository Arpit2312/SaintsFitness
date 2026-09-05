"use server";

import { prisma } from "@/lib/db";
import { generateStudentCode } from "@/lib/ids";
import { studentSchema, type StudentInput } from "@/lib/validations/student";
import { revalidatePath } from "next/cache";

export async function createStudent(input: StudentInput, photoUrl?: string) {
  const data = studentSchema.parse(input);
  const studentCode = await generateStudentCode();

  await prisma.student.create({
    data: {
      studentCode,
      name: data.name,
      photoUrl,
      mobile: data.mobile,
      dob: data.dob,
      gender: data.gender,
      joiningDate: data.joiningDate,
      status: data.status,
      address: {
        create: {
          houseStreet: data.houseStreet,
          area: data.area,
          city: data.city,
          state: data.state,
          pinCode: data.pinCode,
        },
      },
      emergencyContact: {
        create: {
          name: data.emergencyContactName,
          relationship: data.emergencyContactRelationship,
          mobile: data.emergencyContactMobile,
        },
      },
      parentDetails: {
        create: {
          fatherName: data.fatherName || null,
          motherName: data.motherName || null,
          guardianName: data.guardianName || null,
          parentMobile: data.parentMobile || null,
        },
      },
      enrollments: {
        create: { batchId: data.batchId },
      },
    },
  });

  revalidatePath("/students");
  return studentCode;
}

export async function updateStudent(id: string, input: StudentInput, photoUrl?: string) {
  const data = studentSchema.parse(input);

  // The Batch <Select> on the edit form lets an admin reassign the student
  // to a different batch, but enrollments live in a separate join table
  // (Enrollment) rather than as a plain column on Student. Only touch the
  // enrollment when the batch actually changed -- an unconditional
  // delete+recreate on every save would reset joiningBatchDate for a no-op
  // edit. Nested inside the single student.update() call below (rather than
  // a separate prisma.$transaction) so the delete+create pair stays atomic
  // for free, same reasoning as createStudent's single nested create.
  const currentEnrollment = await prisma.enrollment.findFirst({ where: { studentId: id } });
  const batchChanged = !currentEnrollment || currentEnrollment.batchId !== data.batchId;

  const addressData = {
    houseStreet: data.houseStreet,
    area: data.area,
    city: data.city,
    state: data.state,
    pinCode: data.pinCode,
  };
  const emergencyContactData = {
    name: data.emergencyContactName,
    relationship: data.emergencyContactRelationship,
    mobile: data.emergencyContactMobile,
  };
  const parentDetailsData = {
    fatherName: data.fatherName || null,
    motherName: data.motherName || null,
    guardianName: data.guardianName || null,
    parentMobile: data.parentMobile || null,
  };

  await prisma.student.update({
    where: { id },
    data: {
      name: data.name,
      ...(photoUrl ? { photoUrl } : {}),
      mobile: data.mobile,
      dob: data.dob,
      gender: data.gender,
      joiningDate: data.joiningDate,
      status: data.status,
      address: { upsert: { create: addressData, update: addressData } },
      emergencyContact: { upsert: { create: emergencyContactData, update: emergencyContactData } },
      parentDetails: { upsert: { create: parentDetailsData, update: parentDetailsData } },
      // deleteMany: {} is deliberately unfiltered (not scoped to the old
      // batchId) -- Prisma scopes nested relation writes to this student
      // automatically, and an unfiltered clear also cleans up any stray
      // extra enrollment rows (a state the UI never creates but the schema
      // doesn't prevent), guaranteeing exactly one enrollment afterward.
      // Filtering by the old batchId would leave such stray rows behind.
      ...(batchChanged
        ? { enrollments: { deleteMany: {}, create: { batchId: data.batchId } } }
        : {}),
    },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
}

export async function deleteStudent(id: string) {
  await prisma.student.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/students");
}
