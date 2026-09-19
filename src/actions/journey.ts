"use server";

import { prisma } from "@/lib/db";
import {
  journeyProgressSchema,
  instructorNoteSchema,
  type JourneyProgressInput,
  type InstructorNoteInput,
} from "@/lib/validations/journey";
import { revalidatePath } from "next/cache";

function revalidateJourney(studentId: string) {
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/journey");
}

export async function saveJourneyProgress(studentId: string, input: JourneyProgressInput) {
  const data = journeyProgressSchema.parse(input);

  const student = await prisma.student.findUnique({
    where: { id: studentId, deletedAt: null },
    select: { id: true },
  });
  if (!student) {
    throw new Error("Student not found.");
  }

  // Explicit nulls in `data` clear a previously-set field on purpose -- the
  // admin can un-rate something.
  await prisma.journeyProgress.upsert({
    where: { studentId },
    create: { studentId, ...data },
    update: data,
  });

  revalidateJourney(studentId);
}

export async function addInstructorNote(input: InstructorNoteInput) {
  const data = instructorNoteSchema.parse(input);

  const [student, instructor] = await Promise.all([
    prisma.student.findUnique({ where: { id: data.studentId, deletedAt: null }, select: { id: true } }),
    prisma.instructor.findUnique({ where: { id: data.instructorId, deletedAt: null }, select: { id: true } }),
  ]);
  if (!student) {
    throw new Error("Student not found.");
  }
  if (!instructor) {
    throw new Error("Instructor not found.");
  }

  await prisma.instructorNote.create({ data });

  revalidateJourney(data.studentId);
}

export async function deleteInstructorNote(noteId: string) {
  const note = await prisma.instructorNote.findUnique({
    where: { id: noteId, student: { deletedAt: null } },
    select: { id: true, studentId: true },
  });
  if (!note) {
    throw new Error("Note not found.");
  }

  await prisma.instructorNote.delete({ where: { id: noteId } });

  revalidateJourney(note.studentId);
}
