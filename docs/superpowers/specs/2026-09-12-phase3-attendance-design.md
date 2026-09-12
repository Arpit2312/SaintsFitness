# SAINTS Student Management System — Phase 3: Attendance

**Status:** Approved
**Date:** 2026-09-12

## Context

Phase 1 (Foundation) and Phase 2 (Fees & Payments) are live in production. This phase builds Attendance, the third of the phased feature set outlined in Phase 1's design doc. The `Attendance` model (student, batch, date, status) was already scaffolded in Phase 1's schema, so this phase is purely additive — no migration beyond a cheap index.

## Goals

- Admin can mark attendance for a whole batch on a given date via a roll-call view: every enrolled student defaults to PRESENT, the admin only has to flag exceptions (ABSENT/LATE/LEAVE).
- Roll-call works for today or any past date (not future) — covers same-day marking, catching up on a missed day, and correcting a mistake.
- Admin can also mark or edit a single student's attendance record directly from that student's profile, for any batch they're enrolled in.
- A student's profile shows their attendance history and an overall attendance rate.
- The Dashboard's "Today's Attendance" card shows real present/expected numbers, using each batch's scheduled days (`Batch.days`) to know who's actually expected today.

## Non-goals

- Attendance analytics/trends/reports beyond the one rate figure on a student's profile — that's Reports (Phase 5).
- Absentee notifications/reminders — that's Phase 4 (WhatsApp Fee Reminders) territory, and not attendance-specific either way.
- Hard-restricting which batches can be marked on which days. `Batch.days` is used as a soft default (scheduled-today batches sort first / are highlighted) — an admin can still mark any batch on any date (e.g. a makeup class), never blocked.
- Future-dated attendance marking.

## Data model

No schema changes beyond one addition. The existing model:

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

enum AttendanceStatus {
  PRESENT
  ABSENT
  LATE
  LEAVE
}
```

**Addition:** an index on `Attendance.studentId` and `Attendance.batchId` (non-unique FK columns with no index — a cheap fix Phase 1's plan doc already flagged as a follow-up, worth doing now before this table gets real write volume from daily roll-call marking).

The existing `@@unique([studentId, batchId, date])` is exactly what both marking flows need: a bulk batch-roll-call save and a single-record mark both become upserts keyed on that same triple, so there's never a duplicate record for the same student/batch/day.

## Core logic (pure, unit-tested)

Two small pure functions anchor the phase, in `src/lib/attendance/`, mirroring how Phase 2 built `fee-history.ts`:

- **`computeAttendanceRate(records: { status: AttendanceStatus }[]): number`** — `(PRESENT + LATE) / total marked records`. LEAVE and ABSENT both count against the rate; LATE still counts as attended. Returns 0 for an empty record set (never divides by zero).
- **`isBatchScheduledOn(batchDays: string[], date: Date): boolean`** — checks whether `date`'s weekday (computed UTC-safely, not via server-local time — the exact bug class Phase 2's `periods.ts` already hit and fixed for month boundaries applies equally to day-of-week boundaries) is present in `batchDays`.

## Queries & actions

**`src/lib/queries/attendance.ts`** (reads):
- `getBatchRosterForDate(batchId, date)` — every non-soft-deleted student enrolled in the batch, joined with their `Attendance` record for that exact date if one exists. A student who already has a record for that date shows their actual recorded status (so re-opening an already-marked day shows what was saved, not a reset); a student with no record for that date is reported as unmarked, and the UI defaults them to PRESENT for display only — nothing is written until the roll-call is explicitly saved.
- `getStudentAttendanceHistory(studentId)` — all attendance records for a student (batch name, date, status), sorted newest first, plus the computed rate.
- `listBatchesForDate(date)` — all active batches, each flagged with whether it's scheduled on that date's weekday (via `isBatchScheduledOn`), for the roll-call page's batch picker to sort/highlight by.

**`src/actions/attendance.ts`** (mutations):
- `saveBatchAttendance(batchId, date, records: { studentId, status }[])` — one bulk upsert per student in the roster for that batch+date. Validates `date` is not in the future.
- `markStudentAttendance(studentId, batchId, date, status)` — single upsert, used by the profile-page dialog. Validates the student is actually enrolled in `batchId` (mirrors the soft-delete-guard pattern Phase 2's `createPayment` established: an explicit existence/relationship check before the mutation, not folded into a `where` clause) and that `date` is not in the future.

**`src/lib/validations/attendance.ts`**: zod schemas for both inputs above.

## UI

- **`/attendance` page** (replaces the Phase 1 `PhaseStub`): a date picker (defaults to today, max = today) and a batch picker (batches scheduled on the selected date sort first) drive a roster table — one row per enrolled student, a status control per row (defaulting to PRESENT for anyone unmarked that day), one "Save Attendance" button that bulk-upserts the whole roster.
- **Student profile's Attendance tab** (replaces `ComingSoon`): a read-only history table (date, batch, status) plus the computed attendance rate, and a "Mark Attendance" button opening a dialog (date, a batch picker constrained to batches the student is actually enrolled in, status) that calls `markStudentAttendance` — same structural pattern as the Fees tab's history-table-plus-action-dialogs.
- **Dashboard**: `getDashboardStats()`'s attendance figure becomes "present / expected today" (expected = enrollments in batches scheduled for today's weekday — counted per student-per-batch, so a student in two batches that both meet today counts twice, once per session; present = how many of those enrollments have a PRESENT or LATE record for today). While touching this file, two already-documented Phase 1 follow-ups get folded in as part of this same change, since both are exactly what this phase's day-of-week logic needs anyway:
  - "Today's Classes" currently counts ALL active batches regardless of schedule — fixed to actually filter by `isBatchScheduledOn`.
  - The date-range boundaries in this file (`startOfDay`/`endOfDay` from `date-fns`) aren't timezone-safe (local server time, not IST) — replaced with UTC-safe equivalents, following the same pattern Phase 2's `periods.ts` already established for month boundaries.

## Validation & error handling

- Zod schemas shared between client forms and server actions, same convention as Phases 1–2.
- `date` fields reject future dates (both mutations).
- `markStudentAttendance` rejects a `batchId` the student isn't enrolled in.
- Confirmation is implicit in the bulk save (one "Save Attendance" action for the whole roster) rather than per-row confirmation dialogs — marking attendance is a routine, frequent, low-stakes action unlike deleting a record.

## Testing

- Unit tests for `computeAttendanceRate` (empty set, all-PRESENT, all-LEAVE, a realistic mix) and `isBatchScheduledOn` (weekday matching, including a UTC-boundary case mirroring Phase 2's periods.ts tests).
- Manual verification via real actions/queries run against the database with temporary test data (the same approach Phase 2 settled into, since a logged-in browser click-through isn't available in this environment).
- Same subagent-driven-development process as Phase 2: implementer → spec-compliance review → code-quality review per task, in an isolated worktree branched from `main`.

## Open items for later phases

Attendance-based reporting/trends (Phase 5), absentee notifications (Phase 4, if in scope there), and any bulk historical-data-entry tooling remain out of scope for this phase.
