# Phase 6: SAINTS Journey — Design Spec

## Goals & Scope

Phase 6 makes "My SAINTS Journey" real. The original brief: a personal-growth
tracker "beyond attendance and payments", conceptually
**Body → Movement → Discipline → Awareness → Self Knowledge**, with per-student
dance level, fitness and consistency scores (out of 10), auto-calculated
attendance %, dated instructor notes, and a visual progress section that feels
"calm, personal, and reflective" rather than like a corporate KPI dashboard.

It ships in three places:

1. **Student profile → SAINTS Journey tab** — the reflective visual of five
   qualities (Movement, Discipline, Consistency, Awareness, Self Growth), an
   "Update progress" dialog (dance level, fitness, consistency, awareness,
   self-growth), and the most recent instructor notes.
2. **Student profile → Notes tab** — the full list of instructor notes (date,
   instructor name, note text) with "Add note" (the admin picks the instructor,
   defaulting to the student's batch instructor when unambiguous) and delete.
3. **`/journey` page** — a gentle overview grid of all active students (dance
   level, the journey-path glyph, latest-note snippet), each card linking to
   that student's Journey tab.

**Out of scope:** score history over time (current values only; dated notes
carry the story over time), editing notes (add and delete only), instructor
logins/roles, notifications (Phase 7), any charting library.

## Data Model & Derivation

- **Schema (additive migration only):** `JourneyProgress` gains
  `awarenessScore Int?` and `growthScore Int?`. Nothing else changes.
  `JourneyProgress.danceLevel` stays a `String?` and is validated to
  `Beginner | Intermediate | Advanced` in zod, not a new DB enum. Scores are
  integers 1–10; empty/`null` means "not yet reflected". `InstructorNote`
  already has `studentId`, required `instructorId`, `note`, `createdAt` and needs
  no change.
- **Five qualities, each an integer 0–100 or `null`**, computed by the pure
  function `computeJourneyQualities`:
  - **Movement** = the average of whichever of these exist: dance level
    (Beginner 33 / Intermediate 66 / Advanced 100) and fitness score × 10.
    `null` if neither exists.
  - **Discipline** = attendance % over the last 90 days (reusing
    `computeAttendanceRate` from `src/lib/attendance/rate.ts`, so LATE counts as
    attended). `null` when there are no marked attendance records in the
    window.
  - **Consistency** = consistency score × 10 (`null` if unrated).
  - **Awareness** = awareness score × 10 (`null` if unrated).
  - **Self Growth** = growth score × 10 (`null` if unrated).
  - `null` is never treated as 0.
- `describeQuality(value)` maps a value to a soft word: `null` → "Not yet
  reflected"; 0–24 → "Beginning"; 25–49 → "Emerging"; 50–74 → "Growing";
  75–100 → "Flourishing".
- **Attendance window:** the last 90 days measured from today in IST
  (`todayInIST`, `startOfUTCDay` from `src/lib/dates.ts`).

## Architecture & Components

- `src/lib/journey/qualities.ts` (new, pure): `computeJourneyQualities`,
  `describeQuality`, and the dance-level→score mapping.
- `src/lib/validations/journey.ts` (new): progress schema (dance level ∈
  {Beginner, Intermediate, Advanced} or empty; each score an integer 1–10 or
  empty; empty strings normalize to `null`) and note schema (`studentId`,
  `instructorId`, `note` trimmed, 1–1000 characters).
- `src/lib/queries/journey.ts` (new, `import "server-only"`):
  - `getStudentJourney(studentId)` → progress row (or null), 90-day attendance
    rate, and recent notes.
  - `listStudentNotes(studentId)` → all notes newest first with instructor name.
  - `listJourneyOverview()` → active, non-deleted students with their progress
    and latest note (two bulk queries joined in memory, no N+1).
- `src/actions/journey.ts` (new, `"use server"`): `saveJourneyProgress`
  (upsert by `studentId`), `addInstructorNote`, `deleteInstructorNote`. Each
  verifies its target student (and, for notes, the instructor) exists and is not
  soft-deleted before writing — the guard Phases 2 and 3 each had to retrofit —
  and calls `revalidatePath` for the affected pages.
- UI (new): `src/components/journey/journey-path.tsx` (the visual),
  `src/components/students/student-journey-tab.tsx` and
  `src/components/journey/progress-form-dialog.tsx`,
  `src/components/students/student-notes-tab.tsx`,
  `src/components/journey/journey-overview.tsx`.
- Modified: `src/app/(app)/students/[id]/page.tsx` (the `notes` and `journey`
  tabs replace their "coming soon" placeholders; the `ComingSoon` helper is
  removed if unused), `src/app/(app)/journey/page.tsx` (replaces the Phase 1
  `PhaseStub`).
- Default note instructor: pre-selected only when all of the student's
  enrollments' batches share one instructor; otherwise the admin must choose.

## The Visual

Deliberately not a KPI dashboard: five soft rings threaded along a thin gold
line, beneath the quiet caption *Body → Movement → Discipline → Awareness →
Self Knowledge*. Each ring's fill is proportional to its quality; the label is
the `describeQuality` word rather than a percentage. Unrated qualities render as
faint dashed rings reading "Not yet reflected". Plain SVG/CSS using the existing
theme tokens (`--gold`, `--card-border`, `--muted-foreground`); no chart library.

## Error Handling & Edge Cases

- **Empty states:** a student with no progress row shows five unrated rings and
  a warm prompt to add a first reflection plus the "Update progress" button. No
  notes shows a plain-text message (not a card nested in a card). An empty
  `/journey` overview says there are no active students yet.
- **Soft-deleted:** deleted students never appear on `/journey`, and profile
  pages for them already 404. Every action rejects a soft-deleted student or
  instructor with a clear message. Deleted instructors are excluded from the
  "Add note" picker, but their name still displays on existing notes.
- **Note validation:** blank or whitespace-only notes are rejected; notes are
  trimmed and capped at 1000 characters. Delete asks for confirmation via the
  existing `ConfirmDialog`.
- **Server→Client boundary:** every Journey value is a plain int, string or
  Date — no `Decimal` — and the pure function returns plain numbers.

## Testing Strategy

Pure-logic unit tests (this project's established pattern):
`computeJourneyQualities` (each quality's mapping, `null` handling, Movement's
averaging of one-or-both inputs), `describeQuality` band boundaries
(24/25, 49/50, 74/75, `null`), and the zod schemas (level enum, 1–10 bounds,
empty-to-`null` normalization, note trimming and length limits).
Queries, actions and UI are verified manually against the real database, per
the Phase 2–5 precedent (no browser login is available in this environment).

## Post-Plan Check

At the end of this plan: each student has a reflective journey view and
instructor notes, and the admin has an academy-wide overview at `/journey`.
Phase 7 (Settings and notifications) is unrelated to this phase's scope.
