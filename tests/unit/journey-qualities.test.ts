// tests/unit/journey-qualities.test.ts
import { describe, it, expect } from "vitest";
import {
  computeJourneyQualities,
  describeQuality,
  toJourneyItems,
  DANCE_LEVELS,
} from "@/lib/journey/qualities";

const EMPTY = {
  danceLevel: null,
  fitnessScore: null,
  consistencyScore: null,
  awarenessScore: null,
  growthScore: null,
  attendanceRate: null,
};

describe("computeJourneyQualities", () => {
  it("returns all nulls when nothing is rated", () => {
    expect(computeJourneyQualities(EMPTY)).toEqual({
      movement: null,
      discipline: null,
      consistency: null,
      awareness: null,
      selfGrowth: null,
    });
  });

  it.each([
    ["Beginner", 33],
    ["Intermediate", 66],
    ["Advanced", 100],
  ])("maps dance level %s alone to movement %i", (level, expected) => {
    expect(computeJourneyQualities({ ...EMPTY, danceLevel: level }).movement).toBe(expected);
  });

  it("maps fitness alone to movement (x10)", () => {
    expect(computeJourneyQualities({ ...EMPTY, fitnessScore: 8 }).movement).toBe(80);
  });

  it("averages dance level and fitness for movement", () => {
    expect(computeJourneyQualities({ ...EMPTY, danceLevel: "Advanced", fitnessScore: 4 }).movement).toBe(70);
  });

  it("rounds the movement average", () => {
    // (33 + 70) / 2 = 51.5 -> 52
    expect(computeJourneyQualities({ ...EMPTY, danceLevel: "Beginner", fitnessScore: 7 }).movement).toBe(52);
  });

  it("ignores an unrecognised dance level", () => {
    expect(computeJourneyQualities({ ...EMPTY, danceLevel: "Expert", fitnessScore: 6 }).movement).toBe(60);
  });

  it("does not treat inherited object keys as dance levels", () => {
    expect(computeJourneyQualities({ ...EMPTY, danceLevel: "constructor" }).movement).toBeNull();
  });

  it("passes the attendance rate through as discipline, keeping 0 distinct from unrated", () => {
    expect(computeJourneyQualities({ ...EMPTY, attendanceRate: 85 }).discipline).toBe(85);
    expect(computeJourneyQualities({ ...EMPTY, attendanceRate: 0 }).discipline).toBe(0);
    expect(computeJourneyQualities({ ...EMPTY, attendanceRate: null }).discipline).toBeNull();
  });

  it("scales consistency, awareness and growth scores by 10", () => {
    const q = computeJourneyQualities({ ...EMPTY, consistencyScore: 7, awarenessScore: 3, growthScore: 10 });
    expect(q.consistency).toBe(70);
    expect(q.awareness).toBe(30);
    expect(q.selfGrowth).toBe(100);
  });
});

describe("describeQuality", () => {
  it.each([
    [null, "Not yet reflected"],
    [0, "Beginning"],
    [24, "Beginning"],
    [25, "Emerging"],
    [49, "Emerging"],
    [50, "Growing"],
    [74, "Growing"],
    [75, "Flourishing"],
    [100, "Flourishing"],
  ])("describes %s as %s", (value, word) => {
    expect(describeQuality(value)).toBe(word);
  });
});

describe("toJourneyItems", () => {
  it("returns the five qualities in journey order with labels and words", () => {
    const items = toJourneyItems({
      movement: 66,
      discipline: null,
      consistency: 70,
      awareness: 20,
      selfGrowth: 100,
    });
    expect(items.map((i) => i.label)).toEqual(["Movement", "Discipline", "Consistency", "Awareness", "Self Growth"]);
    expect(items.map((i) => i.key)).toEqual(["movement", "discipline", "consistency", "awareness", "selfGrowth"]);
    expect(items.map((i) => i.word)).toEqual(["Growing", "Not yet reflected", "Growing", "Beginning", "Flourishing"]);
    expect(items[1].value).toBeNull();
  });

  it("exposes the three dance levels", () => {
    expect([...DANCE_LEVELS]).toEqual(["Beginner", "Intermediate", "Advanced"]);
  });
});
