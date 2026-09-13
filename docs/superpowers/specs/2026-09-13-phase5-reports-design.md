# Phase 5: Reports — Design Spec

## Goals & Scope

Phase 5 gives the admin one `/reports` hub with two tabs:

1. **Overview** — revenue collected over a selectable range (chart), an outstanding
   dues summary (OVERDUE/PARTIAL/DUE breakdown, as of now), an attendance-rate
   trend over the range (chart), and reminder activity (reminders sent per
   period, with a conversion count — reminders followed by a payment before
   the next reminder or now).
2. **Operational** — three actionable lists: currently-overdue students
   (worst-first), students with no attendance in the last N days (N
   adjustable via a dropdown, default 14), and recently-joined /
   recently-left students in the selected range (joined via `joiningDate`,
   left via `status = LEFT` + `updatedAt` as an approximate transition
   timestamp — the schema has no dedicated "status changed at" column, and
   adding one is out of scope for this phase).

Every table on both tabs has its own inline "Export CSV" button, downloading
exactly what's currently shown (respecting the active date range/threshold).
There is no separate "Export" tab.

Date ranges everywhere use both a presets dropdown (This Month / Last 3
Months / This Year) and a custom from–to picker, carried in the URL as
`searchParams` so links are shareable — matching the Attendance page's
existing `?batchId=&date=` pattern.

**Out of scope for this phase:** no new write paths (this phase is pure
read/reporting), no scheduled/emailed reports, no saved custom report
configurations.

## Architecture & Data Flow

- `src/app/(app)/reports/page.tsx` (rewrite, replacing the Phase 1
  `PhaseStub`) — a Server Component reading `searchParams` (`tab`, `range`,
  `from`, `to`, `gapDays`), resolving the date range once via the shared
  helper below, and rendering `<ReportTabs>` plus the active tab's
  server-fetched content.
- `src/lib/reports/date-range.ts` (new) — resolves a `searchParams`-encoded
  range (a preset name, or explicit `from`/`to`) into concrete UTC boundary
  dates, reusing `startOfUTCDay`/`endOfUTCDay` from `src/lib/dates.ts` rather
  than reinventing date-boundary logic. Also derives the bucket size
  (day/week/month) from the resolved range's length, so every chart/query
  that buckets by time uses one consistent rule. Malformed/invalid
  `from`/`to` (e.g. `from` after `to`, unparseable dates) falls back to the
  default preset (This Month) rather than erroring.
- `src/lib/queries/reports.ts` (new) — read-only, `import "server-only"`,
  composing existing tables and existing query functions rather than
  duplicating logic:
  - `getRevenueOverTime(range)` → bucketed sums of `Payment.amount` (by
    `paymentDate`) over the resolved range/bucket size.
  - `getOutstandingDuesSummary()` → reuses `listStudentFeeStatuses`
    (`@/lib/queries/fees`, built in Phase 2), aggregates counts and total
    pending amount by status.
  - `getAttendanceRateOverTime(range)` → bucketed present/expected counts
    from `Attendance`, reusing `computeAttendanceRate`
    (`@/lib/attendance/rate`, built in Phase 3).
  - `getReminderActivity(range)` → per-bucket `FeeReminder` counts, plus a
    conversion count: a reminder "converts" if the same student has a
    `Payment.paymentDate` between that reminder's `sentAt` and the
    chronologically-next `FeeReminder.sentAt` for that student (or now, if
    there is no next reminder).
  - `getOverdueStudents()` → thin filter over `listStudentsWithPendingFees()`
    (`@/lib/queries/reminders`, built in Phase 4) keeping only
    `status === "OVERDUE"` — no duplicated fee-status logic.
  - `getAttendanceGaps(days)` → active students (`deletedAt: null`) whose
    most recent `Attendance` record (or none, ever) is older than `days`
    days before now.
  - `getRecentJoinsAndLeaves(range)` → active students with `joiningDate` in
    range, and active students with `status === "LEFT"` and `updatedAt` in
    range.
  - All queries filter `deletedAt: null` for "current state" lists (Overdue
    Students, Attendance Gaps, Recent Joins/Leaves), consistent with every
    prior phase's soft-delete convention. Historical aggregates (revenue,
    attendance-rate, reminder activity over a past range) intentionally
    still include a since-deleted student's past payments/attendance/
    reminders — that history doesn't un-happen because the record was later
    deleted.
- `src/lib/csv.ts` (new) — `toCsv(rows: Record<string,string|number>[],
  columns: {key, label}[]): string`, RFC-4180-style quoting (fields
  containing a comma, quote, or newline are wrapped in `"..."` with internal
  `"` doubled). Pure function, unit-tested.
- Charts: `src/components/reports/revenue-chart.tsx` and
  `attendance-trend-chart.tsx` (new client components), each taking only
  plain numbers/strings as props (no `Decimal`/`Date` objects crossing the
  Server→Client boundary — same discipline as every prior phase's fix for
  this exact bug class), rendering via Recharts.
- `src/components/reports/export-button.tsx` (new, client component) — takes
  `rows`, `columns`, `filename` props (the same data already rendered in the
  table above it), builds the CSV via `toCsv()`, and triggers a download via
  a `Blob` + object URL. No extra fetch; exports exactly what's on screen.

## New Dependency

Add **Recharts** (`recharts`, MIT license) for the two chart components. No
other new dependencies.

## UI Structure & Components

- `src/app/(app)/reports/page.tsx` — resolves `searchParams` → date range,
  renders `<ReportTabs activeTab={tab} />` (new client component: two links
  — Overview / Operational — that update `?tab=` via `router.push`, same
  link-based nav pattern as elsewhere in the app) followed by the active
  tab's content.
- `src/components/reports/overview-tab.tsx` (new, Server Component) —
  renders `<DateRangePicker>` (shared, client component: presets dropdown +
  custom from/to inputs, updates `searchParams` via `router.push`), then a
  grid of cards:
  - Revenue chart card (with its own CSV export of the bucketed rows).
  - Dues-summary card: 4 stat tiles (Total Pending / Overdue count / Partial
    count / Due count) — no per-student table here, so no export button on
    this card.
  - Attendance-trend chart card (CSV export of the bucketed rows).
  - Reminder-activity card: sent count, converted count, conversion rate
    (CSV export of the per-bucket rows).
- `src/components/reports/operational-tab.tsx` (new, Server Component) —
  three stacked `glass-card` tables, each with an inline "Export CSV"
  button in its header:
  - Overdue Students (reuses the same row shape as the Reminders page).
  - Attendance Gaps — includes a `gapDays` dropdown (7/14/30, default 14)
    that updates `?gapDays=` via `router.push`.
  - Recent Joins & Leaves — two small tables (Joined / Left) using the
    active date range from the shared picker.
- `src/components/reports/date-range-picker.tsx` (new, shared client
  component) and `src/components/reports/export-button.tsx` (new, shared
  client component) are used by both tabs.
- Nav: `src/components/layout/sidebar.tsx` already links to `/reports` from
  Phase 1 — no change needed.

## Error Handling & Edge Cases

- **Empty states**: every table/chart uses the existing `EmptyState`
  component when there's no data in range (e.g. "No payments in this
  period", "No students are overdue"), matching Reminders/Fees page
  conventions.
- **Divide-by-zero**: attendance rate and reminder-conversion-rate
  calculations guard against a zero denominator (0 expected classes, or 0
  reminders sent) by rendering "—" instead of `NaN%`/`Infinity%`.
- **Custom range validation**: an invalid `from`/`to` in the URL (parse
  failure, or `from` after `to`) falls back to the default preset (This
  Month) rather than erroring — a hand-edited or stale URL shouldn't crash
  the page.
- **Soft-deleted students**: see the data-flow section above — current-state
  lists exclude them; historical aggregates still include their past
  activity.
- **Large ranges**: bucket size adapts to range length (day-buckets under
  ~31 days, week-buckets under ~90 days, month-buckets beyond that),
  computed once in the shared date-range helper so every chart/query uses
  the same bucketing rule.
- **CSV export edge cases**: values containing commas/quotes/newlines are
  correctly quoted per `toCsv()`; an empty table still produces a valid
  header-only CSV rather than hiding/disabling the export button.

## Testing Strategy

Pure-logic unit tests (matching this project's established pattern of
testing computation, not query/page/action layers):

- `date-range.ts` — preset resolution, invalid-range fallback, and
  bucket-size selection logic.
- `csv.ts` — `toCsv()`'s quoting/escaping rules, including the empty-rows
  case.
- The reminder-conversion-window logic — given a reminder and a list of
  payments/other reminders for that student, correctly finds "a payment
  between this reminder and the next", including the edge case of a
  student's most recent reminder having no "next" reminder (window extends
  to now).

Query/action/page-level code is verified manually against the real database,
per the established Phase 2–4 precedent (no browser login available in this
environment).

## Post-Plan Check

At the end of this plan: the admin has one place (`/reports`) to see
revenue, dues, attendance, and reminder trends over any time range, plus
three actionable operational lists, with CSV export on every table. SAINTS
Journey (Phase 6) and Settings/notifications (Phase 7) are unrelated to this
phase's scope.
