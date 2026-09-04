import { z } from "zod";

export const courseSchema = z.object({
  name: z.string().min(2, "Course name is required"),
  category: z.enum(["Dance", "Zumba", "Fitness", "Other"]),
  description: z.string().optional(),
});

export type CourseInput = z.infer<typeof courseSchema>;
