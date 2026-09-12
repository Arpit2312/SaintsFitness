"use server";

import { prisma } from "@/lib/db";
import { startOfUTCDay } from "@/lib/dates";
import {
  saveBatchAttendanceSchema,
  markStudentAttendanceSchema,
  type SaveBatchAttendanceInput,
  type MarkStudentAttendanceInput,
} from "@/lib/validations/attendance";
import { revalidatePath } from "next/cache";

export async function saveBatchAttendance(input: SaveBatchAttendanceInput) {
  const data = saveBatchAttendanceSchema.parse(input);
  const date = startOfUTCDay(data.date);

  const batch = await prisma.batch.findUnique({
    where: { id: data.batchId, deletedAt: null },
    select: { id: true },
  });
  if (!batch) {
    throw new Error("Batch not found.");
  }

  // Attendance has a direct FK to Student/Batch (not to Enrollment), so the
  // batch check above doesn't confirm each record's student actually belongs
  // to this batch. Verify every record's studentId is currently (non-deleted)
  // enrolled in this batch before writing anything.
  const enrollments = await prisma.enrollment.findMany({
    where: { batchId: data.batchId, student: { deletedAt: null } },
    select: { studentId: true },
  });
  const enrolledStudentIds = new Set(enrollments.map((e) => e.studentId));
  const invalidRecord = data.records.find((r) => !enrolledStudentIds.has(r.studentId));
  if (invalidRecord) {
    throw new Error("One or more students are not currently enrolled in this batch.");
  }

  // One transaction for the whole roster: either every student's status for
  // this batch+date is saved, or none are -- never a partially-saved
  // roll-call. (This codebase has no other $transaction usage yet; a bulk
  // multi-row save is exactly the case it exists for.)
  await prisma.$transaction(
    data.records.map((record) =>
      prisma.attendance.upsert({
        where: { studentId_batchId_date: { studentId: record.studentId, batchId: data.batchId, date } },
        create: { studentId: record.studentId, batchId: data.batchId, date, status: record.status },
        update: { status: record.status },
      })
    )
  );

  revalidatePath("/attendance");
  revalidatePath("/dashboard");
}

export async function markStudentAttendance(studentId: string, input: MarkStudentAttendanceInput) {
  const data = markStudentAttendanceSchema.parse(input);
  const date = startOfUTCDay(data.date);

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      studentId_batchId: { studentId, batchId: data.batchId },
      student: { deletedAt: null },
      batch: { deletedAt: null },
    },
    select: { studentId: true },
  });
  if (!enrollment) {
    throw new Error("This student isn't enrolled in that batch.");
  }

  await prisma.attendance.upsert({
    where: { studentId_batchId_date: { studentId, batchId: data.batchId, date } },
    create: { studentId, batchId: data.batchId, date, status: data.status },
    update: { status: data.status },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
}
