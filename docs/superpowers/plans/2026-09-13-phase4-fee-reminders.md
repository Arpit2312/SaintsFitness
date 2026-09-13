# Phase 4 (Fee Reminders) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/reminders` page listing students with pending fee dues, each with a "Send Reminder" button that opens a pre-filled WhatsApp chat and logs the send.

**Architecture:** Same layering as Phases 2/3: a pure, unit-tested message-builder in `src/lib/reminders/`, a read-only query in `src/lib/queries/reminders.ts` (`server-only`) composing Phase 2's already-built `listStudentFeeStatuses`, a mutation in `src/actions/reminders.ts` (`"use server"`), and a `"use client"` list page.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL (Neon), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-phase4-fee-reminders-design.md`

## Global Constraints

- `prisma`/`@prisma/client` pinned to exact `6.19.3` — do not upgrade.
- No paid WhatsApp Business API, no automated/scheduled sending — every reminder is a manual click via a free `wa.me` deep link, exactly like Phase 2's `ReceiptActions` (`src/components/fees/receipt-actions.tsx`).
- Any Prisma `Decimal` value must be converted to a plain `number` before crossing a Server→Client component boundary (RSC serialization rejects `Decimal` — this project has hit this exact bug twice already in Phases 2/3). `buildReminderMessage` therefore takes a plain `number`, not a `Decimal`, so it works identically on both sides of that boundary with no conversion drift.
- Soft-deleted students are excluded from every read; `sendFeeReminder` verifies the target student exists, isn't soft-deleted, has a fee plan, and currently has pending dues before writing — matching Phase 2/3's established mutation-guard convention.
- Follow established UI conventions: `EmptyState` for the zero-state, `variant="outline"` status `Badge`s reusing the exact color map already established in `src/components/fees/fees-list.tsx`.

---

## Task 1: Schema migration — add the FeeReminder model ✅ DONE (commit 707129d, matched the plan byte-for-byte, reviewed and approved — additive-only, correctly includes `@@index([studentId])` from day one [applying the lesson from Phase 3's Attendance table, which needed a follow-up migration for the same index], `Decimal(10,2)` precision consistent with existing money columns)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_fee_reminder/migration.sql`

**Interfaces:**
- Produces: the `FeeReminder` Prisma model, used by Tasks 3 and 4.

- [x] **Step 1: Add the `FeeReminder` model**

In `prisma/schema.prisma`, add this new model (place it near `Notification`, e.g. right after it):

```prisma
model FeeReminder {
  id                  String   @id @default(cuid())
  studentId           String
  student             Student  @relation(fields: [studentId], references: [id])
  sentAt              DateTime @default(now())
  pendingAmountAtSend Decimal  @db.Decimal(10, 2)
  message             String

  @@index([studentId])
}
```

Also add the back-reference on `Student` (find the existing `notifications Notification[]` line in the `Student` model and add a `feeReminders FeeReminder[]` line right after it):

```prisma
  notifications    Notification[]
  feeReminders     FeeReminder[]
```

This is additive only — no existing model's fields change. The `@@index([studentId])` is added from the start (unlike Phase 3's `Attendance`, which needed a follow-up migration to add this after the fact) since this table will be queried by `studentId` from day one.

- [x] **Step 2: Generate the migration SQL (non-interactive-safe)**

`prisma migrate dev` fails in a non-interactive shell — this has bitten every phase's Task 1 so far. Use the diff-based workaround:

```bash
npx prisma migrate diff --from-schema-datasource --to-schema-datamodel --script prisma/schema.prisma
```

Expected output: SQL that creates the `FeeReminder` table (with its columns, the FK to `Student`, and the index) and nothing else. If it contains anything else, stop and investigate — it means `schema.prisma` has an unrelated pending change.

- [x] **Step 3: Place the migration and deploy it**

Create `prisma/migrations/<YYYYMMDDHHMMSS>_add_fee_reminder/migration.sql` (current UTC time, matching the existing migration folders' naming convention) with the SQL from Step 2, then:

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

Expected: clean.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "Add FeeReminder model

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Reminder message builder (TDD) ✅ DONE (commit 7394539, matched the plan byte-for-byte, reviewed and approved — Indian-style digit grouping independently verified in Node, negative/NaN edge cases confirmed unreachable given `computeFeeHistory`'s `Decimal.max(...,0)` floor on `totalPending`)

**Files:**
- Create: `src/lib/reminders/message.ts`
- Create: `tests/unit/reminders-message.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `buildReminderMessage(name: string, pendingAmount: number): string` from `src/lib/reminders/message.ts`. Tasks 4 and 5 import this by this exact name/signature.

- [x] **Step 1: Write the failing tests**

Create `tests/unit/reminders-message.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildReminderMessage } from "@/lib/reminders/message";

describe("buildReminderMessage", () => {
  it("interpolates the student's name and the pending amount", () => {
    const message = buildReminderMessage("Aarav Shah", 1500);
    expect(message).toContain("Aarav Shah");
    expect(message).toContain("₹1,500");
  });

  it("formats a large amount with Indian-style thousands separators", () => {
    const message = buildReminderMessage("Priya", 123456);
    expect(message).toContain("₹1,23,456");
  });

  it("formats a zero amount plainly", () => {
    const message = buildReminderMessage("Rahul", 0);
    expect(message).toContain("₹0");
  });

  it("starts with the fixed SAINTS reminder header", () => {
    expect(buildReminderMessage("Test", 100).startsWith("SAINTS – Fee Reminder")).toBe(true);
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/unit/reminders-message.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/reminders/message'`.

- [x] **Step 3: Implement `src/lib/reminders/message.ts`**

```ts
/**
 * The WhatsApp reminder message text -- one source of truth used both
 * server-side (sendFeeReminder logs exactly this text) and client-side (the
 * "Send Reminder" button builds the same text into the wa.me URL), so the
 * logged message and the actually-sent message can never drift apart.
 *
 * Takes a plain `number`, not a Prisma `Decimal` -- Decimal instances can't
 * cross a Server->Client component boundary (RSC serialization rejects
 * them), so callers convert via `.toNumber()` before this function ever
 * runs, on either side of that boundary.
 */
export function buildReminderMessage(name: string, pendingAmount: number): string {
  const amountLabel = pendingAmount.toLocaleString("en-IN");
  return [
    "SAINTS – Fee Reminder",
    `Hi ${name}, this is a reminder that ₹${amountLabel} is pending for your SAINTS fees. Please clear it at your earliest convenience. Thank you!`,
  ].join("\n");
}
```

- [x] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/unit/reminders-message.test.ts
```

Expected: all pass.

- [x] **Step 5: Full regression + typecheck**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: clean.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "Add reminder message builder

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Reminder queries (server-only reads) ✅ DONE (commit 7ed1aa1, matched the plan byte-for-byte, reviewed and approved — soft-delete safety confirmed to flow from `listStudentFeeStatuses`'s own `deletedAt: null` filter, in-memory join and worst-first sort verified correct, no N+1)

**Files:**
- Create: `src/lib/queries/reminders.ts`

**Interfaces:**
- Consumes: `listStudentFeeStatuses` (`@/lib/queries/fees`, already built in Phase 2 — do not modify that file).
- Produces: `listStudentsWithPendingFees()` from `src/lib/queries/reminders.ts`. Task 5 imports this by this exact name.

This composes an already-built query rather than duplicating its fee-status computation — `listStudentFeeStatuses` doesn't return `mobile` (not needed by its own Fees-page caller), so this task fetches `mobile` and each student's most recent `FeeReminder.sentAt` in one additional bulk query, joined in memory (avoiding both an N+1 and a change to Phase 2's already-shipped file).

- [ ] **Step 1: Write `src/lib/queries/reminders.ts`**

```ts
// Read-only query, not a mutation — lives outside src/actions/ (which is
// "use server") so it can never be called as a Server Action from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { prisma } from "@/lib/db";
import { listStudentFeeStatuses } from "@/lib/queries/fees";

type StudentFeeStatus = Awaited<ReturnType<typeof listStudentFeeStatuses>>[number];
type PendingStudentFeeStatus = Extract<StudentFeeStatus, { hasPlan: true }>;

// Worst-first: OVERDUE surfaces before PARTIAL before DUE. Any other status
// (NOT_STARTED, PAID) can never actually appear here -- this function only
// ever keeps rows with totalPending > 0 -- but the fallback keeps the sort
// total instead of partial if that invariant is ever loosened.
const STATUS_PRIORITY: Record<string, number> = { OVERDUE: 0, PARTIAL: 1, DUE: 2 };

export async function listStudentsWithPendingFees() {
  const statuses = await listStudentFeeStatuses();
  const pending = statuses.filter(
    (s): s is PendingStudentFeeStatus => s.hasPlan && s.totalPending.gt(0)
  );

  if (pending.length === 0) return [];

  const studentIds = pending.map((s) => s.studentId);
  const [students, reminders] = await Promise.all([
    prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, mobile: true } }),
    prisma.feeReminder.findMany({
      where: { studentId: { in: studentIds } },
      orderBy: { sentAt: "desc" },
      select: { studentId: true, sentAt: true },
    }),
  ]);

  const mobileByStudentId = new Map(students.map((s) => [s.id, s.mobile]));
  // reminders is already sorted sentAt desc, so the first entry seen per
  // studentId is that student's most recent reminder.
  const lastReminderByStudentId = new Map<string, Date>();
  for (const r of reminders) {
    if (!lastReminderByStudentId.has(r.studentId)) lastReminderByStudentId.set(r.studentId, r.sentAt);
  }

  return pending
    .map((s) => ({
      studentId: s.studentId,
      studentCode: s.studentCode,
      name: s.name,
      mobile: mobileByStudentId.get(s.studentId) ?? "",
      status: s.status,
      totalPending: s.totalPending,
      lastRemindedAt: lastReminderByStudentId.get(s.studentId) ?? null,
    }))
    .sort((a, b) => (STATUS_PRIORITY[a.status] ?? 99) - (STATUS_PRIORITY[b.status] ?? 99));
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Verify against the real database**

The shared Neon database currently has some real students with fee plans from Phase 2 usage — check the current count via a read-only query before starting (do not assume 0). Write a temporary script (delete when done) that:

1. Creates one temporary test student (distinct code) with a fee plan and a partial payment, so `totalPending > 0`.
2. Calls `listStudentsWithPendingFees()` — confirm the temp student appears with the correct `status`, `totalPending` (matching what `listStudentFeeStatuses` would report for them), correct `mobile`, and `lastRemindedAt: null` (no reminder sent yet).
3. Creates one `FeeReminder` row directly via Prisma for that student. Calls `listStudentsWithPendingFees()` again — confirm `lastRemindedAt` now reflects that reminder's `sentAt`.
4. Creates a second, more recent `FeeReminder` row for the same student. Calls again — confirm `lastRemindedAt` reflects the MORE RECENT of the two, not the first one found.
5. Creates a second temporary test student with a fee plan fully paid off (`totalPending` computed as 0) — confirm they do NOT appear in `listStudentsWithPendingFees()`'s results.
6. Clean up all test data (FeeReminder rows, Payment/Receipt rows, FeePlan rows, Enrollment rows, both temp students). Confirm the database is back to its pre-test state.

- [ ] **Step 4: Run full regression**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: clean (this task adds no new test file — thin query composition over already-tested logic, verified manually against the real DB per the established Phase 2/3 precedent).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add reminder query: students with pending fees, joined with last-reminded date

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Reminder actions (mutations) ✅ DONE (commit bd4f15a, matched the plan byte-for-byte, reviewed and approved — independently re-verified all 8 real-DB scenarios including log-not-upsert behavior, soft-delete guard, and the three rejection error messages)

**Files:**
- Create: `src/actions/reminders.ts`

**Interfaces:**
- Consumes: `buildReminderMessage` (`@/lib/reminders/message`).
- Produces: `sendFeeReminder(studentId: string): Promise<{ id: string; sentAt: Date; pendingAmountAtSend: number; message: string }>` from `src/actions/reminders.ts`. Task 5 calls this by this exact name/signature.

- [ ] **Step 1: Write `src/actions/reminders.ts`**

```ts
"use server";

import { prisma } from "@/lib/db";
import { computeFeeHistory } from "@/lib/fees/fee-history";
import { buildReminderMessage } from "@/lib/reminders/message";
import { revalidatePath } from "next/cache";

// No zod schema here -- unlike Phases 2/3's mutations, this action takes a
// single bare studentId with no user-typed form fields to validate (the
// same shape as Phase 1's deleteStudent(id), which also has no schema for
// the same reason). The real validation is the existence/business-rule
// checks below, not input shape.
export async function sendFeeReminder(studentId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId, deletedAt: null },
    select: { id: true, name: true },
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

  const { totalPending } = computeFeeHistory(plan.dueDate, plan.frequency, plan.finalAmount, plan.payments, new Date());
  if (totalPending.lte(0)) {
    throw new Error("This student has no pending dues.");
  }

  const pendingAmount = totalPending.toNumber();
  const message = buildReminderMessage(student.name, pendingAmount);

  const reminder = await prisma.feeReminder.create({
    data: { studentId, pendingAmountAtSend: pendingAmount, message },
  });

  revalidatePath("/reminders");

  return {
    id: reminder.id,
    sentAt: reminder.sentAt,
    pendingAmountAtSend: reminder.pendingAmountAtSend.toNumber(),
    message: reminder.message,
  };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Verify against the real database**

Using a temporary script (delete when done), against a temporary test student (distinct code, not a real seeded one), clean up fully afterward:

1. Create a fee plan and a partial payment for the temp student so `totalPending > 0`.
2. Call `sendFeeReminder(studentId)` — confirm it returns `{id, sentAt, pendingAmountAtSend, message}` with `pendingAmountAtSend` matching the actual pending amount, and `message` containing the student's name and that amount. Confirm a `FeeReminder` row was actually created in the database with matching values.
3. Call `sendFeeReminder(studentId)` again — confirm it creates a SECOND `FeeReminder` row (this is a log, not an upsert — every send is its own record), with a later `sentAt`.
4. Fully pay off the plan (create a payment that brings `totalPending` to exactly 0), then call `sendFeeReminder(studentId)` — confirm it throws `"This student has no pending dues."` and creates no new row.
5. Call `sendFeeReminder` with a nonexistent `studentId` — confirm it throws `"Student not found."`.
6. Create a second temp student with NO fee plan, call `sendFeeReminder` for them — confirm it throws `"This student doesn't have a fee plan set up yet."`.
7. Soft-delete the first temp student (`deletedAt: new Date()`), call `sendFeeReminder` for them again — confirm it throws `"Student not found."` (the soft-delete guard).
8. Clean up all test data (FeeReminder rows, Payment/Receipt rows, FeePlan rows, both temp students). Confirm the database is back to its pre-test state.

- [ ] **Step 4: Run full regression**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add sendFeeReminder server action

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Fee Reminders page (UI) ✅ DONE (commit 6e4cefb, matched the plan byte-for-byte; review caught a real staleness bug baked into the plan's own code — `handleSend` built the WhatsApp message from the client's cached `student.totalPending` instead of `sendFeeReminder`'s freshly-recomputed return value, risking drift from the DB-logged message if a payment landed between page render and click; fixed in commit 07832fe to destructure `message` from the action's return instead, closing the race; re-reviewed and confirmed no regressions)

**Files:**
- Create: `src/components/reminders/reminders-list.tsx`
- Modify: `src/app/(app)/reminders/page.tsx`

**Interfaces:**
- Consumes: `listStudentsWithPendingFees` (`@/lib/queries/reminders`); `sendFeeReminder` (`@/actions/reminders`); `buildReminderMessage` (`@/lib/reminders/message`).
- Produces: `RemindersList` component, consumed only by this task's own page.

- [ ] **Step 1: Write `src/components/reminders/reminders-list.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { sendFeeReminder } from "@/actions/reminders";
import { formatDateUTC } from "@/lib/dates";
import { toast } from "sonner";

// Same 3-value color map as fees-list.tsx (OVERDUE/PARTIAL/DUE are the only
// statuses that can appear here -- this list only ever shows students with
// totalPending > 0).
const STATUS_COLORS: Record<string, string> = {
  OVERDUE: "border-danger text-danger",
  PARTIAL: "border-warning text-warning",
  DUE: "border-muted text-muted",
};

export type PendingFeeStudent = {
  studentId: string;
  studentCode: string;
  name: string;
  mobile: string;
  status: string;
  totalPending: number;
  lastRemindedAt: Date | null;
};

export function RemindersList({ students }: { students: PendingFeeStudent[] }) {
  const router = useRouter();
  const [sendingId, setSendingId] = useState<string | null>(null);

  async function handleSend(student: PendingFeeStudent) {
    setSendingId(student.studentId);
    try {
      const { message } = await sendFeeReminder(student.studentId);
      const url = `https://wa.me/91${student.mobile}?text=${encodeURIComponent(message)}`;
      window.open(url, "_blank");
      toast.success("Reminder logged");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Fee Reminders</h1>

      {students.length === 0 ? (
        <EmptyState icon={MessageCircle} title="No students have pending dues." />
      ) : (
        <div className="glass-card divide-y divide-card-border">
          {students.map((student) => (
            <div key={student.studentId} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium text-foreground">{student.name}</p>
                <p className="text-sm text-muted">
                  {student.studentCode} · ₹{student.totalPending.toLocaleString("en-IN")} pending
                  {student.lastRemindedAt && ` · Last reminded ${formatDateUTC(student.lastRemindedAt)}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={STATUS_COLORS[student.status]}>
                  {student.status}
                </Badge>
                <Button
                  variant="outline"
                  onClick={() => handleSend(student)}
                  disabled={sendingId === student.studentId}
                >
                  <MessageCircle size={16} className="mr-2" />
                  {sendingId === student.studentId ? "Sending..." : "Send Reminder"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `src/app/(app)/reminders/page.tsx`**

Replace the Phase 1 `PhaseStub` placeholder entirely:

```tsx
import { listStudentsWithPendingFees } from "@/lib/queries/reminders";
import { RemindersList, type PendingFeeStudent } from "@/components/reminders/reminders-list";

export default async function RemindersPage() {
  const students = await listStudentsWithPendingFees();

  // Convert each Decimal totalPending to a plain number before crossing the
  // Server -> Client Component boundary (Decimal instances can't cross RSC
  // serialization -- see Phase 2/3's identical fix on this same boundary).
  const serialized: PendingFeeStudent[] = students.map((s) => ({
    ...s,
    totalPending: s.totalPending.toNumber(),
  }));

  return <RemindersList students={serialized} />;
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Verify manually**

Since a logged-in browser click-through may not be available in your environment (every prior phase in this project hit that exact restriction and substituted direct data-layer verification instead), verify via a temporary script exercising `listStudentsWithPendingFees`/`sendFeeReminder` together end-to-end against the real database with a temporary test student, mirroring the scenario a real click-through would exercise: load the list, confirm the temp student appears with correct status/pending amount, call `sendFeeReminder`, confirm a new `FeeReminder` row exists and `listStudentsWithPendingFees()`'s next call shows the updated `lastRemindedAt`. Also independently confirm `buildReminderMessage(name, totalPending)` produces the same text the component would build into its `wa.me` URL. If you do have real browser access, use it and take a screenshot instead. Clean up all test data afterward.

- [ ] **Step 5: Run full regression**

```bash
npx vitest run
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add Fee Reminders page with WhatsApp send-and-log

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Final verification and wrap-up

**Files:** none (verification only)

- [ ] **Step 1: Full regression pass**

```bash
npx vitest run
npx tsc --noEmit
npx eslint .
npx next build
```

Expected: every test passes (Phase 1-3's baseline plus this phase's new message-builder tests); `tsc`/`eslint` clean or matching the pre-existing baseline with no new errors/warnings from this phase's files; `next build` clean with `/reminders` present in the route table.

- [ ] **Step 2: End-to-end verification**

Create one temporary test student with a fee plan and a partial payment (so `totalPending > 0`). Confirm they appear on the Reminders list with the right status/amount. Call `sendFeeReminder` for them and confirm the returned message text matches `buildReminderMessage`'s output exactly, a `FeeReminder` row was created with the correct `pendingAmountAtSend`, and the list's next fetch shows the updated `lastRemindedAt`. Fully pay off their plan and confirm they disappear from the list. Clean up all test data afterward, confirm the database is back to its pre-phase baseline.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "Phase 4 (Fee Reminders) complete: manual verification pass

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Post-plan check

At the end of this plan: admins have one place (`/reminders`) to see every student with pending fees, worst-first, and send a WhatsApp reminder with one click — logged so the front desk can see who's already been reminded and when. Reports (Phase 5) may want to query `FeeReminder` history for a "reminders sent" metric; SAINTS Journey (Phase 6) and Settings/notifications (Phase 7) are unrelated to this phase's scope.
