import { z } from "zod";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const batchSchema = z.object({
  name: z.string().min(2, "Batch name is required"),
  courseId: z.string().min(1, "Course is required"),
  instructorId: z.string().min(1, "Instructor is required"),
  timing: z.string().min(1, "Timing is required"),
  days: z.array(z.enum(DAYS)).min(1, "Select at least one day"),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1"),
});

export type BatchInput = z.infer<typeof batchSchema>;
