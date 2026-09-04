"use server";

import { prisma } from "@/lib/db";
import { courseSchema, type CourseInput } from "@/lib/validations/course";
import { revalidatePath } from "next/cache";

export async function createCourse(input: CourseInput) {
  const data = courseSchema.parse(input);
  await prisma.course.create({ data });
  revalidatePath("/classes/courses");
}

export async function updateCourse(id: string, input: CourseInput) {
  const data = courseSchema.parse(input);
  await prisma.course.update({ where: { id }, data });
  revalidatePath("/classes/courses");
}

export async function deleteCourse(id: string) {
  await prisma.course.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/classes/courses");
}
