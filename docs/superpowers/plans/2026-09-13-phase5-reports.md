# Phase 5: Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin one `/reports` hub (Overview + Operational tabs) covering revenue/dues/attendance/reminder trends and three actionable operational lists, each exportable to CSV.

**Architecture:** A single Server Component page (`reports/page.tsx`) reads `searchParams` (tab/range/from/to/gapDays), resolves the date range once via a shared pure helper, and renders one of two tab components, each a Server Component that fetches its own data and composes existing Phase 2–4 query functions rather than duplicating fee/attendance/reminder logic. Charts and CSV export are small client components fed only plain (non-Decimal) props.

**Tech Stack:** Next.js App Router (Server Components + `searchParams`), Prisma, Recharts (new dependency, MIT license) for the two trend charts.

**Spec:** `docs/superpowers/specs/2026-09-13-phase5-reports-design.md`

## Global Constraints

- Pure read/reporting phase — no new write paths (no new Server Actions).
- Recharts is the only new dependency; install via `npm install recharts` (let npm resolve the current stable version; do not hand-pin a version number).
- Every `Decimal` value must be converted to a plain `number` (`.toNumber()`) before it is passed as a prop to any `"use client"` component — this exact bug class has recurred and been fixed in every prior phase.
- Every "current state" query (Overdue Students, Attendance Gaps, Recent Joins/Leaves) filters `deletedAt: null`. Historical aggregates (Revenue, Attendance Rate, Reminder Activity over a past date range) intentionally do NOT exclude since-deleted students' past activity — that history doesn't un-happen because the record was later deleted.
- Date-range resolution and time-bucketing are centralized in one shared module (`src/lib/reports/date-range.ts`); no chart or query may reimplement its own bucketing logic.
- CSV export is an inline "Export CSV" button per table/chart card — there is no separate export tab.
- In this Next.js version, a page's `searchParams` prop is a `Promise` — it must be `await`ed (see the existing `src/app/(app)/attendance/page.tsx` for the established pattern).
- All UTC/calendar-date math reuses the existing helpers in `src/lib/dates.ts` (`startOfUTCDay`, `endOfUTCDay`, `todayInIST`, `formatDateUTC`) and `src/lib/fees/periods.ts` (`startOfMonth`, `endOfMonth`, `addMonths`, `formatMonthYear`) — no new date-math primitives are invented.

---

## Task 1: CSV export utility (TDD)

**Files:**
- Create: `src/lib/csv.ts`
- Test: `tests/unit/csv.test.ts`

**Interfaces:**
- Produces: `toCsv<T extends Record<string, CsvValue>>(rows: T[], columns: CsvColumn<T>[]): string`, `CsvColumn<T> = { key: keyof T; label: string }`, `CsvValue = string | number | null | undefined`. Task 6 (`export-button.tsx`) imports `toCsv` and `CsvColumn` by these exact names.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/csv.test.ts
import { describe, it, expect } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("renders a header row and one row per record", () => {
    const csv = toCsv(
      [
        { name: "Asha", amount: 500 },
        { name: "Ravi", amount: 1200 },
      ],
      [
        { key: "name", label: "Name" },
        { key: "amount", label: "Amount" },
      ]
    );
    expect(csv).toBe("Name,Amount\r\nAsha,500\r\nRavi,1200");
  });

  it("quotes a field containing a comma", () => {
    const csv = toCsv([{ name: "Doe, John" }], [{ key: "name", label: "Name" }]);
    expect(csv).toBe('Name\r\n"Doe, John"');
  });

  it("quotes a field containing a double quote, doubling the internal quote", () => {
    const csv = toCsv([{ note: 'Said "hello"' }], [{ key: "note", label: "Note" }]);
    expect(csv).toBe('Note\r\n"Said ""hello"""');
  });

  it("quotes a field containing a newline", () => {
    const csv = toCsv([{ note: "line1\nline2" }], [{ key: "note", label: "Note" }]);
    expect(csv).toBe('Note\r\n"line1\nline2"');
  });

  it("produces a header-only CSV for an empty rows array", () => {
    const csv = toCsv([], [{ key: "name", label: "Name" }]);
    expect(csv).toBe("Name");
  });

  it("renders an empty string for a null/undefined field value", () => {
    const csv = toCsv([{ name: undefined }], [{ key: "name", label: "Name" }]);
    expect(csv).toBe("Name\r\n");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/csv.test.ts`
Expected: FAIL with "Cannot find module '@/lib/csv'" (or similar).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/csv.ts

export type CsvValue = string | number | null | undefined;
export type CsvColumn<T> = { key: keyof T; label: string };

// RFC-4180-style quoting: a field is wrapped in double quotes only if it
// contains a comma, a double quote, or a newline; an internal double quote
// is escaped by doubling it.
function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv<T extends Record<string, CsvValue>>(
  rows: T[],
  columns: CsvColumn<T>[]
): string {
  const header = columns.map((c) => escapeCsvField(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvField(String(row[c.key] ?? ""))).join(",")
  );
  return [header, ...lines].join("\r\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/csv.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv.ts tests/unit/csv.test.ts
git commit -m "Add CSV export utility

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Date-range resolution and bucketing (TDD)

**Files:**
- Create: `src/lib/reports/date-range.ts`
- Test: `tests/unit/date-range.test.ts`

**Interfaces:**
- Consumes: `startOfUTCDay`, `endOfUTCDay`, `todayInIST`, `formatDateUTC` (`@/lib/dates`); `startOfMonth`, `endOfMonth`, `addMonths`, `formatMonthYear` (`@/lib/fees/periods`).
- Produces: `RangeParams = { range?: string; from?: string; to?: string }`, `BucketSize = "day" | "week" | "month"`, `ResolvedRange = { from: Date; to: Date; bucketSize: BucketSize }`, `Bucket = { start: Date; end: Date; label: string }`, `resolveDateRange(params: RangeParams): ResolvedRange`, `generateBuckets(from: Date, to: Date, bucketSize: BucketSize): Bucket[]`. Tasks 7, 8, 9, 10, 11 all import these exact names from `@/lib/reports/date-range`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/date-range.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveDateRange, generateBuckets } from "@/lib/reports/date-range";

describe("resolveDateRange", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to this-month when no range is given", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T10:00:00.000Z"));
    const result = resolveDateRange({});
    expect(result.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(result.to.toISOString()).toBe("2026-09-13T23:59:59.999Z");
    expect(result.bucketSize).toBe("day");
  });

  it("resolves last-3-months to the start of the month two months back", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T10:00:00.000Z"));
    const result = resolveDateRange({ range: "last-3-months" });
    expect(result.from.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(result.to.toISOString()).toBe("2026-09-13T23:59:59.999Z");
  });

  it("resolves this-year to Jan 1st of the current year, bucketed by month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T10:00:00.000Z"));
    const result = resolveDateRange({ range: "this-year" });
    expect(result.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(result.bucketSize).toBe("month");
  });

  it("resolves a valid custom range", () => {
    const result = resolveDateRange({ range: "custom", from: "2026-01-01", to: "2026-01-10" });
    expect(result.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(result.to.toISOString()).toBe("2026-01-10T23:59:59.999Z");
    expect(result.bucketSize).toBe("day");
  });

  it("falls back to this-month when custom from is after to", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T10:00:00.000Z"));
    const result = resolveDateRange({ range: "custom", from: "2026-01-10", to: "2026-01-01" });
    expect(result.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("falls back to this-month when custom from/to are unparseable", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T10:00:00.000Z"));
    const result = resolveDateRange({ range: "custom", from: "not-a-date", to: "2026-01-01" });
    expect(result.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("generateBuckets", () => {
  it("creates one bucket per day for a short range", () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-03T23:59:59.999Z");
    const buckets = generateBuckets(from, to, "day");
    expect(buckets).toHaveLength(3);
    expect(buckets[0].label).toBe("01 Sep 2026");
    expect(buckets[0].start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(buckets[0].end.toISOString()).toBe("2026-09-01T23:59:59.999Z");
    expect(buckets[2].end.toISOString()).toBe(to.toISOString());
  });

  it("creates 7-day buckets aligned to `from`, clipping the final bucket to `to`", () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-10T23:59:59.999Z"); // 10 days
    const buckets = generateBuckets(from, to, "week");
    expect(buckets).toHaveLength(2);
    expect(buckets[0].start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(buckets[0].end.toISOString()).toBe("2026-09-07T23:59:59.999Z");
    expect(buckets[1].start.toISOString()).toBe("2026-09-08T00:00:00.000Z");
    expect(buckets[1].end.toISOString()).toBe(to.toISOString());
  });

  it("creates one bucket per calendar month, aligned to the 1st even if `from` isn't", () => {
    const from = new Date("2026-01-15T00:00:00.000Z");
    const to = new Date("2026-03-31T23:59:59.999Z");
    const buckets = generateBuckets(from, to, "month");
    expect(buckets.map((b) => b.label)).toEqual(["Jan 2026", "Feb 2026", "Mar 2026"]);
    expect(buckets[0].start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/date-range.test.ts`
Expected: FAIL with "Cannot find module '@/lib/reports/date-range'".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/reports/date-range.ts
import { startOfUTCDay, endOfUTCDay, todayInIST, formatDateUTC } from "@/lib/dates";
import { startOfMonth, endOfMonth, addMonths, formatMonthYear } from "@/lib/fees/periods";

export type RangeParams = {
  range?: string;
  from?: string;
  to?: string;
};

export type BucketSize = "day" | "week" | "month";

export type ResolvedRange = {
  from: Date;
  to: Date;
  bucketSize: BucketSize;
};

export type Bucket = { start: Date; end: Date; label: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateParam(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function bucketSizeFor(from: Date, to: Date): BucketSize {
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
  if (days <= 31) return "day";
  if (days <= 90) return "week";
  return "month";
}

/**
 * Resolves the searchParams-encoded range into concrete UTC boundaries plus
 * the bucket size every chart/query should use for this range. An invalid
 * or backwards custom range (unparseable from/to, or from after to) falls
 * back to the default preset rather than throwing -- a hand-edited or
 * stale URL shouldn't crash the page.
 */
export function resolveDateRange(params: RangeParams): ResolvedRange {
  const today = todayInIST();

  if (params.range === "custom") {
    const from = parseDateParam(params.from);
    const to = parseDateParam(params.to);
    if (from && to && from.getTime() <= to.getTime()) {
      const resolvedFrom = startOfUTCDay(from);
      const resolvedTo = endOfUTCDay(to);
      return { from: resolvedFrom, to: resolvedTo, bucketSize: bucketSizeFor(resolvedFrom, resolvedTo) };
    }
  } else if (params.range === "last-3-months") {
    const from = addMonths(startOfMonth(today), -2);
    const to = endOfUTCDay(today);
    return { from, to, bucketSize: bucketSizeFor(from, to) };
  } else if (params.range === "this-year") {
    const from = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    const to = endOfUTCDay(today);
    return { from, to, bucketSize: bucketSizeFor(from, to) };
  }

  // Default / "this-month" / any unrecognized or invalid value.
  const from = startOfMonth(today);
  const to = endOfUTCDay(today);
  return { from, to, bucketSize: bucketSizeFor(from, to) };
}

/**
 * Splits [from, to] into contiguous, non-overlapping buckets sized by
 * `bucketSize`. Month buckets align to calendar months (the first bucket
 * starts at startOfMonth(from), even if `from` isn't the 1st); day/week
 * buckets align to `from` itself rather than the calendar week, which is
 * simpler and fully deterministic. The final bucket is clipped to `to`.
 */
export function generateBuckets(from: Date, to: Date, bucketSize: BucketSize): Bucket[] {
  const buckets: Bucket[] = [];

  if (bucketSize === "month") {
    let cursor = startOfMonth(from);
    while (cursor.getTime() <= to.getTime()) {
      buckets.push({ start: cursor, end: endOfMonth(cursor), label: formatMonthYear(cursor) });
      cursor = addMonths(cursor, 1);
    }
    return buckets;
  }

  const stepMs = bucketSize === "week" ? 7 * DAY_MS : DAY_MS;
  let cursor = startOfUTCDay(from);
  while (cursor.getTime() <= to.getTime()) {
    const end = new Date(Math.min(cursor.getTime() + stepMs - 1, to.getTime()));
    buckets.push({ start: cursor, end, label: formatDateUTC(cursor) });
    cursor = new Date(cursor.getTime() + stepMs);
  }
  return buckets;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/date-range.test.ts`
Expected: PASS (9/9).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/date-range.ts tests/unit/date-range.test.ts
git commit -m "Add date-range resolution and time-bucketing helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Reminder-conversion logic (TDD)

**Files:**
- Create: `src/lib/reports/reminder-conversion.ts`
- Test: `tests/unit/reminder-conversion.test.ts`

**Interfaces:**
- Produces: `ReminderRecord = { id: string; studentId: string; sentAt: Date }`, `PaymentRecord = { studentId: string; paymentDate: Date }`, `computeReminderConversions(reminders: ReminderRecord[], payments: PaymentRecord[], now: Date): Map<string, boolean>` (keyed by reminder `id`). Task 7 (`reports-overview.ts`'s `getReminderActivity`) imports this by this exact name.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/reminder-conversion.test.ts
import { describe, it, expect } from "vitest";
import { computeReminderConversions } from "@/lib/reports/reminder-conversion";

describe("computeReminderConversions", () => {
  it("marks a reminder converted when a payment lands after it and before the next reminder", () => {
    const reminders = [
      { id: "r1", studentId: "s1", sentAt: new Date("2026-09-01T00:00:00Z") },
      { id: "r2", studentId: "s1", sentAt: new Date("2026-09-10T00:00:00Z") },
    ];
    const payments = [{ studentId: "s1", paymentDate: new Date("2026-09-05T00:00:00Z") }];
    const result = computeReminderConversions(reminders, payments, new Date("2026-09-20T00:00:00Z"));
    expect(result.get("r1")).toBe(true);
    expect(result.get("r2")).toBe(false);
  });

  it("uses `now` as the window end for a student's most recent reminder", () => {
    const reminders = [{ id: "r1", studentId: "s1", sentAt: new Date("2026-09-01T00:00:00Z") }];
    const payments = [{ studentId: "s1", paymentDate: new Date("2026-09-15T00:00:00Z") }];
    const result = computeReminderConversions(reminders, payments, new Date("2026-09-20T00:00:00Z"));
    expect(result.get("r1")).toBe(true);
  });

  it("does not count a payment made before the reminder was sent", () => {
    const reminders = [{ id: "r1", studentId: "s1", sentAt: new Date("2026-09-10T00:00:00Z") }];
    const payments = [{ studentId: "s1", paymentDate: new Date("2026-09-05T00:00:00Z") }];
    const result = computeReminderConversions(reminders, payments, new Date("2026-09-20T00:00:00Z"));
    expect(result.get("r1")).toBe(false);
  });

  it("returns false for a reminder with no matching payment at all", () => {
    const reminders = [{ id: "r1", studentId: "s1", sentAt: new Date("2026-09-01T00:00:00Z") }];
    const result = computeReminderConversions(reminders, [], new Date("2026-09-20T00:00:00Z"));
    expect(result.get("r1")).toBe(false);
  });

  it("keeps different students' reminders/payments independent", () => {
    const reminders = [
      { id: "r1", studentId: "s1", sentAt: new Date("2026-09-01T00:00:00Z") },
      { id: "r2", studentId: "s2", sentAt: new Date("2026-09-01T00:00:00Z") },
    ];
    const payments = [{ studentId: "s2", paymentDate: new Date("2026-09-05T00:00:00Z") }];
    const result = computeReminderConversions(reminders, payments, new Date("2026-09-20T00:00:00Z"));
    expect(result.get("r1")).toBe(false);
    expect(result.get("r2")).toBe(true);
  });

  it("sorts out-of-order input reminders by sentAt before pairing windows", () => {
    const reminders = [
      { id: "r2", studentId: "s1", sentAt: new Date("2026-09-10T00:00:00Z") },
      { id: "r1", studentId: "s1", sentAt: new Date("2026-09-01T00:00:00Z") },
    ];
    const payments = [{ studentId: "s1", paymentDate: new Date("2026-09-05T00:00:00Z") }];
    const result = computeReminderConversions(reminders, payments, new Date("2026-09-20T00:00:00Z"));
    expect(result.get("r1")).toBe(true);
    expect(result.get("r2")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/reminder-conversion.test.ts`
Expected: FAIL with "Cannot find module '@/lib/reports/reminder-conversion'".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/reports/reminder-conversion.ts

export type ReminderRecord = { id: string; studentId: string; sentAt: Date };
export type PaymentRecord = { studentId: string; paymentDate: Date };

/**
 * A reminder "converts" if the same student made a payment strictly after
 * that reminder was sent, and at or before the window end -- the
 * chronologically-next reminder sent to that same student, or `now` if
 * there is no next reminder. This intentionally does NOT check whether the
 * payment was "for" the same pending amount -- any payment in the window
 * counts, since the goal is "did reminding them correlate with them paying
 * soon after", not exact dollar-for-dollar attribution.
 */
export function computeReminderConversions(
  reminders: ReminderRecord[],
  payments: PaymentRecord[],
  now: Date
): Map<string, boolean> {
  const remindersByStudent = new Map<string, ReminderRecord[]>();
  for (const r of reminders) {
    const list = remindersByStudent.get(r.studentId) ?? [];
    list.push(r);
    remindersByStudent.set(r.studentId, list);
  }

  const paymentsByStudent = new Map<string, PaymentRecord[]>();
  for (const p of payments) {
    const list = paymentsByStudent.get(p.studentId) ?? [];
    list.push(p);
    paymentsByStudent.set(p.studentId, list);
  }

  const result = new Map<string, boolean>();
  for (const [studentId, studentReminders] of remindersByStudent) {
    const sorted = [...studentReminders].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
    const studentPayments = paymentsByStudent.get(studentId) ?? [];
    for (let i = 0; i < sorted.length; i++) {
      const reminder = sorted[i];
      const windowEnd = sorted[i + 1] ? sorted[i + 1].sentAt : now;
      const converted = studentPayments.some(
        (p) => p.paymentDate.getTime() > reminder.sentAt.getTime() && p.paymentDate.getTime() <= windowEnd.getTime()
      );
      result.set(reminder.id, converted);
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/reminder-conversion.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/reminder-conversion.ts tests/unit/reminder-conversion.test.ts
git commit -m "Add reminder-conversion window logic

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Shared tab/range-picker UI atoms

**Files:**
- Create: `src/components/reports/report-tabs.tsx`
- Create: `src/components/reports/date-range-picker.tsx`

**Interfaces:**
- Produces: `ReportTabs({ activeTab }: { activeTab: string })`, `DateRangePicker({ range, from, to }: { range: string; from: Date; to: Date })`. Task 11 (`reports/page.tsx`) renders `ReportTabs`; Task 9 (`overview-tab.tsx`) renders `DateRangePicker`.

Both are plain UI components with no dependency on Tasks 1–3 or 7–8 — safe to build in parallel with every other Task 4/5/6/7/8.

- [ ] **Step 1: Write `src/components/reports/report-tabs.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "operational", label: "Operational" },
] as const;

export function ReportTabs({ activeTab }: { activeTab: string }) {
  const searchParams = useSearchParams();

  return (
    <div className="flex gap-2 border-b border-card-border">
      {TABS.map((t) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", t.value);
        return (
          <Link
            key={t.value}
            href={`/reports?${params.toString()}`}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              activeTab === t.value
                ? "border-gold text-gold"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/reports/date-range-picker.tsx`**

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const PRESETS = [
  { value: "this-month", label: "This Month" },
  { value: "last-3-months", label: "Last 3 Months" },
  { value: "this-year", label: "This Year" },
  { value: "custom", label: "Custom Range" },
] as const;

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function DateRangePicker({ range, from, to }: { range: string; from: Date; to: Date }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) params.delete(key);
      else params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={range}
        onValueChange={(v) => updateParams({ range: v as string, from: undefined, to: undefined })}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Select a range">
            {(value: string) => PRESETS.find((p) => p.value === value)?.label ?? "Select a range"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {range === "custom" && (
        <>
          <Input
            type="date"
            value={toDateInputValue(from)}
            max={toDateInputValue(to)}
            onChange={(e) => updateParams({ range: "custom", from: e.target.value })}
            className="w-40"
          />
          <span className="text-sm text-muted">to</span>
          <Input
            type="date"
            value={toDateInputValue(to)}
            min={toDateInputValue(from)}
            onChange={(e) => updateParams({ range: "custom", to: e.target.value })}
            className="w-40"
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/reports/report-tabs.tsx src/components/reports/date-range-picker.tsx
git commit -m "Add shared Reports tab/date-range-picker UI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Chart components (+ Recharts dependency)

**Files:**
- Modify: `package.json`, `package-lock.json` (add `recharts`)
- Create: `src/components/reports/revenue-chart.tsx`
- Create: `src/components/reports/attendance-trend-chart.tsx`

**Interfaces:**
- Produces: `RevenuePoint = { label: string; total: number }`, `RevenueChart({ data }: { data: RevenuePoint[] })`; `AttendanceTrendPoint = { label: string; rate: number }`, `AttendanceTrendChart({ data }: { data: AttendanceTrendPoint[] })`. Task 9 (`overview-tab.tsx`) imports both by these exact names, and imports `RevenuePoint`/`AttendanceTrendPoint` as the shape it must pass.

No dependency on Tasks 1–4 or 6–8 — safe to build in parallel with all of them.

- [ ] **Step 1: Install Recharts**

```bash
npm install recharts
```

- [ ] **Step 2: Write `src/components/reports/revenue-chart.tsx`**

```tsx
"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export type RevenuePoint = { label: string; total: number };

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
          <YAxis
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickFormatter={(value: number) => `₹${value.toLocaleString("en-IN")}`}
          />
          <Tooltip formatter={(value: number) => [`₹${value.toLocaleString("en-IN")}`, "Revenue"]} />
          <Line type="monotone" dataKey="total" stroke="var(--gold)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Write `src/components/reports/attendance-trend-chart.tsx`**

```tsx
"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export type AttendanceTrendPoint = { label: string; rate: number };

export function AttendanceTrendChart({ data }: { data: AttendanceTrendPoint[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickFormatter={(value: number) => `${value}%`}
          />
          <Tooltip formatter={(value: number) => [`${value}%`, "Attendance Rate"]} />
          <Line type="monotone" dataKey="rate" stroke="var(--gold)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles and builds**

```bash
npx tsc --noEmit
```

Expected: clean. If Recharts' bundled types conflict with the project's TS config, resolve by checking the installed `recharts` version's peer-dependency requirements against this project's React/Next version (`package.json`) before making any other change.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/reports/revenue-chart.tsx src/components/reports/attendance-trend-chart.tsx
git commit -m "Add Recharts dependency and Reports trend chart components

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: CSV export button (client component)

**Files:**
- Create: `src/components/reports/export-button.tsx`

**Interfaces:**
- Consumes: `toCsv`, `CsvColumn`, `CsvValue` (`@/lib/csv`, Task 1).
- Produces: `ExportButton<T extends Record<string, CsvValue>>({ rows, columns, filename }: { rows: T[]; columns: CsvColumn<T>[]; filename: string })`. Tasks 9 and 10 import this by this exact name.

- [ ] **Step 1: Write `src/components/reports/export-button.tsx`**

```tsx
"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toCsv, type CsvColumn, type CsvValue } from "@/lib/csv";

export function ExportButton<T extends Record<string, CsvValue>>({
  rows,
  columns,
  filename,
}: {
  rows: T[];
  columns: CsvColumn<T>[];
  filename: string;
}) {
  function handleExport() {
    const csv = toCsv(rows, columns);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download size={14} className="mr-2" />
      Export CSV
    </Button>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/reports/export-button.tsx
git commit -m "Add reusable CSV export button

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Overview report queries (server-only reads)

**Files:**
- Create: `src/lib/queries/reports-overview.ts`

**Interfaces:**
- Consumes: `ResolvedRange`, `generateBuckets` (`@/lib/reports/date-range`, Task 2); `computeReminderConversions` (`@/lib/reports/reminder-conversion`, Task 3); `listStudentFeeStatuses` (`@/lib/queries/fees`, Phase 2); `computeAttendanceRate` (`@/lib/attendance/rate`, Phase 3); `prisma` (`@/lib/db`).
- Produces: `getRevenueOverTime(range: ResolvedRange): Promise<{ label: string; total: number }[]>`, `getOutstandingDuesSummary(): Promise<{ totalPending: number; overdueCount: number; partialCount: number; dueCount: number }>`, `getAttendanceRateOverTime(range: ResolvedRange): Promise<{ label: string; rate: number }[]>`, `getReminderActivity(range: ResolvedRange): Promise<{ label: string; sent: number; converted: number }[]>`. Task 9 (`overview-tab.tsx`) imports all four by these exact names.

- [ ] **Step 1: Write `src/lib/queries/reports-overview.ts`**

```ts
// Read-only queries, not mutations -- lives outside src/actions/ (which is
// "use server") so these can never be called as Server Actions from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/db";
import { generateBuckets, type ResolvedRange } from "@/lib/reports/date-range";
import { computeReminderConversions } from "@/lib/reports/reminder-conversion";
import { listStudentFeeStatuses } from "@/lib/queries/fees";
import { computeAttendanceRate } from "@/lib/attendance/rate";

export async function getRevenueOverTime(range: ResolvedRange) {
  const payments = await prisma.payment.findMany({
    where: { paymentDate: { gte: range.from, lte: range.to } },
    select: { amount: true, paymentDate: true },
  });
  const buckets = generateBuckets(range.from, range.to, range.bucketSize);
  return buckets.map((b) => {
    const total = payments
      .filter((p) => p.paymentDate.getTime() >= b.start.getTime() && p.paymentDate.getTime() <= b.end.getTime())
      .reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
    return { label: b.label, total: total.toNumber() };
  });
}

export async function getOutstandingDuesSummary() {
  const statuses = await listStudentFeeStatuses();
  const pending = statuses.filter(
    (s): s is Extract<(typeof statuses)[number], { hasPlan: true }> => s.hasPlan && s.totalPending.gt(0)
  );

  let totalPending = new Decimal(0);
  let overdueCount = 0;
  let partialCount = 0;
  let dueCount = 0;
  for (const s of pending) {
    totalPending = totalPending.plus(s.totalPending);
    if (s.status === "OVERDUE") overdueCount += 1;
    else if (s.status === "PARTIAL") partialCount += 1;
    else if (s.status === "DUE") dueCount += 1;
  }

  return { totalPending: totalPending.toNumber(), overdueCount, partialCount, dueCount };
}

export async function getAttendanceRateOverTime(range: ResolvedRange) {
  const records = await prisma.attendance.findMany({
    where: { date: { gte: range.from, lte: range.to } },
    select: { date: true, status: true },
  });
  const buckets = generateBuckets(range.from, range.to, range.bucketSize);
  return buckets.map((b) => {
    const inBucket = records.filter(
      (r) => r.date.getTime() >= b.start.getTime() && r.date.getTime() <= b.end.getTime()
    );
    return { label: b.label, rate: computeAttendanceRate(inBucket) };
  });
}

export async function getReminderActivity(range: ResolvedRange) {
  const buckets = generateBuckets(range.from, range.to, range.bucketSize);

  const remindersInRange = await prisma.feeReminder.findMany({
    where: { sentAt: { gte: range.from, lte: range.to } },
    select: { id: true, studentId: true, sentAt: true },
  });
  if (remindersInRange.length === 0) {
    return buckets.map((b) => ({ label: b.label, sent: 0, converted: 0 }));
  }

  // Conversion for a reminder can depend on its next reminder or on a
  // payment outside the selected range, so this fetches ALL of the
  // relevant students' reminders/payments (not just those inside [from,
  // to]) rather than restricting the conversion computation to the range.
  const studentIds = [...new Set(remindersInRange.map((r) => r.studentId))];
  const [allReminders, allPayments] = await Promise.all([
    prisma.feeReminder.findMany({
      where: { studentId: { in: studentIds } },
      select: { id: true, studentId: true, sentAt: true },
    }),
    prisma.payment.findMany({
      where: { studentId: { in: studentIds } },
      select: { studentId: true, paymentDate: true },
    }),
  ]);
  const conversions = computeReminderConversions(allReminders, allPayments, new Date());

  return buckets.map((b) => {
    const inBucket = remindersInRange.filter(
      (r) => r.sentAt.getTime() >= b.start.getTime() && r.sentAt.getTime() <= b.end.getTime()
    );
    const converted = inBucket.filter((r) => conversions.get(r.id)).length;
    return { label: b.label, sent: inBucket.length, converted };
  });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Verify against the real database**

The shared Neon database has real students/fee-plans/attendance/reminders from Phases 2–4 usage — do not assume it's empty. Write a temporary script (delete when done, use a distinct temp-student-code prefix, clean up all created rows afterward) that:

1. Creates one temporary test student with a fee plan and a payment dated inside "This Month", and confirms `getRevenueOverTime({..this-month resolved..})` includes that payment's amount in the correct bucket.
2. Confirms `getOutstandingDuesSummary()`'s `totalPending`/counts change by the expected amount/count after creating the temp student's pending fee plan, and change back after cleanup.
3. Creates one Attendance record (PRESENT) dated today for the temp student on a temp batch, confirms `getAttendanceRateOverTime` reflects it in the correct bucket.
4. Creates two `FeeReminder` rows for the temp student with a `Payment` dated between them, confirms `getReminderActivity` reports the first as converted and (if a second reminder with no later payment exists) the second as not converted, with `sent`/`converted` counts matching.
5. Cleans up all test data (FeeReminder, Attendance, Payment, FeePlan, Enrollment, Batch, both the temp student and its batch). Confirm the database is back to its pre-test state.

- [ ] **Step 4: Run full regression**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: clean (this task adds no new test file — thin composition over already-tested logic from Tasks 2–3 plus Phase 2/3's `listStudentFeeStatuses`/`computeAttendanceRate`, verified manually against the real DB per the established Phase 2–4 precedent).

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/reports-overview.ts
git commit -m "Add Overview tab report queries (revenue, dues, attendance rate, reminder activity)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Operational report queries (server-only reads)

**Files:**
- Create: `src/lib/queries/reports-operational.ts`

**Interfaces:**
- Consumes: `ResolvedRange` (`@/lib/reports/date-range`, Task 2); `listStudentsWithPendingFees` (`@/lib/queries/reminders`, Phase 4); `todayInIST` (`@/lib/dates`); `prisma` (`@/lib/db`).
- Produces: `getOverdueStudents(): Promise<Awaited<ReturnType<typeof listStudentsWithPendingFees>>>` (filtered to `status === "OVERDUE"`), `getAttendanceGaps(days: number): Promise<{ studentId: string; studentCode: string; name: string; mobile: string; lastAttendedAt: Date | null }[]>`, `getRecentJoinsAndLeaves(range: ResolvedRange): Promise<{ joined: { studentId: string; studentCode: string; name: string; mobile: string; joiningDate: Date }[]; left: { studentId: string; studentCode: string; name: string; mobile: string; leftAt: Date }[] }>`. Task 10 (`operational-tab.tsx`) imports all three by these exact names.

- [ ] **Step 1: Write `src/lib/queries/reports-operational.ts`**

```ts
// Read-only queries, not mutations -- lives outside src/actions/ (which is
// "use server") so these can never be called as Server Actions from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { prisma } from "@/lib/db";
import { todayInIST } from "@/lib/dates";
import { listStudentsWithPendingFees } from "@/lib/queries/reminders";
import type { ResolvedRange } from "@/lib/reports/date-range";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getOverdueStudents() {
  const pending = await listStudentsWithPendingFees();
  return pending.filter((s) => s.status === "OVERDUE");
}

export async function getAttendanceGaps(days: number) {
  const cutoff = new Date(todayInIST().getTime() - days * DAY_MS);
  const students = await prisma.student.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: {
      id: true,
      studentCode: true,
      name: true,
      mobile: true,
      attendance: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
    },
  });

  return students
    .map((s) => ({
      studentId: s.id,
      studentCode: s.studentCode,
      name: s.name,
      mobile: s.mobile,
      lastAttendedAt: s.attendance[0]?.date ?? null,
    }))
    .filter((s) => !s.lastAttendedAt || s.lastAttendedAt.getTime() < cutoff.getTime())
    .sort((a, b) => {
      // Students who never attended sort first (most urgent), then
      // oldest-last-attended first.
      if (!a.lastAttendedAt && !b.lastAttendedAt) return 0;
      if (!a.lastAttendedAt) return -1;
      if (!b.lastAttendedAt) return 1;
      return a.lastAttendedAt.getTime() - b.lastAttendedAt.getTime();
    });
}

export async function getRecentJoinsAndLeaves(range: ResolvedRange) {
  const [joined, left] = await Promise.all([
    prisma.student.findMany({
      where: { deletedAt: null, joiningDate: { gte: range.from, lte: range.to } },
      select: { id: true, studentCode: true, name: true, mobile: true, joiningDate: true },
      orderBy: { joiningDate: "desc" },
    }),
    prisma.student.findMany({
      where: { deletedAt: null, status: "LEFT", updatedAt: { gte: range.from, lte: range.to } },
      select: { id: true, studentCode: true, name: true, mobile: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    joined: joined.map((s) => ({
      studentId: s.id,
      studentCode: s.studentCode,
      name: s.name,
      mobile: s.mobile,
      joiningDate: s.joiningDate,
    })),
    left: left.map((s) => ({
      studentId: s.id,
      studentCode: s.studentCode,
      name: s.name,
      mobile: s.mobile,
      leftAt: s.updatedAt,
    })),
  };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Verify against the real database**

Write a temporary script (delete when done, distinct temp-student-code prefix, clean up all created rows afterward) that:

1. Creates a temp student with an OVERDUE fee plan (`dueDate` far enough in the past that the current period is overdue), confirms they appear in `getOverdueStudents()`.
2. Creates a temp student with `status: "ACTIVE"` and no Attendance rows at all, confirms they appear in `getAttendanceGaps(14)` with `lastAttendedAt: null`, sorted before a student with an old-but-present attendance record. Creates an Attendance row dated `today` for a second temp student, confirms that student does NOT appear in `getAttendanceGaps(14)`.
3. Creates a temp student with `joiningDate` inside "This Month", confirms they appear in `getRecentJoinsAndLeaves(<this-month range>).joined`. Creates a temp student with `status: "LEFT"` (triggering `updatedAt` to now), confirms they appear in `.left`.
4. Confirms a soft-deleted (`deletedAt` set) temp student does NOT appear in any of the three functions' results.
5. Cleans up all test data (Attendance, Payment, FeePlan, both temp students, any temp batch created). Confirm the database is back to its pre-test state.

- [ ] **Step 4: Run full regression**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/reports-operational.ts
git commit -m "Add Operational tab report queries (overdue, attendance gaps, joins/leaves)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Overview tab component

**Files:**
- Create: `src/components/reports/overview-tab.tsx`

**Interfaces:**
- Consumes: `getRevenueOverTime`, `getOutstandingDuesSummary`, `getAttendanceRateOverTime`, `getReminderActivity` (`@/lib/queries/reports-overview`, Task 7); `DateRangePicker` (`@/components/reports/date-range-picker`, Task 4); `RevenueChart`, `AttendanceTrendChart` (Task 5); `ExportButton` (Task 6); `StatCard` (`@/components/dashboard/stat-card`); `ResolvedRange` (`@/lib/reports/date-range`, Task 2).
- Produces: `OverviewTab({ range, rangeParam }: { range: ResolvedRange; rangeParam: string })`, an `async` Server Component. Task 11 (`reports/page.tsx`) renders this by this exact name.

- [ ] **Step 1: Write `src/components/reports/overview-tab.tsx`**

```tsx
import { Wallet, AlertCircle, Clock, BellRing } from "lucide-react";
import {
  getRevenueOverTime,
  getOutstandingDuesSummary,
  getAttendanceRateOverTime,
  getReminderActivity,
} from "@/lib/queries/reports-overview";
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { RevenueChart } from "@/components/reports/revenue-chart";
import { AttendanceTrendChart } from "@/components/reports/attendance-trend-chart";
import { ExportButton } from "@/components/reports/export-button";
import { StatCard } from "@/components/dashboard/stat-card";
import type { ResolvedRange } from "@/lib/reports/date-range";

export async function OverviewTab({ range, rangeParam }: { range: ResolvedRange; rangeParam: string }) {
  const [revenue, dues, attendanceTrend, reminderActivity] = await Promise.all([
    getRevenueOverTime(range),
    getOutstandingDuesSummary(),
    getAttendanceRateOverTime(range),
    getReminderActivity(range),
  ]);

  const totalSent = reminderActivity.reduce((sum, r) => sum + r.sent, 0);
  const totalConverted = reminderActivity.reduce((sum, r) => sum + r.converted, 0);
  const conversionRate = totalSent === 0 ? null : Math.round((totalConverted / totalSent) * 100);

  return (
    <div className="space-y-6">
      <DateRangePicker range={rangeParam} from={range.from} to={range.to} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Wallet} label="Total Pending" value={`₹${dues.totalPending.toLocaleString("en-IN")}`} />
        <StatCard icon={AlertCircle} label="Overdue" value={String(dues.overdueCount)} />
        <StatCard icon={Clock} label="Partial" value={String(dues.partialCount)} />
        <StatCard icon={BellRing} label="Due" value={String(dues.dueCount)} />
      </div>

      <div className="glass-card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Revenue Collected</h2>
          <ExportButton
            rows={revenue}
            columns={[
              { key: "label", label: "Period" },
              { key: "total", label: "Revenue" },
            ]}
            filename="revenue.csv"
          />
        </div>
        <RevenueChart data={revenue} />
      </div>

      <div className="glass-card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Attendance Rate</h2>
          <ExportButton
            rows={attendanceTrend}
            columns={[
              { key: "label", label: "Period" },
              { key: "rate", label: "Attendance Rate (%)" },
            ]}
            filename="attendance-trend.csv"
          />
        </div>
        <AttendanceTrendChart data={attendanceTrend} />
      </div>

      <div className="glass-card space-y-2 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Reminder Activity</h2>
          <ExportButton
            rows={reminderActivity}
            columns={[
              { key: "label", label: "Period" },
              { key: "sent", label: "Reminders Sent" },
              { key: "converted", label: "Converted" },
            ]}
            filename="reminder-activity.csv"
          />
        </div>
        <p className="text-sm text-muted">
          {totalSent} sent, {totalConverted} converted
          {conversionRate !== null && ` (${conversionRate}% conversion rate)`}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/reports/overview-tab.tsx
git commit -m "Add Overview tab component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Operational tab component

**Files:**
- Create: `src/components/reports/gap-days-select.tsx`
- Create: `src/components/reports/operational-tab.tsx`

**Interfaces:**
- Consumes: `getOverdueStudents`, `getAttendanceGaps`, `getRecentJoinsAndLeaves` (`@/lib/queries/reports-operational`, Task 8); `ExportButton` (Task 6); `EmptyState` (`@/components/shared/empty-state`); `formatDateUTC` (`@/lib/dates`); `ResolvedRange` (`@/lib/reports/date-range`, Task 2).
- Produces: `GapDaysSelect({ value }: { value: number })`; `OperationalTab({ range, gapDays }: { range: ResolvedRange; gapDays: number })`, an `async` Server Component. Task 11 (`reports/page.tsx`) renders `OperationalTab` by this exact name.

- [ ] **Step 1: Write `src/components/reports/gap-days-select.tsx`**

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const OPTIONS = [7, 14, 30];

export function GapDaysSelect({ value }: { value: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateGapDays(days: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("gapDays", days);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={String(value)} onValueChange={(v) => updateGapDays(v as string)}>
      <SelectTrigger className="w-32">
        <SelectValue placeholder="Days">{(v: string) => `${v} days`}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((d) => (
          <SelectItem key={d} value={String(d)}>
            {d} days
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Write `src/components/reports/operational-tab.tsx`**

```tsx
import { AlertCircle, ClipboardX, UserPlus, UserMinus } from "lucide-react";
import {
  getOverdueStudents,
  getAttendanceGaps,
  getRecentJoinsAndLeaves,
} from "@/lib/queries/reports-operational";
import { ExportButton } from "@/components/reports/export-button";
import { GapDaysSelect } from "@/components/reports/gap-days-select";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateUTC } from "@/lib/dates";
import type { ResolvedRange } from "@/lib/reports/date-range";

export async function OperationalTab({ range, gapDays }: { range: ResolvedRange; gapDays: number }) {
  const [overdue, gaps, joinsAndLeaves] = await Promise.all([
    getOverdueStudents(),
    getAttendanceGaps(gapDays),
    getRecentJoinsAndLeaves(range),
  ]);

  return (
    <div className="space-y-6">
      <div className="glass-card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Overdue Students</h2>
          <ExportButton
            rows={overdue.map((s) => ({
              studentCode: s.studentCode,
              name: s.name,
              mobile: s.mobile,
              totalPending: s.totalPending.toNumber(),
            }))}
            columns={[
              { key: "studentCode", label: "Student Code" },
              { key: "name", label: "Name" },
              { key: "mobile", label: "Mobile" },
              { key: "totalPending", label: "Pending Amount" },
            ]}
            filename="overdue-students.csv"
          />
        </div>
        {overdue.length === 0 ? (
          <EmptyState icon={AlertCircle} title="No students are overdue." />
        ) : (
          <div className="divide-y divide-card-border">
            {overdue.map((s) => (
              <div key={s.studentId} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="text-sm text-muted">{s.studentCode}</p>
                </div>
                <p className="text-sm font-medium text-danger">
                  ₹{s.totalPending.toNumber().toLocaleString("en-IN")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Attendance Gaps</h2>
          <div className="flex items-center gap-3">
            <GapDaysSelect value={gapDays} />
            <ExportButton
              rows={gaps.map((s) => ({
                studentCode: s.studentCode,
                name: s.name,
                mobile: s.mobile,
                lastAttendedAt: s.lastAttendedAt ? formatDateUTC(s.lastAttendedAt) : "Never",
              }))}
              columns={[
                { key: "studentCode", label: "Student Code" },
                { key: "name", label: "Name" },
                { key: "mobile", label: "Mobile" },
                { key: "lastAttendedAt", label: "Last Attended" },
              ]}
              filename="attendance-gaps.csv"
            />
          </div>
        </div>
        {gaps.length === 0 ? (
          <EmptyState icon={ClipboardX} title={`No active students have a ${gapDays}+ day attendance gap.`} />
        ) : (
          <div className="divide-y divide-card-border">
            {gaps.map((s) => (
              <div key={s.studentId} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="text-sm text-muted">{s.studentCode}</p>
                </div>
                <p className="text-sm text-muted">
                  {s.lastAttendedAt ? `Last attended ${formatDateUTC(s.lastAttendedAt)}` : "Never attended"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="glass-card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Recently Joined</h2>
            <ExportButton
              rows={joinsAndLeaves.joined.map((s) => ({
                studentCode: s.studentCode,
                name: s.name,
                mobile: s.mobile,
                joiningDate: formatDateUTC(s.joiningDate),
              }))}
              columns={[
                { key: "studentCode", label: "Student Code" },
                { key: "name", label: "Name" },
                { key: "mobile", label: "Mobile" },
                { key: "joiningDate", label: "Joined On" },
              ]}
              filename="recent-joins.csv"
            />
          </div>
          {joinsAndLeaves.joined.length === 0 ? (
            <EmptyState icon={UserPlus} title="No new students joined in this range." />
          ) : (
            <div className="divide-y divide-card-border">
              {joinsAndLeaves.joined.map((s) => (
                <div key={s.studentId} className="flex items-center justify-between gap-4 py-3">
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="text-sm text-muted">{formatDateUTC(s.joiningDate)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Recently Left</h2>
            <ExportButton
              rows={joinsAndLeaves.left.map((s) => ({
                studentCode: s.studentCode,
                name: s.name,
                mobile: s.mobile,
                leftAt: formatDateUTC(s.leftAt),
              }))}
              columns={[
                { key: "studentCode", label: "Student Code" },
                { key: "name", label: "Name" },
                { key: "mobile", label: "Mobile" },
                { key: "leftAt", label: "Left On" },
              ]}
              filename="recent-leaves.csv"
            />
          </div>
          {joinsAndLeaves.left.length === 0 ? (
            <EmptyState icon={UserMinus} title="No students left in this range." />
          ) : (
            <div className="divide-y divide-card-border">
              {joinsAndLeaves.left.map((s) => (
                <div key={s.studentId} className="flex items-center justify-between gap-4 py-3">
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="text-sm text-muted">{formatDateUTC(s.leftAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/reports/gap-days-select.tsx src/components/reports/operational-tab.tsx
git commit -m "Add Operational tab component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Reports page integration

**Files:**
- Modify: `src/app/(app)/reports/page.tsx` (replace the Phase 1 `PhaseStub`)

**Interfaces:**
- Consumes: `ReportTabs` (Task 4); `OverviewTab` (Task 9); `OperationalTab` (Task 10); `resolveDateRange` (`@/lib/reports/date-range`, Task 2).

- [ ] **Step 1: Rewrite `src/app/(app)/reports/page.tsx`**

```tsx
import { ReportTabs } from "@/components/reports/report-tabs";
import { OverviewTab } from "@/components/reports/overview-tab";
import { OperationalTab } from "@/components/reports/operational-tab";
import { resolveDateRange } from "@/lib/reports/date-range";

const VALID_TABS = ["overview", "operational"] as const;
const DEFAULT_GAP_DAYS = 14;
const VALID_GAP_DAYS = [7, 14, 30];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; range?: string; from?: string; to?: string; gapDays?: string }>;
}) {
  const params = await searchParams;
  const tab = (VALID_TABS as readonly string[]).includes(params.tab ?? "") ? (params.tab as string) : "overview";
  const range = resolveDateRange(params);
  const rangeParam = params.range ?? "this-month";
  const parsedGapDays = Number(params.gapDays);
  const gapDays = VALID_GAP_DAYS.includes(parsedGapDays) ? parsedGapDays : DEFAULT_GAP_DAYS;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
      <ReportTabs activeTab={tab} />
      {tab === "operational" ? (
        <OperationalTab range={range} gapDays={gapDays} />
      ) : (
        <OverviewTab range={range} rangeParam={rangeParam} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Verify manually**

Since a logged-in browser click-through may not be available in this environment (every prior phase hit this exact restriction), verify via a temporary script exercising the full chain end-to-end against the real database: call `resolveDateRange({})`, then `OverviewTab`'s underlying queries and `OperationalTab`'s underlying queries directly with a temporary test student, confirming the shapes returned match what each component destructures (no runtime property-access errors). If real browser access is available, use it and take a screenshot of both tabs instead. Clean up all test data afterward.

- [ ] **Step 4: Run full regression**

```bash
npx vitest run
npx tsc --noEmit
npx eslint .
```

Expected: all clean, eslint matching the project's pre-existing baseline (13 problems / 1 error / 12 warnings, none in Reports files).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/reports/page.tsx"
git commit -m "Wire up the Reports page (Overview + Operational tabs)

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

Expected: every test passes (Phase 1–4's baseline plus this phase's 21 new unit tests: 6 CSV + 9 date-range + 6 reminder-conversion); `tsc`/`eslint` clean or matching the pre-existing baseline with no new errors/warnings from this phase's files; `next build` clean with `/reports` present in the route table.

- [ ] **Step 2: End-to-end verification**

Create one temporary test student with a fee plan (partially paid, so they show as PARTIAL/OVERDUE), an Attendance record, and a FeeReminder. Confirm:
- The Overview tab's queries (`getRevenueOverTime`, `getOutstandingDuesSummary`, `getAttendanceRateOverTime`, `getReminderActivity`) all reflect this student's data in the correct bucket/summary for "This Month".
- The Operational tab's queries (`getOverdueStudents`, `getAttendanceGaps`, `getRecentJoinsAndLeaves`) correctly include/exclude this student as expected for their current state.
- Switching the `range` param to `"last-3-months"` and `"this-year"` doesn't throw and produces a `ResolvedRange` with the expected bucket size.
- `toCsv()` on a sample of this real data produces valid, correctly-escaped CSV output.

Clean up all test data afterward, confirm the database is back to its pre-phase baseline.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "Phase 5 (Reports) complete: manual verification pass

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Post-Plan Check

At the end of this plan: the admin has one place (`/reports`) to see revenue, dues, attendance, and reminder trends over any time range, plus three actionable operational lists, with CSV export on every table. SAINTS Journey (Phase 6) and Settings/notifications (Phase 7) are unrelated to this phase's scope.
