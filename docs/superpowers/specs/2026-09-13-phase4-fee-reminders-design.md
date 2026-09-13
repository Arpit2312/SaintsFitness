# SAINTS Student Management System — Phase 4: Fee Reminders (WhatsApp)

**Status:** Approved
**Date:** 2026-09-13

## Context

Phases 1–3 (Foundation, Fees & Payments, Attendance) are live in production. This phase builds Fee Reminders, the fourth of the phased feature set outlined in Phase 1's design doc. Per that doc's cost constraints, this stays on free `wa.me` deep links (the same mechanism Phase 2's receipt page already uses to share a receipt) — no paid WhatsApp Business API, so sending is always a manual click, never automatic or scheduled.

## Goals

- A `/reminders` page lists every student with pending fee dues (Overdue, Partial, or Due — worst-first), reusing Phase 2's fee-status computation.
- Each row has a "Send Reminder" button that opens a pre-filled WhatsApp chat (same `wa.me` mechanism as Phase 2's receipt sharing) and logs that a reminder was sent.
- The list shows "last reminded" per student (or nothing, if never reminded), so the front desk can avoid re-reminding someone who was already contacted recently.

## Non-goals

- No automated or scheduled sending — every reminder is a manual click, reviewed by the admin before it's actually sent in WhatsApp.
- No paid WhatsApp Business API integration.
- No in-app notification center (dismissible/read-tracked notifications) — that's Phase 7's `Notification` model, a different concept from this phase's outbound-message audit log.
- No reminder content customization/templates UI — one fixed message template, same as the receipt page's fixed share-message format.
- No attendance reminders — this phase is fee-reminders only, per its name.

## Data model

One new model, additive only (no changes to existing tables):

```prisma
model FeeReminder {
  id                  String   @id @default(cuid())
  studentId           String
  student             Student  @relation(fields: [studentId], references: [id])
  sentAt              DateTime @default(now())
  pendingAmountAtSend Decimal  @db.Decimal(10, 2)
  message             String
}
```

Deliberately separate from `Notification` (Phase 1's model, scoped for Phase 7's in-app notification center — dismissible/read-tracked, a different concept from this phase's outbound-message audit log). `pendingAmountAtSend` snapshots what was actually owed at send time, so the log stays historically accurate even after later payments change the real balance. No `channel` field — only WhatsApp exists right now; add one later if a second channel shows up (YAGNI).

## Core logic (pure, unit-tested)

**`buildReminderMessage(name: string, pendingAmount: Decimal): string`** — the WhatsApp message text, in `src/lib/reminders/message.ts`. One source of truth imported both server-side (`sendFeeReminder`, to log exactly what was sent) and client-side (the "Send Reminder" button, to build the same `wa.me` URL) — mirroring how Phase 2 shared `previewActualPeriodsCovered` across the server/client boundary rather than risking the logged text and the actually-sent text drifting apart.

Message format (fixed, no customization):
```
SAINTS – Fee Reminder
Hi {name}, this is a reminder that ₹{pendingAmount} is pending for your SAINTS fees. Please clear it at your earliest convenience. Thank you!
```

## Queries & actions

**`src/lib/queries/reminders.ts`**:
- `listStudentsWithPendingFees()` — reuses `listStudentFeeStatuses` (Phase 2, `src/lib/queries/fees.ts`), filters to students with `hasPlan: true` and `totalPending > 0`, sorted worst-first (`OVERDUE` → `PARTIAL` → `DUE`), each row joined with that student's most recent `FeeReminder.sentAt` (or `null` if never reminded) and `mobile` (for the WhatsApp link).

**`src/actions/reminders.ts`**:
- `sendFeeReminder(studentId: string)` — verifies the student exists and isn't soft-deleted, has a fee plan, and currently has `totalPending > 0` (rejecting a stale/crafted request the same way Phase 2/3's mutations reject invalid targets), then creates one `FeeReminder` row (via `buildReminderMessage` for the logged text) and returns it.

## UI

- `/reminders` page (replaces the Phase 1 `PhaseStub`): a list of students from `listStudentsWithPendingFees()` — name, pending amount, status badge (reusing the same color convention as Phase 2/3's status badges), "Last reminded: <relative time>" or nothing yet.
- Each row's "Send Reminder" button: calls `sendFeeReminder(studentId)` (logs it), then opens `https://wa.me/91<mobile>?text=<encoded buildReminderMessage(...)>` in a new tab (same pattern as Phase 2's `ReceiptActions`) — no confirmation dialog, since this is a routine, non-destructive action (same class as Phase 3's attendance marking, not a delete).
- Empty state when no students have pending dues.

## Validation & error handling

- `sendFeeReminder` throws a clear error if the student doesn't exist/is soft-deleted, has no fee plan, or has zero pending dues — mirrors Phase 2/3's established mutation-guard convention.
- Zod schema for the action's input (just `studentId`, but validated consistently with the rest of the codebase's convention of every mutation having a schema, even a trivial one).

## Testing

- Unit tests for `buildReminderMessage` (name interpolation, rupee formatting, a zero/small/large amount).
- Manual verification via real actions/queries run against the database with temporary test data (same approach as Phases 2/3, since a logged-in browser click-through isn't available in this environment).
- Same subagent-driven-development process as Phases 2/3: implementer → spec-compliance review → code-quality review per task, in an isolated worktree branched from `main`.

## Open items for later phases

Reports (Phase 5) may want to query `FeeReminder` history for a "reminders sent" metric. SAINTS Journey (Phase 6) and Settings/notifications (Phase 7) are unrelated to this phase's scope.
