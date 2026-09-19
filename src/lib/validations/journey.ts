import { z } from "zod";
import { DANCE_LEVELS } from "@/lib/journey/qualities";

// Form fields arrive as "" (unrated), numeric strings, numbers, or null.
// Normalize "unrated" spellings to null and numeric strings to numbers
// before the real checks run.
const normalize = (value: unknown): unknown => {
  if (value === "" || value === undefined || value === null) return null;
  if (typeof value === "string") return Number(value);
  return value;
};

const score = z.preprocess(
  normalize,
  z
    .number({ invalid_type_error: "Score must be a number from 1 to 10" })
    .int("Score must be a whole number")
    .min(1, "Score must be from 1 to 10")
    .max(10, "Score must be from 1 to 10")
    .nullable()
);

const danceLevel = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.enum(DANCE_LEVELS).nullable()
);

export const journeyProgressSchema = z.object({
  danceLevel,
  fitnessScore: score,
  consistencyScore: score,
  awarenessScore: score,
  growthScore: score,
});

export type JourneyProgressData = z.infer<typeof journeyProgressSchema>;

// Explicit input shape for the Server Action boundary (z.preprocess makes
// z.input `unknown`, which would accept anything at compile time).
export type JourneyProgressInput = {
  danceLevel: string | null;
  fitnessScore: number | null;
  consistencyScore: number | null;
  awarenessScore: number | null;
  growthScore: number | null;
};

export const instructorNoteSchema = z.object({
  studentId: z.string().min(1),
  instructorId: z.string().min(1, "Choose an instructor"),
  note: z
    .string()
    .trim()
    .min(1, "Write a note")
    .max(1000, "Notes can be at most 1000 characters"),
});

export type InstructorNoteInput = { studentId: string; instructorId: string; note: string };
