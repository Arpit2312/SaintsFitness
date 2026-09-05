# SAINTS Student Management System — Phase 2: Fees & Payments

**Status:** Approved
**Date:** 2026-09-05

## Context

Phase 1 (Foundation) is complete and deployed at https://saintsfitness.vercel.app — auth, Courses/Batches/Instructors, full Student CRUD, and a Dashboard whose fee-related stat cards (This Month Collection, Pending Fees) currently show ₹0 with a "Starts tracking in Phase 2" note, since no fee data exists yet. Phase 2 builds the Fees & Payments module described in the master spec's sections 7-8: fee plan setup, payment recording, automatic fee-status calculation, fee history, and digital receipts. This document specs Phase 2 only, following the same phased approach established for Phase 1.

## Goals

- Admin can set up a fee plan for a student (amount, frequency, discount, start date) from the student's profile.
- Admin can record a payment against a student, including one that covers multiple periods at once (e.g., paying 3 months in one transaction).
- Fee status per period (Paid/Partial/Due/Overdue) and running totals (Total Paid, Total Pending) are always computed live from `FeePlan` + `Payment` records — never hardcoded, never a stale materialized value.
- A dedicated top-level Fees page lists all students with their current fee status, replacing today's "coming soon" stub.
- Every payment auto-generates a receipt number and a printable, SAINTS-branded digital receipt with Print/Download-as-PDF (via the browser's native print dialog) and Share (a pre-filled WhatsApp link).
- The Dashboard's existing "This Month Collection" and "Pending Fees" stat cards start showing real numbers (no new dashboard UI — this is an automatic side effect of populating the tables those queries already read from).

## Non-goals (Phase 2)

- Fee Reminders (WhatsApp nudges for due/overdue fees) — that's Phase 4, which will build on this phase's status calculation rather than duplicate it.
- The Dashboard's "Attention Required" list and "🔴/🟡/🟢 Fee Status Overview" visual summary from the master spec's section 5 — these are reminder-adjacent and belong with Phase 4.
- Fee plan history/versioning — a student has exactly one active fee plan; changing it edits the existing record in place (see Decision 1 below).
- Any scheduled/cron job — all fee status is computed on read, not materialized on a schedule.
- Reports (Phase 5) and multi-location/multi-currency support — out of scope entirely for this project.

## Decisions

**1. One active fee plan per student, not a history of plans.** A student's `FeePlan` is edited in place when their fee changes. Past payments still record what was actually paid and when, so no history is lost — just the "current terms" aren't versioned. Chosen over multi-plan history for simplicity; the master spec's own examples treat "the student's fee plan" as a single, editable thing.

**2. Fee status is computed on read from `FeePlan` + `Payment`, never materialized.** No `FeeInstallment`/`Invoice` table, no cron job generating monthly rows. Whenever fee history is displayed, the app enumerates periods from the plan's start date to today (based on `frequency`) and computes each period's paid/due amount from overlapping payments. This matches the master spec's "never hardcode, calculate dynamically" requirement and needs no background job infrastructure (Phase 1 has none).

**3. A payment can cover multiple periods in one transaction**, recorded as a `coverageStart`/`coverageEnd` date range rather than a single period label. Allocation across periods within that range uses a **waterfall**: the oldest unpaid period is filled to its due amount first, with any remainder spilling into the next period, and so on. Example: paying ₹4,000 against 3 months at ₹1,500 each fully covers month 1 and 2 (₹3,000) and leaves ₹1,000 (partial) toward month 3.

**3a. `CUSTOM` frequency means a single one-time fee, not a recurring cycle.** For `MONTHLY`/`QUARTERLY`/`YEARLY` plans, the period-enumeration logic advances by that calendar interval from the plan's start date. For `CUSTOM`, there is exactly one period (the whole `finalAmount`, due once on the plan's `dueDate`) — no recurring periods are enumerated. "Periods covered" on the Add Payment form is meaningless for a `CUSTOM` plan and is hidden/fixed to 1 in the UI when the student's plan is `CUSTOM`.

**4. Receipts are generated per payment, not per period.** A payment covering 3 months gets one receipt showing the covered range (e.g., "For: Sep–Nov 2026"), not three separate receipts.

**5. Receipts render as a printable HTML page; "Print" and "Download as PDF" both just invoke the browser's native print dialog** (which includes "Save as PDF" everywhere). No PDF-generation library. "Share" opens a `wa.me` link with a pre-filled message summarizing the payment — consistent with the WhatsApp approach already planned for Phase 4's reminders, no new integration.

## Data model additions

Extending `prisma/schema.prisma` (the `FeePlan`, `Payment`, and `Receipt` models already exist from Phase 1's full-system schema — this phase adjusts `Payment`'s shape and starts actually using all three):

- `FeePlan` (already exists, used as-is): `studentId` (unique — enforces "one plan per student"), `totalAmount`, `frequency` (`MONTHLY`/`QUARTERLY`/`YEARLY`/`CUSTOM`), `dueDate` (the plan's start/anchor date — periods are computed forward from this), `discount`, `finalAmount`.
- `Payment` (modify): replace the free-text `period: String` field with `coverageStart: DateTime` and `coverageEnd: DateTime` (inclusive range), keep `amount`, `paymentDate`, `mode`, `notes`, `feePlanId`. This is a schema migration — `period` is dropped, the two new columns added. Since Phase 1 never populated `Payment` (table is empty), this is a clean migration with no data to preserve.
- `Receipt` (already exists, used as-is): `receiptNumber` (unique, generated via Phase 1's already-built `generateReceiptNumber()`), `paymentId` (unique — one receipt per payment).

## Functional scope

### Fee Plan setup
- New "Fees" tab on the student profile (replaces the Phase 1 "coming soon" stub) — empty state "No fee plan set up yet" → "+ Set Up Fee Plan" when none exists.
- Form: total amount, frequency, discount, start date. Final payable (`totalAmount - discount`) computed live in the UI as the admin types, and stored as `finalAmount`.
- Editing an existing plan updates it in place (Decision 1).

### Add Payment
- Available both from the student's Fees tab and from the new top-level Fees list page.
- Form: amount, payment date, mode (Cash/UPI/Online/Bank Transfer), a "periods covered" number input (default 1) that computes `coverageStart`/`coverageEnd` from the plan's frequency and the next unpaid period, notes.
- On save: creates the `Payment`, generates its `Receipt` (via `generateReceiptNumber()`), and the student's fee status/dashboard stats reflect it immediately (`router.refresh()` pattern, consistent with the rest of the app).

### Fee History (per student, and status list on the top-level Fees page)
- Enumerates periods from the plan's `dueDate` (start) to the current period, one row per period: label, amount due, amount paid (via waterfall allocation across all the student's payments), status badge (Paid/Partial/Due/Overdue — Due vs Overdue determined by whether the period's own due date has passed).
- Only past-and-current periods are shown as rows (no infinite future list).
- Totals below the table: Total Paid, Total Pending — real sums, not per-row approximations.
- Top-level Fees page: one row per student with a `FeePlan`, showing their current overall status and pending amount, filterable by status (Paid/Partial/Due/Overdue) — same list/filter pattern as the Students page.

### Digital Receipt
- One printable page per payment, SAINTS-branded (per the master spec's receipt layout: branding, receipt no., student name, amount, covered period, payment mode, date, thank-you line).
- Actions: View (navigate to the page), Print/Download as PDF (browser print dialog), Share (pre-filled `wa.me` link).

### Dashboard integration
- No new dashboard UI. The existing "This Month Collection" and "Pending Fees" stat cards (built in Phase 1, currently querying real-but-empty tables) will show real numbers automatically once `Payment`/`FeePlan` rows exist — confirms Phase 1's dashboard queries were correctly forward-looking.

## Validation & error handling

- `feePlanSchema` (Zod): `totalAmount > 0`, valid `frequency` enum, `discount >= 0` and `discount <= totalAmount`.
- `paymentSchema` (Zod): `amount > 0`, valid `mode` enum, `periodsCovered >= 1` (integer).
- Same architectural conventions as Phase 1: `src/lib/queries/fees.ts` (reads, `import "server-only"`) vs `src/actions/fees.ts` (mutations, `"use server"`); Server Component pages + `"use client"` list components + `router.refresh()` after mutations; the shared, already-tested `useGuardedDialogOpenChange` hook for any dialogs; soft-delete-safe query patterns throughout (`deletedAt: null` on student joins).
- Money handled as Prisma `Decimal` end-to-end — no floating-point arithmetic in totals or allocation.

## Testing

- Unit tests (table-driven, exhaustive) for the two pure-logic pieces this phase's correctness hinges on:
  - The waterfall payment-allocation function (exact payment, underpayment/partial, overpayment, multi-period spans, zero periods).
  - The period-status calculator (Paid/Partial/Due/Overdue, including the due-date boundary).
- No new E2E test this phase — Phase 1's existing smoke test (login + student CRUD) remains the baseline regression check. Manual verification closes out the phase: set up a fee plan, record a partial payment and a multi-period payment, confirm fee history/receipt/dashboard all reflect it correctly.

## Open items for later phases

Fee Reminders (Phase 4) will read this phase's period-status calculator directly rather than re-implementing overdue/due-soon detection, and will add the Dashboard's "Attention Required" list and red/yellow/green fee status overview. Reports (Phase 5) will aggregate across this phase's data for collection/pending-fee reporting by date range, course, and batch.
