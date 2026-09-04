"use server";

import { prisma } from "@/lib/db";
import { instructorSchema, type InstructorInput } from "@/lib/validations/instructor";
import { revalidatePath } from "next/cache";

export async function listInstructors() {
  return prisma.instructor.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { batches: { where: { deletedAt: null } } },
  });
}

export async function createInstructor(input: InstructorInput) {
  const data = instructorSchema.parse(input);
  await prisma.instructor.create({ data });
  revalidatePath("/classes/instructors");
}

export async function updateInstructor(id: string, input: InstructorInput) {
  const data = instructorSchema.parse(input);
  await prisma.instructor.update({ where: { id }, data });
  revalidatePath("/classes/instructors");
}

export async function deleteInstructor(id: string) {
  await prisma.instructor.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/classes/instructors");
}
