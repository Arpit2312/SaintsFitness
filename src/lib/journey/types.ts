// Plain, serializable shapes shared by the journey queries, actions, and
// client components. No Prisma/Decimal types here so client components can
// import them freely.

export type JourneyProgressValues = {
  danceLevel: string | null;
  fitnessScore: number | null;
  consistencyScore: number | null;
  awarenessScore: number | null;
  growthScore: number | null;
};

export type JourneyNote = {
  id: string;
  note: string;
  createdAt: Date;
  instructorName: string;
};
