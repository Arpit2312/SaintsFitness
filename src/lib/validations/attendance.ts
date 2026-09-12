import { z } from "zod";
import { startOfUTCDay, todayInIST } from "@/lib/dates";

export const attendanceStatusSchema = z.enum(["PRESENT", "ABSENT", "LATE", "LEAVE"]);

// Compares calendar days, not instants: `d` (a date typed via <input
// type="date">, coerced to that day's UTC midnight) is floored again
// defensively via startOfUTCDay in case a caller ever passes a
// non-midnight Date, then compared against todayInIST() -- also a
// UTC-midnight instant, but standing for IST's current calendar day, per
// this project's "today" convention (see src/components/layout/header.tsx's
// currentHourInIST). Comparing against raw `Date.now()` instead (an
// earlier version of this file did) is a real bug, not just a theoretical
// one: IST is UTC+5:30, so for the ~5.5 hours each day from IST midnight to
// 05:30 IST, "today" in the IST calendar coerces to a UTC-midnight instant
// that is *later* than the actual current UTC instant, and gets wrongly
// rejected as a future date -- e.g. an admin marking attendance at 2am IST
// for a class that already happened that same IST morning.
const notFutureDate = z.coerce.date().refine((d) => startOfUTCDay(d).getTime() <= todayInIST().getTime(), {
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
