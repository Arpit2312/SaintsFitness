# SAINTS Phase 2: Fees & Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin set up a fee plan per student, record payments (including ones covering multiple periods at once), see live-computed fee status/history, and generate a printable/shareable digital receipt per payment — making the Dashboard's existing Collection/Pending Fees stat cards show real numbers for the first time.

**Architecture:** Fee status is computed on read from two tables (`FeePlan`, `Payment`) — never materialized, no cron job. A small pure-logic module (`src/lib/fees/`) enumerates calendar periods from a plan's start date and waterfall-allocates payments across them; this is the trickiest part of the phase and gets full TDD coverage. Everything else follows the exact conventions Phase 1 already established: `src/lib/queries/` (reads, `server-only`) vs `src/actions/` (mutations, `"use server"`), Server Component pages + `"use client"` list components + `router.refresh()`, the shared `useGuardedDialogOpenChange` hook for dialogs, and the `SelectValue` children-function pattern wherever a value differs from its display label.

**Tech Stack:** Next.js 16, TypeScript, Prisma (Decimal for all money), Zod, react-hook-form, Tailwind v4 + shadcn/ui (base-ui), Vitest.

**Reference spec:** `docs/superpowers/specs/2026-09-05-phase2-fees-payments-design.md`

**Existing codebase conventions to follow exactly (read these files before starting if unfamiliar):**
- `src/components/classes/course-form-dialog.tsx` — the canonical dialog pattern: `useGuardedDialogOpenChange`, `showCloseButton={!submitting}`, `useEffect`+`reset()` re-seed on open/target change, fields `disabled={submitting}`, try/catch/finally submit handler, optional `onSuccess` prop.
- `src/components/classes/batch-form-dialog.tsx` — the `SelectValue` children-function pattern for when a Select's value (an id) differs from its display label, plus the `v as string` cast comment for `onValueChange`.
- `src/components/classes/courses-list.tsx` + `src/app/(app)/classes/courses/page.tsx` — the Server Component (fetch) + `"use client"` list component (UI state only, `router.refresh()` after mutations) split.
- `src/lib/queries/courses.ts` + `src/actions/courses.ts` — the read/write file split (`import "server-only"` vs `"use server"`).
- `src/hooks/use-guarded-dialog.ts` — reuse directly, do not reinvent.
- `src/lib/ids.ts` — `generateReceiptNumber()` already exists from Phase 1, unused until now.

---

## Task 1: Schema migration — Payment coverage range + one-plan-per-student ✅ DONE (commit 66dbac3 — `prisma migrate dev` can't run in this non-interactive shell when it needs to show any confirmation prompt; worked around via `migrate diff` → manual migration folder → `migrate deploy`, verified equivalent via `migrate status` showing no drift)

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update the `FeePlan`, `Payment`, and `Student` models**

In `prisma/schema.prisma`, find the `FeePlan` model and add `@unique` to `studentId` (enforces one fee plan per student, and is required for the `upsert({ where: { studentId } })` pattern Task 7 uses):

Also add a one-line comment above `dueDate` — this Phase 1 field name is being repurposed by Phase 2 as the plan's *start/anchor* date (periods are enumerated forward from it), not a single one-off due date, and that's easy to misread from the name alone:

```prisma
model FeePlan {
  id          String       @id @default(cuid())
  studentId   String       @unique
  student     Student      @relation(fields: [studentId], references: [id])
  totalAmount Decimal      @db.Decimal(10, 2)
  frequency   FeeFrequency
  /// The plan's start/anchor date -- periods are enumerated forward from
  /// here based on `frequency`, not a single one-off due date. Named
  /// `dueDate` for historical reasons (Phase 1's original schema).
  dueDate     DateTime
  discount    Decimal      @default(0) @db.Decimal(10, 2)
  finalAmount Decimal      @db.Decimal(10, 2)
  createdAt   DateTime     @default(now())
  payments    Payment[]
}
```

Find the `Payment` model and replace the free-text `period: String` field with `coverageStart`/`coverageEnd`:

```prisma
model Payment {
  id            String      @id @default(cuid())
  studentId     String
  student       Student     @relation(fields: [studentId], references: [id])
  feePlanId     String?
  feePlan       FeePlan?    @relation(fields: [feePlanId], references: [id])
  amount        Decimal     @db.Decimal(10, 2)
  paymentDate   DateTime
  mode          PaymentMode
  coverageStart DateTime
  coverageEnd   DateTime
  notes         String?
  createdAt     DateTime    @default(now())
  receipt       Receipt?
}
```

Find the `Student` model and change `feePlans FeePlan[]` to `feePlan FeePlan?` (singular — matches the new one-plan-per-student constraint and the existing 1:1 pattern already used for `address`/`emergencyContact`/`parentDetails`/`journeyProgress` on this same model):

```prisma
model Student {
  id          String        @id @default(cuid())
  studentCode String        @unique
  name        String
  photoUrl    String?
  mobile      String
  dob         DateTime
  gender      Gender
  joiningDate DateTime
  status      StudentStatus @default(ACTIVE)
  deletedAt   DateTime?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  address          Address?
  emergencyContact EmergencyContact?
  parentDetails    ParentDetails?
  enrollments      Enrollment[]
  feePlan          FeePlan?
  payments         Payment[]
  attendance       Attendance[]
  notes            InstructorNote[]
  journeyProgress  JourneyProgress?
  notifications    Notification[]
}
```

- [ ] **Step 2: Run the migration**

The `Payment` table is currently empty (Phase 1 never populated it), so this migration has no real data to preserve or backfill — a plain `prisma migrate dev` is safe here, unlike Task 4/Account.issuer's migration in Phase 1 which needed a careful expand/backfill/constrain sequence for a populated table. Confirm the `Payment` table really is empty before running, as a safety check:

```bash
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.payment.count().then((n) => { console.log('Payment rows:', n); return prisma.\$disconnect(); });
"
```

Expected: `Payment rows: 0`. If it's not 0, STOP and report back rather than proceeding — that would mean something unexpected has payment data already and the migration needs a different (expand/backfill) approach.

```bash
npx prisma migrate dev --name fee_plan_unique_and_payment_coverage_range
```

Expected: migration applies cleanly, Prisma Client regenerates with no errors.

- [ ] **Step 3: Verify the migration structurally**

```bash
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.feePlan.findMany().then((rows) => { console.log('FeePlan rows:', rows.length); return prisma.\$disconnect(); });
"
```

Expected: `FeePlan rows: 0` (table also empty, migration just changes shape, not data). Also run `npx tsc --noEmit` and confirm it's clean — this proves the regenerated Prisma Client types (e.g. `Student.feePlan` now singular, `Payment.coverageStart`/`coverageEnd`) are consistent with nothing else in the codebase referencing the old shapes (nothing does yet, since this is brand new functionality).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Migrate FeePlan/Payment schema: one plan per student, coverage range

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Period enumeration + status calculation (TDD) ✅ DONE (commit 783006b, extended with exported UTC helpers + formatMonthYear in 912a506, a runtime day-1 guard on addMonths in b4417df — date-fns's addMonths/startOfMonth/endOfMonth operate in local time and silently corrupted month-boundary math against UTC-anchored dates in this IST environment; the code block below is the corrected, actually-committed version, not the original draft. This same UTC-safety fix must be reused, not reimported from date-fns, by Task 4 and by Phase 3's fix to dashboard.ts.)

**Files:**
- Create: `src/lib/fees/periods.ts`
- Create: `tests/unit/periods.test.ts`

This is pure logic — no Prisma queries, no `"use server"`/`"server-only"` needed, safe to import from both server and client code (the Add Payment dialog will use `computeCoverageRange` client-side for a live preview).

- [ ] **Step 1: Write the failing tests in `tests/unit/periods.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  enumeratePeriods,
  calculatePeriodStatus,
  advancePeriodStart,
  computeCoverageRange,
} from "@/lib/fees/periods";

describe("enumeratePeriods", () => {
  it("enumerates monthly periods from plan start through the current period, inclusive", () => {
    const start = new Date("2026-06-15"); // mid-June
    const asOf = new Date("2026-09-04");
    const periods = enumeratePeriods(start, "MONTHLY", new Decimal(1500), asOf);
    expect(periods).toHaveLength(4); // June, July, August, September
    expect(periods[0].start.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(periods[0].end.toISOString().slice(0, 10)).toBe("2026-06-30");
    expect(periods[3].start.toISOString().slice(0, 10)).toBe("2026-09-01");
    periods.forEach((p) => expect(p.amountDue.toString()).toBe("1500"));
  });

  it("does not include future periods beyond asOf", () => {
    const start = new Date("2026-09-01");
    const asOf = new Date("2026-09-04");
    const periods = enumeratePeriods(start, "MONTHLY", new Decimal(1500), asOf);
    expect(periods).toHaveLength(1);
  });

  it("enumerates quarterly periods as 3-month blocks", () => {
    const start = new Date("2026-01-01");
    const asOf = new Date("2026-07-15");
    const periods = enumeratePeriods(start, "QUARTERLY", new Decimal(4500), asOf);
    expect(periods).toHaveLength(3); // Jan-Mar, Apr-Jun, Jul-Sep
    expect(periods[0].end.toISOString().slice(0, 10)).toBe("2026-03-31");
    expect(periods[2].start.toISOString().slice(0, 10)).toBe("2026-07-01");
  });

  it("CUSTOM frequency yields exactly one period once the start date has passed", () => {
    const start = new Date("2026-08-01");
    const asOf = new Date("2026-09-04");
    const periods = enumeratePeriods(start, "CUSTOM", new Decimal(5000), asOf);
    expect(periods).toHaveLength(1);
    expect(periods[0].start).toEqual(start);
    expect(periods[0].dueDate).toEqual(start);
  });

  it("CUSTOM frequency yields no periods before the start date", () => {
    const start = new Date("2026-12-01");
    const asOf = new Date("2026-09-04");
    expect(enumeratePeriods(start, "CUSTOM", new Decimal(5000), asOf)).toHaveLength(0);
  });

  it("yields no periods when the plan hasn't started yet", () => {
    const start = new Date("2026-12-01");
    const asOf = new Date("2026-09-04");
    expect(enumeratePeriods(start, "MONTHLY", new Decimal(1500), asOf)).toHaveLength(0);
  });
});

describe("calculatePeriodStatus", () => {
  const dueDate = new Date("2026-08-31");

  it("is PAID when amountPaid >= amountDue", () => {
    expect(
      calculatePeriodStatus(new Decimal(1500), new Decimal(1500), dueDate, new Date("2026-08-15"))
    ).toBe("PAID");
    expect(
      calculatePeriodStatus(new Decimal(1500), new Decimal(1600), dueDate, new Date("2026-08-15"))
    ).toBe("PAID");
  });

  it("is PARTIAL whenever something (but not enough) has been paid, regardless of due date", () => {
    expect(
      calculatePeriodStatus(new Decimal(1500), new Decimal(1000), dueDate, new Date("2026-09-04"))
    ).toBe("PARTIAL");
  });

  it("is DUE when nothing has been paid and the due date hasn't passed", () => {
    expect(
      calculatePeriodStatus(new Decimal(1500), new Decimal(0), dueDate, new Date("2026-08-15"))
    ).toBe("DUE");
  });

  it("is OVERDUE when nothing has been paid and the due date has passed", () => {
    expect(
      calculatePeriodStatus(new Decimal(1500), new Decimal(0), dueDate, new Date("2026-09-04"))
    ).toBe("OVERDUE");
  });
});

describe("advancePeriodStart", () => {
  it("advances a monthly period by one month", () => {
    const next = advancePeriodStart(new Date("2026-06-01"), "MONTHLY");
    expect(next.toISOString().slice(0, 10)).toBe("2026-07-01");
  });

  it("advances a quarterly period by three months", () => {
    const next = advancePeriodStart(new Date("2026-01-01"), "QUARTERLY");
    expect(next.toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("throws for CUSTOM, which has no recurring periods", () => {
    expect(() => advancePeriodStart(new Date("2026-01-01"), "CUSTOM")).toThrow();
  });
});

describe("computeCoverageRange", () => {
  it("computes a 3-month monthly range", () => {
    const { coverageStart, coverageEnd } = computeCoverageRange(new Date("2026-09-01"), 3, "MONTHLY");
    expect(coverageStart.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(coverageEnd.toISOString().slice(0, 10)).toBe("2026-11-30");
  });

  it("computes a single-quarter range for a quarterly plan", () => {
    const { coverageStart, coverageEnd } = computeCoverageRange(new Date("2026-01-01"), 1, "QUARTERLY");
    expect(coverageEnd.toISOString().slice(0, 10)).toBe("2026-03-31");
  });

  it("collapses to a single day for CUSTOM regardless of periodsCovered", () => {
    const { coverageStart, coverageEnd } = computeCoverageRange(new Date("2026-09-01"), 1, "CUSTOM");
    expect(coverageStart).toEqual(coverageEnd);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/unit/periods.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/fees/periods'`.

- [ ] **Step 3: Implement `src/lib/fees/periods.ts`**

**Note: this is the exact, current content of the actually-committed `src/lib/fees/periods.ts` (commit `912a506`), not the plan's original draft.** The original draft imported `addMonths`/`startOfMonth`/`endOfMonth` from `date-fns` — implementing that literally fails 4 of the 16 tests below, because date-fns's month arithmetic operates in local time while these dates are UTC-instant midnights, and this machine's IST (UTC+5:30) timezone silently shifts results by a day. The code below reimplements those three functions in UTC instead (same names/signatures, drop-in), and adds `formatMonthYear` for UTC-safe display formatting (needed by Tasks 9/10/12):

```ts
import type { FeeFrequency } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * UTC-based month arithmetic.
 *
 * Plan/period boundaries are calendar dates (e.g. "2026-06-01") which, per
 * the `Date` spec, parse as UTC instants. date-fns's `addMonths` /
 * `startOfMonth` / `endOfMonth` operate on the *local* calendar though, so
 * combining them with UTC-instant inputs silently shifts results by a day
 * whenever the host runs outside UTC -- verified in this environment
 * (Asia/Calcutta, UTC+5:30): `startOfMonth(addMonths(new
 * Date("2026-06-01"), 1))` comes back as `2026-06-30T18:30:00.000Z`
 * instead of `2026-07-01`. Doing the month math in UTC directly keeps
 * period boundaries stable regardless of server timezone.
 *
 * Invariant: `date` must already be a start-of-month date. Unlike date-fns's
 * real `addMonths`, this does not clamp day-of-month overflow to the last day
 * of the target month -- it's only exercised here against day-1 inputs, so
 * that clamping behavior was never needed.
 */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

/**
 * Formats a UTC-anchored date as "MMM yyyy" (e.g. "Sep 2026") without going
 * through the host's local timezone -- date-fns's `format` reads local wall-
 * clock time, so a period boundary like `Date.UTC(2026, 6, 1)` would render
 * as "Jun 2026" instead of "Jul 2026" in a negative-UTC-offset timezone.
 */
export function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export type PeriodStatus = "PAID" | "PARTIAL" | "DUE" | "OVERDUE";

export type Period = {
  index: number;
  start: Date;
  end: Date;
  dueDate: Date;
  amountDue: Decimal;
};

/** Calendar months per period. CUSTOM has no recurring cycle (0 = "not applicable"). */
export function periodLengthInMonths(frequency: FeeFrequency): number {
  switch (frequency) {
    case "MONTHLY":
      return 1;
    case "QUARTERLY":
      return 3;
    case "YEARLY":
      return 12;
    case "CUSTOM":
      return 0;
  }
}

/** Start of the next period after `date` (which must itself be a period start). Throws for CUSTOM. */
export function advancePeriodStart(date: Date, frequency: FeeFrequency): Date {
  const months = periodLengthInMonths(frequency);
  if (months === 0) {
    throw new Error("CUSTOM frequency has no recurring periods to advance through");
  }
  return startOfMonth(addMonths(date, months));
}

/**
 * Periods from the plan's start date through (and including) the period
 * containing `asOf` -- never future periods beyond that. CUSTOM yields at
 * most one period (Decision 3a in the Phase 2 spec): the whole finalAmount,
 * due once, with no recurring cycle.
 */
export function enumeratePeriods(
  planStartDate: Date,
  frequency: FeeFrequency,
  amountPerPeriod: Decimal,
  asOf: Date
): Period[] {
  if (frequency === "CUSTOM") {
    if (planStartDate > asOf) return [];
    return [
      { index: 0, start: planStartDate, end: planStartDate, dueDate: planStartDate, amountDue: amountPerPeriod },
    ];
  }

  const periods: Period[] = [];
  let start = startOfMonth(planStartDate);
  let index = 0;
  const months = periodLengthInMonths(frequency);
  while (start <= asOf) {
    const end = endOfMonth(addMonths(start, months - 1));
    periods.push({ index, start, end, dueDate: end, amountDue: amountPerPeriod });
    start = advancePeriodStart(start, frequency);
    index++;
  }
  return periods;
}

/**
 * PARTIAL takes precedence over OVERDUE: once any payment has landed on a
 * period, it reads as "Partial" regardless of whether its due date has since
 * passed (matches the master spec's Fee History example, where a partially
 * paid past month shows "Partial", not "Overdue").
 */
export function calculatePeriodStatus(
  amountDue: Decimal,
  amountPaid: Decimal,
  dueDate: Date,
  today: Date
): PeriodStatus {
  if (amountPaid.gte(amountDue)) return "PAID";
  if (amountPaid.gt(0)) return "PARTIAL";
  if (today > dueDate) return "OVERDUE";
  return "DUE";
}

/**
 * The coverage range a new payment of `periodsCovered` periods would span,
 * starting at `coverageStart`. Invariant: `coverageStart` must be a
 * start-of-month date -- every current call site already passes one.
 */
export function computeCoverageRange(
  coverageStart: Date,
  periodsCovered: number,
  frequency: FeeFrequency
): { coverageStart: Date; coverageEnd: Date } {
  if (frequency === "CUSTOM") {
    return { coverageStart, coverageEnd: coverageStart };
  }
  const months = periodLengthInMonths(frequency) * periodsCovered;
  const coverageEnd = endOfMonth(addMonths(coverageStart, months - 1));
  return { coverageStart, coverageEnd };
}
```

The test file also gained additional cases beyond the original 16 shown above, covering `formatMonthYear` and the now-exported UTC helpers directly — see the actual committed `tests/unit/periods.test.ts` (48 tests pass across the whole suite as of this task).

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/unit/periods.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add fee period enumeration and status calculation with unit tests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Waterfall payment allocation (TDD) ✅ DONE (commit 00cecf3 — no deviation needed, plan's code worked verbatim; independently stress-tested beyond the 8 committed cases: many periods with a payment running out partway, all-zero/all-negative dues, non-integer Decimal amounts, input immutability, all passed)

**Files:**
- Create: `src/lib/fees/allocation.ts`
- Create: `tests/unit/allocation.test.ts`

- [ ] **Step 1: Write the failing tests in `tests/unit/allocation.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { waterfallAllocate } from "@/lib/fees/allocation";

describe("waterfallAllocate", () => {
  it("fully covers each period in order when the payment exactly matches total due", () => {
    const result = waterfallAllocate(new Decimal(4500), [new Decimal(1500), new Decimal(1500), new Decimal(1500)]);
    expect(result.map((d) => d.toString())).toEqual(["1500", "1500", "1500"]);
  });

  it("partially covers the last period it reaches when underpaying (the waterfall scenario)", () => {
    const result = waterfallAllocate(new Decimal(4000), [new Decimal(1500), new Decimal(1500), new Decimal(1500)]);
    expect(result.map((d) => d.toString())).toEqual(["1500", "1500", "1000"]);
  });

  it("allocates nothing to periods beyond what the payment covers", () => {
    const result = waterfallAllocate(new Decimal(1500), [new Decimal(1500), new Decimal(1500), new Decimal(1500)]);
    expect(result.map((d) => d.toString())).toEqual(["1500", "0", "0"]);
  });

  it("caps allocation at each period's remaining due, never over-allocating a single period", () => {
    // Simulates a period that's already partially paid elsewhere (remaining due < full amount).
    const result = waterfallAllocate(new Decimal(2000), [new Decimal(500), new Decimal(1500)]);
    expect(result.map((d) => d.toString())).toEqual(["500", "1500"]);
  });

  it("handles an overpayment gracefully -- excess is simply not allocated anywhere", () => {
    const result = waterfallAllocate(new Decimal(10000), [new Decimal(1500), new Decimal(1500)]);
    expect(result.map((d) => d.toString())).toEqual(["1500", "1500"]);
  });

  it("returns an empty array for zero periods", () => {
    expect(waterfallAllocate(new Decimal(1500), [])).toEqual([]);
  });

  it("allocates zero to every period for a zero-amount payment", () => {
    const result = waterfallAllocate(new Decimal(0), [new Decimal(1500), new Decimal(1500)]);
    expect(result.map((d) => d.toString())).toEqual(["0", "0"]);
  });

  it("treats a negative remaining-due (already overpaid) as zero, not negative allocation", () => {
    const result = waterfallAllocate(new Decimal(1500), [new Decimal(-500), new Decimal(1500)]);
    expect(result.map((d) => d.toString())).toEqual(["0", "1500"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/unit/allocation.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/fees/allocation'`.

- [ ] **Step 3: Implement `src/lib/fees/allocation.ts`**

```ts
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Waterfall-allocates a single payment across an ordered list of periods'
 * remaining due amounts: the first period is filled up to its remaining due
 * first, with any leftover spilling into the next, and so on. Amounts
 * already fully paid should be passed in as 0 (or negative, from an
 * overpayment elsewhere) -- either way this function only ever allocates
 * min(remaining payment, remaining due) to each period, never negative.
 */
export function waterfallAllocate(paymentAmount: Decimal, remainingDues: Decimal[]): Decimal[] {
  let remaining = paymentAmount;
  const allocations: Decimal[] = [];
  for (const due of remainingDues) {
    const dueClamped = Decimal.max(due, 0);
    const alloc = Decimal.max(Decimal.min(remaining, dueClamped), 0);
    allocations.push(alloc);
    remaining = remaining.minus(alloc);
  }
  return allocations;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/unit/allocation.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add waterfall payment allocation with unit tests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Fee history composition + next-unpaid-period helper (TDD) ✅ DONE (commit 72ca178, through two rounds of a real money-correctness fix: 128239c/fee7d02 fixed same-coverageStart order-sensitivity but missed a nested-no-shared-edge case, found in review; d2eaa3a/e7b58e3 generalized the sort to coverageEnd-ascending/coverageStart-descending, verified via 270,000+ randomized adversarial trials against a max-flow ground truth with zero counter-examples; d0b2850/ea10091 promoted that verification into a permanent permutation test and softened a forward reference to Task 7, which doesn't exist yet)

**Files:**
- Create: `src/lib/fees/fee-history.ts`
- Create: `tests/unit/fee-history.test.ts`

**Dependency note:** `periods.ts` (Task 2) now exports its UTC-safe `startOfMonth` (alongside `endOfMonth`/`addMonths`). This task's `getCoverageStartForNewPayment` fallback branch must import `startOfMonth` from `./periods`, not from `date-fns` directly -- date-fns's version operates in local time and would reintroduce the exact bug Task 2 fixed.

This composes Tasks 2 and 3 into the two functions the rest of the app actually calls: `computeFeeHistory` (for display) and `getCoverageStartForNewPayment` (for the Add Payment form's default coverage start).

- [ ] **Step 1: Write the failing tests in `tests/unit/fee-history.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { computeFeeHistory, getCoverageStartForNewPayment, type PaymentForAllocation } from "@/lib/fees/fee-history";

const PLAN_START = new Date("2026-06-01");
const TODAY = new Date("2026-09-04"); // periods: June, July, August, September

function payment(overrides: Partial<PaymentForAllocation>): PaymentForAllocation {
  return {
    amount: new Decimal(1500),
    paymentDate: new Date("2026-06-05"),
    coverageStart: new Date("2026-06-01"),
    coverageEnd: new Date("2026-06-30"),
    ...overrides,
  };
}

describe("computeFeeHistory", () => {
  it("marks fully-paid periods as PAID and totals correctly with no payments at all", () => {
    const { periods, totalPaid, totalPending } = computeFeeHistory(
      PLAN_START,
      "MONTHLY",
      new Decimal(1500),
      [],
      TODAY
    );
    expect(periods).toHaveLength(4);
    periods.forEach((p) => expect(p.status).toBe(p.dueDate < TODAY ? "OVERDUE" : "DUE"));
    expect(totalPaid.toString()).toBe("0");
    expect(totalPending.toString()).toBe("6000"); // 4 x 1500
  });

  it("applies a single-period payment to just that period", () => {
    const payments = [payment({})]; // June only
    const { periods, totalPaid } = computeFeeHistory(PLAN_START, "MONTHLY", new Decimal(1500), payments, TODAY);
    expect(periods[0].status).toBe("PAID");
    expect(periods[0].amountPaid.toString()).toBe("1500");
    expect(periods[1].status).toBe("OVERDUE"); // July, unpaid, past due
    expect(totalPaid.toString()).toBe("1500");
  });

  it("waterfall-applies a multi-period payment across the periods it covers", () => {
    const payments = [
      payment({
        amount: new Decimal(4000),
        coverageStart: new Date("2026-06-01"),
        coverageEnd: new Date("2026-08-31"), // June, July, August
      }),
    ];
    const { periods, totalPaid, totalPending } = computeFeeHistory(
      PLAN_START,
      "MONTHLY",
      new Decimal(1500),
      payments,
      TODAY
    );
    expect(periods[0].status).toBe("PAID"); // June: 1500 of 1500
    expect(periods[1].status).toBe("PAID"); // July: 1500 of 1500
    expect(periods[2].status).toBe("PARTIAL"); // August: 1000 of 1500
    expect(periods[2].amountPaid.toString()).toBe("1000");
    expect(periods[3].status).toBe("DUE"); // September: untouched, not yet overdue since it's the current period
    expect(totalPaid.toString()).toBe("4000");
    expect(totalPending.toString()).toBe("2000"); // 500 (Aug) + 1500 (Sep)
  });

  it("combines two payments landing on the same period (a partial top-up)", () => {
    const payments = [
      payment({ amount: new Decimal(1000) }), // June, partial
      payment({ amount: new Decimal(500), paymentDate: new Date("2026-06-20") }), // June, top-up
    ];
    const { periods } = computeFeeHistory(PLAN_START, "MONTHLY", new Decimal(1500), payments, TODAY);
    expect(periods[0].status).toBe("PAID");
    expect(periods[0].amountPaid.toString()).toBe("1500");
  });

  it("ignores a payment whose coverage range doesn't overlap any enumerated period", () => {
    const payments = [payment({ coverageStart: new Date("2027-01-01"), coverageEnd: new Date("2027-01-31") })];
    const { periods, totalPaid } = computeFeeHistory(PLAN_START, "MONTHLY", new Decimal(1500), payments, TODAY);
    periods.forEach((p) => expect(p.amountPaid.toString()).toBe("0"));
    expect(totalPaid.toString()).toBe("0");
  });

  it("doesn't lose money when a wide payment is logged with an earlier paymentDate than a narrow payment covering the same period (order-independence)", () => {
    // June only, partial -- e.g. a delayed cash payment backdated to when it was actually received.
    const narrowPayment = payment({
      amount: new Decimal(800),
      coverageStart: new Date("2026-06-01"),
      coverageEnd: new Date("2026-06-30"),
    });
    // June-August, enough to cover the rest -- logged after the narrow payment but with an earlier paymentDate.
    const widePayment = payment({
      amount: new Decimal(3000),
      coverageStart: new Date("2026-06-01"),
      coverageEnd: new Date("2026-08-31"),
    });
    const expectedTotalPaid = "3800"; // 800 + 3000, regardless of ordering

    const wideLoggedFirstButDatedEarlier = [
      { ...widePayment, paymentDate: new Date("2026-06-01") },
      { ...narrowPayment, paymentDate: new Date("2026-06-10") },
    ];
    const narrowLoggedFirstAndDatedEarlier = [
      { ...narrowPayment, paymentDate: new Date("2026-06-01") },
      { ...widePayment, paymentDate: new Date("2026-06-10") },
    ];

    const resultA = computeFeeHistory(PLAN_START, "MONTHLY", new Decimal(1500), wideLoggedFirstButDatedEarlier, TODAY);
    const resultB = computeFeeHistory(PLAN_START, "MONTHLY", new Decimal(1500), narrowLoggedFirstAndDatedEarlier, TODAY);

    expect(resultA.totalPaid.toString()).toBe(expectedTotalPaid);
    expect(resultB.totalPaid.toString()).toBe(expectedTotalPaid);
  });

  it("doesn't lose money when a narrow payment is nested inside a wide payment's range that starts earlier (coverageStart-ascending is not enough)", () => {
    // June-August, wide -- coverageStart is EARLIER than the narrow payment's,
    // so a coverageStart-ascending sort would still process this one first.
    // Sized (3700) so that together with the narrow payment's 800 it exactly
    // fills June+July+August's combined due (4500), leaving no overpayment
    // residue to muddy the order-independence check.
    const widePayment = payment({
      amount: new Decimal(3700),
      coverageStart: new Date("2026-06-01"),
      coverageEnd: new Date("2026-08-31"),
    });
    // July only, nested inside the wide payment's range starting at the
    // SECOND period (not the first) -- this is the newly-found adversarial
    // case: coverageEnd (end of July) is earlier than the wide payment's
    // (end of August), so it must still be processed first despite its
    // coverageStart being later.
    const narrowPayment = payment({
      amount: new Decimal(800),
      coverageStart: new Date("2026-07-01"),
      coverageEnd: new Date("2026-07-31"),
    });
    const expectedTotalPaid = "4500"; // 3700 + 800, regardless of ordering

    const wideLoggedFirst = [
      { ...widePayment, paymentDate: new Date("2026-06-05") },
      { ...narrowPayment, paymentDate: new Date("2026-07-10") },
    ];
    const narrowLoggedFirst = [
      { ...narrowPayment, paymentDate: new Date("2026-06-05") },
      { ...widePayment, paymentDate: new Date("2026-07-10") },
    ];

    const resultA = computeFeeHistory(PLAN_START, "MONTHLY", new Decimal(1500), wideLoggedFirst, TODAY);
    const resultB = computeFeeHistory(PLAN_START, "MONTHLY", new Decimal(1500), narrowLoggedFirst, TODAY);

    for (const result of [resultA, resultB]) {
      expect(result.totalPaid.toString()).toBe(expectedTotalPaid);
      // June: fully paid (1500) out of the wide payment's 3700.
      expect(result.periods[0].amountPaid.toString()).toBe("1500");
      expect(result.periods[0].status).toBe("PAID");
      // July: the narrow payment claims it first (800), then the wide
      // payment's spillover (700 of its remaining 2200) tops it up to fully
      // paid (1500) -- if the wide payment had been processed first instead,
      // it would have consumed July's whole 1500 due itself, leaving nothing
      // for the narrow payment's 800 to apply to (the bug this test guards
      // against).
      expect(result.periods[1].amountPaid.toString()).toBe("1500");
      expect(result.periods[1].status).toBe("PAID");
      // August: fully paid (1500) by the wide payment's remaining spillover.
      expect(result.periods[2].amountPaid.toString()).toBe("1500");
      expect(result.periods[2].status).toBe("PAID");
    }
  });
});

describe("getCoverageStartForNewPayment", () => {
  it("starts at the first unpaid (partial or untouched) period", () => {
    const payments = [payment({})]; // June fully paid
    const start = getCoverageStartForNewPayment(PLAN_START, "MONTHLY", new Decimal(1500), payments, TODAY);
    expect(start.toISOString().slice(0, 10)).toBe("2026-07-01"); // July, first unpaid
  });

  it("starts at the current period when nothing has been paid yet", () => {
    const start = getCoverageStartForNewPayment(PLAN_START, "MONTHLY", new Decimal(1500), [], TODAY);
    expect(start.toISOString().slice(0, 10)).toBe("2026-06-01");
  });

  it("advances past all enumerated periods (pays ahead) once everything up to today is fully paid", () => {
    const payments = [
      payment({ coverageStart: new Date("2026-06-01"), coverageEnd: new Date("2026-09-30"), amount: new Decimal(6000) }),
    ];
    const start = getCoverageStartForNewPayment(PLAN_START, "MONTHLY", new Decimal(1500), payments, TODAY);
    expect(start.toISOString().slice(0, 10)).toBe("2026-10-01"); // October, one past the last enumerated (September)
  });

  it("starts at the plan's own start date for a CUSTOM plan with no payments yet", () => {
    const customStart = new Date("2026-09-01");
    const start = getCoverageStartForNewPayment(customStart, "CUSTOM", new Decimal(5000), [], TODAY);
    expect(start).toEqual(customStart);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/unit/fee-history.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/fees/fee-history'`.

- [ ] **Step 3: Implement `src/lib/fees/fee-history.ts`**

```ts
import { Decimal } from "@prisma/client/runtime/library";
import type { FeeFrequency } from "@prisma/client";
import {
  enumeratePeriods,
  calculatePeriodStatus,
  advancePeriodStart,
  startOfMonth,
  type Period,
  type PeriodStatus,
} from "./periods";
import { waterfallAllocate } from "./allocation";

// Re-exported so consumers (fee-history-table.tsx, fees-list.tsx) can import
// both the composed types and the base PeriodStatus from this one module.
export type { PeriodStatus } from "./periods";

export type PeriodWithStatus = Period & {
  amountPaid: Decimal;
  status: PeriodStatus;
};

export type PaymentForAllocation = {
  amount: Decimal;
  paymentDate: Date;
  coverageStart: Date;
  coverageEnd: Date;
};

/**
 * Scoping note on the allocation order below: it is proven correct (money-
 * conserving and order-independent) for nested ranges and for ranges that
 * share a coverageStart or coverageEnd -- which is all that this app's own
 * `createPayment` action (Task 7) can ever produce, since it always derives
 * a new payment's coverageStart from `getCoverageStartForNewPayment` below
 * rather than letting an admin type in an arbitrary range. It also happens
 * to handle genuinely crossing ranges (e.g. one payment covering Jun-Aug and
 * another covering Jul-Sep, neither a subset of the other) correctly in every
 * scenario tested, but that has NOT been formally proven optimal for
 * arbitrary adversarial crossing-range configurations in general -- doing so
 * would require a max-flow-style allocation algorithm, which isn't warranted
 * given the bounded way payments are actually created in this app.
 */
export function computeFeeHistory(
  planStartDate: Date,
  frequency: FeeFrequency,
  amountPerPeriod: Decimal,
  payments: PaymentForAllocation[],
  today: Date
): { periods: PeriodWithStatus[]; totalPaid: Decimal; totalPending: Decimal } {
  const periods = enumeratePeriods(planStartDate, frequency, amountPerPeriod, today);
  const paidPerPeriod = periods.map(() => new Decimal(0));

  // Sort by coverageEnd ascending (then coverageStart DESCENDING, then
  // paymentDate as a final tiebreak) -- NOT by paymentDate, and NOT by
  // coverageStart ascending either. A payment's coverage range determines
  // which periods it can settle, so processing order must be tied to which
  // period a payment is fundamentally FOR, not to when it was typed into the
  // system. The key idea is "least flexibility first": a payment whose
  // coverage runs out soonest (earliest coverageEnd) has the fewest periods
  // it could possibly apply to, so it should get first claim on those
  // periods before a payment with a later coverageEnd -- which has more
  // remaining periods to potentially spill into -- gets a chance to consume
  // them. When two payments share the same coverageEnd, the one with the
  // LATER coverageStart is a strict subset (nested, sharing the right edge)
  // of the one with the earlier coverageStart, so it is even less flexible
  // and should still be processed first; hence coverageStart descending as
  // the secondary key.
  //
  // coverageStart ascending (what an earlier fix used) is NOT sufficient: it
  // fixes the case where two payments share the same coverageStart, but it
  // does nothing when a wide payment's coverageStart is EARLIER than a
  // narrower payment nested later inside its range -- the primary sort key
  // already differs there, so the tiebreakers never engage, and the wide
  // payment still gets processed first, silently dropping the narrow
  // payment's money. coverageEnd ascending fixes both cases uniformly.
  //
  // Concrete example (originally-reported bug, still fixed by this ordering):
  // a plan with Sep/Oct/Nov each due 1500, a narrow payment (800, Sep only)
  // and a wide payment (3000, Sep-Nov). If the wide payment is logged with an
  // earlier paymentDate than the narrow one (e.g. an admin backdates a
  // delayed cash payment to when it was actually received, landing earlier
  // than a payment already logged in the interim), sorting by paymentDate
  // would process the wide payment first -- it would fully consume
  // Sep/Oct/Nov's dues with its own 3000, leaving the narrow payment's 800
  // with nowhere left to go within its own range, silently dropping it from
  // totalPaid (3000 instead of the correct 3800). Sorting by coverageEnd
  // means the narrow, Sep-only payment (coverageEnd = end of Sep) always
  // claims Sep before the wider payment (coverageEnd = end of Nov) can spill
  // into it, regardless of data-entry order or where each payment's range
  // starts. Do not "simplify" this back to a plain paymentDate or
  // coverageStart-ascending sort.
  const sortedPayments = [...payments].sort((a, b) => {
    const endDiff = a.coverageEnd.getTime() - b.coverageEnd.getTime();
    if (endDiff !== 0) return endDiff;
    const startDiff = b.coverageStart.getTime() - a.coverageStart.getTime(); // descending
    if (startDiff !== 0) return startDiff;
    return a.paymentDate.getTime() - b.paymentDate.getTime();
  });
  for (const pay of sortedPayments) {
    const coveredIndices = periods
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.start <= pay.coverageEnd && p.end >= pay.coverageStart)
      .map(({ i }) => i);

    if (coveredIndices.length === 0) continue;

    const remainingDues = coveredIndices.map((i) => periods[i].amountDue.minus(paidPerPeriod[i]));
    const allocations = waterfallAllocate(pay.amount, remainingDues);
    coveredIndices.forEach((i, k) => {
      paidPerPeriod[i] = paidPerPeriod[i].plus(allocations[k]);
    });
  }

  const withStatus: PeriodWithStatus[] = periods.map((p, i) => ({
    ...p,
    amountPaid: paidPerPeriod[i],
    status: calculatePeriodStatus(p.amountDue, paidPerPeriod[i], p.dueDate, today),
  }));

  const totalPaid = paidPerPeriod.reduce((sum, p) => sum.plus(p), new Decimal(0));
  const totalDue = periods.reduce((sum, p) => sum.plus(p.amountDue), new Decimal(0));
  const totalPending = Decimal.max(totalDue.minus(totalPaid), 0);

  return { periods: withStatus, totalPaid, totalPending };
}

/**
 * Where a new payment should start covering from: the first period that
 * isn't fully PAID yet, or -- if every enumerated period is fully paid --
 * one period past the last enumerated period (paying ahead of schedule).
 */
export function getCoverageStartForNewPayment(
  planStartDate: Date,
  frequency: FeeFrequency,
  amountPerPeriod: Decimal,
  payments: PaymentForAllocation[],
  today: Date
): Date {
  const { periods } = computeFeeHistory(planStartDate, frequency, amountPerPeriod, payments, today);

  const firstUnpaid = periods.find((p) => p.status !== "PAID");
  if (firstUnpaid) return firstUnpaid.start;

  if (periods.length === 0) {
    return frequency === "CUSTOM" ? planStartDate : startOfMonth(planStartDate);
  }

  const last = periods[periods.length - 1];
  if (frequency === "CUSTOM") return last.start; // one-time fee, already paid -- no further periods
  return advancePeriodStart(last.start, frequency);
}
```

**Post-Task-6 update:** the body above (from `const firstUnpaid = ...` through the end) was extracted into a separately-exported `nextCoverageStartFromPeriods(periods, planStartDate, frequency)` when Task 6's review found `getStudentFeeHistory` was triggering a redundant second `computeFeeHistory` pass by calling this function. `getCoverageStartForNewPayment` now just calls `computeFeeHistory` once and delegates to that extracted function -- same behavior, existing tests below unchanged. See Task 6 for the final code.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/unit/fee-history.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Run the full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all pre-existing tests plus these three new files' tests all pass (check the count against what was passing before this task — should be the prior total plus the tests added in Tasks 2-4).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add fee history composition and next-unpaid-period helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Validation schemas ✅ DONE (commit 858fc9a, added a periodsCovered upper bound in 34599ba — review flagged no fat-finger guard against an accidental extra digit; also updated Task 9's periodsCovered input with a matching max={60})

**Files:**
- Create: `src/lib/validations/fee-plan.ts`
- Create: `src/lib/validations/payment.ts`

- [ ] **Step 1: Write `src/lib/validations/fee-plan.ts`**

```ts
import { z } from "zod";

export const feePlanSchema = z.object({
  totalAmount: z.coerce.number().positive("Total amount must be greater than zero"),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]),
  dueDate: z.coerce.date(),
  discount: z.coerce.number().min(0, "Discount cannot be negative").default(0),
}).refine((data) => data.discount <= data.totalAmount, {
  message: "Discount cannot exceed the total amount",
  path: ["discount"],
});

export type FeePlanInput = z.infer<typeof feePlanSchema>;
```

- [ ] **Step 2: Write `src/lib/validations/payment.ts`**

```ts
import { z } from "zod";

export const paymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  paymentDate: z.coerce.date(),
  mode: z.enum(["CASH", "UPI", "ONLINE", "BANK_TRANSFER"]),
  // Upper bound is a fat-finger guard, not a business rule: even at MONTHLY
  // frequency, 60 periods is 5 years paid in advance, comfortably past any
  // real use case, while still catching an accidental extra digit (e.g.
  // "9999" instead of "1") from silently producing a coverageEnd many
  // millennia in the future.
  periodsCovered: z.coerce
    .number()
    .int()
    .min(1, "Must cover at least 1 period")
    .max(60, "Must cover 60 periods or fewer"),
  notes: z.string().optional(),
});

export type PaymentInput = z.infer<typeof paymentSchema>;
```

- [ ] **Step 3: Add unit tests for the trickier validation rule in `tests/unit/fee-plan-validation.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { feePlanSchema } from "@/lib/validations/fee-plan";

const validInput = {
  totalAmount: 1500,
  frequency: "MONTHLY" as const,
  dueDate: "2026-09-01",
  discount: 0,
};

describe("feePlanSchema", () => {
  it("accepts a valid plan", () => {
    expect(feePlanSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects a zero or negative total amount", () => {
    expect(feePlanSchema.safeParse({ ...validInput, totalAmount: 0 }).success).toBe(false);
    expect(feePlanSchema.safeParse({ ...validInput, totalAmount: -100 }).success).toBe(false);
  });

  it("rejects a discount larger than the total amount", () => {
    expect(feePlanSchema.safeParse({ ...validInput, totalAmount: 1000, discount: 1500 }).success).toBe(false);
  });

  it("accepts a discount exactly equal to the total amount (free plan)", () => {
    expect(feePlanSchema.safeParse({ ...validInput, totalAmount: 1000, discount: 1000 }).success).toBe(true);
  });

  it("defaults discount to 0 when omitted", () => {
    const { discount, ...withoutDiscount } = validInput;
    const result = feePlanSchema.safeParse(withoutDiscount);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.discount).toBe(0);
  });
});
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/unit/fee-plan-validation.test.ts
```

Expected: PASS, 5 tests.

**Also add `tests/unit/payment-validation.test.ts`** covering `paymentSchema`'s `periodsCovered` bound specifically (accepts 1, accepts the upper bound 60, rejects 0, rejects above 60/a fat-fingered value like 9999) — a code review flagged that `periodsCovered` had no upper bound, risking a coverageEnd many millennia in the future from an accidental extra digit; the schema above already includes the `.max(60, ...)` fix.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add fee plan and payment validation schemas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Fee queries (server-only reads) ✅ DONE (commit b727f69, fixed in 67be50c -- review flagged missing soft-delete scoping on student-keyed lookups, a redundant double `computeFeeHistory` pass in `getStudentFeeHistory`, and a future-dated plan being mislabeled `"DUE"` instead of a distinct `"NOT_STARTED"`)

**Files:**
- Create: `src/lib/queries/fees.ts`
- Also touched (fix): `src/lib/fees/fee-history.ts` -- extracted `nextCoverageStartFromPeriods` so `getStudentFeeHistory` can reuse an already-computed `periods` array instead of triggering a second full `computeFeeHistory` pass via `getCoverageStartForNewPayment`

- [x] **Step 1: Write `src/lib/queries/fees.ts`**

```ts
// Read-only queries, not mutations -- lives outside src/actions/ (which is
// "use server") so these can never be called as Server Actions from client
// code. "server-only" makes any client-side value import a build error;
// client components that need a return type should use `import type`
// instead (see src/components/classes/courses-list.tsx for the pattern).
import "server-only";

import { prisma } from "@/lib/db";
import { computeFeeHistory, nextCoverageStartFromPeriods } from "@/lib/fees/fee-history";

export async function getStudentFeeHistory(studentId: string) {
  const plan = await prisma.feePlan.findUnique({
    where: { studentId, student: { deletedAt: null } },
    include: { payments: true },
  });
  if (!plan) return null;

  const today = new Date();
  const { periods, totalPaid, totalPending } = computeFeeHistory(
    plan.dueDate,
    plan.frequency,
    plan.finalAmount,
    plan.payments,
    today
  );
  const nextCoverageStart = nextCoverageStartFromPeriods(periods, plan.dueDate, plan.frequency);

  return { plan, periods, totalPaid, totalPending, nextCoverageStart };
}

export async function getFeePlan(studentId: string) {
  return prisma.feePlan.findUnique({ where: { studentId, student: { deletedAt: null } } });
}

export async function listStudentFeeStatuses() {
  const students = await prisma.student.findMany({
    where: { deletedAt: null },
    include: { feePlan: { include: { payments: true } } },
    orderBy: { name: "asc" },
  });

  const today = new Date();
  return students.map((student) => {
    if (!student.feePlan) {
      return {
        studentId: student.id,
        studentCode: student.studentCode,
        name: student.name,
        hasPlan: false as const,
      };
    }

    const { periods, totalPending } = computeFeeHistory(
      student.feePlan.dueDate,
      student.feePlan.frequency,
      student.feePlan.finalAmount,
      student.feePlan.payments,
      today
    );
    const currentPeriod = periods[periods.length - 1];

    return {
      studentId: student.id,
      studentCode: student.studentCode,
      name: student.name,
      hasPlan: true as const,
      // NOT_STARTED (not the shared PeriodStatus union) when a plan's start
      // date is still in the future and enumeratePeriods yields no periods
      // yet -- distinct from DUE so a not-yet-started plan doesn't read as
      // "payment owed".
      status: currentPeriod?.status ?? ("NOT_STARTED" as const),
      totalPending,
    };
  });
}

export async function getPayment(paymentId: string) {
  return prisma.payment.findUnique({
    where: { id: paymentId },
    include: { student: true, receipt: true, feePlan: true },
  });
}
```

`getCoverageStartForNewPayment` in `src/lib/fees/fee-history.ts` was refactored (behavior-preserving, existing tests unchanged) to delegate to the new exported `nextCoverageStartFromPeriods(periods, planStartDate, frequency)`, so callers that already have `periods` from a `computeFeeHistory` call don't pay for a second sort + waterfall-allocation pass.

- [x] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "Add fee queries: student fee history, plan lookup, fee status list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Fee actions (mutations) ✅ DONE (commit 634799a, fixed in 496b791 -- review flagged `saveFeePlan` missing a `/dashboard` revalidatePath despite being the sole writer of `FeePlan.finalAmount` [which the dashboard's pendingFees aggregate reads], and both actions missing a soft-delete guard on their student lookup -- an extended where-unique filter alone would be insufficient since `upsert`'s `create` branch has no soft-delete awareness, so an explicit `prisma.student.findUnique({ where: { id, deletedAt: null } })` guard was added to the top of both functions instead)

**Files:**
- Create: `src/actions/fees.ts`

- [x] **Step 1: Write `src/actions/fees.ts`**

```ts
"use server";

import { prisma } from "@/lib/db";
import { generateReceiptNumber } from "@/lib/ids";
import { feePlanSchema, type FeePlanInput } from "@/lib/validations/fee-plan";
import { paymentSchema, type PaymentInput } from "@/lib/validations/payment";
import { getCoverageStartForNewPayment } from "@/lib/fees/fee-history";
import { computeCoverageRange } from "@/lib/fees/periods";
import { revalidatePath } from "next/cache";

export async function saveFeePlan(studentId: string, input: FeePlanInput) {
  const data = feePlanSchema.parse(input);

  const student = await prisma.student.findUnique({
    where: { id: studentId, deletedAt: null },
    select: { id: true },
  });
  if (!student) {
    throw new Error("Student not found.");
  }

  const finalAmount = data.totalAmount - data.discount;

  await prisma.feePlan.upsert({
    where: { studentId },
    create: {
      studentId,
      totalAmount: data.totalAmount,
      frequency: data.frequency,
      dueDate: data.dueDate,
      discount: data.discount,
      finalAmount,
    },
    update: {
      totalAmount: data.totalAmount,
      frequency: data.frequency,
      dueDate: data.dueDate,
      discount: data.discount,
      finalAmount,
    },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/fees");
  revalidatePath("/dashboard");
}

export async function createPayment(studentId: string, input: PaymentInput) {
  const data = paymentSchema.parse(input);

  const student = await prisma.student.findUnique({
    where: { id: studentId, deletedAt: null },
    select: { id: true },
  });
  if (!student) {
    throw new Error("Student not found.");
  }

  const plan = await prisma.feePlan.findUnique({
    where: { studentId },
    include: { payments: true },
  });
  if (!plan) {
    throw new Error("This student doesn't have a fee plan set up yet.");
  }

  const today = new Date();
  const coverageStartBase = getCoverageStartForNewPayment(
    plan.dueDate,
    plan.frequency,
    plan.finalAmount,
    plan.payments,
    today
  );
  const { coverageStart, coverageEnd } = computeCoverageRange(coverageStartBase, data.periodsCovered, plan.frequency);
  const receiptNumber = await generateReceiptNumber();

  const payment = await prisma.payment.create({
    data: {
      studentId,
      feePlanId: plan.id,
      amount: data.amount,
      paymentDate: data.paymentDate,
      mode: data.mode,
      coverageStart,
      coverageEnd,
      notes: data.notes || null,
      receipt: { create: { receiptNumber } },
    },
    include: { receipt: true },
  });

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/fees");
  revalidatePath("/dashboard");

  return payment;
}
```

- [x] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "Add fee plan and payment server actions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Fee Plan form dialog ✅ DONE (commit ad392fc, refined in f295fcf -- `feePlanSchema`'s `discount: .default(0)` makes zod's input/output types diverge, which broke the plan's literal `useForm<FeePlanInput>(...)` under `zodResolver`; fixed with react-hook-form's 3-generic `useForm<TFieldValues, TContext, TTransformedValues>` form instead of dropping the default [a test locks in the default-to-0 behavior]; review separately flagged the derived "Final Payable" preview relying on implicit string-arithmetic coercion from unregistered-as-number inputs, made explicit via `Number(watch(...))` even though the reachable failure case was verified not to actually misbehave)

**Files:**
- Create: `src/components/fees/fee-plan-form-dialog.tsx`

- [x] **Step 1: Write `src/components/fees/fee-plan-form-dialog.tsx`**

Follow `src/components/classes/course-form-dialog.tsx`'s exact pattern (`useGuardedDialogOpenChange`, `showCloseButton={!submitting}`, `useEffect`+`reset()` re-seed, `onSuccess` callback, fields `disabled={submitting}`):

```tsx
"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { feePlanSchema, type FeePlanInput } from "@/lib/validations/fee-plan";
import { saveFeePlan } from "@/actions/fees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGuardedDialogOpenChange } from "@/hooks/use-guarded-dialog";
import { toast } from "sonner";

type ExistingFeePlan = {
  totalAmount: number;
  frequency: FeePlanInput["frequency"];
  dueDate: Date;
  discount: number;
};

// feePlanSchema's `discount` has a schema-level `.default(0)` (kept because
// tests/unit/fee-plan-validation.test.ts locks in that behavior for
// safeParse callers), which makes discount optional on zod's *input* type
// but required on its *output* type (FeePlanInput = z.infer, the output).
// zodResolver's Resolver is typed against the input side, so
// useForm<FeePlanInput> alone doesn't type-check (student.ts's dob/joiningDate
// comment covers the same class of bug, solved there by dropping the
// schema-level default -- not an option here since a test depends on it).
// react-hook-form's 3-generic useForm<TFieldValues, TContext, TTransformedValues>
// exists for exactly this: form fields are typed against the input shape,
// while handleSubmit's callback still receives the resolved output shape.
type FeePlanFormValues = z.input<typeof feePlanSchema>;

function defaultsFor(plan?: ExistingFeePlan): FeePlanInput {
  return plan
    ? { totalAmount: plan.totalAmount, frequency: plan.frequency, dueDate: plan.dueDate, discount: plan.discount }
    : { totalAmount: 0, frequency: "MONTHLY", dueDate: new Date(), discount: 0 };
}

// <input type="date"> only accepts a "yyyy-MM-dd" string; a register()-based
// uncontrolled input assigning a raw Date to its DOM .value gets rejected by
// the browser, leaving the field blank. Same fix Phase 1's student-form.tsx
// already applies to dob/joiningDate: make the field controlled via
// watch()/setValue(), guarding against an invalid/absent Date so this never
// throws on .toISOString().
function toDateInputValue(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function FeePlanFormDialog({
  open,
  onOpenChange,
  studentId,
  plan,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  plan?: ExistingFeePlan;
  onSuccess?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FeePlanFormValues, unknown, FeePlanInput>({
    resolver: zodResolver(feePlanSchema),
    defaultValues: defaultsFor(plan),
  });

  useEffect(() => {
    if (open) reset(defaultsFor(plan));
  }, [open, plan, reset]);

  // watch() returns the raw (unregistered-as-number) DOM input value until
  // submit-time zod coercion runs, so this can be a string -- Number(...)
  // makes the conversion explicit rather than relying on `-`'s implicit
  // string coercion (which happens to floor out safely via Math.max below,
  // but only by accident).
  const totalAmount = Number(watch("totalAmount")) || 0;
  const discount = Number(watch("discount")) || 0;
  const finalAmount = Math.max(totalAmount - discount, 0);

  async function onSubmit(data: FeePlanInput) {
    setSubmitting(true);
    try {
      await saveFeePlan(studentId, data);
      toast.success(plan ? "Fee plan updated" : "Fee plan created");
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
          <DialogTitle>{plan ? "Edit Fee Plan" : "Set Up Fee Plan"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="totalAmount">Total Fee Amount (₹)</Label>
            <Input id="totalAmount" type="number" step="0.01" {...register("totalAmount")} disabled={submitting} />
            {errors.totalAmount && <p className="text-sm text-danger">{errors.totalAmount.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select
              value={watch("frequency")}
              onValueChange={(v) => setValue("frequency", v as FeePlanInput["frequency"])}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
                <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                <SelectItem value="YEARLY">Yearly</SelectItem>
                <SelectItem value="CUSTOM">Custom (one-time)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dueDate">Start Date</Label>
            <Input
              id="dueDate"
              type="date"
              value={toDateInputValue(watch("dueDate"))}
              onChange={(e) =>
                setValue("dueDate", (e.target.value || undefined) as unknown as Date, { shouldValidate: true })
              }
              disabled={submitting}
            />
            {errors.dueDate && <p className="text-sm text-danger">{String(errors.dueDate.message)}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="discount">Discount (₹)</Label>
            <Input id="discount" type="number" step="0.01" {...register("discount")} disabled={submitting} />
            {errors.discount && <p className="text-sm text-danger">{errors.discount.message}</p>}
          </div>
          <div className="glass-card p-3 text-sm text-muted">
            Final Payable: <span className="text-gold">₹{finalAmount.toLocaleString("en-IN")}</span> per period
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving..." : "Save Fee Plan"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [x] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean (this component isn't wired into any page yet — Task 10 does that — so there's nothing to click through yet, just confirm no type errors).

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "Add fee plan form dialog

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Add Payment dialog ✅ DONE (commit d9d908f, fixed in 23d4647 -- review found `watch("periodsCovered") || 1` was a real bug, not just a robustness nit like Task 8's analogous case: a typed "0" is a truthy string that bypasses the `|| 1` fallback, producing a backwards coverage-preview range; fixed with `Number(watch(...)) || 1`, matching the convention established in Task 8's fee-plan-form-dialog.tsx)

**Files:**
- Create: `src/components/fees/add-payment-dialog.tsx`

- [x] **Step 1: Write `src/components/fees/add-payment-dialog.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { paymentSchema, type PaymentInput } from "@/lib/validations/payment";
import { computeCoverageRange, formatMonthYear } from "@/lib/fees/periods";
import { createPayment } from "@/actions/fees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGuardedDialogOpenChange } from "@/hooks/use-guarded-dialog";
import { toast } from "sonner";
import type { FeeFrequency } from "@prisma/client";

function defaults(): PaymentInput {
  return { amount: 0, paymentDate: new Date(), mode: "CASH", periodsCovered: 1, notes: "" };
}

// Same controlled-date-field fix as fee-plan-form-dialog.tsx / Phase 1's
// student-form.tsx: <input type="date"> rejects a raw Date assigned via
// register(), so this must be controlled via watch()/setValue() with a
// guarded ISO-string conversion.
function toDateInputValue(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function AddPaymentDialog({
  open,
  onOpenChange,
  studentId,
  frequency,
  nextCoverageStart,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  frequency: FeeFrequency;
  nextCoverageStart: Date;
  onSuccess?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: defaults(),
  });

  useEffect(() => {
    if (open) reset(defaults());
  }, [open, reset]);

  // watch() returns the raw (unregistered-as-number) DOM input value until
  // submit-time zod coercion runs. Number(...) makes the conversion explicit
  // (matching fee-plan-form-dialog.tsx's convention) -- without it, a typed
  // "0" is a truthy string that bypasses the `|| 1` fallback and produces a
  // backwards coverage range (0 months added, i.e. end before start).
  const periodsCovered = Number(watch("periodsCovered")) || 1;
  const coveragePreview = useMemo(() => {
    if (frequency === "CUSTOM") return "One-time fee";
    const { coverageStart, coverageEnd } = computeCoverageRange(nextCoverageStart, periodsCovered, frequency);
    const startLabel = formatMonthYear(coverageStart);
    const endLabel = formatMonthYear(coverageEnd);
    return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
  }, [frequency, nextCoverageStart, periodsCovered]);

  async function onSubmit(data: PaymentInput) {
    setSubmitting(true);
    try {
      await createPayment(studentId, data);
      toast.success("Payment recorded");
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
          <DialogTitle>Add Payment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (₹)</Label>
            <Input id="amount" type="number" step="0.01" {...register("amount")} disabled={submitting} />
            {errors.amount && <p className="text-sm text-danger">{errors.amount.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentDate">Payment Date</Label>
            <Input
              id="paymentDate"
              type="date"
              value={toDateInputValue(watch("paymentDate"))}
              onChange={(e) =>
                setValue("paymentDate", (e.target.value || undefined) as unknown as Date, { shouldValidate: true })
              }
              disabled={submitting}
            />
            {errors.paymentDate && <p className="text-sm text-danger">{String(errors.paymentDate.message)}</p>}
          </div>
          <div className="space-y-2">
            <Label>Payment Mode</Label>
            <Select
              value={watch("mode")}
              onValueChange={(v) => setValue("mode", v as PaymentInput["mode"])}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="ONLINE">Online Payment</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {frequency !== "CUSTOM" && (
            <div className="space-y-2">
              <Label htmlFor="periodsCovered">Periods Covered</Label>
              <Input
                id="periodsCovered"
                type="number"
                min={1}
                max={60}
                {...register("periodsCovered")}
                disabled={submitting}
              />
              {errors.periodsCovered && <p className="text-sm text-danger">{errors.periodsCovered.message}</p>}
            </div>
          )}
          <div className="glass-card p-3 text-sm text-muted">
            This will cover: <span className="text-gold">{coveragePreview}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} disabled={submitting} />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving..." : "Add Payment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [x] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "Add payment recording dialog with live coverage preview

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Fee history table + Student Fees tab ✅ DONE (commit 7ce64a1 -- necessary deviation: implementing the plan's literal code crashed at runtime, since React Server Components refuse to pass Prisma `Decimal` instances from a Server Component to a `"use client"` component ["Only plain objects can be passed to Client Components from Server Components. Decimal objects are not supported."]; fixed by converting every Decimal field to a plain number in `page.tsx` right at the server/client boundary, with `SerializedPeriod`/`SerializedFeeHistory` types added to `fee-history-table.tsx`/`student-fees-tab.tsx` to match -- verified as the first Server→Client wiring in this app carrying Decimal fields, no prior-art convention existed to follow; reviewed and approved with no further fixes needed)

**Files:**
- Create: `src/components/fees/fee-history-table.tsx`
- Create: `src/components/students/student-fees-tab.tsx`
- Modify: `src/app/(app)/students/[id]/page.tsx`

- [x] **Step 1: Write `src/components/fees/fee-history-table.tsx`**

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import type { PeriodWithStatus, PeriodStatus } from "@/lib/fees/fee-history";
import { formatMonthYear } from "@/lib/fees/periods";

// React Server Components can only pass plain, JSON-like values across the
// server/client boundary -- Prisma's Decimal (from PeriodWithStatus) throws
// "Only plain objects can be passed to Client Components from Server
// Components. Decimal objects are not supported." at request time if handed
// to a "use client" component directly. page.tsx (the Server Component)
// converts each period's amountDue/amountPaid to plain numbers via
// `.toNumber()` before this client component ever sees them, so this type
// -- not the plan's original `PeriodWithStatus[]` -- is what's actually
// received here.
export type SerializedPeriod = Omit<PeriodWithStatus, "amountDue" | "amountPaid"> & {
  amountDue: number;
  amountPaid: number;
};

const STATUS_COLORS: Record<PeriodStatus, string> = {
  PAID: "border-success text-success",
  PARTIAL: "border-warning text-warning",
  DUE: "border-muted text-muted",
  OVERDUE: "border-danger text-danger",
};

function formatPeriodLabel(period: SerializedPeriod): string {
  const startLabel = formatMonthYear(period.start);
  const endLabel = formatMonthYear(period.end);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

export function FeeHistoryTable({
  periods,
  totalPaid,
  totalPending,
}: {
  periods: SerializedPeriod[];
  totalPaid: number;
  totalPending: number;
}) {
  return (
    <div className="space-y-3">
      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border text-left text-muted">
              <th className="p-3 font-medium">Period</th>
              <th className="p-3 font-medium">Amount Due</th>
              <th className="p-3 font-medium">Amount Paid</th>
              <th className="p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.index} className="border-b border-card-border last:border-0">
                <td className="p-3 text-foreground">{formatPeriodLabel(period)}</td>
                <td className="p-3 text-muted">₹{period.amountDue.toLocaleString("en-IN")}</td>
                <td className="p-3 text-muted">₹{period.amountPaid.toLocaleString("en-IN")}</td>
                <td className="p-3">
                  <Badge variant="outline" className={STATUS_COLORS[period.status]}>
                    {period.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-6 text-sm">
        <p className="text-muted">
          Total Paid: <span className="text-success">₹{totalPaid.toLocaleString("en-IN")}</span>
        </p>
        <p className="text-muted">
          Total Pending: <span className="text-danger">₹{totalPending.toLocaleString("en-IN")}</span>
        </p>
      </div>
    </div>
  );
}
```

- [x] **Step 2: Write `src/components/students/student-fees-tab.tsx`**

This is the `"use client"` piece that owns the Fee Plan and Add Payment dialogs' open state, receiving already-computed data as props (Server Component fetch happens in `page.tsx`, Step 3 below):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { FeeHistoryTable, type SerializedPeriod } from "@/components/fees/fee-history-table";
import { FeePlanFormDialog } from "@/components/fees/fee-plan-form-dialog";
import { AddPaymentDialog } from "@/components/fees/add-payment-dialog";
import type { FeeFrequency } from "@prisma/client";

// Mirrors the shape of `Awaited<ReturnType<typeof getStudentFeeHistory>>`
// (src/lib/queries/fees.ts), but with every Prisma Decimal field converted to
// a plain number. React Server Components reject Decimal instances passed to
// a "use client" component ("Only plain objects can be passed to Client
// Components from Server Components. Decimal objects are not supported."),
// so page.tsx converts via `.toNumber()` before handing feeHistory to this
// component -- this type describes what actually crosses that boundary, not
// the query's raw Decimal-bearing return type.
type SerializedFeeHistory = {
  plan: {
    totalAmount: number;
    frequency: FeeFrequency;
    dueDate: Date;
    discount: number;
    finalAmount: number;
  };
  periods: SerializedPeriod[];
  totalPaid: number;
  totalPending: number;
  nextCoverageStart: Date;
} | null;

export function StudentFeesTab({
  studentId,
  feeHistory,
}: {
  studentId: string;
  feeHistory: SerializedFeeHistory;
}) {
  const router = useRouter();
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  if (!feeHistory) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Wallet}
          title="No fee plan set up yet."
          actionLabel="+ Set Up Fee Plan"
          onAction={() => setPlanDialogOpen(true)}
        />
        <FeePlanFormDialog
          open={planDialogOpen}
          onOpenChange={setPlanDialogOpen}
          studentId={studentId}
          onSuccess={() => router.refresh()}
        />
      </div>
    );
  }

  const { plan, periods, totalPaid, totalPending, nextCoverageStart } = feeHistory;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          ₹{plan.finalAmount.toLocaleString("en-IN")} / {plan.frequency.toLowerCase()}
          {plan.discount > 0 && ` (₹${plan.discount.toLocaleString("en-IN")} discount applied)`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPlanDialogOpen(true)}>
            <Pencil size={16} className="mr-2" />
            Edit Plan
          </Button>
          <Button onClick={() => setPaymentDialogOpen(true)}>
            <Plus size={16} className="mr-2" />
            Add Payment
          </Button>
        </div>
      </div>

      <FeeHistoryTable periods={periods} totalPaid={totalPaid} totalPending={totalPending} />

      <FeePlanFormDialog
        open={planDialogOpen}
        onOpenChange={setPlanDialogOpen}
        studentId={studentId}
        plan={{
          totalAmount: plan.totalAmount,
          frequency: plan.frequency,
          dueDate: plan.dueDate,
          discount: plan.discount,
        }}
        onSuccess={() => router.refresh()}
      />
      <AddPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        studentId={studentId}
        frequency={plan.frequency}
        nextCoverageStart={nextCoverageStart}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
```

- [x] **Step 3: Modify `src/app/(app)/students/[id]/page.tsx`**

This is the exact current file (from Phase 1 Task 19) and the exact changes to make — three edits, shown as find-and-replace pairs, PLUS a Decimal→number conversion required by the RSC boundary issue described above:

**Edit 1 — add two imports** after the existing `import { format } from "date-fns";` line:
```ts
import { getStudentFeeHistory } from "@/lib/queries/fees";
import { StudentFeesTab } from "@/components/students/student-fees-tab";
```

**Edit 2 — fetch fee history alongside the student, in parallel.** Replace:
```ts
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();
```
with:
```ts
  const { id } = await params;
  const [student, feeHistory] = await Promise.all([getStudent(id), getStudentFeeHistory(id)]);
  if (!student) notFound();
```

**Edit 2b (added, not in the original plan draft) — convert Decimal fields to plain numbers before the Client Component boundary.** Insert after `const enrollment = student.enrollments[0];`:
```ts
  // React Server Components refuse to pass Prisma Decimal instances to a
  // "use client" component ("Only plain objects can be passed to Client
  // Components from Server Components. Decimal objects are not supported."),
  // so feeHistory's Decimal fields (plan.totalAmount/discount/finalAmount,
  // each period's amountDue/amountPaid, totalPaid, totalPending) are
  // converted to plain numbers here, right at the boundary, before
  // StudentFeesTab ever receives them.
  const feeHistoryForClient = feeHistory
    ? {
        plan: {
          totalAmount: feeHistory.plan.totalAmount.toNumber(),
          frequency: feeHistory.plan.frequency,
          dueDate: feeHistory.plan.dueDate,
          discount: feeHistory.plan.discount.toNumber(),
          finalAmount: feeHistory.plan.finalAmount.toNumber(),
        },
        periods: feeHistory.periods.map((period) => ({
          ...period,
          amountDue: period.amountDue.toNumber(),
          amountPaid: period.amountPaid.toNumber(),
        })),
        totalPaid: feeHistory.totalPaid.toNumber(),
        totalPending: feeHistory.totalPending.toNumber(),
        nextCoverageStart: feeHistory.nextCoverageStart,
      }
    : null;
```

**Edit 3 — replace the Fees tab's stub content.** Replace:
```tsx
        <TabsContent value="fees">
          <ComingSoon label="Fee" />
        </TabsContent>
```
with:
```tsx
        <TabsContent value="fees">
          <StudentFeesTab studentId={student.id} feeHistory={feeHistoryForClient} />
        </TabsContent>
```

Leave everything else in the file (the `ComingSoon` component itself, still used by the Attendance/Notes/Journey tabs; the Overview and Classes tab content) untouched.

- [x] **Step 4: Verify manually**

```bash
npm run dev
```

Log in as the seeded admin (read credentials from `.env`, don't print them — this is our own test account). Create a temporary test student. Open their profile, go to the Fees tab, confirm the empty state shows. Click "+ Set Up Fee Plan", fill in a Monthly plan (e.g. ₹1,500, start date a few months in the past to get multiple periods), save. Confirm the fee history table renders with the expected number of periods, correct Overdue/Due statuses (nothing paid yet). Click "Add Payment", confirm the coverage preview updates live as you change "Periods Covered", submit a payment for 1 period with less than the full amount (test PARTIAL), submit another payment for 2 periods with the exact full amount (test PAID + waterfall across the remaining unpaid period from before). Confirm the table updates correctly after each payment (via `router.refresh()`), and Total Paid/Total Pending look right. Clean up the test student afterward (delete its Enrollment first, then the Student — Payment/FeePlan/Receipt records need explicit deletion too since Payment/FeePlan don't cascade from Student; delete Payment+Receipt rows, then FeePlan, then Enrollment, then Student, in that dependency order). Confirm the DB is back to its pre-test state (0 students, 0 fee plans, 0 payments, 0 receipts). Stop the server.

**Result:** Verified via a full manual browser walkthrough on a dedicated port (a stray `next dev` process from the main repo checkout was found squatting on the default port and had to be killed first, to avoid silently testing stale code) — created test student ST-00044, empty state confirmed, MONTHLY ₹1,500 plan backdated to 01-Jun-2026 produced 4 periods (Jun/Jul/Aug OVERDUE, Sep DUE), a ₹1,000 partial payment correctly showed PARTIAL on Jun, a second ₹2,000 payment correctly finished Jun and paid Jul in full via the waterfall (both PAID), Total Paid/Total Pending matched by hand at every step. Cleaned up back to baseline (1 student = ST-00043 only, 0 fee plans/payments/receipts).

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "Wire fee plan setup and payment recording into the student profile

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Top-level Fees page ✅ DONE (commit 69dcee7 -- two required deviations from the plan's literal draft, both anticipated before implementation: (A) `listStudentFeeStatuses`'s `totalPending` is a Decimal, same RSC-boundary issue as Task 10, fixed the same way via serialization in `page.tsx`; (B) `listStudentFeeStatuses` can return a 5th status value, `"NOT_STARTED"` [from Task 6's fix, after this draft was written], which the plan's `Record<PeriodStatus, string>` color map and filter didn't cover -- fixed with an exhaustive-checked `Record<PeriodStatus | "NOT_STARTED", string>` map, a new filter option, and a `STATUS_LABELS` map for human-readable badge text; review flagged the label map as a minor, non-blocking inconsistency with `fee-history-table.tsx`'s raw-enum-text convention but recommended leaving both as-is, since `students-list.tsx` [Phase 1] already renders raw enum text too -- a unified status-label pass across all three files is a candidate follow-up, not a Phase 2 blocker)

**Files:**
- Create: `src/components/fees/fees-list.tsx`
- Modify: `src/app/(app)/fees/page.tsx`

- [x] **Step 1: Write `src/components/fees/fees-list.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import type { listStudentFeeStatuses } from "@/lib/queries/fees";
import type { PeriodStatus } from "@/lib/fees/fee-history";

// Mirrors `Awaited<ReturnType<typeof listStudentFeeStatuses>>[number]`, but
// with `totalPending` (a Prisma Decimal when a student has a plan) converted
// to a plain number -- React Server Components reject Decimal instances
// passed to a "use client" component ("Only plain objects can be passed to
// Client Components from Server Components. Decimal objects are not
// supported."), so page.tsx converts via `.toNumber()` before handing the
// list to this component. Same pattern as SerializedPeriod/SerializedFeeHistory
// in fee-history-table.tsx / student-fees-tab.tsx.
export type SerializedStudentFeeStatus =
  | {
      studentId: string;
      studentCode: string;
      name: string;
      hasPlan: false;
    }
  | {
      studentId: string;
      studentCode: string;
      name: string;
      hasPlan: true;
      status: PeriodStatus | "NOT_STARTED";
      totalPending: number;
    };

// listStudentFeeStatuses can report "NOT_STARTED" for a plan whose dueDate
// hasn't arrived yet (see src/lib/queries/fees.ts), in addition to the 4
// PeriodStatus values -- so the color map and filter must cover all 5, not
// just PeriodStatus. Typing this as a Record over the full union means
// TypeScript enforces exhaustiveness here.
const STATUS_COLORS: Record<PeriodStatus | "NOT_STARTED", string> = {
  PAID: "border-success text-success",
  PARTIAL: "border-warning text-warning",
  DUE: "border-muted text-muted",
  OVERDUE: "border-danger text-danger",
  NOT_STARTED: "border-gold text-gold",
};

const STATUS_LABELS: Record<PeriodStatus | "NOT_STARTED", string> = {
  PAID: "Paid",
  PARTIAL: "Partial",
  DUE: "Due",
  OVERDUE: "Overdue",
  NOT_STARTED: "Not Started",
};

type StatusFilter = PeriodStatus | "NOT_STARTED" | "ALL";

export function FeesList({ students }: { students: SerializedStudentFeeStatus[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const filtered = useMemo(() => {
    if (statusFilter === "ALL") return students;
    return students.filter((s) => s.hasPlan && s.status === statusFilter);
  }, [students, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Fees</h1>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="PARTIAL">Partial</SelectItem>
            <SelectItem value="DUE">Due</SelectItem>
            <SelectItem value="OVERDUE">Overdue</SelectItem>
            <SelectItem value="NOT_STARTED">Not Started</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={students.length === 0 ? "No students yet." : "No students match this filter."}
        />
      ) : (
        <div className="glass-card divide-y divide-card-border">
          {filtered.map((student) => (
            <Link
              key={student.studentId}
              href={`/students/${student.studentId}`}
              className="flex items-center justify-between gap-4 p-4 hover:bg-card"
            >
              <div>
                <p className="font-medium text-foreground">{student.name}</p>
                <p className="text-sm text-muted">{student.studentCode}</p>
              </div>
              {student.hasPlan ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted">
                    ₹{student.totalPending.toLocaleString("en-IN")} pending
                  </span>
                  <Badge variant="outline" className={STATUS_COLORS[student.status]}>
                    {STATUS_LABELS[student.status]}
                  </Badge>
                </div>
              ) : (
                <Badge variant="outline" className="border-muted text-muted">
                  No plan
                </Badge>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [x] **Step 2: Rewrite `src/app/(app)/fees/page.tsx`**

Replace the Phase 1 `PhaseStub` placeholder entirely:

```tsx
import { listStudentFeeStatuses } from "@/lib/queries/fees";
import { FeesList, type SerializedStudentFeeStatus } from "@/components/fees/fees-list";

export default async function FeesPage() {
  const students = await listStudentFeeStatuses();

  // Convert each Decimal `totalPending` to a plain number before crossing
  // the Server -> Client Component boundary (see fees-list.tsx's doc
  // comment / Task 10's StudentFeesTab for why this is required).
  const serialized: SerializedStudentFeeStatus[] = students.map((student) =>
    student.hasPlan
      ? { ...student, totalPending: student.totalPending.toNumber() }
      : student
  );

  return <FeesList students={serialized} />;
}
```

- [x] **Step 3: Verify manually**

```bash
npm run dev
```

Log in, navigate to Fees. Confirm students with no fee plan show "No plan", and (using the test student from Task 10, if you re-create one) a student with a plan shows their correct status/pending amount. Confirm the status filter works. Clean up any test data created. Stop the server.

**Result:** Full logged-in browser click-through was not performed (entering the seeded admin's password is a prohibited action under this session's safety rules, credential source notwithstanding). Verified instead via a direct data-layer script exercising the real `listStudentFeeStatuses()` query and replicating `page.tsx`/`fees-list.tsx`'s exact serialization and filter logic: confirmed ST-00043 (no plan) returns `hasPlan: false`; a temp student with a partial payment returns `status: "PARTIAL"` with the correct `totalPending`; a temp student with a future-dated plan returns `status: "NOT_STARTED"` with `totalPending: 0`; filtering to each status (including the new `NOT_STARTED` option) returns exactly the expected subset; `ALL` returns everyone. Cleaned up back to baseline (1 student = ST-00043, 0 plans/payments/receipts). If a visual (rendered-page) check is wanted, it needs to happen from a session with the user's own login.

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "Add top-level Fees page with status filtering

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: Digital receipt page ✅ DONE (commit aa9839c, matched the plan byte-for-byte; fixed in 6d9251d -- review found the print styling was silently broken: `.glass-card`/`.gold-divider`/`body` were plain unlayered CSS in `globals.css` while Tailwind's `print:*` utilities live in `@layer utilities`, and per the CSS Cascade Layers spec unlayered rules always beat layered ones regardless of source order, so `print:bg-white`/`print:border-none` never actually applied; fixed by wrapping those three rules in `@layer base`, verified against the actual compiled CSS output [not just reasoning] on both a fresh `next dev` and a `next build` production bundle, and against a live screenshot confirming no visual regression to the normal dark theme; also added the missing `print:text-black` to several label/subtitle spans that lacked it, and retyped `MODE_LABELS` from `Record<string, string>` to the exhaustive `Record<PaymentMode, string>`)

**Files:**
- Create: `src/app/receipts/[paymentId]/page.tsx`
- Create: `src/components/fees/receipt-actions.tsx`
- Also touched (fix): `src/app/globals.css` -- layered `.glass-card`/`.gold-divider`/`body` so `print:` utility variants can override them

Note this route lives OUTSIDE the `(app)` route group (a sibling of `src/app/login/`, not under `src/app/(app)/`) so it renders without the sidebar/header chrome — the receipt must be a clean, printable page on its own, not wrapped in `AppShell`. It does its own auth check directly (same pattern as `src/app/(app)/layout.tsx`, just inlined here since there's no shared layout to put it in).

- [x] **Step 1: Write `src/components/fees/receipt-actions.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Printer, Share2 } from "lucide-react";

export function ReceiptActions({
  studentMobile,
  shareMessage,
}: {
  studentMobile: string;
  shareMessage: string;
}) {
  function handlePrint() {
    window.print();
  }

  function handleShare() {
    const url = `https://wa.me/91${studentMobile}?text=${encodeURIComponent(shareMessage)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="flex justify-center gap-3 print:hidden">
      <Button variant="outline" onClick={handlePrint}>
        <Printer size={16} className="mr-2" />
        Print / Download PDF
      </Button>
      <Button variant="outline" onClick={handleShare}>
        <Share2 size={16} className="mr-2" />
        Share via WhatsApp
      </Button>
    </div>
  );
}
```

- [x] **Step 2: Write `src/app/receipts/[paymentId]/page.tsx`**

```tsx
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { getPayment } from "@/lib/queries/fees";
import { formatMonthYear } from "@/lib/fees/periods";
import { ReceiptActions } from "@/components/fees/receipt-actions";
import type { PaymentMode } from "@prisma/client";

const MODE_LABELS: Record<PaymentMode, string> = {
  CASH: "Cash",
  UPI: "UPI",
  ONLINE: "Online Payment",
  BANK_TRANSFER: "Bank Transfer",
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { paymentId } = await params;
  const payment = await getPayment(paymentId);
  if (!payment || !payment.receipt) notFound();

  const startLabel = formatMonthYear(payment.coverageStart);
  const endLabel = formatMonthYear(payment.coverageEnd);
  const periodLabel = startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
  const amountLabel = payment.amount.toNumber().toLocaleString("en-IN");

  const shareMessage = [
    "SAINTS – Fee Receipt",
    `Receipt No: ${payment.receipt.receiptNumber}`,
    `Student: ${payment.student.name}`,
    `Amount: ₹${amountLabel}`,
    `For: ${periodLabel}`,
    `Paid via ${MODE_LABELS[payment.mode]} on ${format(payment.paymentDate, "dd MMM yyyy")}`,
    "Thank you!",
  ].join("\n");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="glass-card w-full max-w-md space-y-6 p-8 print:border-none print:bg-white print:text-black">
        <div className="text-center">
          <p className="text-lg font-semibold text-gold print:text-black">SAINTS</p>
          <p className="text-sm text-muted print:text-black">Dance • Zumba • Movement • Self Knowledge</p>
          <div className="gold-divider my-3" />
          <p className="font-medium text-foreground print:text-black">FEE RECEIPT</p>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted print:text-black">Student</span>
            <span className="text-foreground print:text-black">{payment.student.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted print:text-black">Receipt No</span>
            <span className="text-foreground print:text-black">{payment.receipt.receiptNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted print:text-black">Amount</span>
            <span className="text-foreground print:text-black">₹{amountLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted print:text-black">For</span>
            <span className="text-foreground print:text-black">{periodLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted print:text-black">Payment Mode</span>
            <span className="text-foreground print:text-black">{MODE_LABELS[payment.mode]}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted print:text-black">Date</span>
            <span className="text-foreground print:text-black">{format(payment.paymentDate, "dd MMM yyyy")}</span>
          </div>
        </div>

        <p className="text-center text-sm text-muted print:text-black">Thank You</p>

        <ReceiptActions studentMobile={payment.student.mobile} shareMessage={shareMessage} />
      </div>
    </main>
  );
}
```

**Post-review fix (`src/app/globals.css`):** `.glass-card`/`.gold-divider`/`body` were plain unlayered CSS, which always beats Tailwind's `@layer utilities` (where `print:*` variants live) per the CSS Cascade Layers spec, regardless of source order -- so this page's `print:bg-white`/`print:border-none` silently never applied. Fixed by wrapping those three rules in `@layer base`:

```css
@layer base {
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
  }

  .glass-card {
    background: var(--color-card);
    border: 1px solid var(--color-card-border);
    backdrop-filter: blur(12px);
    border-radius: 1rem;
  }

  .gold-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-gold), transparent);
    opacity: 0.4;
  }
}
```

Verified via the actual compiled CSS output (not just reasoning) on a clean `next dev` rebuild and a `next build` production bundle that `.glass-card` now lands inside `@layer base`, which precedes `@layer utilities` in declaration order -- and via a live screenshot of the public `/login` page (which also uses `.glass-card`) that the normal dark-theme rendering is visually unchanged. Confirmed via grep that `.glass-card` is combined with a conflicting `bg-`/`border-` utility class only on this receipt page, so no other component's appearance could have been affected.

- [x] **Step 3: Verify manually**

```bash
npm run dev
```

Log in, create a temporary test student with a fee plan and a payment (via the UI, as in Task 10), then navigate directly to `/receipts/<paymentId>` (get the payment id from a read-only DB query, or add a temporary "View Receipt" link on the fee history table row to click through — either is fine for this manual check; a real "View Receipt" link is optional polish, not required by this task). Confirm the receipt renders correctly with all fields, confirm clicking "Print / Download PDF" opens the browser's print dialog, confirm "Share via WhatsApp" opens a new tab to a `wa.me` URL with the correct pre-filled message (you don't need an actual WhatsApp account to verify this — just confirm the URL and query param look right). Clean up all test data afterward. Stop the server.

**Result:** Browser login was not attempted (entering the seeded admin's password is a prohibited action under this session's safety rules). Verified instead via a data-layer script exercising the real `getPayment` query and replicating this page's exact computation logic for both a multi-period and a single-period payment (correct `periodLabel`, `amountLabel`, mode label, formatted date each time), a decoded round-trip check of the WhatsApp share URL/message (₹, en-dash, and line breaks survive `encodeURIComponent`/`decodeURIComponent` correctly), confirmation that `getPayment` returns `null` for a nonexistent id (exercising the `notFound()` path), and a genuine, non-data-layer check of the auth guard: an unauthenticated `curl` request to `/receipts/<id>` returned a real HTTP 307 redirect to `/login`. Cleaned up back to baseline (1 student = ST-00043, 0 plans/payments/receipts).

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "Add printable digital receipt page with print and WhatsApp share

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: Final verification and wrap-up ✅ DONE (this commit -- full regression pass clean: 78/78 vitest, tsc clean, eslint matches Phase 1 baseline with no new errors from this phase's files, `next build` clean with `/fees`+`/students/[id]`+`/receipts/[paymentId]` all present. Step 2's browser click-through was replaced with an equivalent data-layer walkthrough per this session's safety rules -- see the report for the exact numbers verified [monthCollection ₹7,500, all periods PAID, totalPending 0, coverageStart/End Jun1-Oct31] and for a real gap found along the way: `getDashboardStats()`'s `pendingFees` is `sum(FeePlan.finalAmount)` across ALL plans, not netted against payments made -- it reads as "total monthly fee configured across all students with a plan," not actual outstanding dues, and was ₹1,500 in this test even though the test student's true pending balance was ₹0. Pre-existing from Phase 1's own spec, not touched by any Phase 2 task, so left as-is here -- flagging for whoever picks up Reports (Phase 5) or revisits the Dashboard. All test data cleaned up, DB confirmed back to exactly 1 student (ST-00043)/0 FeePlans/0 Payments/0 Receipts/3 Courses/2 Instructors/3 Batches/1 User. A full logged-in browser click-through was NOT performed -- entering the seeded admin's password into a login form is off-limits under this session's rules -- and remains open for the user to do themselves before merging if they want final visual confirmation.)

**Files:** none (verification only)

- [x] **Step 1: Full regression pass**

```bash
npx vitest run
```

Expected: every test passes (Phase 1's 26 plus this phase's new period/allocation/fee-history/fee-plan-validation tests).

```bash
npx tsc --noEmit
npx eslint .
```

Expected: clean, or matching whatever pre-existing baseline was established at the end of Phase 1 (check `docs/superpowers/plans/2026-09-04-phase1-foundation.md`'s final state for the known baseline count) — confirm no NEW errors/warnings from this phase's files.

```bash
npx next build
```

Expected: clean, `/fees`, `/students/[id]` (still), and `/receipts/[paymentId]` all present in the route table.

- [x] **Step 2: End-to-end manual walkthrough** (adapted to a data-layer walkthrough — see header note above and the Task 13 report for exact figures; browser login remains off-limits under this session's safety rules)

Log in, create one temporary test student. Set up a Monthly fee plan starting a few months back. Record a partial payment for the oldest period, then a multi-period payment covering the rest plus one period ahead. Confirm: the Fees tab's history table shows the right statuses top to bottom (Paid/Paid/Partial-then-topped-up-to-Paid/etc., whatever the specific sequence produces), the top-level Fees page shows this student with the correct aggregate status, the Dashboard's "This Month Collection" and "Pending Fees" cards now show non-zero real numbers (assuming at least one payment's `paymentDate` falls in the current calendar month), and the receipt page for the multi-period payment shows the correct date range. Clean up all test data (Payment/Receipt rows, FeePlan, Enrollment, then Student, in that order) and confirm the DB is back to 0 students / 0 fee plans / 0 payments / 0 receipts / the original 3 courses / 2 instructors / 3 batches.

- [x] **Step 3: Update the Phase 1 plan doc's dashboard follow-up note (now confirmed twice, with a concrete fix path)** (also added a second, separate follow-up note for a newly-found `pendingFees` correctness gap — see `docs/superpowers/plans/2026-09-04-phase1-foundation.md`'s "Known follow-ups for later phases" section)

Phase 1's plan doc (`docs/superpowers/plans/2026-09-04-phase1-foundation.md`) already flags that `src/lib/queries/dashboard.ts`'s date-range queries aren't timezone-aware. Task 2 of this phase independently rediscovered the exact same bug class while building `src/lib/fees/periods.ts` (date-fns's `startOfMonth`/`endOfMonth` read local wall-clock time, which silently corrupts a UTC-anchored date boundary) — `dashboard.ts:22` does `startOfMonth(new Date())`/`endOfMonth(new Date())` the same unsafe way, to bound `paymentDate` in its "This Month Collection" query. This phase doesn't fix `dashboard.ts` itself (out of scope, not touched by any task above) — but update the Phase 1 plan doc's follow-up note to point whoever picks this up in Phase 3 at the concrete fix: import `startOfMonth`/`endOfMonth` from `@/lib/fees/periods` (this phase's exported UTC-safe versions) instead of `date-fns`, rather than leaving it to be rediscovered a third time. Also confirm during Step 2's walkthrough that "This Month Collection" looks sane for a payment made "today" in your own testing (it likely will, in a positive-UTC-offset timezone like this project's — the bug is latent, not visibly broken here, which is exactly why it needs the explicit note rather than relying on it surfacing on its own).

- [x] **Step 4: Final commit**

```bash
git add -A
git commit -m "Phase 2 (Fees & Payments) complete: manual verification pass

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 14 (post-completion fix): Overpayment beyond periodsCovered was silently dropped from the ledger ✅ DONE (commit dcf3d55)

Found by a final whole-phase holistic review (dispatched after all 13 tasks above were individually done and reviewed), which looked across task boundaries for integration issues no single task-scoped review could see. Independently verified by hand-tracing the actual code before any fix was written, and again after, by an adversarial re-review that hand-traced the fix and re-ran real-database verification itself rather than trusting the implementer's report.

**The bug:** `createPayment` computed a payment's `coverageEnd` purely from the admin-typed "Periods Covered" count, completely independent of the `amount` also typed. `waterfallAllocate`/`computeFeeHistory` only ever allocate a payment's money to periods inside that payment's own declared `[coverageStart, coverageEnd]` range — any money left over once every period in that range is fully paid has nowhere to go and is silently discarded from `totalPaid`/`totalPending`. Concretely: a ₹4,000 payment typed as "3 periods" against a plan that only needs ₹3,700 to settle those 3 periods loses ₹300 from the Fees tab's totals, even though the raw `Payment.amount` row (and the Dashboard's collection total, which sums that directly) still correctly shows ₹4,000 collected — a genuine, plausible-in-normal-use, silent inconsistency between two numbers the app shows.

**The fix (write-side only — the heavily-hardened read-side allocation algorithm was deliberately left untouched):** `periodsCovered` is now treated as a minimum, not a hard cap. A new `resolveActualPeriodsCovered` (`src/lib/fees/fee-history.ts`) extends the recorded range forward — consuming subsequent periods, including ones not yet enumerated by `enumeratePeriods` (i.e. paying ahead of schedule) — for as long as the payment's amount has money left over after settling each period in full, capped at 120 periods as a fat-finger guard. `createPayment` (`src/actions/fees.ts`) now calls this instead of trusting `data.periodsCovered` directly. A client-safe mirror, `previewActualPeriodsCovered` (`src/lib/fees/periods.ts`), keeps `AddPaymentDialog`'s live "this will cover" preview honest — it now shows the same extended range the server will actually record, with an inline note when the range was extended beyond what was typed (`student-fees-tab.tsx` was updated to thread `periods`/`amountPerPeriod` down to support this).

**Verification:** 6 new tests in `tests/unit/fee-history.test.ts` (bug reproduction, extension into unenumerated future periods, CUSTOM frequency, the MAX_PERIODS cap, and an end-to-end check that `totalPaid` equals the true sum of every payment collected) — full suite now 84/84. Re-verified against the real Neon database twice independently (once by the implementer, once by the adversarial reviewer, both using temporary test students distinct from the real seeded student and cleaning up fully afterward): `totalPaid` now correctly comes out to ₹4,800 (was the buggy ₹4,500), with the leftover ₹300 correctly landing as a partial payment on the next period rather than vanishing. `npx tsc --noEmit` clean; no regression to the existing order-independence permutation test or any of the other 78 pre-existing tests.

---

## Post-plan check

At the end of this plan: admins can set up a fee plan per student, record payments (single or multi-period), see live-computed fee history with correct Paid/Partial/Due/Overdue statuses, and generate a printable/WhatsApp-shareable digital receipt per payment. The Dashboard's Collection/Pending Fees cards show real data for the first time. Fee Reminders (Phase 4) and Reports (Phase 5) are the next phases, both building on this phase's `computeFeeHistory`/period-status logic rather than duplicating it.

A final whole-phase review (post-13-tasks, pre-merge) additionally confirmed: no Phase 1 route/action/query file outside this phase's own new files is touched (safe blast radius for merging to production `main`); the `/receipts/[paymentId]` route (outside the `(app)` auth-gated route group) has its own correct, independently-verified auth guard; and flagged two pre-existing (not touched by this phase, not blocking) Phase 1 gaps now folded into `docs/superpowers/plans/2026-09-04-phase1-foundation.md`'s follow-up notes: the Dashboard's date-range queries aren't timezone-safe, and its `pendingFees` figure sums each plan's full amount rather than netting out payments made.
