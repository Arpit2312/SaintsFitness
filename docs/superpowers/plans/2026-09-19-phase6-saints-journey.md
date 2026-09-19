# Phase 6: SAINTS Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "My SAINTS Journey" real: a reflective five-quality visual and progress editor on each student's Journey tab, instructor notes on the Notes tab, and an academy-wide `/journey` overview.

**Architecture:** One pure, unit-tested module turns a student's scores plus 90-day attendance into five 0-100-or-null qualities that feed a plain-SVG "path of rings" visual. Reads live in `src/lib/queries/journey.ts`, writes in `src/actions/journey.ts` (upsert progress, add/delete note), UI in small components wired into the existing student profile tabs and the `/journey` page. One additive migration (two nullable columns).

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Prisma/PostgreSQL, zod 3, plain SVG/Tailwind (no chart library), vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-phase6-saints-journey-design.md`

## Global Constraints

- Schema change is ADDITIVE ONLY: `JourneyProgress` gains `awarenessScore Int?` and `growthScore Int?`. No other model/column changes. The generated migration must contain only two `ADD COLUMN` statements.
- Scores are integers 1-10 (empty/`null` = "not yet reflected"); dance level is one of `Beginner | Intermediate | Advanced` (validated in zod, stored as the existing `String?`). `null` is NEVER treated as 0.
- Every Server Action verifies its target student (and, for notes, the instructor) exists and is not soft-deleted (`deletedAt: null`) BEFORE writing (this exact gap was found and fixed in Phases 2 and 3). Use Prisma's extended where-unique form where a unique key is available, e.g. `findUnique({ where: { id, deletedAt: null } })`.
- Forms use plain controlled `useState` (no `react-hook-form`; its `watch`/Select combination triggers `react-hooks/incompatible-library` lint warnings). Do NOT reseed form state with `useEffect` + `setState` (`react-hooks/set-state-in-effect` lint error, hit in Phase 3). Instead the parent remounts a dialog by changing its `key` each time it opens, and the dialog initializes state with a `useState(() => ...)` lazy initializer.
- Empty states INSIDE a `glass-card` are plain `<p className="py-6 text-center text-sm text-muted">` text; only use the `EmptyState` component at page top level (it is itself a `glass-card`, so nesting it draws a card in a card).
- All user-facing labels are Title Case words (dance levels already are; quality words come from `describeQuality`). Never render a raw enum/uppercase value.
- Only plain values (numbers, strings, `null`, `Date`) may cross into a `"use client"` component. There are no `Decimal` fields in this phase.
- Reuse existing helpers; invent no new date primitives: `startOfUTCDay`, `todayInIST`, `formatDateUTC` (`@/lib/dates`), `computeAttendanceRate` (`@/lib/attendance/rate`), `ConfirmDialog` (`@/components/shared/confirm-dialog`), `useGuardedDialogOpenChange` (`@/hooks/use-guarded-dialog`).
- The attendance window for Discipline is 90 days: `ATTENDANCE_WINDOW_DAYS = 90` in `src/lib/queries/journey.ts`, measured back from `startOfUTCDay(todayInIST())`.
- Query modules `import "server-only"`. Client components may only `import type` from them (and only import from pure modules such as `@/lib/journey/*`, `@/lib/validations/*`).
- In this Next.js version a page's `params` and `searchParams` props are Promises and must be `await`ed (see `src/app/(app)/attendance/page.tsx`); each `searchParams` value may be `string | string[] | undefined`.
- Real-DB verification notes (for any task that verifies against the shared Neon database): it contains real students plus temp rows from OTHER concurrent agents, so use your own distinct temp student-code prefix, assert on YOUR rows/deltas (never global totals), and delete only what you created (children before parents, confirm zero leftover rows). Files that `import "server-only"` throw outside Next: create a throwaway preload `.cjs` that monkeypatches `Module._resolveFilename` so `"server-only"` resolves to a stub `module.exports = {};`, and (for Server Actions) also stub `next/cache`'s `revalidatePath`; run with `npx tsx --require ./_tmp_preload_x.cjs _tmp_x.ts`, and delete every `_tmp_*` file when done. Prisma required fields: Student needs `name, studentCode, mobile ("9876543210"), dob (Date), gender ("MALE"), joiningDate (Date)`; Instructor needs `name, mobile`; Course/Batch: read `prisma/schema.prisma` for required fields (Batch needs a Course, `timing`, `days`, `capacity`); Attendance needs `studentId, batchId, date, status`.

---

## Task 1: Schema migration — add awareness and growth scores

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_journey_awareness_growth/migration.sql` (generated)

**Interfaces:**
- Produces: `JourneyProgress.awarenessScore: number | null` and `JourneyProgress.growthScore: number | null` on the generated Prisma client. Tasks 5 and 6 read/write these fields.

- [ ] **Step 1: Edit the model**

In `prisma/schema.prisma`, change `JourneyProgress` to:

```prisma
model JourneyProgress {
  id               String   @id @default(cuid())
  studentId        String   @unique
  student          Student  @relation(fields: [studentId], references: [id])
  danceLevel       String?
  fitnessScore     Int?
  consistencyScore Int?
  awarenessScore   Int?
  growthScore      Int?
  updatedAt        DateTime @updatedAt
}
```

- [ ] **Step 2: Generate and apply the migration**

```bash
npx prisma migrate dev --name add_journey_awareness_growth
```

Expected: a new folder under `prisma/migrations/` whose `migration.sql` contains exactly two `ALTER TABLE "JourneyProgress" ADD COLUMN ...` statements (both nullable `INTEGER`), nothing else; the Prisma client is regenerated. (This applies to the shared database; it is purely additive, so it is safe for the live site.)

- [ ] **Step 3: Verify**

```bash
npx prisma generate
npx tsc --noEmit
```

Expected: clean. Open the generated `migration.sql` and confirm it is additive only.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Add awareness and growth scores to JourneyProgress

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Journey qualities and shared types (TDD)

**Files:**
- Create: `src/lib/journey/types.ts`
- Create: `src/lib/journey/qualities.ts`
- Test: `tests/unit/journey-qualities.test.ts`

**Interfaces:**
- Produces (`types.ts`): `JourneyProgressValues = { danceLevel: string | null; fitnessScore: number | null; consistencyScore: number | null; awarenessScore: number | null; growthScore: number | null }`; `JourneyNote = { id: string; note: string; createdAt: Date; instructorName: string }`.
- Produces (`qualities.ts`): `DANCE_LEVELS` (`readonly ["Beginner", "Intermediate", "Advanced"]`), `DanceLevel`, `JourneyInputs`, `JourneyQualities`, `JourneyItem = { key: string; label: string; value: number | null; word: string }`, `computeJourneyQualities(inputs: JourneyInputs): JourneyQualities`, `describeQuality(value: number | null): string`, `toJourneyItems(q: JourneyQualities): JourneyItem[]`. Tasks 3, 5, 7, 8, 9, 10 import these by these exact names.

- [ ] **Step 1: Write `src/lib/journey/types.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing tests**

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/journey-qualities.test.ts`
Expected: FAIL (cannot find module `@/lib/journey/qualities`).

- [ ] **Step 4: Write `src/lib/journey/qualities.ts`**

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/journey-qualities.test.ts`
Expected: PASS (22 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/journey/types.ts src/lib/journey/qualities.ts tests/unit/journey-qualities.test.ts
git commit -m "Add journey qualities computation and shared journey types

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Journey validation schemas (TDD)

**Files:**
- Create: `src/lib/validations/journey.ts`
- Test: `tests/unit/journey-validation.test.ts`

**Interfaces:**
- Consumes: `DANCE_LEVELS` (`@/lib/journey/qualities`, Task 2).
- Produces: `journeyProgressSchema`, `instructorNoteSchema`, `JourneyProgressInput` (= `{ danceLevel: string | null; fitnessScore: number | null; consistencyScore: number | null; awarenessScore: number | null; growthScore: number | null }`), `JourneyProgressData` (`z.infer` of the progress schema), `InstructorNoteInput` (= `{ studentId: string; instructorId: string; note: string }`). Tasks 6, 7, 9 import these by these exact names.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/journey-validation.test.ts
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

  it("rejects an unknown dance level", () => {
    expect(journeyProgressSchema.safeParse({ danceLevel: "Expert" }).success).toBe(false);
  });

  it.each(["0", "11", "5.5", "abc"])("rejects the invalid score %s", (bad) => {
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

  it("rejects a missing instructor", () => {
    expect(instructorNoteSchema.safeParse({ ...valid, instructorId: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/journey-validation.test.ts`
Expected: FAIL (cannot find module `@/lib/validations/journey`).

- [ ] **Step 3: Write `src/lib/validations/journey.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/journey-validation.test.ts`
Expected: PASS (16 tests). If a rejection test fails because `Number("abc")` becoming `NaN` is accepted, tighten the `score` schema so NaN is rejected (`z.number()` already rejects NaN in zod 3; confirm by test output, don't guess).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/journey.ts tests/unit/journey-validation.test.ts
git commit -m "Add journey progress and instructor note validation schemas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Journey path visual (pure UI)

**Files:**
- Create: `src/components/journey/journey-path.tsx`

**Interfaces:**
- Produces: `JourneyPathItem = { key: string; label: string; value: number | null; word: string }` (structurally identical to Task 2's `JourneyItem`, deliberately not imported so this task has no dependency) and `JourneyPath({ items, compact }: { items: JourneyPathItem[]; compact?: boolean })`. It has no hooks and no `"use client"`, so both Server and Client components can render it. Tasks 8 and 10 import it by this exact name.

- [ ] **Step 1: Write `src/components/journey/journey-path.tsx`**

```tsx
import { cn } from "@/lib/utils";

export type JourneyPathItem = {
  key: string;
  label: string;
  value: number | null;
  word: string;
};

const RING_RADIUS = 20;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// A soft ring whose gold arc fills in proportion to the quality. An unrated
// quality is a faint dashed ring, not an empty (0%) one -- "not yet
// reflected" is different from "low".
function Ring({ item, size }: { item: JourneyPathItem; size: number }) {
  const value = item.value;
  const offset = value === null ? 0 : RING_CIRCUMFERENCE * (1 - value / 100);
  const description = `${item.label}: ${item.word}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={description}
      className="rounded-full bg-background"
    >
      <title>{description}</title>
      <circle
        cx="24"
        cy="24"
        r={RING_RADIUS}
        fill="none"
        stroke={value === null ? "var(--muted-foreground)" : "var(--card-border)"}
        strokeOpacity={value === null ? 0.5 : 1}
        strokeWidth="3"
        strokeDasharray={value === null ? "3 5" : undefined}
      />
      {value !== null && (
        <circle
          cx="24"
          cy="24"
          r={RING_RADIUS}
          fill="none"
          stroke="var(--gold)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 24 24)"
        />
      )}
    </svg>
  );
}

export function JourneyPath({ items, compact = false }: { items: JourneyPathItem[]; compact?: boolean }) {
  const size = compact ? 36 : 56;

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          aria-hidden
          className={cn("absolute left-[10%] right-[10%] h-px bg-gold/30", compact ? "top-[18px]" : "top-7")}
        />
        <ol className="relative grid grid-cols-5 gap-1">
          {items.map((item) => (
            <li key={item.key} className="flex flex-col items-center gap-1.5 text-center">
              <Ring item={item} size={size} />
              {!compact && (
                <>
                  <span className="text-sm text-foreground">{item.label}</span>
                  <span className="text-xs text-muted">{item.word}</span>
                </>
              )}
            </li>
          ))}
        </ol>
      </div>
      {!compact && (
        <p className="text-center text-xs tracking-wide text-muted">
          Body → Movement → Discipline → Awareness → Self Knowledge
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npx tsc --noEmit
npx eslint src/components/journey/journey-path.tsx
```

Expected: no errors in this file (errors in other agents' files mid-edit are not yours).

- [ ] **Step 3: Commit**

```bash
git add src/components/journey/journey-path.tsx
git commit -m "Add journey path visual

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Journey queries (server-only reads)

**Files:**
- Create: `src/lib/queries/journey.ts`

**Interfaces:**
- Consumes: `JourneyProgressValues`, `JourneyNote` (`@/lib/journey/types`, Task 2); `computeAttendanceRate` (`@/lib/attendance/rate`); `startOfUTCDay`, `todayInIST` (`@/lib/dates`); the Task 1 Prisma fields.
- Produces (all plain values):
  - `ATTENDANCE_WINDOW_DAYS = 90`
  - `getStudentJourney(studentId): Promise<{ progress: JourneyProgressValues | null; attendanceRate: number | null; recentNotes: JourneyNote[] }>` (3 most recent notes)
  - `listStudentNotes(studentId): Promise<JourneyNote[]>` (all, newest first)
  - `getNoteInstructorOptions(studentId): Promise<{ instructors: { id: string; name: string }[]; defaultInstructorId: string | null }>`
  - `listJourneyOverview(): Promise<{ studentId: string; studentCode: string; name: string; progress: JourneyProgressValues | null; attendanceRate: number | null; latestNote: { note: string; createdAt: Date } | null }[]>` (active, non-deleted students by name)
  Tasks 8, 9, 10, 11 use these by these exact names.

- [ ] **Step 1: Write `src/lib/queries/journey.ts`**

```ts
// Read-only queries, not mutations -- lives outside src/actions/ (which is
// "use server") so these can never be called as Server Actions from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { prisma } from "@/lib/db";
import { computeAttendanceRate } from "@/lib/attendance/rate";
import { startOfUTCDay, todayInIST } from "@/lib/dates";
import type { JourneyNote, JourneyProgressValues } from "@/lib/journey/types";

export const ATTENDANCE_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function windowStart(): Date {
  return new Date(startOfUTCDay(todayInIST()).getTime() - ATTENDANCE_WINDOW_DAYS * DAY_MS);
}

function toProgressValues(row: {
  danceLevel: string | null;
  fitnessScore: number | null;
  consistencyScore: number | null;
  awarenessScore: number | null;
  growthScore: number | null;
}): JourneyProgressValues {
  return {
    danceLevel: row.danceLevel,
    fitnessScore: row.fitnessScore,
    consistencyScore: row.consistencyScore,
    awarenessScore: row.awarenessScore,
    growthScore: row.growthScore,
  };
}

function toNote(row: { id: string; note: string; createdAt: Date; instructor: { name: string } }): JourneyNote {
  return { id: row.id, note: row.note, createdAt: row.createdAt, instructorName: row.instructor.name };
}

export async function getStudentJourney(studentId: string) {
  const since = windowStart();
  const [progress, attendance, notes] = await Promise.all([
    prisma.journeyProgress.findUnique({ where: { studentId, student: { deletedAt: null } } }),
    prisma.attendance.findMany({
      where: { studentId, student: { deletedAt: null }, date: { gte: since } },
      select: { status: true },
    }),
    prisma.instructorNote.findMany({
      where: { studentId, student: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { instructor: { select: { name: true } } },
    }),
  ]);

  return {
    progress: progress ? toProgressValues(progress) : null,
    // No marked records in the window means "unrated", not 0%.
    attendanceRate: attendance.length === 0 ? null : computeAttendanceRate(attendance),
    recentNotes: notes.map(toNote),
  };
}

export async function listStudentNotes(studentId: string): Promise<JourneyNote[]> {
  const notes = await prisma.instructorNote.findMany({
    where: { studentId, student: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    include: { instructor: { select: { name: true } } },
  });
  return notes.map(toNote);
}

export async function getNoteInstructorOptions(studentId: string) {
  const [instructors, enrollments] = await Promise.all([
    prisma.instructor.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.enrollment.findMany({
      where: { studentId, student: { deletedAt: null }, batch: { deletedAt: null } },
      select: { batch: { select: { instructorId: true } } },
    }),
  ]);

  // Pre-select an instructor only when every enrolled batch shares exactly
  // one; otherwise the admin has to choose.
  const batchInstructorIds = new Set(
    enrollments.map((e) => e.batch.instructorId).filter((id): id is string => id !== null)
  );
  const onlyId = batchInstructorIds.size === 1 ? [...batchInstructorIds][0] : null;
  const defaultInstructorId = onlyId !== null && instructors.some((i) => i.id === onlyId) ? onlyId : null;

  return { instructors, defaultInstructorId };
}

export async function listJourneyOverview() {
  const students = await prisma.student.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      studentCode: true,
      name: true,
      journeyProgress: {
        select: {
          danceLevel: true,
          fitnessScore: true,
          consistencyScore: true,
          awarenessScore: true,
          growthScore: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });
  if (students.length === 0) return [];

  const studentIds = students.map((s) => s.id);
  const [notes, attendance] = await Promise.all([
    prisma.instructorNote.findMany({
      where: { studentId: { in: studentIds } },
      orderBy: { createdAt: "desc" },
      select: { studentId: true, note: true, createdAt: true },
    }),
    prisma.attendance.findMany({
      where: { studentId: { in: studentIds }, date: { gte: windowStart() } },
      select: { studentId: true, status: true },
    }),
  ]);

  // notes is sorted newest-first, so the first one seen per student is the latest.
  const latestNoteByStudent = new Map<string, { note: string; createdAt: Date }>();
  for (const n of notes) {
    if (!latestNoteByStudent.has(n.studentId)) latestNoteByStudent.set(n.studentId, { note: n.note, createdAt: n.createdAt });
  }

  const attendanceByStudent = new Map<string, { status: (typeof attendance)[number]["status"] }[]>();
  for (const a of attendance) {
    const list = attendanceByStudent.get(a.studentId) ?? [];
    list.push({ status: a.status });
    attendanceByStudent.set(a.studentId, list);
  }

  return students.map((s) => {
    const records = attendanceByStudent.get(s.id) ?? [];
    return {
      studentId: s.id,
      studentCode: s.studentCode,
      name: s.name,
      progress: s.journeyProgress ? toProgressValues(s.journeyProgress) : null,
      attendanceRate: records.length === 0 ? null : computeAttendanceRate(records),
      latestNote: latestNoteByStudent.get(s.id) ?? null,
    };
  });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in this file.

- [ ] **Step 3: Verify against the real database**

Temp student-code prefix `ZZJ5-` (see Global Constraints for the harness). Write a temporary script that:

1. Creates a temp student, a temp Instructor, and calls `getStudentJourney(studentId)` with no progress row: `progress` is `null`, `attendanceRate` is `null`, `recentNotes` is `[]`.
2. Creates a `JourneyProgress` row (danceLevel "Intermediate", fitnessScore 7, awarenessScore 4, growthScore null) and four `InstructorNote` rows with distinct `createdAt` times (oldest to newest); confirms `getStudentJourney` returns exactly the 3 newest notes newest-first with the instructor name, and the progress values (including `awarenessScore: 4`, `growthScore: null`).
3. Creates a temp Course + Batch and Attendance rows for the student: one PRESENT dated 10 days ago, one ABSENT dated 5 days ago, and one PRESENT dated 200 days ago (outside the window) — confirms `attendanceRate` is 50 (only the two in-window rows count). Confirms `listStudentNotes` returns all four notes newest-first.
4. `getNoteInstructorOptions`: with the student enrolled in one batch whose instructor is the temp instructor, `defaultInstructorId` equals that instructor's id and `instructors` contains it; enroll the student in a second batch with a different instructor, and confirm `defaultInstructorId` becomes `null`. Soft-delete the temp instructor and confirm it disappears from `instructors`.
5. `listJourneyOverview`: the temp student (ACTIVE) appears with the progress, the 50% attendance rate, and the newest note as `latestNote`; setting `status: "INACTIVE"` removes them; setting `deletedAt` removes them; a second ACTIVE temp student with no progress/notes/attendance appears with `progress: null`, `attendanceRate: null`, `latestNote: null`.
6. Cleans up every row you created (InstructorNote, Attendance, Enrollment, JourneyProgress, Batch, Course, Instructor, Student) and confirms zero `ZZJ5-` students remain.

- [ ] **Step 4: Run full regression**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: clean (no new test file; thin composition over tested logic, verified against the real DB per the Phase 2-5 precedent).

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/journey.ts
git commit -m "Add journey queries (student journey, notes, note instructor options, overview)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Journey server actions (mutations)

**Files:**
- Create: `src/actions/journey.ts`

**Interfaces:**
- Consumes: `journeyProgressSchema`, `instructorNoteSchema`, `JourneyProgressInput`, `InstructorNoteInput` (`@/lib/validations/journey`, Task 3); the Task 1 Prisma fields.
- Produces: `saveJourneyProgress(studentId: string, input: JourneyProgressInput): Promise<void>`, `addInstructorNote(input: InstructorNoteInput): Promise<void>`, `deleteInstructorNote(noteId: string): Promise<void>`. Tasks 7 and 9 call these by these exact names.

- [ ] **Step 1: Write `src/actions/journey.ts`**

```ts
"use server";

import { prisma } from "@/lib/db";
import {
  journeyProgressSchema,
  instructorNoteSchema,
  type JourneyProgressInput,
  type InstructorNoteInput,
} from "@/lib/validations/journey";
import { revalidatePath } from "next/cache";

function revalidateJourney(studentId: string) {
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/journey");
}

export async function saveJourneyProgress(studentId: string, input: JourneyProgressInput) {
  const data = journeyProgressSchema.parse(input);

  const student = await prisma.student.findUnique({
    where: { id: studentId, deletedAt: null },
    select: { id: true },
  });
  if (!student) {
    throw new Error("Student not found.");
  }

  // Explicit nulls in `data` clear a previously-set field on purpose -- the
  // admin can un-rate something.
  await prisma.journeyProgress.upsert({
    where: { studentId },
    create: { studentId, ...data },
    update: data,
  });

  revalidateJourney(studentId);
}

export async function addInstructorNote(input: InstructorNoteInput) {
  const data = instructorNoteSchema.parse(input);

  const [student, instructor] = await Promise.all([
    prisma.student.findUnique({ where: { id: data.studentId, deletedAt: null }, select: { id: true } }),
    prisma.instructor.findUnique({ where: { id: data.instructorId, deletedAt: null }, select: { id: true } }),
  ]);
  if (!student) {
    throw new Error("Student not found.");
  }
  if (!instructor) {
    throw new Error("Instructor not found.");
  }

  await prisma.instructorNote.create({ data });

  revalidateJourney(data.studentId);
}

export async function deleteInstructorNote(noteId: string) {
  const note = await prisma.instructorNote.findUnique({
    where: { id: noteId, student: { deletedAt: null } },
    select: { id: true, studentId: true },
  });
  if (!note) {
    throw new Error("Note not found.");
  }

  await prisma.instructorNote.delete({ where: { id: noteId } });

  revalidateJourney(note.studentId);
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in this file.

- [ ] **Step 3: Verify against the real database**

Temp student-code prefix `ZZJ6-`. Stub `next/cache`'s `revalidatePath` and `server-only` in your preload (see Global Constraints). Write a temporary script that:

1. `saveJourneyProgress(studentId, {danceLevel: "Intermediate", fitnessScore: 7, consistencyScore: null, awarenessScore: 4, growthScore: null})` on a temp student with no row: a `JourneyProgress` row now exists with exactly those values. Calling it again with `fitnessScore: 9, awarenessScore: null` UPDATES the same row (still exactly one row for the student) and `awarenessScore` is now `null` (un-rating works).
2. Invalid input is rejected by zod and writes nothing: `danceLevel: "Expert"`, `fitnessScore: 11`, `fitnessScore: 0`.
3. `saveJourneyProgress` for a nonexistent student id throws "Student not found."; for a soft-deleted student throws the same and creates no row.
4. `addInstructorNote({studentId, instructorId, note: "  Moving with more confidence.  "})` creates a note whose text is trimmed; a blank note is rejected; a 1001-character note is rejected; a nonexistent instructor throws "Instructor not found."; a soft-deleted instructor throws the same; a nonexistent/soft-deleted student throws "Student not found."; none of the failing calls creates a row.
5. `deleteInstructorNote(noteId)` removes exactly that note; a nonexistent id throws "Note not found."; a note belonging to a soft-deleted student throws "Note not found." and the note is NOT deleted.
6. Cleans up every row you created (InstructorNote, JourneyProgress, Instructor, Student) and confirms zero `ZZJ6-` rows remain.

- [ ] **Step 4: Run full regression**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/actions/journey.ts
git commit -m "Add journey server actions (save progress, add/delete instructor note)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Progress form dialog

**Files:**
- Create: `src/components/journey/progress-form-dialog.tsx`

**Interfaces:**
- Consumes: `saveJourneyProgress` (`@/actions/journey`, Task 6); `DANCE_LEVELS` (`@/lib/journey/qualities`, Task 2); `JourneyProgressValues` (`@/lib/journey/types`, Task 2).
- Produces: `ProgressFormDialog({ open, onOpenChange, studentId, initial, onSuccess }: { open: boolean; onOpenChange: (open: boolean) => void; studentId: string; initial: JourneyProgressValues | null; onSuccess?: () => void })`. Task 8 renders it by this exact name. The dialog seeds its form once from `initial` (lazy `useState` initializer); the PARENT must remount it (change its `key`) each time it opens.

- [ ] **Step 1: Write `src/components/journey/progress-form-dialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGuardedDialogOpenChange } from "@/hooks/use-guarded-dialog";
import { saveJourneyProgress } from "@/actions/journey";
import { DANCE_LEVELS } from "@/lib/journey/qualities";
import type { JourneyProgressValues } from "@/lib/journey/types";
import { toast } from "sonner";

const NONE = "none";
const NONE_LABEL = "Not yet reflected";
const SCORE_OPTIONS = Array.from({ length: 10 }, (_, i) => String(i + 1));

const SCORE_FIELDS = [
  { key: "fitnessScore", label: "Fitness" },
  { key: "consistencyScore", label: "Consistency" },
  { key: "awarenessScore", label: "Awareness" },
  { key: "growthScore", label: "Self Growth" },
] as const;
type ScoreKey = (typeof SCORE_FIELDS)[number]["key"];

type FormState = { danceLevel: string } & Record<ScoreKey, string>;

function scoreToState(score: number | null | undefined): string {
  return score == null ? NONE : String(score);
}

function toFormState(initial: JourneyProgressValues | null): FormState {
  return {
    danceLevel: initial?.danceLevel ?? NONE,
    fitnessScore: scoreToState(initial?.fitnessScore),
    consistencyScore: scoreToState(initial?.consistencyScore),
    awarenessScore: scoreToState(initial?.awarenessScore),
    growthScore: scoreToState(initial?.growthScore),
  };
}

const stateToScore = (value: string): number | null => (value === NONE ? null : Number(value));

function ChoiceSelect({
  id,
  value,
  onChange,
  options,
  formatOption,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  formatOption: (option: string) => string;
  disabled: boolean;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      // base-ui types onValueChange's value as `string | null`, but no real
      // call site emits null in single-select mode -- see batch-form-dialog.tsx.
      onValueChange={(v) => onChange(v as string)}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={NONE_LABEL}>
          {(v: string) => (v === NONE ? NONE_LABEL : formatOption(v))}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{NONE_LABEL}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {formatOption(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProgressFormDialog({
  open,
  onOpenChange,
  studentId,
  initial,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  initial: JourneyProgressValues | null;
  onSuccess?: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await saveJourneyProgress(studentId, {
        danceLevel: form.danceLevel === NONE ? null : form.danceLevel,
        fitnessScore: stateToScore(form.fitnessScore),
        consistencyScore: stateToScore(form.consistencyScore),
        awarenessScore: stateToScore(form.awarenessScore),
        growthScore: stateToScore(form.growthScore),
      });
      toast.success("Progress updated");
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const handleOpenChange = useGuardedDialogOpenChange(submitting, onOpenChange);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>Update progress</DialogTitle>
          <DialogDescription>
            Reflect only what you have observed. Anything left as &ldquo;{NONE_LABEL}&rdquo; stays quietly unrated.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="danceLevel">Dance level</Label>
            <ChoiceSelect
              id="danceLevel"
              value={form.danceLevel}
              onChange={(v) => setForm((f) => ({ ...f, danceLevel: v }))}
              options={DANCE_LEVELS}
              formatOption={(o) => o}
              disabled={submitting}
            />
          </div>
          {SCORE_FIELDS.map(({ key, label }) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <ChoiceSelect
                id={key}
                value={form[key]}
                onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
                options={SCORE_OPTIONS}
                formatOption={(o) => `${o} / 10`}
                disabled={submitting}
              />
            </div>
          ))}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving..." : "Save progress"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npx tsc --noEmit
npx eslint src/components/journey/progress-form-dialog.tsx
```

Expected: no errors or warnings in this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/journey/progress-form-dialog.tsx
git commit -m "Add journey progress form dialog

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Student Journey tab

**Files:**
- Create: `src/components/students/student-journey-tab.tsx`

**Interfaces:**
- Consumes: `computeJourneyQualities`, `toJourneyItems` (`@/lib/journey/qualities`, Task 2); `JourneyPath` (`@/components/journey/journey-path`, Task 4); `ProgressFormDialog` (Task 7); `JourneyProgressValues`, `JourneyNote` (`@/lib/journey/types`, Task 2); `formatDateUTC` (`@/lib/dates`).
- Produces: `StudentJourneyTab({ studentId, progress, attendanceRate, recentNotes }: { studentId: string; progress: JourneyProgressValues | null; attendanceRate: number | null; recentNotes: JourneyNote[] })`. Task 11 renders it by this exact name. It receives the outputs of Task 5's `getStudentJourney` field-for-field.

- [ ] **Step 1: Write `src/components/students/student-journey-tab.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JourneyPath } from "@/components/journey/journey-path";
import { ProgressFormDialog } from "@/components/journey/progress-form-dialog";
import { computeJourneyQualities, toJourneyItems } from "@/lib/journey/qualities";
import type { JourneyNote, JourneyProgressValues } from "@/lib/journey/types";
import { formatDateUTC } from "@/lib/dates";

export function StudentJourneyTab({
  studentId,
  progress,
  attendanceRate,
  recentNotes,
}: {
  studentId: string;
  progress: JourneyProgressValues | null;
  attendanceRate: number | null;
  recentNotes: JourneyNote[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  // The dialog seeds its form once on mount, so a new key per open gives it
  // fresh initial values without an effect that calls setState.
  const [dialogKey, setDialogKey] = useState(0);

  const qualities = computeJourneyQualities({
    danceLevel: progress?.danceLevel ?? null,
    fitnessScore: progress?.fitnessScore ?? null,
    consistencyScore: progress?.consistencyScore ?? null,
    awarenessScore: progress?.awarenessScore ?? null,
    growthScore: progress?.growthScore ?? null,
    attendanceRate,
  });
  const items = toJourneyItems(qualities);
  const hasAnyReflection = items.some((item) => item.value !== null);

  return (
    <div className="space-y-6">
      <div className="glass-card space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">My SAINTS Journey</h2>
            <p className="text-sm text-muted">
              {progress?.danceLevel ? (
                <>
                  Dance level <Badge variant="outline">{progress.danceLevel}</Badge>
                </>
              ) : (
                "Dance level not yet reflected"
              )}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setDialogKey((k) => k + 1);
              setDialogOpen(true);
            }}
          >
            <Pencil size={16} className="mr-2" />
            Update progress
          </Button>
        </div>

        <JourneyPath items={items} />

        {!hasAnyReflection && (
          <p className="text-center text-sm text-muted">
            Begin this journey &mdash; add a first reflection with &ldquo;Update progress&rdquo;.
          </p>
        )}
      </div>

      <div className="glass-card space-y-3 p-6">
        <h3 className="font-semibold text-foreground">Recent reflections</h3>
        {recentNotes.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            No reflections yet. Instructors can add notes from the Notes tab.
          </p>
        ) : (
          <div className="divide-y divide-card-border">
            {recentNotes.map((note) => (
              <div key={note.id} className="space-y-1 py-3">
                <p className="whitespace-pre-wrap text-foreground">{note.note}</p>
                <p className="text-xs text-muted">
                  {note.instructorName} · {formatDateUTC(note.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <ProgressFormDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        studentId={studentId}
        initial={progress}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npx tsc --noEmit
npx eslint src/components/students/student-journey-tab.tsx
```

Expected: no errors or warnings in this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/students/student-journey-tab.tsx
git commit -m "Add student Journey tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Student Notes tab and note form dialog

**Files:**
- Create: `src/components/journey/note-form-dialog.tsx`
- Create: `src/components/students/student-notes-tab.tsx`

**Interfaces:**
- Consumes: `addInstructorNote`, `deleteInstructorNote` (`@/actions/journey`, Task 6); `instructorNoteSchema` (`@/lib/validations/journey`, Task 3); `JourneyNote` (`@/lib/journey/types`, Task 2); `ConfirmDialog`; `formatDateUTC`.
- Produces: `NoteFormDialog({ open, onOpenChange, studentId, instructors, defaultInstructorId, onSuccess })` (parent remounts by `key`), and `StudentNotesTab({ studentId, notes, instructors, defaultInstructorId }: { studentId: string; notes: JourneyNote[]; instructors: { id: string; name: string }[]; defaultInstructorId: string | null })`. Task 11 renders `StudentNotesTab` by this exact name, passing Task 5's `listStudentNotes` and `getNoteInstructorOptions` results.

- [ ] **Step 1: Write `src/components/journey/note-form-dialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGuardedDialogOpenChange } from "@/hooks/use-guarded-dialog";
import { addInstructorNote } from "@/actions/journey";
import { instructorNoteSchema } from "@/lib/validations/journey";
import { toast } from "sonner";

const MAX_LENGTH = 1000;

export function NoteFormDialog({
  open,
  onOpenChange,
  studentId,
  instructors,
  defaultInstructorId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  instructors: { id: string; name: string }[];
  defaultInstructorId: string | null;
  onSuccess?: () => void;
}) {
  // Seeded once on mount; the parent remounts this dialog (new `key`) each
  // time it opens, so every "Add note" starts fresh.
  const [instructorId, setInstructorId] = useState(defaultInstructorId ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = instructorNoteSchema.safeParse({ studentId, instructorId, note });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await addInstructorNote(parsed.data);
      toast.success("Note added");
      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const handleOpenChange = useGuardedDialogOpenChange(submitting, onOpenChange);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>Add note</DialogTitle>
          <DialogDescription>A reflection on this student&rsquo;s journey, from their instructor.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="noteInstructor">Instructor</Label>
            <Select
              value={instructorId === "" ? undefined : instructorId}
              disabled={submitting}
              onValueChange={(v) => setInstructorId(v as string)}
            >
              <SelectTrigger id="noteInstructor" className="w-full">
                <SelectValue placeholder="Select an instructor">
                  {(value: string) => instructors.find((i) => i.id === value)?.name ?? "Select an instructor"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {instructors.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="noteText">Note</Label>
            <Textarea
              id="noteText"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Your movement is becoming more confident. Keep observing yourself."
              disabled={submitting}
            />
            <p className="text-right text-xs text-muted">
              {note.length} / {MAX_LENGTH}
            </p>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving..." : "Save note"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write `src/components/students/student-notes-tab.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NoteFormDialog } from "@/components/journey/note-form-dialog";
import { deleteInstructorNote } from "@/actions/journey";
import type { JourneyNote } from "@/lib/journey/types";
import { formatDateUTC } from "@/lib/dates";

export function StudentNotesTab({
  studentId,
  notes,
  instructors,
  defaultInstructorId,
}: {
  studentId: string;
  notes: JourneyNote[];
  instructors: { id: string; name: string }[];
  defaultInstructorId: string | null;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<JourneyNote | undefined>();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Instructor reflections on this student&rsquo;s journey.</p>
        <Button
          onClick={() => {
            setFormKey((k) => k + 1);
            setFormOpen(true);
          }}
          disabled={instructors.length === 0}
        >
          <Plus size={16} className="mr-2" />
          Add note
        </Button>
      </div>
      {instructors.length === 0 && (
        <p className="text-xs text-muted">Add an instructor under Classes &rarr; Instructors before writing notes.</p>
      )}

      {notes.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-muted">
          No notes yet. A short, kind observation is a good place to start.
        </div>
      ) : (
        <div className="glass-card divide-y divide-card-border">
          {notes.map((note) => (
            <div key={note.id} className="flex items-start justify-between gap-4 p-4">
              <div className="space-y-1">
                <p className="whitespace-pre-wrap text-foreground">{note.note}</p>
                <p className="text-xs text-muted">
                  {note.instructorName} · {formatDateUTC(note.createdAt)}
                </p>
              </div>
              <button
                onClick={() => setDeleteTarget(note)}
                className="rounded p-1 text-muted hover:text-danger"
                aria-label="Delete note"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <NoteFormDialog
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        studentId={studentId}
        instructors={instructors}
        defaultInstructorId={defaultInstructorId}
        onSuccess={() => router.refresh()}
      />
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(undefined)}
          title="Delete this note?"
          description="This note will be permanently removed from the student's journey."
          onConfirm={async () => {
            await deleteInstructorNote(deleteTarget.id);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles and lints**

```bash
npx tsc --noEmit
npx eslint src/components/journey/note-form-dialog.tsx src/components/students/student-notes-tab.tsx
```

Expected: no errors or warnings in these files.

- [ ] **Step 4: Commit**

```bash
git add src/components/journey/note-form-dialog.tsx src/components/students/student-notes-tab.tsx
git commit -m "Add student Notes tab and note form dialog

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Journey overview component

**Files:**
- Create: `src/components/journey/journey-overview.tsx`

**Interfaces:**
- Consumes: `listJourneyOverview` result shape (`@/lib/queries/journey`, Task 5 -- via a plain structural prop type, NOT an import of the server-only module's values); `JourneyPath` (Task 4); `computeJourneyQualities`, `toJourneyItems` (Task 2); `JourneyProgressValues` (Task 2); `formatDateUTC`.
- Produces: `JourneyOverview({ students }: { students: JourneyOverviewStudent[] })` and `JourneyOverviewStudent`. A Server Component (no hooks). Task 11 renders it by this exact name with Task 5's `listJourneyOverview()` result.

- [ ] **Step 1: Write `src/components/journey/journey-overview.tsx`**

```tsx
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { JourneyPath } from "@/components/journey/journey-path";
import { computeJourneyQualities, toJourneyItems } from "@/lib/journey/qualities";
import type { JourneyProgressValues } from "@/lib/journey/types";
import { formatDateUTC } from "@/lib/dates";

export type JourneyOverviewStudent = {
  studentId: string;
  studentCode: string;
  name: string;
  progress: JourneyProgressValues | null;
  attendanceRate: number | null;
  latestNote: { note: string; createdAt: Date } | null;
};

const SNIPPET_LENGTH = 120;

function snippet(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > SNIPPET_LENGTH ? `${oneLine.slice(0, SNIPPET_LENGTH).trimEnd()}…` : oneLine;
}

export function JourneyOverview({ students }: { students: JourneyOverviewStudent[] }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">SAINTS Journey</h1>
        <p className="text-sm text-muted">
          Body → Movement → Discipline → Awareness → Self Knowledge. Open a student to reflect on their journey.
        </p>
      </div>

      {students.length === 0 ? (
        <EmptyState icon={Sparkles} title="No active students yet." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((student) => {
            const qualities = computeJourneyQualities({
              danceLevel: student.progress?.danceLevel ?? null,
              fitnessScore: student.progress?.fitnessScore ?? null,
              consistencyScore: student.progress?.consistencyScore ?? null,
              awarenessScore: student.progress?.awarenessScore ?? null,
              growthScore: student.progress?.growthScore ?? null,
              attendanceRate: student.attendanceRate,
            });
            return (
              <Link
                key={student.studentId}
                href={`/students/${student.studentId}?tab=journey`}
                className="glass-card block space-y-4 p-5 transition-colors hover:border-gold"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{student.name}</p>
                    <p className="text-sm text-muted">{student.studentCode}</p>
                  </div>
                  {student.progress?.danceLevel && <Badge variant="outline">{student.progress.danceLevel}</Badge>}
                </div>
                <JourneyPath items={toJourneyItems(qualities)} compact />
                {student.latestNote ? (
                  <div className="space-y-1">
                    <p className="text-sm text-muted">&ldquo;{snippet(student.latestNote.note)}&rdquo;</p>
                    <p className="text-xs text-muted">{formatDateUTC(student.latestNote.createdAt)}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted">No reflections yet.</p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npx tsc --noEmit
npx eslint src/components/journey/journey-overview.tsx
```

Expected: no errors or warnings in this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/journey/journey-overview.tsx
git commit -m "Add journey overview grid

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Page integration

**Files:**
- Modify: `src/app/(app)/students/[id]/page.tsx`
- Modify: `src/app/(app)/journey/page.tsx` (replace the Phase 1 `PhaseStub`)

**Interfaces:**
- Consumes: `getStudentJourney`, `listStudentNotes`, `getNoteInstructorOptions`, `listJourneyOverview` (Task 5); `StudentJourneyTab` (Task 8); `StudentNotesTab` (Task 9); `JourneyOverview` (Task 10).

- [ ] **Step 1: Rewrite `src/app/(app)/journey/page.tsx`**

```tsx
import { listJourneyOverview } from "@/lib/queries/journey";
import { JourneyOverview } from "@/components/journey/journey-overview";

export default async function JourneyPage() {
  const students = await listJourneyOverview();
  return <JourneyOverview students={students} />;
}
```

- [ ] **Step 2: Edit `src/app/(app)/students/[id]/page.tsx`**

Read the whole file first, then make exactly these edits and change nothing else:

1. Add imports:

```tsx
import { getStudentJourney, listStudentNotes, getNoteInstructorOptions } from "@/lib/queries/journey";
import { StudentJourneyTab } from "@/components/students/student-journey-tab";
import { StudentNotesTab } from "@/components/students/student-notes-tab";
```

2. Delete the now-unused `ComingSoon` helper function (both the Notes and Journey tabs stop using it; leaving it would add an unused-variable lint warning).
3. Change the page signature to also accept `searchParams`, and select the initial tab from `?tab=` (so `/journey` cards can deep-link to the Journey tab):

```tsx
const TAB_VALUES = ["overview", "fees", "attendance", "classes", "notes", "journey"] as const;

export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { id } = await params;
  const rawTab = (await searchParams).tab;
  const requestedTab = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  const initialTab = (TAB_VALUES as readonly string[]).includes(requestedTab ?? "") ? requestedTab! : "overview";
```

and change `<Tabs defaultValue="overview">` to `<Tabs defaultValue={initialTab}>`.
4. Extend the existing `Promise.all` with the three journey reads (append to the array and to the destructuring, keeping the existing four in order):

```tsx
  const [student, feeHistory, attendanceHistory, enrolledBatches, journey, notes, noteOptions] = await Promise.all([
    getStudent(id),
    getStudentFeeHistory(id),
    getStudentAttendanceHistory(id),
    getStudentEnrolledBatches(id),
    getStudentJourney(id),
    listStudentNotes(id),
    getNoteInstructorOptions(id),
  ]);
```

5. Replace the two placeholder tab contents:

```tsx
        <TabsContent value="notes">
          <StudentNotesTab
            studentId={student.id}
            notes={notes}
            instructors={noteOptions.instructors}
            defaultInstructorId={noteOptions.defaultInstructorId}
          />
        </TabsContent>
```

```tsx
        <TabsContent value="journey">
          <StudentJourneyTab
            studentId={student.id}
            progress={journey.progress}
            attendanceRate={journey.attendanceRate}
            recentNotes={journey.recentNotes}
          />
        </TabsContent>
```

- [ ] **Step 3: Verify it compiles and lints**

```bash
npx tsc --noEmit
npx eslint "src/app/(app)/students/[id]/page.tsx" "src/app/(app)/journey/page.tsx"
```

Expected: no errors or warnings in these files.

- [ ] **Step 4: Verify end-to-end against the real database**

Since a logged-in browser click-through is not available in this environment (every prior phase hit the same restriction), verify via a temporary script (temp student-code prefix `ZZJ11-`; harness per Global Constraints, including stubs for `server-only` and `next/cache`) that exercises the same calls the two pages make, end to end, with a temp student, temp instructor, temp course/batch enrollment, attendance rows and notes:

1. `saveJourneyProgress` then `getStudentJourney`: the saved scores round-trip; feeding them through `computeJourneyQualities` + `toJourneyItems` gives the expected five values/words (e.g. Intermediate + fitness 8 → movement 73 "Growing"; attendance 100% → discipline "Flourishing"; an unset growth score → "Not yet reflected").
2. `addInstructorNote` then `listStudentNotes` / `getStudentJourney().recentNotes` / `listJourneyOverview()`: the note appears everywhere with the instructor's name and is the overview's `latestNote`; `getNoteInstructorOptions` pre-selects the batch instructor.
3. `deleteInstructorNote` removes it from all three reads.
4. A soft-deleted student vanishes from `listJourneyOverview()`, and `saveJourneyProgress`/`addInstructorNote` for them throw.
5. Every value handed to a client component in Tasks 8-10 is a plain number/string/null/Date (spot-check with `JSON.stringify` round-trip of the objects the pages pass).

Clean up all test data and confirm zero `ZZJ11-` rows remain; delete every `_tmp_*` file.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/students/[id]/page.tsx" "src/app/(app)/journey/page.tsx"
git commit -m "Wire journey and notes into the student profile and /journey page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: Final verification and wrap-up

**Files:** none (verification only)

- [ ] **Step 1: Full regression pass**

```bash
npx vitest run
npx tsc --noEmit
npx eslint .
npx next build
```

Expected: every test passes (177 from earlier phases plus 22 in `journey-qualities` and 16 in `journey-validation` = 215); `tsc` clean; `eslint` matches the project's pre-existing baseline (13 problems: 1 error, 12 warnings, none in Journey files); `next build` clean with `/journey` present in the route table.

- [ ] **Step 2: Migration safety check**

`git diff main...HEAD -- prisma/` shows only the two-column `schema.prisma` change and the one new migration folder, and the migration SQL contains only two `ALTER TABLE "JourneyProgress" ADD COLUMN` statements.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "Phase 6 (SAINTS Journey) complete: verification pass

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Execution Notes: post-review changes (supersede the code blocks above where they differ)

Task 1 was run first by the orchestrator (migration applied to the shared database, which is additive); Tasks 2-11 were implemented in parallel by dependency-chained agents, committed one task per commit, and independently reviewed in four clusters plus a whole-branch review. The implementations matched the plan verbatim; review found these plan-level defects, fixed in a follow-up commit, so the shipped code differs from the blocks above as follows:

1. **Task 9 (`note-form-dialog.tsx`)**: the instructor `Select` used `value={instructorId === "" ? undefined : instructorId}`, which starts uncontrolled and flips to controlled on the first pick (base-ui logs a dev error). It is now always controlled: `value={instructorId}`. The textarea is capped (`max-h-48 overflow-y-auto`) so a ~1000-character note cannot push Save off a short screen, and the counter turns red over the limit.
2. **Task 8 (`student-journey-tab.tsx`)**: `hasAnyReflection` counted Discipline, which is derived from attendance, so the "Begin this journey" prompt was effectively dead for anyone who had attended a class. It now ignores `discipline`. A caption under the visual explains that Discipline reflects the last 90 days of attendance.
3. **Task 4 (`journey-path.tsx`)**: values are clamped to 0-100 (out-of-range legacy values drew a wrong arc), the gold arc is skipped at 0% (round caps can draw a dot), rings are `aria-hidden` when their label text is visible (avoids announcing every quality twice), and labels are `text-[10px] sm:text-sm` because five labels share ~50px columns on a phone.
4. **Task 7 (`progress-form-dialog.tsx`)**: an unrecognised stored dance level (the column was free-form before this phase) seeds the form as unrated so the first save cannot fail zod; the description notes that Movement combines dance level and fitness.
5. **Tasks 8/9/10**: long unbroken text wraps (`break-words`, `min-w-0`) in the notes list, journey tab and overview cards; the overview snippet truncates by code point (`Array.from`) so an emoji is never split; Title Case for new buttons/headings/labels ("Update Progress", "Save Progress", "Add Note", "Save Note", "Dance Level", "Recent Reflections") to match the rest of the app.
6. **Task 11**: `src/components/shared/phase-stub.tsx` was deleted (the Journey stub was its last user).
7. **Tests**: `toJourneyItems` now pins every value; added cases for dance-level case sensitivity, an empty progress object, whitespace-only and negative scores, trim-before-max for notes, and a missing student. Final test count is 224 (177 earlier + 23 in `journey-qualities` + 24 in `journey-validation`).
8. **Known and accepted**: notes show as UTC calendar dates (as Reminders does); the 90-day window is 91 calendar days inclusive; `listJourneyOverview` does three bulk queries (the spec said two: the extra one is the 90-day attendance the Discipline ring needs) and loads all notes/attendance for active students, which is fine at academy scale.

## Post-Plan Check

At the end of this plan: each student has a reflective journey view and instructor notes, and the admin has an academy-wide overview at `/journey`. The overview's Discipline ring needs each student's 90-day attendance, so `listJourneyOverview` does one extra bulk attendance query beyond the spec's "two bulk queries" (still no N+1). Phase 7 (Settings and notifications) is unrelated to this phase's scope.
