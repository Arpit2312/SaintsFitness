import { z } from "zod";

export const instructorSchema = z.object({
  name: z.string().min(2, "Name is required"),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  bio: z.string().optional(),
});

export type InstructorInput = z.infer<typeof instructorSchema>;
