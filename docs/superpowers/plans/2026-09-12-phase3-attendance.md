# Phase 3 (Attendance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build batch roll-call attendance marking, per-student attendance marking, a student's attendance history/rate, and real Dashboard attendance numbers, on top of Phase 1's already-scaffolded `Attendance` model.

**Architecture:** Same layering as Phase 2 (Fees & Payments): pure, unit-tested logic in `src/lib/`, read-only queries in `src/lib/queries/` (`server-only`), mutations in `src/actions/` (`"use server"`), zod validation schemas shared between client and server, `"use client"` components composed into Server Component pages. New shared UTC-day/weekday date helpers live in `src/lib/dates.ts` since both Attendance and a Dashboard fix need them.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL (Neon), Zod, react-hook-form, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-12-phase3-attendance-design.md`

## Global Constraints

- `prisma`/`@prisma/client` pinned to exact `6.19.3` (see Phase 1's plan doc Task 4 note) — do not upgrade.
- All calendar-date fields (`Attendance.date`, comparisons against "today") are UTC-midnight instants, never computed via `date-fns`'s local-time helpers (`startOfMonth`/`startOfDay`/etc.) — this project has already hit and fixed this exact bug class twice (Phase 2's `periods.ts`, this phase's `dates.ts`). Use the UTC-safe helpers this plan builds.
- "Today" for business-logic purposes (attendance defaults, Dashboard) is computed in IST (`Asia/Kolkata`), matching the existing `currentHourInIST()` pattern in `src/components/layout/header.tsx` — not raw server-local time, not raw UTC "now".
- No future-dated attendance records, ever (enforced in validation).
- Soft-deleted students/batches are excluded from every read; mutations verify the target student/batch/enrollment still exists and isn't soft-deleted before writing (same pattern Phase 2's `createPayment`/`saveFeePlan` established after a review found the gap — apply it from the start here, don't wait for review to catch it).
- Follow established UI conventions exactly: `useGuardedDialogOpenChange` for every dialog, `showCloseButton={!submitting}`, controlled `<input type="date">` via `watch`/`setValue` (never `register`), `EmptyState` for zero-states, `variant="outline"` status `Badge`s, children-function `<SelectValue>` when a select's value ≠ its display label (dynamic lists) vs. plain `<SelectValue />` for small hardcoded option sets.

---

## Task 1: Schema migration — index Attendance's foreign keys ✅ DONE (commit 8540e0b, reviewed and approved — additive-only migration, verified applied cleanly against the shared Neon DB)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_index_attendance_fks/migration.sql`

**Interfaces:**
- Produces: no code-level interface — this only adds two indexes to the already-existing `Attendance` table, used implicitly by every query in later tasks.

- [x] **Step 1: Add indexes to the `Attendance` model**

In `prisma/schema.prisma`, find the existing `Attendance` model:

```prisma
model Attendance {
  id        String           @id @default(cuid())
  studentId String
  student   Student          @relation(fields: [studentId], references: [id])
  batchId   String
  batch     Batch            @relation(fields: [batchId], references: [id])
  date      DateTime
  status    AttendanceStatus
  createdAt DateTime         @default(now())

  @@unique([studentId, batchId, date])
}
```

Replace it with (only the two `@@index` lines are new):

```prisma
model Attendance {
  id        String           @id @default(cuid())
  studentId String
  student   Student          @relation(fields: [studentId], references: [id])
  batchId   String
  batch     Batch            @relation(fields: [batchId], references: [id])
  date      DateTime
  status    AttendanceStatus
  createdAt DateTime         @default(now())

  @@unique([studentId, batchId, date])
  @@index([studentId])
  @@index([batchId])
}
```

This closes a follow-up Phase 1's plan doc already flagged: non-unique FK columns with no index, cheap to add before this table gets real write volume from daily roll-call marking.

- [x] **Step 2: Generate the migration SQL (non-interactive-safe)**

`prisma migrate dev` fails in a non-interactive shell (any confirmation prompt throws `Error: Prisma Migrate has detected that the environment is non-interactive`) — this bit Phase 2's Task 1 the same way. Use the diff-based workaround instead:

```bash
npx prisma migrate diff --from-schema-datasource --to-schema-datamodel --script prisma/schema.prisma
```

Expected output: SQL containing exactly two `CREATE INDEX` statements for `Attendance(studentId)` and `Attendance(batchId)`, nothing else. If it contains anything else, stop and investigate before proceeding — it means `schema.prisma` has an unrelated pending change.

- [x] **Step 3: Place the migration and deploy it**

Create `prisma/migrations/<YYYYMMDDHHMMSS>_index_attendance_fks/migration.sql` (pick the timestamp as the current UTC time, matching the folder-naming convention of the existing migrations in `prisma/migrations/`) with the SQL from Step 2, then:

```bash
npx prisma migrate deploy
npx prisma migrate status
```

Expected: `migrate deploy` reports the new migration applied; `migrate status` reports "Database schema is up to date!" with no drift.

- [x] **Step 4: Regenerate the Prisma client and verify**

```bash
npx prisma generate
npx tsc --noEmit
```

Expected: clean (this task only adds indexes, no field/type changes, so no code should be affected yet).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "Index Attendance's studentId and batchId foreign key columns

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Shared UTC date helpers + attendance pure logic (TDD) ✅ DONE (commit 2a02c6a, matched the plan byte-for-byte, reviewed and approved — all UTC/weekday arithmetic independently re-verified by the reviewer; `todayInIST()`'s missing test coverage, flagged in review, was closed as part of Task 3's fix commit since that fix needed the same fake-timer test infrastructure)

**Files:**
- Create: `src/lib/dates.ts`
- Create: `tests/unit/dates.test.ts`
- Create: `src/lib/attendance/schedule.ts`
- Create: `tests/unit/attendance-schedule.test.ts`
- Create: `src/lib/attendance/rate.ts`
- Create: `tests/unit/attendance-rate.test.ts`

**Interfaces:**
- Produces: `startOfUTCDay(date: Date): Date`, `endOfUTCDay(date: Date): Date`, `weekdayAbbrevUTC(date: Date): string`, `todayInIST(): Date`, `formatDateUTC(date: Date): string` (all from `src/lib/dates.ts`); `isBatchScheduledOn(batchDays: string[], date: Date): boolean` (from `src/lib/attendance/schedule.ts`); `computeAttendanceRate(records: { status: AttendanceStatus }[]): number` (from `src/lib/attendance/rate.ts`). Every later task imports from these three files by these exact names.

- [x] **Step 1: Write the failing tests for `src/lib/dates.ts`**

Create `tests/unit/dates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { startOfUTCDay, endOfUTCDay, weekdayAbbrevUTC, formatDateUTC } from "@/lib/dates";

describe("startOfUTCDay", () => {
  it("floors a UTC instant to that day's midnight", () => {
    expect(startOfUTCDay(new Date("2026-09-12T18:45:30.000Z")).toISOString()).toBe("2026-09-12T00:00:00.000Z");
  });

  it("is idempotent on an already-midnight instant", () => {
    expect(startOfUTCDay(new Date("2026-09-12T00:00:00.000Z")).toISOString()).toBe("2026-09-12T00:00:00.000Z");
  });
});

describe("endOfUTCDay", () => {
  it("returns 23:59:59.999 UTC for the given day", () => {
    expect(endOfUTCDay(new Date("2026-09-12T03:00:00.000Z")).toISOString()).toBe("2026-09-12T23:59:59.999Z");
  });
});

describe("weekdayAbbrevUTC", () => {
  it("reads Monday from a known UTC Monday instant", () => {
    // 2026-01-01 is a Thursday (verified: Jan 1 2024 was a Monday [366-day
    // leap year to 2025 -> +2 -> Wednesday; 365-day 2025 to 2026 -> +1 ->
    // Thursday]), so 2026-01-05 is the following Monday.
    expect(weekdayAbbrevUTC(new Date(Date.UTC(2026, 0, 5)))).toBe("Mon");
  });

  it("reads Tuesday from the next day", () => {
    expect(weekdayAbbrevUTC(new Date(Date.UTC(2026, 0, 6)))).toBe("Tue");
  });

  it("does not shift across a UTC day boundary", () => {
    expect(weekdayAbbrevUTC(new Date("2026-01-05T23:59:00.000Z"))).toBe("Mon");
    expect(weekdayAbbrevUTC(new Date("2026-01-06T00:01:00.000Z"))).toBe("Tue");
  });
});

describe("formatDateUTC", () => {
  it("formats a UTC-midnight date as dd MMM yyyy, reading the UTC instant not local time", () => {
    expect(formatDateUTC(new Date(Date.UTC(2026, 5, 5)))).toBe("05 Jun 2026");
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/unit/dates.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/dates'` (the file doesn't exist yet).

- [x] **Step 3: Implement `src/lib/dates.ts`**

```ts
/**
 * Shared UTC-anchored date helpers. Calendar-date fields throughout this
 * system (FeePlan.dueDate, Payment.coverageStart/coverageEnd,
 * Attendance.date, etc.) are stored and compared as UTC-midnight instants
 * standing in for a plain calendar day -- date-fns's local-time equivalents
 * (startOfMonth/startOfDay/format/etc.) silently corrupt these boundaries
 * whenever the host runs outside UTC (see src/lib/fees/periods.ts's
 * addMonths comment for the original, verified repro of this bug class).
 * This module extends that same UTC-anchoring convention from month
 * boundaries to day boundaries and weekday reads, needed by Attendance and
 * by a Phase 1 Dashboard follow-up fix.
 */

export function startOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function endOfUTCDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

/** e.g. "Mon", matching Batch.days' exact 3-letter format (src/lib/validations/batch.ts's DAYS list). */
export function weekdayAbbrevUTC(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(date);
}

/**
 * Today's calendar date in IST (Asia/Kolkata), as a UTC-midnight instant --
 * mirrors the IST-pinning pattern already established in
 * src/components/layout/header.tsx's currentHourInIST, extended from "hour"
 * to "calendar date". `en-CA` is a locale-formatting trick, not a Canada
 * reference: its default date format is exactly "YYYY-MM-DD", which a plain
 * `new Date(...)` then parses as UTC midnight per the Date spec's
 * date-only-string handling.
 */
export function todayInIST(): Date {
  const isoDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Date(isoDate);
}

/** Formats a UTC-anchored date as "dd MMM yyyy" (e.g. "05 Jun 2026") without reading local time. */
export function formatDateUTC(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
```

- [x] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/unit/dates.test.ts
```

Expected: all pass.

- [x] **Step 5: Write the failing tests for `src/lib/attendance/schedule.ts`**

Create `tests/unit/attendance-schedule.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isBatchScheduledOn } from "@/lib/attendance/schedule";

describe("isBatchScheduledOn", () => {
  it("returns true when the date's UTC weekday is in batchDays", () => {
    expect(isBatchScheduledOn(["Mon", "Wed", "Fri"], new Date(Date.UTC(2026, 0, 5)))).toBe(true); // Monday
  });

  it("returns false when the date's UTC weekday is not in batchDays", () => {
    expect(isBatchScheduledOn(["Mon", "Wed", "Fri"], new Date(Date.UTC(2026, 0, 6)))).toBe(false); // Tuesday
  });

  it("returns false for an empty schedule", () => {
    expect(isBatchScheduledOn([], new Date(Date.UTC(2026, 0, 5)))).toBe(false);
  });

  it("matches on any of multiple scheduled days", () => {
    expect(isBatchScheduledOn(["Tue", "Thu", "Sat"], new Date(Date.UTC(2026, 0, 6)))).toBe(true); // Tuesday
  });
});
```

- [x] **Step 6: Run the tests to verify they fail**

```bash
npx vitest run tests/unit/attendance-schedule.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/attendance/schedule'`.

- [x] **Step 7: Implement `src/lib/attendance/schedule.ts`**

```ts
import { weekdayAbbrevUTC } from "@/lib/dates";

/**
 * Whether `date`'s UTC weekday appears in `batchDays` (Batch.days, e.g.
 * ["Mon","Wed","Fri"] -- see src/lib/validations/batch.ts's DAYS list for
 * the exact 3-letter format these values always take). Used as a SOFT
 * default only (sorting/highlighting "scheduled today" batches) -- never a
 * hard restriction on which batch can be marked on which date.
 */
export function isBatchScheduledOn(batchDays: string[], date: Date): boolean {
  return batchDays.includes(weekdayAbbrevUTC(date));
}
```

- [x] **Step 8: Run the tests to verify they pass**

```bash
npx vitest run tests/unit/attendance-schedule.test.ts
```

Expected: all pass.

- [x] **Step 9: Write the failing tests for `src/lib/attendance/rate.ts`**

Create `tests/unit/attendance-rate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeAttendanceRate } from "@/lib/attendance/rate";

describe("computeAttendanceRate", () => {
  it("returns 0 for no records", () => {
    expect(computeAttendanceRate([])).toBe(0);
  });

  it("counts PRESENT and LATE as attended; ABSENT and LEAVE count against the rate", () => {
    const records = [
      { status: "PRESENT" as const },
      { status: "LATE" as const },
      { status: "ABSENT" as const },
      { status: "LEAVE" as const },
    ];
    expect(computeAttendanceRate(records)).toBe(50); // 2 of 4
  });

  it("is 100 when every record is PRESENT or LATE", () => {
    expect(computeAttendanceRate([{ status: "PRESENT" as const }, { status: "LATE" as const }])).toBe(100);
  });

  it("is 0 when every record is ABSENT or LEAVE", () => {
    expect(computeAttendanceRate([{ status: "ABSENT" as const }, { status: "LEAVE" as const }])).toBe(0);
  });

  it("rounds to the nearest whole percent", () => {
    // 1 of 3 attended = 33.33...% -> rounds to 33
    const records = [{ status: "PRESENT" as const }, { status: "ABSENT" as const }, { status: "ABSENT" as const }];
    expect(computeAttendanceRate(records)).toBe(33);
  });
});
```

- [x] **Step 10: Run the tests to verify they fail**

```bash
npx vitest run tests/unit/attendance-rate.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/attendance/rate'`.

- [x] **Step 11: Implement `src/lib/attendance/rate.ts`**

```ts
import type { AttendanceStatus } from "@prisma/client";

/**
 * (PRESENT + LATE) / total marked records, as a 0-100 rounded percentage.
 * LEAVE and ABSENT both count against the rate; LATE still counts as
 * attended (just marked separately for visibility elsewhere). Returns 0 for
 * an empty record set rather than dividing by zero.
 */
export function computeAttendanceRate(records: { status: AttendanceStatus }[]): number {
  if (records.length === 0) return 0;
  const attended = records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;
  return Math.round((attended / records.length) * 100);
}
```

- [x] **Step 12: Run all three test files together**

```bash
npx vitest run tests/unit/dates.test.ts tests/unit/attendance-schedule.test.ts tests/unit/attendance-rate.test.ts
```

Expected: all pass, 16 tests total (7 + 4 + 5).

- [x] **Step 13: Verify no regressions and typecheck**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: full suite passes (existing 84 + 13 new = 97), tsc clean.

- [x] **Step 14: Commit**

```bash
git add -A
git commit -m "Add shared UTC date helpers and attendance pure logic (rate, schedule matching)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Validation schemas ✅ DONE (commit 0ed3d10, matched the plan byte-for-byte; fixed in bc74044 -- review found `notFutureDate`'s raw `d.getTime() <= Date.now()` comparison was a real bug, not the "generous by a full day" non-issue the plan's own comment claimed: for the ~5.5 hours each day between IST midnight and 05:30 IST, typing today's own IST calendar date coerces to a UTC-midnight instant *later* than the actual current UTC instant, wrongly rejecting it as a future date -- e.g. an admin marking attendance at 2am IST for a class earlier that same IST morning. Fixed by comparing calendar days via `todayInIST()` [Task 2] instead of raw `Date.now()`; independently re-derived and confirmed by both the orchestrating session and a follow-up re-review before and after the fix)

**Files:**
- Create: `src/lib/validations/attendance.ts`
- Create: `tests/unit/attendance-validation.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `attendanceStatusSchema`, `saveBatchAttendanceSchema` + `SaveBatchAttendanceInput` type, `markStudentAttendanceSchema` + `MarkStudentAttendanceInput` type — all from `src/lib/validations/attendance.ts`. Task 5 (actions), Task 6 (roster UI), and Task 7 (dialog) import these by these exact names.

- [x] **Step 1: Write the failing tests**

Create `tests/unit/attendance-validation.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { saveBatchAttendanceSchema, markStudentAttendanceSchema } from "@/lib/validations/attendance";

describe("saveBatchAttendanceSchema", () => {
  const valid = {
    batchId: "batch1",
    date: "2020-01-01",
    records: [{ studentId: "s1", status: "PRESENT" }],
  };

  it("accepts a valid payload", () => {
    expect(saveBatchAttendanceSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty records array", () => {
    expect(saveBatchAttendanceSchema.safeParse({ ...valid, records: [] }).success).toBe(false);
  });

  it("rejects a future date", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(
      saveBatchAttendanceSchema.safeParse({ ...valid, date: future.toISOString().slice(0, 10) }).success
    ).toBe(false);
  });

  it("rejects an invalid status", () => {
    expect(
      saveBatchAttendanceSchema.safeParse({ ...valid, records: [{ studentId: "s1", status: "MAYBE" }] }).success
    ).toBe(false);
  });
});

describe("markStudentAttendanceSchema", () => {
  const valid = { batchId: "batch1", date: "2020-01-01", status: "PRESENT" };

  it("accepts a valid payload", () => {
    expect(markStudentAttendanceSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a future date", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(
      markStudentAttendanceSchema.safeParse({ ...valid, date: future.toISOString().slice(0, 10) }).success
    ).toBe(false);
  });

  it("rejects a missing batchId", () => {
    expect(markStudentAttendanceSchema.safeParse({ ...valid, batchId: "" }).success).toBe(false);
  });
});

describe("notFutureDate IST boundary (regression)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts today's IST calendar date even during the 00:00-05:30 IST window where raw UTC 'now' lags behind", () => {
    // 2026-01-04T20:00:00Z = 2026-01-05 01:30 IST -- IST's calendar day is
    // already the 5th, but the UTC-midnight instant for "2026-01-05" (what
    // a naive `Date.now()` comparison would check against) is still ~4
    // hours in the future relative to raw UTC "now". A date-only compare
    // against todayInIST() must still accept this as "today", not "future".
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-04T20:00:00.000Z"));

    const valid = {
      batchId: "batch1",
      date: "2026-01-05",
      records: [{ studentId: "s1", status: "PRESENT" }],
    };
    expect(saveBatchAttendanceSchema.safeParse(valid).success).toBe(true);
  });

  it("still rejects a genuinely future IST calendar date during that same window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-04T20:00:00.000Z")); // IST "today" = Jan 5

    const future = {
      batchId: "batch1",
      date: "2026-01-06", // IST tomorrow
      records: [{ studentId: "s1", status: "PRESENT" }],
    };
    expect(saveBatchAttendanceSchema.safeParse(future).success).toBe(false);
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/unit/attendance-validation.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/validations/attendance'`.

- [x] **Step 3: Implement `src/lib/validations/attendance.ts`**

```ts
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
```

- [x] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/unit/attendance-validation.test.ts
```

Expected: all pass (9, after the IST-boundary fix added 2 more to the original 7).

- [x] **Step 5: Full regression + typecheck**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: clean (112 tests total after the fix; `tsc` shows only the pre-existing, unrelated `LayoutProps` error caused by this worktree never having run `next build`/`next dev`).

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "Add attendance validation schemas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

**Post-review fix (`bc74044`):** also added `todayInIST()` test coverage to `tests/unit/dates.test.ts` (Task 2 had zero coverage for it, flagged in Task 2's own review as a gap) using the same `vi.useFakeTimers()` infrastructure the IST-boundary regression test above needed anyway.

---

## Task 4: Attendance queries (server-only reads) ✅ DONE (commit 77a5ffe, matched the plan byte-for-byte, reviewed and approved — soft-delete scoping scrutinized function-by-function, no gap found; one asymmetry noted [`getStudentAttendanceHistory` doesn't filter a soft-deleted *batch* referenced by a historical record] but confirmed consistent with existing `students.ts` convention for historical/display-only relations, not a regression)

**Files:**
- Create: `src/lib/queries/attendance.ts`

**Interfaces:**
- Consumes: `startOfUTCDay` (`@/lib/dates`), `isBatchScheduledOn` (`@/lib/attendance/schedule`), `computeAttendanceRate` (`@/lib/attendance/rate`).
- Produces: `getBatchRosterForDate(batchId: string, date: Date)`, `getStudentAttendanceHistory(studentId: string)`, `listBatchesForDate(date: Date)`, `getStudentEnrolledBatches(studentId: string)` — all exported from `src/lib/queries/attendance.ts`. Tasks 6 and 7 import these by these exact names.

This is the first task touching the real database with real reads — there's no UI yet, so verify with a temporary script against the real Neon DB, the same way Phase 2's Task 6 did.

- [x] **Step 1: Write `src/lib/queries/attendance.ts`**

```ts
// Read-only queries, not mutations -- lives outside src/actions/ (which is
// "use server") so these can never be called as Server Actions from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { prisma } from "@/lib/db";
import { startOfUTCDay } from "@/lib/dates";
import { isBatchScheduledOn } from "@/lib/attendance/schedule";
import { computeAttendanceRate } from "@/lib/attendance/rate";

export async function getBatchRosterForDate(batchId: string, date: Date) {
  const normalizedDate = startOfUTCDay(date);

  const [batch, attendanceRecords] = await Promise.all([
    prisma.batch.findUnique({
      where: { id: batchId, deletedAt: null },
      include: {
        enrollments: {
          where: { student: { deletedAt: null } },
          include: { student: true },
          orderBy: { student: { name: "asc" } },
        },
      },
    }),
    prisma.attendance.findMany({ where: { batchId, date: normalizedDate } }),
  ]);
  if (!batch) return null;

  const statusByStudentId = new Map(attendanceRecords.map((a) => [a.studentId, a.status]));

  return {
    batchName: batch.name,
    // `status: null` means "not yet marked for this date" -- the UI defaults
    // these to PRESENT for display only, nothing is written until saved.
    roster: batch.enrollments.map((e) => ({
      studentId: e.student.id,
      name: e.student.name,
      studentCode: e.student.studentCode,
      status: statusByStudentId.get(e.student.id) ?? null,
    })),
  };
}

export async function getStudentAttendanceHistory(studentId: string) {
  const records = await prisma.attendance.findMany({
    where: { studentId, student: { deletedAt: null } },
    include: { batch: true },
    orderBy: { date: "desc" },
  });

  return {
    records: records.map((r) => ({
      id: r.id,
      date: r.date,
      batchName: r.batch.name,
      status: r.status,
    })),
    rate: computeAttendanceRate(records),
  };
}

export async function listBatchesForDate(date: Date) {
  const normalizedDate = startOfUTCDay(date);
  const batches = await prisma.batch.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, days: true },
    orderBy: { name: "asc" },
  });

  // Array.prototype.sort is a stable sort (guaranteed since ES2019), so this
  // preserves the name-ascending order fetched above within each group --
  // scheduled-today batches first, still alphabetical among themselves.
  return batches
    .map((b) => ({ id: b.id, name: b.name, scheduledToday: isBatchScheduledOn(b.days, normalizedDate) }))
    .sort((a, b) => Number(b.scheduledToday) - Number(a.scheduledToday));
}

export async function getStudentEnrolledBatches(studentId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId, student: { deletedAt: null }, batch: { deletedAt: null } },
    include: { batch: true },
    orderBy: { batch: { name: "asc" } },
  });
  return enrollments.map((e) => ({ id: e.batch.id, name: e.batch.name }));
}
```

- [x] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [x] **Step 3: Verify against the real database**

The shared Neon database currently has 3 Courses, 2 Instructors, 3 Batches, some real students (check current count via a read-only query before starting — do not assume 0), 0 Attendance records. Write a temporary script (delete it when done) that:

1. Picks one of the existing seeded batches (e.g. via `listBatchOptions()` from `src/lib/queries/batches.ts`) and confirms it has enrolled students (if none, create ONE temporary test student enrolled in it, distinct code, clean up after).
2. Calls `listBatchesForDate(new Date())` — confirm it returns all batches, with `scheduledToday` correctly reflecting each batch's `days` against today's actual weekday.
3. Calls `getBatchRosterForDate(batchId, new Date())` on the chosen batch — confirm it returns the batch name and every enrolled (non-deleted) student with `status: null` (nothing marked yet).
4. Directly creates one `Attendance` row via Prisma for one of that roster's students, for today, status `LATE`. Calls `getBatchRosterForDate` again — confirm that student's `status` is now `"LATE"` while everyone else is still `null`.
5. Calls `getStudentAttendanceHistory(studentId)` for that same student — confirm it returns the one record with the correct `batchName`/`date`/`status`, and `rate: 100` (LATE counts as attended, only one record).
6. Calls `getStudentEnrolledBatches(studentId)` — confirm it returns the batch(es) that student is actually enrolled in.
7. Clean up: delete the `Attendance` row (and any temporary student/enrollment you created). Confirm the database is back to its exact pre-test state (same counts you recorded in step 1).

- [x] **Step 4: Run full regression**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: clean, no new test files needed for this task (thin query wrappers over already-tested pure logic, verified manually against the real DB per Phase 2's Task 6 precedent).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "Add attendance queries: batch roster, student history, batch-for-date listing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Attendance actions (mutations) ✅ DONE (commit fdd8d9e, matched the plan byte-for-byte; fixed in 96fd564 -- review empirically confirmed against the real DB that the plan's own literal code violated its own stated design principle [Global Constraints: mutations must verify the target isn't soft-deleted]: `markStudentAttendance`'s enrollment check didn't verify the student/batch weren't soft-deleted [Enrollment has no deletedAt of its own and isn't cascade-affected], so attendance could be marked for a soft-deleted student or an archived batch; `saveBatchAttendance` never verified each record's studentId was actually enrolled in the target batch at all. Fixed by extending the enrollment lookup with `student`/`batch` non-deleted filters [same "extended where-unique" pattern as Task 4's `getStudentEnrolledBatches`] and adding a pre-transaction enrollment-membership check; both fixes independently re-verified at runtime against the real database by a follow-up review, not just compile-checked)

**Files:**
- Create: `src/actions/attendance.ts`

**Interfaces:**
- Consumes: `saveBatchAttendanceSchema`, `markStudentAttendanceSchema`, `SaveBatchAttendanceInput`, `MarkStudentAttendanceInput` (`@/lib/validations/attendance`); `startOfUTCDay` (`@/lib/dates`).
- Produces: `saveBatchAttendance(input: SaveBatchAttendanceInput): Promise<void>`, `markStudentAttendance(studentId: string, input: MarkStudentAttendanceInput): Promise<void>` — both exported from `src/actions/attendance.ts`. Tasks 6 and 7 call these by these exact names/signatures.

**Before writing:** the `Attendance` model's compound unique constraint is `@@unique([studentId, batchId, date])`. Prisma generates the compound-key `where` field name by joining the field names with underscores in declaration order (this codebase's `Enrollment.@@unique([studentId, batchId])` follows the identical convention, though nothing currently queries it by that compound key directly, so this will be the first use of that specific Prisma feature here). After writing the code below, run `npx tsc --noEmit` immediately — if the compound key name (`studentId_batchId_date`) is wrong, TypeScript will reject it as an unknown property immediately, not fail silently; check the generated type in `node_modules/.prisma/client/index.d.ts` (search for `AttendanceWhereUniqueInput`) if you need to confirm the exact name before or after writing.

- [x] **Step 1: Write `src/actions/attendance.ts`**

```ts
"use server";

import { prisma } from "@/lib/db";
import { startOfUTCDay } from "@/lib/dates";
import {
  saveBatchAttendanceSchema,
  markStudentAttendanceSchema,
  type SaveBatchAttendanceInput,
  type MarkStudentAttendanceInput,
} from "@/lib/validations/attendance";
import { revalidatePath } from "next/cache";

export async function saveBatchAttendance(input: SaveBatchAttendanceInput) {
  const data = saveBatchAttendanceSchema.parse(input);
  const date = startOfUTCDay(data.date);

  const batch = await prisma.batch.findUnique({
    where: { id: data.batchId, deletedAt: null },
    select: { id: true },
  });
  if (!batch) {
    throw new Error("Batch not found.");
  }

  // One transaction for the whole roster: either every student's status for
  // this batch+date is saved, or none are -- never a partially-saved
  // roll-call. (This codebase has no other $transaction usage yet; a bulk
  // multi-row save is exactly the case it exists for.)
  await prisma.$transaction(
    data.records.map((record) =>
      prisma.attendance.upsert({
        where: { studentId_batchId_date: { studentId: record.studentId, batchId: data.batchId, date } },
        create: { studentId: record.studentId, batchId: data.batchId, date, status: record.status },
        update: { status: record.status },
      })
    )
  );

  revalidatePath("/attendance");
  revalidatePath("/dashboard");
}

export async function markStudentAttendance(studentId: string, input: MarkStudentAttendanceInput) {
  const data = markStudentAttendanceSchema.parse(input);
  const date = startOfUTCDay(data.date);

  const enrollment = await prisma.enrollment.findUnique({
    where: {
      studentId_batchId: { studentId, batchId: data.batchId },
      student: { deletedAt: null },
      batch: { deletedAt: null },
    },
    select: { studentId: true },
  });
  if (!enrollment) {
    throw new Error("This student isn't enrolled in that batch.");
  }

  await prisma.attendance.upsert({
    where: { studentId_batchId_date: { studentId, batchId: data.batchId, date } },
    create: { studentId, batchId: data.batchId, date, status: data.status },
    update: { status: data.status },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
}
```

**Post-review fix (`96fd564`):** `saveBatchAttendance` never verified each record's `studentId` was actually enrolled in the target batch. Fixed by adding, right after the batch-existence check:

```ts
  // Attendance has a direct FK to Student/Batch (not to Enrollment), so the
  // batch check above doesn't confirm each record's student actually belongs
  // to this batch. Verify every record's studentId is currently (non-deleted)
  // enrolled in this batch before writing anything.
  const enrollments = await prisma.enrollment.findMany({
    where: { batchId: data.batchId, student: { deletedAt: null } },
    select: { studentId: true },
  });
  const enrolledStudentIds = new Set(enrollments.map((e) => e.studentId));
  const invalidRecord = data.records.find((r) => !enrolledStudentIds.has(r.studentId));
  if (invalidRecord) {
    throw new Error("One or more students are not currently enrolled in this batch.");
  }
```

- [x] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean. If `studentId_batchId_date` or `studentId_batchId` is rejected as an unknown property, check the generated `AttendanceWhereUniqueInput`/`EnrollmentWhereUniqueInput` types in `node_modules/.prisma/client/index.d.ts` for the actual generated name and correct it.

- [x] **Step 3: Verify against the real database**

Using a temporary script (delete when done), against a temporary test student enrolled in an existing seeded batch (distinct student code, clean up fully afterward):

1. Call `saveBatchAttendance({ batchId, date: <today>, records: [{ studentId, status: "PRESENT" }] })` — confirm one `Attendance` row was created with the right values.
2. Call it again for the same batch+date with a different status (e.g. `"LATE"`) for the same student — confirm it upserts in place (still exactly one row for that student+batch+date, status updated), not a duplicate.
3. Call `saveBatchAttendance` with two students' records in one call — confirm both are written correctly (proving the `$transaction` array handles multiple records, not just one).
4. Call `markStudentAttendance(studentId, { batchId, date: <a different day>, status: "ABSENT" })` — confirm a new row is created for that date without disturbing the earlier date's row.
5. Call `markStudentAttendance` again for the same student+batch+date with a different status — confirm it upserts (edits in place).
6. Call `markStudentAttendance(studentId, { batchId: <a batch this student is NOT enrolled in>, date: <today>, status: "PRESENT" })` — confirm it throws `"This student isn't enrolled in that batch."` and creates no row.
7. Call `saveBatchAttendance` with a nonexistent `batchId` — confirm it throws `"Batch not found."`.
8. Try `saveBatchAttendance`/`markStudentAttendance` with a future date — confirm zod rejects it before any DB write.
9. Clean up all `Attendance` rows and the temporary student, confirm the database is back to its pre-test state.

- [x] **Step 4: Run full regression**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: clean.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "Add attendance server actions: batch roll-call save, single-student mark

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Attendance roster page (batch roll-call UI) ✅ DONE (commit bfdafa2, matched the plan byte-for-byte [plus an established, pre-existing `as string` cast on a Select's onValueChange, matching batch-form-dialog.tsx's convention]; fixed in 02d2be0 -- review found a real, non-hypothetical bug baked into the plan's own code: `statuses` was seeded via a `useState` lazy initializer, which only runs on first mount, but Next.js App Router doesn't remount this component on a searchParams-only navigation [changing date/batch] -- so switching dates left stale local statuses in place, and an unsaved toggle from one date could silently get written to a different date on the next save. Fixed with a `useEffect(() => setStatuses(...), [roster])` re-seed, mirroring this codebase's own established dialog-reset pattern; also added `aria-pressed` to the status buttons for a flagged accessibility gap. Re-review confirmed the fix at the React/Next.js mechanics level and noted one narrow, non-blocking edge case for awareness: status edits made during the brief save-then-refresh round-trip window get discarded rather than surviving, since the effect now always resyncs from the server's persisted truth -- judged an acceptable, defensible default, not a regression of the original bug)

**Files:**
- Create: `src/components/attendance/attendance-roster.tsx`
- Modify: `src/app/(app)/attendance/page.tsx`

**Interfaces:**
- Consumes: `listBatchesForDate`, `getBatchRosterForDate` (`@/lib/queries/attendance`); `saveBatchAttendance` (`@/actions/attendance`); `todayInIST` (`@/lib/dates`).
- Produces: `AttendanceRoster` component (`@/components/attendance/attendance-roster`), consumed only by this task's own page.

- [x] **Step 1: Write `src/components/attendance/attendance-roster.tsx`**

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { saveBatchAttendance } from "@/actions/attendance";
import { toast } from "sonner";
import type { AttendanceStatus } from "@prisma/client";
import type { listBatchesForDate, getBatchRosterForDate } from "@/lib/queries/attendance";

type BatchOption = Awaited<ReturnType<typeof listBatchesForDate>>[number];
type Roster = Awaited<ReturnType<typeof getBatchRosterForDate>>;

const STATUS_OPTIONS: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "LEAVE"];
const STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  LEAVE: "Leave",
};
// Applied only to the currently-selected status button in each row; the
// unselected buttons use the default outline variant.
const STATUS_SELECTED_CLASSES: Record<AttendanceStatus, string> = {
  PRESENT: "bg-success text-white hover:bg-success/80",
  ABSENT: "bg-danger text-white hover:bg-danger/80",
  LATE: "bg-warning text-white hover:bg-warning/80",
  LEAVE: "bg-muted text-foreground hover:bg-muted/80",
};

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function AttendanceRoster({
  date,
  batches,
  selectedBatchId,
  roster,
}: {
  date: Date;
  batches: BatchOption[];
  selectedBatchId: string | null;
  roster: Roster;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  // Local edit buffer: studentId -> status, seeded from the roster's saved
  // statuses. A student with no saved record for this date (`status: null`
  // from getBatchRosterForDate) defaults to PRESENT here for display only --
  // nothing is written until Save Attendance is clicked.
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>(() =>
    Object.fromEntries((roster?.roster ?? []).map((r) => [r.studentId, r.status ?? "PRESENT"]))
  );
  // The roster prop changes on every date/batch navigation, but Next.js does
  // not remount this component for a searchParams-only navigation -- so the
  // lazy useState initializer above only runs once, on first mount. Without
  // this effect, switching date/batch would leave `statuses` holding stale
  // data (or unsaved local toggles) from the PREVIOUS roster.
  useEffect(() => {
    setStatuses(Object.fromEntries((roster?.roster ?? []).map((r) => [r.studentId, r.status ?? "PRESENT"])));
  }, [roster]);

  function navigate(nextDate: string, nextBatchId?: string) {
    const params = new URLSearchParams();
    params.set("date", nextDate);
    if (nextBatchId) params.set("batchId", nextBatchId);
    startTransition(() => router.push(`/attendance?${params.toString()}`));
  }

  async function handleSave() {
    if (!selectedBatchId || !roster) return;
    setSaving(true);
    try {
      await saveBatchAttendance({
        batchId: selectedBatchId,
        date,
        records: roster.roster.map((r) => ({
          studentId: r.studentId,
          status: statuses[r.studentId] ?? "PRESENT",
        })),
      });
      toast.success("Attendance saved");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Attendance</h1>
        <div className="flex gap-3">
          <Input
            type="date"
            max={toDateInputValue(new Date())}
            value={toDateInputValue(date)}
            onChange={(e) => navigate(e.target.value, selectedBatchId ?? undefined)}
            className="w-40"
          />
          <Select
            value={selectedBatchId ?? undefined}
            // base-ui types onValueChange's value as `string | null`, but no real
            // call site emits null in single-select mode -- see batch-form-dialog.tsx
            // for the fuller rationale.
            onValueChange={(v) => navigate(toDateInputValue(date), v as string)}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select a batch">
                {(value: string) => batches.find((b) => b.id === value)?.name ?? "Select a batch"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                  {b.scheduledToday ? " (scheduled today)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!roster || roster.roster.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No students enrolled in this batch." />
      ) : (
        <div className="space-y-3">
          <div className="glass-card divide-y divide-card-border">
            {roster.roster.map((student) => (
              <div key={student.studentId} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-medium text-foreground">{student.name}</p>
                  <p className="text-sm text-muted">{student.studentCode}</p>
                </div>
                <div className="flex gap-2">
                  {STATUS_OPTIONS.map((status) => {
                    const selected = statuses[student.studentId] === status;
                    return (
                      <Button
                        key={status}
                        type="button"
                        size="xs"
                        variant={selected ? "default" : "outline"}
                        className={selected ? STATUS_SELECTED_CLASSES[status] : undefined}
                        aria-pressed={selected}
                        onClick={() => setStatuses((prev) => ({ ...prev, [student.studentId]: status }))}
                      >
                        {STATUS_LABELS[status]}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save Attendance"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [x] **Step 2: Rewrite `src/app/(app)/attendance/page.tsx`**

Replace the Phase 1 `PhaseStub` placeholder entirely:

```tsx
import { listBatchesForDate, getBatchRosterForDate } from "@/lib/queries/attendance";
import { AttendanceRoster } from "@/components/attendance/attendance-roster";
import { todayInIST } from "@/lib/dates";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; batchId?: string }>;
}) {
  const params = await searchParams;
  const date = params.date ? new Date(params.date) : todayInIST();
  const batches = await listBatchesForDate(date);
  const selectedBatchId = params.batchId ?? batches.find((b) => b.scheduledToday)?.id ?? batches[0]?.id ?? null;
  const roster = selectedBatchId ? await getBatchRosterForDate(selectedBatchId, date) : null;

  return (
    <AttendanceRoster date={date} batches={batches} selectedBatchId={selectedBatchId} roster={roster} />
  );
}
```

- [x] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [x] **Step 4: Verify manually**

Since a logged-in browser click-through may not be available in your environment (a prior phase in this project hit that exact restriction and substituted direct data-layer verification instead), verify via a temporary script exercising `listBatchesForDate`/`getBatchRosterForDate`/`saveBatchAttendance` together end-to-end against the real database, using a temporary test student, mirroring the same scenario a real click-through would exercise: load the page's data for today with no `batchId` in params (confirm it defaults to a scheduled-today batch if one exists, else the first batch alphabetically), simulate marking one student ABSENT and saving, then re-fetch and confirm the roster reflects it. If you do have real browser access, use it and take a screenshot instead. Clean up all test data afterward.

- [x] **Step 5: Run full regression**

```bash
npx vitest run
npx tsc --noEmit
```

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "Add batch roll-call attendance page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Mark Attendance dialog + Student profile Attendance tab ✅ DONE (commit 0b9c929, matched the plan byte-for-byte [plus the same established `as string` cast convention as Task 6], reviewed and approved -- the empty-enrolledBatches dialog scenario, the Date-vs-Decimal RSC-boundary question, and zero-history rendering were all traced through and confirmed correct, no fixes needed)

**Files:**
- Create: `src/components/attendance/mark-attendance-dialog.tsx`
- Create: `src/components/students/student-attendance-tab.tsx`
- Modify: `src/app/(app)/students/[id]/page.tsx`

**Interfaces:**
- Consumes: `markStudentAttendanceSchema`, `MarkStudentAttendanceInput` (`@/lib/validations/attendance`); `markStudentAttendance` (`@/actions/attendance`); `getStudentAttendanceHistory`, `getStudentEnrolledBatches` (`@/lib/queries/attendance`); `formatDateUTC` (`@/lib/dates`); `useGuardedDialogOpenChange` (`@/hooks/use-guarded-dialog`).
- Produces: `MarkAttendanceDialog`, `StudentAttendanceTab` components.

- [x] **Step 1: Write `src/components/attendance/mark-attendance-dialog.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { markStudentAttendanceSchema, type MarkStudentAttendanceInput } from "@/lib/validations/attendance";
import { markStudentAttendance } from "@/actions/attendance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGuardedDialogOpenChange } from "@/hooks/use-guarded-dialog";
import { toast } from "sonner";

function defaults(batchId: string): MarkStudentAttendanceInput {
  return { batchId, date: new Date(), status: "PRESENT" };
}

// Same controlled-date-field fix as fee-plan-form-dialog.tsx / Phase 1's
// student-form.tsx: <input type="date"> rejects a raw Date assigned via
// register(), so this must be controlled via watch()/setValue().
function toDateInputValue(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function MarkAttendanceDialog({
  open,
  onOpenChange,
  studentId,
  batches,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  batches: { id: string; name: string }[];
  onSuccess?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const firstBatchId = batches[0]?.id ?? "";

  const {
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<MarkStudentAttendanceInput>({
    resolver: zodResolver(markStudentAttendanceSchema),
    defaultValues: defaults(firstBatchId),
  });

  useEffect(() => {
    if (open) reset(defaults(firstBatchId));
  }, [open, firstBatchId, reset]);

  async function onSubmit(data: MarkStudentAttendanceInput) {
    setSubmitting(true);
    try {
      await markStudentAttendance(studentId, data);
      toast.success("Attendance recorded");
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
          <DialogTitle>Mark Attendance</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Batch</Label>
            <Select
              value={watch("batchId")}
              // base-ui types onValueChange's value as `string | null`, but no real
              // call site emits null in single-select mode -- see batch-form-dialog.tsx
              // for the fuller rationale.
              onValueChange={(v) => setValue("batchId", v as string)}
              disabled={submitting || batches.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a batch">
                  {(value: string) => batches.find((b) => b.id === value)?.name ?? "Select a batch"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.batchId && <p className="text-sm text-danger">{errors.batchId.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              max={toDateInputValue(new Date())}
              value={toDateInputValue(watch("date"))}
              onChange={(e) =>
                setValue("date", (e.target.value || undefined) as unknown as Date, { shouldValidate: true })
              }
              disabled={submitting}
            />
            {errors.date && <p className="text-sm text-danger">{String(errors.date.message)}</p>}
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={watch("status")}
              onValueChange={(v) => setValue("status", v as MarkStudentAttendanceInput["status"])}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRESENT">Present</SelectItem>
                <SelectItem value="ABSENT">Absent</SelectItem>
                <SelectItem value="LATE">Late</SelectItem>
                <SelectItem value="LEAVE">Leave</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={submitting || batches.length === 0}>
            {submitting ? "Saving..." : "Mark Attendance"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [x] **Step 2: Write `src/components/students/student-attendance-tab.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { MarkAttendanceDialog } from "@/components/attendance/mark-attendance-dialog";
import { formatDateUTC } from "@/lib/dates";
import type { AttendanceStatus } from "@prisma/client";

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  PRESENT: "border-success text-success",
  ABSENT: "border-danger text-danger",
  LATE: "border-warning text-warning",
  LEAVE: "border-muted text-muted",
};

export type AttendanceHistoryRecord = {
  id: string;
  date: Date;
  batchName: string;
  status: AttendanceStatus;
};

export function StudentAttendanceTab({
  studentId,
  records,
  rate,
  enrolledBatches,
}: {
  studentId: string;
  records: AttendanceHistoryRecord[];
  rate: number;
  enrolledBatches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Attendance Rate: <span className="text-gold">{rate}%</span>
        </p>
        <Button onClick={() => setDialogOpen(true)} disabled={enrolledBatches.length === 0}>
          <Plus size={16} className="mr-2" />
          Mark Attendance
        </Button>
      </div>

      {records.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No attendance recorded yet." />
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-muted">
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Batch</th>
                <th className="p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b border-card-border last:border-0">
                  <td className="p-3 text-foreground">{formatDateUTC(record.date)}</td>
                  <td className="p-3 text-muted">{record.batchName}</td>
                  <td className="p-3">
                    <Badge variant="outline" className={STATUS_COLORS[record.status]}>
                      {record.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MarkAttendanceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        studentId={studentId}
        batches={enrolledBatches}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
```

- [x] **Step 3: Modify `src/app/(app)/students/[id]/page.tsx`**

**Edit 1 — add three imports** after the existing `import { StudentFeesTab } from "@/components/students/student-fees-tab";` line:
```ts
import { getStudentAttendanceHistory, getStudentEnrolledBatches } from "@/lib/queries/attendance";
import { StudentAttendanceTab } from "@/components/students/student-attendance-tab";
```

**Edit 2 — fetch attendance data alongside the student and fee history, in parallel.** Replace:
```ts
  const { id } = await params;
  const [student, feeHistory] = await Promise.all([getStudent(id), getStudentFeeHistory(id)]);
  if (!student) notFound();
```
with:
```ts
  const { id } = await params;
  const [student, feeHistory, attendanceHistory, enrolledBatches] = await Promise.all([
    getStudent(id),
    getStudentFeeHistory(id),
    getStudentAttendanceHistory(id),
    getStudentEnrolledBatches(id),
  ]);
  if (!student) notFound();
```

**Edit 3 — replace the Attendance tab's stub content.** Replace:
```tsx
        <TabsContent value="attendance">
          <ComingSoon label="Attendance" />
        </TabsContent>
```
with:
```tsx
        <TabsContent value="attendance">
          <StudentAttendanceTab
            studentId={student.id}
            records={attendanceHistory.records}
            rate={attendanceHistory.rate}
            enrolledBatches={enrolledBatches}
          />
        </TabsContent>
```

No Decimal-serialization concern here (unlike the Fees tab) — attendance data is all plain strings/Dates, which cross the Server→Client boundary safely without conversion.

Leave everything else in the file untouched (the `ComingSoon` component itself, still used by Notes/Journey; the Overview, Fees, and Classes tab content).

- [x] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [x] **Step 5: Verify manually**

Same approach as Task 6 if browser access isn't available: a temporary script/test creating a temp student with a couple of `Attendance` rows, calling `getStudentAttendanceHistory`/`getStudentEnrolledBatches` and confirming the numbers match what a rendered tab would show (record count, rate, batch list for the dialog). If real browser access is available, click through the actual tab and take a screenshot instead. Clean up all test data afterward.

- [x] **Step 6: Run full regression**

```bash
npx vitest run
npx tsc --noEmit
```

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "Wire per-student attendance marking and history into the student profile

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Dashboard integration (real attendance numbers + two Phase 1 follow-up fixes) ✅ DONE (commit 8451484, matched the plan byte-for-byte, reviewed and approved -- the `batchId: { in: [] }` "no batch scheduled today" edge case was independently verified empirically against the real DB to correctly resolve to zero rows, not match-everything; the `monthCollection` date-boundary swap was confirmed to change only the timezone-safety mechanism, not the numeric result)

**Files:**
- Modify: `src/lib/queries/dashboard.ts`
- Modify: `src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `todayInIST`, `startOfUTCDay` (`@/lib/dates`); `isBatchScheduledOn` (`@/lib/attendance/schedule`); `startOfMonth`, `endOfMonth` (`@/lib/fees/periods` — Phase 2's UTC-safe versions, replacing `date-fns`'s unsafe ones per the already-documented Phase 1 follow-up).
- Produces: `getDashboardStats()`'s return shape changes from `{ ..., todaysAttendanceCount }` to `{ ..., todaysClasses, presentToday, expectedToday }` (`todaysClasses` already existed but is now actually filtered by schedule instead of counting every batch).

This task folds in two already-documented Phase 1 follow-ups (see `docs/superpowers/plans/2026-09-04-phase1-foundation.md`'s "Known follow-ups for later phases") since both are exactly what real attendance data needs anyway: "Today's Classes" currently counts every active batch regardless of schedule, and this file's date-range boundaries use `date-fns`'s local-time `startOfMonth`/`endOfMonth`/`startOfDay`/`endOfDay` instead of a UTC-safe equivalent.

- [x] **Step 1: Read the current file**

Read `src/lib/queries/dashboard.ts` in full before editing — confirm it still matches what's described below (it hasn't been touched since Phase 1).

- [x] **Step 2: Rewrite `src/lib/queries/dashboard.ts`**

```ts
// Read-only query, not a mutation — lives outside src/actions/ (which is
// "use server") so it can never be called as a Server Action from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { prisma } from "@/lib/db";
import { startOfMonth, endOfMonth } from "@/lib/fees/periods";
import { todayInIST, startOfUTCDay } from "@/lib/dates";
import { isBatchScheduledOn } from "@/lib/attendance/schedule";

export async function getDashboardStats() {
  const today = todayInIST();
  const dayStart = startOfUTCDay(today); // todayInIST() is already UTC-midnight; this is a defensive no-op

  const [totalStudents, activeStudents, batchesWithEnrollments] = await Promise.all([
    prisma.student.count({ where: { deletedAt: null } }),
    prisma.student.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.batch.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        days: true,
        enrollments: { where: { student: { deletedAt: null } }, select: { studentId: true } },
      },
    }),
  ]);

  // "Today's Classes" now means batches actually scheduled today (via
  // Batch.days), not every active batch regardless of schedule -- a Phase 1
  // follow-up this file's own comment already flagged as overpromising.
  const todaysBatches = batchesWithEnrollments.filter((b) => isBatchScheduledOn(b.days, dayStart));
  // Expected attendance today is counted per enrollment, not per unique
  // student -- a student in two batches that both meet today is expected
  // twice, once per session (matches the design spec's explicit call-out).
  const expectedToday = todaysBatches.reduce((sum, b) => sum + b.enrollments.length, 0);

  const [monthCollection, pendingFees, presentToday] = await Promise.all([
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { paymentDate: { gte: startOfMonth(today), lte: endOfMonth(today) } },
    }),
    prisma.feePlan.aggregate({ _sum: { finalAmount: true } }),
    prisma.attendance.count({
      where: {
        date: dayStart,
        batchId: { in: todaysBatches.map((b) => b.id) },
        status: { in: ["PRESENT", "LATE"] },
      },
    }),
  ]);

  return {
    totalStudents,
    activeStudents,
    monthCollection: Number(monthCollection._sum.amount ?? 0),
    pendingFees: Number(pendingFees._sum.finalAmount ?? 0),
    todaysClasses: todaysBatches.length,
    presentToday,
    expectedToday,
  };
}
```

- [x] **Step 3: Update `src/app/(app)/dashboard/page.tsx`**

Replace the whole file (only the "This Month Collection"/"Pending Fees" `note` props are removed, since Phase 2 already shipped those — the note was stale — and the attendance card's value/note changes):

```tsx
import { Users, UserCheck, Wallet, AlertCircle, CalendarClock, ClipboardCheck } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { getDashboardStats } from "@/lib/queries/dashboard";

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div className="space-y-8">
      <div className="glass-card p-6 text-center">
        <p className="text-lg text-gold">SAINTS</p>
        <p className="text-sm text-muted">Know Yourself — The Divine Within</p>
        <p className="mt-3 text-sm text-muted">स्वयं को जानना ही वास्तविक शिक्षा है।</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Users} label="Total Students" value={String(stats.totalStudents)} />
        <StatCard icon={UserCheck} label="Active Students" value={String(stats.activeStudents)} />
        <StatCard icon={CalendarClock} label="Today's Classes" value={String(stats.todaysClasses)} />
        <StatCard icon={Wallet} label="This Month Collection" value={`₹${stats.monthCollection.toLocaleString("en-IN")}`} />
        <StatCard icon={AlertCircle} label="Pending Fees" value={`₹${stats.pendingFees.toLocaleString("en-IN")}`} />
        <StatCard icon={ClipboardCheck} label="Today's Attendance" value={`${stats.presentToday} / ${stats.expectedToday}`} />
      </div>
    </div>
  );
}
```

- [x] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [x] **Step 5: Verify against the real database**

Using a temporary script (or, if browser access is available, the real Dashboard page): confirm `getDashboardStats()` returns sane numbers against current real data — in particular, create a temporary batch-day scenario if the seeded batches don't currently have one scheduled "today" (e.g. temporarily note today's actual weekday and check whether any seeded batch's `days` includes it), mark one enrolled student PRESENT for today in a batch that IS scheduled today, and confirm `presentToday`/`expectedToday`/`todaysClasses` all reflect it correctly. Also confirm `monthCollection` still returns the correct real figure from Phase 2's data (this is the regression check for the `startOfMonth`/`endOfMonth` swap — the numeric result should be identical to before the swap, since the fix only changes *how* the boundary is computed, not what real payments fall within the current month in this IST-positive-offset environment). Clean up any temporary attendance rows/students created.

- [x] **Step 6: Run full regression**

```bash
npx vitest run
npx tsc --noEmit
npx next build
```

Expected: all clean; `next build`'s route table still lists `/dashboard` and `/attendance`.

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "Wire real attendance numbers into the Dashboard; fix Today's Classes schedule filter and timezone-unsafe date boundaries

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Final verification and wrap-up ✅ DONE

**Files:** none (verification only)

- [x] **Step 1: Full regression pass**

```bash
npx vitest run
npx tsc --noEmit
npx eslint .
npx next build
```

Expected: every test passes (Phase 1+2's baseline plus this phase's new date/schedule/rate/validation tests); `tsc`/`eslint` clean or matching the pre-existing baseline with no new errors/warnings from this phase's files; `next build` clean with `/attendance` present in the route table (and `/students/[id]`, `/dashboard` still present).

**Result:** `npx vitest run` — 112/112 tests, 14/14 files. `npx tsc --noEmit` — one pre-existing error (`src/app/layout.tsx(21,50): Cannot find name 'LayoutProps'`, caused solely by this worktree never having run `next build`/`next dev` before, so `.next/types` didn't exist yet — resolved the moment `next build` below actually ran). `npx eslint .` — 14 problems (2 errors, 12 warnings), all in pre-existing Phase 1/2 files untouched by this phase (`confirm-dialog.tsx`, `student-form.tsx`, three test files) — matches the established baseline, zero new findings from any Phase 3 file. `npx next build` — clean, full route table present including `/attendance`, `/students/[id]`, `/dashboard`.

- [x] **Step 2: End-to-end verification**

Create one temporary test student enrolled in a seeded batch. Mark a full batch roll-call for today via `saveBatchAttendance` (a mix of statuses across the roster). Confirm via `getStudentAttendanceHistory` that the tab's history table and rate would be correct for the marked student. Confirm via `getDashboardStats()` that "Today's Attendance" reflects the marking. Mark one more record via `markStudentAttendance` for a past date and confirm it shows up correctly in history without disturbing today's record. If real browser access is available, do this via the actual UI (roll-call page, student profile tab, dashboard) instead and take screenshots; otherwise use the data-layer approach the rest of this plan already established. Clean up all test data afterward, confirm the database is back to its pre-phase baseline (same counts recorded at the start of Task 4's verification).

**Result:** Browser login remains off-limits under this session's safety rules; verified via a data-layer script exercising the real `saveBatchAttendance`/`markStudentAttendance`/`getStudentAttendanceHistory`/`getStudentEnrolledBatches`/`listBatchesForDate`/`getDashboardStats` functions together end-to-end against the real Neon database (temp student, distinct code, cleaned up fully): batch roll-call mark → roster correctly showed PRESENT → student history correctly showed 1 record/100% rate → a second `markStudentAttendance` call for the previous day correctly added a second record without disturbing the first, rate correctly recalculated to 50% (1 PRESENT + 1 ABSENT) → `getStudentEnrolledBatches`/`listBatchesForDate` both correctly reflected the batch → `getDashboardStats()` correctly returned `presentToday/expectedToday: 0/0` since the test batch wasn't scheduled on the actual test date (a Sunday), consistent with Task 8's already-verified schedule-filtering logic, not a bug. Full before/after database snapshot matched exactly.

- [x] **Step 3: Final commit**

```bash
git add -A
git commit -m "Phase 3 (Attendance) complete: manual verification pass

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Post-plan check

At the end of this plan: admins can mark attendance for a whole batch on any date via roll-call, or a single student from their profile; a student's profile shows their attendance history and rate; the Dashboard's "Today's Attendance" and "Today's Classes" cards show real, schedule-aware numbers for the first time. Fee Reminders (Phase 4), Reports (Phase 5), and SAINTS Journey (Phase 6) are the next phases; Reports will likely want attendance trend queries beyond this phase's single rate figure, building on `computeAttendanceRate`/`isBatchScheduledOn` rather than duplicating them.
