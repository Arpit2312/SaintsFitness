import { z } from "zod";

export const attendanceStatusSchema = z.enum(["PRESENT", "ABSENT", "LATE", "LEAVE"]);

// `date` is compared against `new Date()` (the current instant) rather than
// a UTC-midnight "today" -- a date typed via <input type="date"> coerces to
// that day's UTC midnight, which is always <= the current instant for
// today's own date or any past date, and > it for any future date. This is
// intentionally simple: it does not need IST-awareness, since the boundary
// it guards against (typing tomorrow's date) is generous by a full day in
// either timezone direction.
const notFutureDate = z.coerce.date().refine((d) => d.getTime() <= Date.now(), {
  message: "Cannot mark attendance for a future date",
});

export const batchAttendanceRecordSchema = z.object({
  studentId: z.string().min(1),
  status: attendanceStatusSchema,
});

export const saveBatchAttendanceSchema = z.object({
  batchId: z.string().min(1),
  date: notFutureDate,
  records: z.array(batchAttendanceRecordSchema).min(1, "No students to mark"),
});
export type SaveBatchAttendanceInput = z.infer<typeof saveBatchAttendanceSchema>;

export const markStudentAttendanceSchema = z.object({
  batchId: z.string().min(1),
  date: notFutureDate,
  status: attendanceStatusSchema,
});
export type MarkStudentAttendanceInput = z.infer<typeof markStudentAttendanceSchema>;
