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
    },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
}

export async function deleteStudent(id: string) {
  await prisma.student.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/students");
}
