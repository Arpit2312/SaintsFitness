# SAINTS Student Management System — Phase 1: Foundation

**Status:** Approved
**Date:** 2026-09-04

## Context

SAINTS (Self Awareness & Inner Transformation System) needs a full academy management system covering students, fees, attendance, batches, reports, and a unique "SAINTS Journey" progress-tracking feature. The full feature set (see original master prompt) is too large for a single design/build cycle, so it is split into phases, each with its own spec → plan → implementation cycle:

1. **Foundation** (this document) — auth, full DB schema, Courses/Batches/Instructors, core Student Management, Dashboard shell
2. Fees & Payments (fee plans, payment tracking, calculations, digital receipts)
3. Attendance
4. Fee Reminders (WhatsApp)
5. Reports
6. SAINTS Journey
7. Settings & polish

This document specs Phase 1 only.

## Goals (Phase 1)

- Admin can log in securely.
- Admin can manage Courses, Batches, and Instructors.
- Admin can manage full Student profiles, including photo upload, and see them listed/searched/filtered.
- Dashboard shell renders with sidebar nav for all 9 sections, a personalized greeting, and stat cards backed by real (not fake) data — cards for modules not yet built (fees, attendance) show accurate zero/empty states, not placeholder numbers.
- Database schema models the entire system (all phases) so later phases are additive, not restructuring.
- Application is deployed and reachable over the internet.

## Non-goals (Phase 1)

Fee plans/payments/receipts, attendance marking, WhatsApp reminders, reports, SAINTS Journey scoring/notes, notifications, Settings beyond password change. These appear in navigation/UI as future-phase placeholders but are not functional yet.

## Tech stack

- **Framework:** Next.js 14 (App Router), TypeScript
- **Styling:** Tailwind CSS + shadcn/ui (Radix primitives), themed to SAINTS's black/gold glassmorphism visual identity
- **Database:** PostgreSQL, hosted on Neon
- **ORM:** Prisma
- **Auth:** Auth.js (NextAuth), Credentials provider, session-based; every route checks `role` (future-ready for Instructor/Receptionist/Accountant/Student roles)
- **File storage:** Vercel Blob (student photos)
- **Hosting:** Vercel, deployed from a GitHub repo
- **Testing:** Vitest (unit), Playwright (one E2E smoke test)

## Admin account

Seeded on first deploy:
- Email: `arpitagrggc@gmail.com`
- Password: read from `ADMIN_SEED_PASSWORD` environment variable at seed time — never hardcoded in source, docs, or committed anywhere. Changeable from Settings after first login.

## Database schema (full system, modeled now)

Modeled in this phase so future phases are additive:

- `User` — admin login, `role` enum (`ADMIN` now; `INSTRUCTOR`, `RECEPTIONIST`, `ACCOUNTANT`, `STUDENT` reserved for later)
- `Instructor` — name, contact, bio
- `Course` — name, category (Dance/Zumba/Fitness/etc.), description
- `Batch` — name, course (FK), instructor (FK), timing, days, capacity
- `Student` — student ID (`ST-00001`, generated via DB sequence for uniqueness), name, photo URL, mobile, DOB, gender, joining date, status (`ACTIVE`/`INACTIVE`/`LEFT`), soft-delete (`deletedAt`)
- `Address` — 1:1 with Student (house/street, area, city, state, PIN)
- `EmergencyContact` — 1:1 with Student (name, relationship, mobile)
- `ParentDetails` — 1:1 with Student (father, mother, guardian, parent mobile)
- `Enrollment` — Student ↔ Batch (join table), joining-batch date
- `FeePlan`, `Payment`, `Receipt` — modeled now (frequency, amount, discount, receipt numbering via DB sequence `SNT-YYYY-00001`), built out in Phase 2
- `Attendance` — modeled now (student, batch, date, status), built out in Phase 3
- `InstructorNote`, `JourneyProgress` — modeled now, built out in Phase 6
- `Notification` — modeled now, built out in Phase 7

All deletes across the schema are soft deletes (`deletedAt` timestamp), so financial and history data referenced by later phases is never actually lost.

## Functional scope (Phase 1)

### Auth
- Login page (email + password)
- Protected app shell (redirect to login if unauthenticated)
- Logout

### Dashboard shell
- Collapsible sidebar with all 9 nav sections; sections beyond Phase 1 are visible but lead to a "coming in a future phase" state rather than being hidden, so navigation doesn't shift later
- Personalized greeting (time-of-day + name) and the Hindi philosophical line from the spec
- Stat cards computed from real DB data:
  - Total Students, Active Students, Today's Classes — real, populated this phase
  - This Month Collection, Pending Fees, Today's Attendance — real query, correctly shows ₹0 / 0% until Phase 2/3 add data, with a small note that tracking starts in a later phase (never a fake/hardcoded number)

### Courses & Batches
- Full CRUD for Courses and Batches (timing, days, instructor, capacity)
- Seeded with a few realistic sample courses/batches (Dance, Zumba, Fitness, matching the spec's examples) — fully editable/deletable, for demo purposes only

### Instructors
- Basic CRUD (name, contact, bio)

### Students
- Full CRUD with all profile fields from the master spec: basic info, address, emergency contact, parent details, course/batch assignment
- Photo upload (Vercel Blob)
- Auto-generated Student ID, status field (Active/Inactive/Left)
- Profile page with all 6 tabs present (Overview, Fees, Attendance, Classes, Notes, SAINTS Journey); only **Overview** and **Classes** are functional this phase, others show a clean "available in a future phase" empty state
- Global search (name/ID/mobile/batch), list filters (status/course/batch/joining date)
- Premium empty states with clear calls-to-action (e.g. "No students added yet — + Add Your First Student")

## Validation & error handling

- Zod schemas shared between client forms and server actions (mobile number: 10-digit Indian format, required fields, date validity)
- Server actions return typed errors; forms show inline field errors
- Confirmation dialogs before all destructive actions (delete student/batch/instructor)
- Soft deletes only — no hard deletes of records other phases may reference

## Testing

- Vitest: unit tests for ID/receipt-number generation uniqueness, validation schemas
- Playwright: one E2E smoke test — login → add student → see it in the list

## Open items for later phases

Fees/payments/receipts (Phase 2), attendance (Phase 3), WhatsApp reminders (Phase 4), reports (Phase 5), SAINTS Journey (Phase 6), notifications/full Settings (Phase 7) — each gets its own spec and plan when we reach it.
