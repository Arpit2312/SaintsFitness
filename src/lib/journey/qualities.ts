import type { JourneyProgressValues } from "@/lib/journey/types";

export const DANCE_LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
export type DanceLevel = (typeof DANCE_LEVELS)[number];

const DANCE_LEVEL_SCORE: Record<DanceLevel, number> = {
  Beginner: 33,
  Intermediate: 66,
  Advanced: 100,
};

export type JourneyInputs = JourneyProgressValues & {
  /** 0-100, or null when there are no marked attendance records in the window. */
  attendanceRate: number | null;
};

export type JourneyQualities = {
  movement: number | null;
  discipline: number | null;
  consistency: number | null;
  awareness: number | null;
  selfGrowth: number | null;
};

export type JourneyItem = {
  key: string;
  label: string;
  value: number | null;
  word: string;
};

function danceLevelToScore(level: string | null): number | null {
  // includes() on the tuple, not `in`, so inherited keys like "constructor"
  // are not mistaken for a level.
  if (level !== null && (DANCE_LEVELS as readonly string[]).includes(level)) {
    return DANCE_LEVEL_SCORE[level as DanceLevel];
  }
  return null;
}

const times10 = (score: number | null): number | null => (score === null ? null : score * 10);

/**
 * The five journey qualities, each 0-100 or null (never coerced to 0 --
 * "not yet reflected" is different from a low score). Movement averages
 * whichever of dance level and fitness exist; Discipline is the caller's
 * attendance rate as-is.
 */
export function computeJourneyQualities(inputs: JourneyInputs): JourneyQualities {
  const movementParts = [danceLevelToScore(inputs.danceLevel), times10(inputs.fitnessScore)].filter(
    (v): v is number => v !== null
  );
  const movement =
    movementParts.length === 0
      ? null
      : Math.round(movementParts.reduce((sum, v) => sum + v, 0) / movementParts.length);

  return {
    movement,
    discipline: inputs.attendanceRate,
    consistency: times10(inputs.consistencyScore),
    awareness: times10(inputs.awarenessScore),
    selfGrowth: times10(inputs.growthScore),
  };
}

export function describeQuality(value: number | null): string {
  if (value === null) return "Not yet reflected";
  if (value < 25) return "Beginning";
  if (value < 50) return "Emerging";
  if (value < 75) return "Growing";
  return "Flourishing";
}

const QUALITY_LABELS = [
  { key: "movement", label: "Movement" },
  { key: "discipline", label: "Discipline" },
  { key: "consistency", label: "Consistency" },
  { key: "awareness", label: "Awareness" },
  { key: "selfGrowth", label: "Self Growth" },
] as const;

export function toJourneyItems(qualities: JourneyQualities): JourneyItem[] {
  return QUALITY_LABELS.map(({ key, label }) => ({
    key,
    label,
    value: qualities[key],
    word: describeQuality(qualities[key]),
  }));
}
