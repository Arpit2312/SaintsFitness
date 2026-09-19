import { describe, it, expect } from "vitest";
import { journeyProgressSchema, instructorNoteSchema } from "@/lib/validations/journey";

describe("journeyProgressSchema", () => {
  it("accepts a full valid payload", () => {
    const result = journeyProgressSchema.safeParse({
      danceLevel: "Advanced",
      fitnessScore: 7,
      consistencyScore: 8,
      awarenessScore: 5,
      growthScore: 10,
    });
    expect(result.success).toBe(true);
  });

  it("accepts numeric strings for scores and coerces them", () => {
    const result = journeyProgressSchema.parse({
      danceLevel: "Beginner",
      fitnessScore: "7",
      consistencyScore: "1",
      awarenessScore: "10",
      growthScore: "3",
    });
    expect(result.fitnessScore).toBe(7);
    expect(result.awarenessScore).toBe(10);
  });

  it("normalizes empty strings and missing keys to null", () => {
    const result = journeyProgressSchema.parse({ danceLevel: "", fitnessScore: "" });
    expect(result).toEqual({
      danceLevel: null,
      fitnessScore: null,
      consistencyScore: null,
      awarenessScore: null,
      growthScore: null,
    });
  });

  it("accepts an all-null payload", () => {
    const result = journeyProgressSchema.safeParse({
      danceLevel: null,
      fitnessScore: null,
      consistencyScore: null,
      awarenessScore: null,
      growthScore: null,
    });
    expect(result.success).toBe(true);
  });

  it("treats a completely empty object as all-unrated", () => {
    expect(journeyProgressSchema.parse({})).toEqual({
      danceLevel: null,
      fitnessScore: null,
      consistencyScore: null,
      awarenessScore: null,
      growthScore: null,
    });
  });

  it.each(["Expert", "beginner", " Beginner", "BEGINNER"])("rejects the invalid dance level %s", (bad) => {
    expect(journeyProgressSchema.safeParse({ danceLevel: bad }).success).toBe(false);
  });

  it.each(["0", "11", "5.5", "abc", " ", "-3"])("rejects the invalid score %s", (bad) => {
    expect(journeyProgressSchema.safeParse({ fitnessScore: bad }).success).toBe(false);
  });
});

describe("instructorNoteSchema", () => {
  const valid = { studentId: "s1", instructorId: "i1", note: "Movement is becoming more confident." };

  it("accepts a valid note", () => {
    expect(instructorNoteSchema.safeParse(valid).success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(instructorNoteSchema.parse({ ...valid, note: "  hello  " }).note).toBe("hello");
  });

  it("rejects a blank note", () => {
    expect(instructorNoteSchema.safeParse({ ...valid, note: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only note", () => {
    expect(instructorNoteSchema.safeParse({ ...valid, note: "   \n  " }).success).toBe(false);
  });

  it("rejects a note over 1000 characters", () => {
    expect(instructorNoteSchema.safeParse({ ...valid, note: "a".repeat(1001) }).success).toBe(false);
  });

  it("accepts a note of exactly 1000 characters", () => {
    expect(instructorNoteSchema.safeParse({ ...valid, note: "a".repeat(1000) }).success).toBe(true);
  });

  it("trims before applying the length limit", () => {
    expect(instructorNoteSchema.safeParse({ ...valid, note: ` ${"a".repeat(1000)} ` }).success).toBe(true);
    expect(instructorNoteSchema.safeParse({ ...valid, note: ` ${"a".repeat(1001)} ` }).success).toBe(false);
  });

  it("rejects a missing student", () => {
    expect(instructorNoteSchema.safeParse({ ...valid, studentId: "" }).success).toBe(false);
  });

  it("rejects a missing instructor", () => {
    expect(instructorNoteSchema.safeParse({ ...valid, instructorId: "" }).success).toBe(false);
  });
});
