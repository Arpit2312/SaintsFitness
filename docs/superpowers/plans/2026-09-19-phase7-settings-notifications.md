# Phase 7: Settings & Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurable academy/receipt/fee-reminder settings wired into the real receipts and reminders, a notification center (bell + `/notifications`) for five event types, and a dashboard "Recent Activity" feed.

**Architecture:** A singleton `AcademySettings` row (defaults in code when absent) drives receipt numbers, the receipt page, the sidebar brand and the reminder template. Event notifications (new admission, payment received) are written by the existing actions; time-based ones (overdue, due soon, low attendance) come from a throttled, atomically-claimed sync run by the app layout and de-duplicated by a unique `dedupeKey`. Pure logic (formatting, templates, validation, candidate builders, activity merge) is unit-tested; queries/actions/UI are verified manually against the real database.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Prisma/PostgreSQL, zod 3, Tailwind/base-ui components, vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-phase7-settings-notifications-design.md`

## Global Constraints

- The schema change is ADDITIVE ONLY: a new `AcademySettings` model and `Notification.dedupeKey`/index. The generated migration SQL must contain only `CREATE TABLE`, `ADD COLUMN`, and `CREATE INDEX` statements.
- `AcademySettings.reminderTemplate` is a nullable `String?`; `null` means "use `DEFAULT_REMINDER_TEMPLATE` from code" (this keeps a long multi-line literal with `₹` out of the migration). Every other setting has a schema default identical to `DEFAULT_SETTINGS` in code.
- `getSettings()` (`src/lib/queries/settings.ts`) returns `DEFAULT_SETTINGS` when no row exists and MUST NOT `import "server-only"`: `src/lib/ids.ts` (which unit tests import) calls it, and `server-only` throws under vitest. It imports the Prisma client, so it can never be bundled for the browser anyway. Do not wrap it in React's `cache()` (unavailable outside an RSC render, e.g. in verification scripts).
- Forms use plain controlled `useState` (no `react-hook-form`), validate client-side with `schema.safeParse` for inline errors, and never reseed state with `useEffect` + `setState` (`react-hooks/set-state-in-effect`). Do not call impure functions (`new Date()`, `Date.now()`) during render in client components; pass the year/date in as a prop from a Server Component.
- Every new user-facing label, button and heading is Title Case ("Save Settings", "Mark All Read"). Empty states inside a `glass-card` are plain `<p className="py-6 text-center text-sm text-muted">` text; use `EmptyState` only at page top level.
- Only plain values (numbers, strings, booleans, `null`, `Date`) may cross into a `"use client"` component; never a Prisma `Decimal`. Client components may `import type` from server-only modules but never import their values.
- Notification, sync and activity queries exclude soft-deleted students (`deletedAt: null`).
- A failure to create a notification, or to run the sync, is caught and logged (`console.error`) and must never fail an admission, a payment, or a page render.
- The logo URL must be `https://`; render it with a plain `<img>` and a one-line `eslint-disable-next-line @next/next/no-img-element -- <reason>` comment (do not add `next/image` remote-host config, and do not introduce new lint warnings: the repo baseline is exactly 13 problems).
- Reuse existing helpers; invent no new date primitives: `startOfUTCDay`, `todayInIST`, `formatDateUTC` (`@/lib/dates`), `computeAttendanceRate` (`@/lib/attendance/rate`), `listPendingStudentsWithDues` / `classifyDues` (Phase 5), `ConfirmDialog`, `EmptyState`, `Button`, `Input`, `Label`, `Textarea`, `Checkbox`.
- In this Next.js version a page's `params`/`searchParams` are Promises; a page/layout may do DB work during render.
- **Real-DB verification safety rules (the shared Neon database is PRODUCTION data):**
  1. Use your own distinct temp student-code prefix (given per task), never assume the DB is empty, assert on your own rows and before/after deltas, delete only what you created (children before parents), confirm zero leftovers.
  2. NEVER call `createStudent`, `createPayment` or `generateReceiptNumber()` (no-argument form) against the real database: they consume real student-code / receipt sequence numbers and would leave gaps in the sequences. Verify wiring for those by `tsc` + reading, and exercise the underlying helpers directly.
  3. Only Task 7's verification may write the real `AcademySettings` row, and it must snapshot the row (or record its absence) first and restore it exactly afterwards (delete the row if it did not exist).
  4. NEVER run the full `syncTimeBasedNotifications()` unscoped against the real DB (it would create real notifications for real students); use its `studentIds` option to restrict it to your temp students.
  5. Write throwaway scripts at the worktree root named `_tmp_*.ts`. Files that `import "server-only"` throw outside Next: create a throwaway preload `_tmp_preload_<x>.cjs` that monkeypatches `Module._resolveFilename` so the request `"server-only"` resolves to a stub `.cjs` containing `module.exports = {};` (and, for Server Actions, also stub `next/cache`'s `revalidatePath`), run with `npx tsx --require ./_tmp_preload_<x>.cjs _tmp_<x>.ts`, delete every `_tmp_*` file when done, and leave NO background process running.
  6. Prisma required fields: Student needs `name, studentCode, mobile ("9876543210"), dob (Date), gender ("MALE"), joiningDate (Date)`; FeePlan needs `studentId, dueDate, frequency ("MONTHLY" or "CUSTOM"), totalAmount, discount, finalAmount` (Decimal from `@prisma/client/runtime/library`); Payment needs `studentId, feePlanId (MUST be set), amount, paymentDate, mode ("CASH"), coverageStart, coverageEnd` (use `computeCoverageRange` from `src/lib/fees/periods.ts`); Attendance needs a real Batch (with a Course; read `prisma/schema.prisma` for required fields), `studentId, batchId, date, status`; `Notification` needs `type, message` (+ optional `studentId`, `dedupeKey`).

---

## Task 1: Schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_settings_and_notification_dedupe/migration.sql` (generated)

**Interfaces:**
- Produces: Prisma model `AcademySettings` (accessor `prisma.academySettings`) with fields `id (String, default "default"), academyName, logoUrl?, address?, mobile?, email?, receiptPrefix, receiptIncludeYear, receiptFooter, reminderTemplate?, dueSoonDays, overdueReminderDays, lastNotificationSyncAt?, updatedAt`; and `Notification.dedupeKey String? @unique`. Tasks 6-12 use these by these exact names.

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Add the new model (place it after `Notification`):

```prisma
model AcademySettings {
  id                     String    @id @default("default")
  academyName            String    @default("SAINTS")
  logoUrl                String?
  address                String?
  mobile                 String?
  email                  String?
  receiptPrefix          String    @default("SNT")
  receiptIncludeYear     Boolean   @default(true)
  receiptFooter          String    @default("Thank You")
  /// null => use DEFAULT_REMINDER_TEMPLATE from src/lib/settings/defaults.ts
  reminderTemplate       String?
  dueSoonDays            Int       @default(3)
  overdueReminderDays    Int       @default(7)
  lastNotificationSyncAt DateTime?
  updatedAt              DateTime  @updatedAt
}
```

Change `Notification` to:

```prisma
model Notification {
  id        String   @id @default(cuid())
  studentId String?
  student   Student? @relation(fields: [studentId], references: [id])
  type      String
  message   String
  read      Boolean  @default(false)
  dedupeKey String?  @unique
  createdAt DateTime @default(now())

  @@index([read, createdAt])
}
```

- [ ] **Step 2: Generate and apply the migration**

```bash
npx prisma migrate dev --name add_settings_and_notification_dedupe
```

Expected: a new folder under `prisma/migrations/` whose `migration.sql` contains only `CREATE TABLE "AcademySettings"`, `ALTER TABLE "Notification" ADD COLUMN "dedupeKey"`, `CREATE UNIQUE INDEX`, and `CREATE INDEX` statements; the client is regenerated. This applies to the shared database and is additive, so it is safe for the live site. If Git shows `prisma/migrations/migration_lock.toml` modified only by line endings, restore it with `git checkout -- prisma/migrations/migration_lock.toml`.

- [ ] **Step 3: Verify**

```bash
npx prisma generate
npx tsc --noEmit
```

Expected: no errors other than the known missing generated `LayoutProps` type in `src/app/layout.tsx` (it disappears after any `next build`). Read the generated `migration.sql` and confirm it is additive only.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "Add AcademySettings model and Notification dedupe key

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Settings pure logic (TDD)

**Files:**
- Create: `src/lib/settings/defaults.ts`
- Create: `src/lib/settings/receipt.ts`
- Create: `src/lib/settings/reminder-template.ts`
- Test: `tests/unit/settings-defaults.test.ts`, `tests/unit/settings-receipt.test.ts`, `tests/unit/settings-reminder-template.test.ts`

**Interfaces:**
- Produces (`defaults.ts`): `SETTINGS_ID = "default"`, `REMINDER_PLACEHOLDERS` (`readonly ["name", "amount", "academy"]`), `DEFAULT_REMINDER_TEMPLATE`, `SettingsValues`, `DEFAULT_SETTINGS`.
- Produces (`receipt.ts`): `formatReceiptNumber({ prefix, includeYear, year, sequence }): string`, `receiptSequenceName(includeYear: boolean, year: number): string`.
- Produces (`reminder-template.ts`): `ReminderTemplateValues = { name: string; amount: string; academy: string }`, `renderReminderTemplate(template: string, values: ReminderTemplateValues): string`, `extractPlaceholders(template: string): string[]` (unique, in order of first appearance; unknown/empty names included).
  Tasks 3, 4, 6, 7, 8, 13 import these by these exact names.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/settings-receipt.test.ts
import { describe, it, expect } from "vitest";
import { formatReceiptNumber, receiptSequenceName } from "@/lib/settings/receipt";
import { formatSequence } from "@/lib/ids";

describe("formatReceiptNumber", () => {
  it("includes the year when asked", () => {
    expect(formatReceiptNumber({ prefix: "SNT", includeYear: true, year: 2026, sequence: 45 })).toBe("SNT-2026-00045");
  });

  it("omits the year when asked", () => {
    expect(formatReceiptNumber({ prefix: "SNT", includeYear: false, year: 2026, sequence: 45 })).toBe("SNT-00045");
  });

  it("pads the sequence to 5 digits", () => {
    expect(formatReceiptNumber({ prefix: "SNT", includeYear: true, year: 2026, sequence: 1 })).toBe("SNT-2026-00001");
  });

  it("does not truncate a sequence wider than 5 digits", () => {
    expect(formatReceiptNumber({ prefix: "SNT", includeYear: true, year: 2026, sequence: 123456 })).toBe(
      "SNT-2026-123456"
    );
  });

  it("uses the given prefix", () => {
    expect(formatReceiptNumber({ prefix: "ACAD", includeYear: false, year: 2026, sequence: 7 })).toBe("ACAD-00007");
  });

  it("matches the legacy generator's output for the default configuration", () => {
    expect(formatReceiptNumber({ prefix: "SNT", includeYear: true, year: 2026, sequence: 451 })).toBe(
      formatSequence("SNT-2026", 451, 5)
    );
  });
});

describe("receiptSequenceName", () => {
  it("is per-year when the year is part of the number", () => {
    expect(receiptSequenceName(true, 2026)).toBe("receipt-2026");
  });

  it("is a single global counter when the year is not part of the number", () => {
    expect(receiptSequenceName(false, 2026)).toBe("receipt-all");
  });

  it("ignores the year for the global counter", () => {
    expect(receiptSequenceName(false, 2031)).toBe("receipt-all");
  });
});
```

```ts
// tests/unit/settings-reminder-template.test.ts
import { describe, it, expect } from "vitest";
import { renderReminderTemplate, extractPlaceholders } from "@/lib/settings/reminder-template";
import { DEFAULT_REMINDER_TEMPLATE } from "@/lib/settings/defaults";

const VALUES = { name: "Aarav Shah", amount: "1,500", academy: "SAINTS" };

describe("renderReminderTemplate", () => {
  it("replaces name, amount and academy", () => {
    expect(renderReminderTemplate("{academy}: {name} owes ₹{amount}", VALUES)).toBe("SAINTS: Aarav Shah owes ₹1,500");
  });

  it("replaces repeated placeholders", () => {
    expect(renderReminderTemplate("{name} / {name}", VALUES)).toBe("Aarav Shah / Aarav Shah");
  });

  it("leaves unknown braces untouched", () => {
    expect(renderReminderTemplate("Hi {name} {foo}", VALUES)).toBe("Hi Aarav Shah {foo}");
  });

  it("does not re-substitute placeholder-looking text inside a value", () => {
    expect(renderReminderTemplate("Hi {name}", { ...VALUES, name: "{amount}" })).toBe("Hi {amount}");
  });

  it("does not interpret $ patterns inside a value", () => {
    expect(renderReminderTemplate("Hi {name}", { ...VALUES, name: "$&" })).toBe("Hi $&");
  });

  it("renders the default template to the exact legacy reminder message", () => {
    expect(renderReminderTemplate(DEFAULT_REMINDER_TEMPLATE, VALUES)).toBe(
      "SAINTS – Fee Reminder\nHi Aarav Shah, this is a reminder that ₹1,500 is pending for your SAINTS fees. Please clear it at your earliest convenience. Thank you!"
    );
  });
});

describe("extractPlaceholders", () => {
  it("returns unique placeholder names in order of first appearance", () => {
    expect(extractPlaceholders("{name} {amount} {name} {academy}")).toEqual(["name", "amount", "academy"]);
  });

  it("returns an empty array when there are none", () => {
    expect(extractPlaceholders("no placeholders here")).toEqual([]);
  });

  it("includes unknown and empty names so callers can reject them", () => {
    expect(extractPlaceholders("{name} {foo} {}")).toEqual(["name", "foo", ""]);
  });
});
```

```ts
// tests/unit/settings-defaults.test.ts
import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, DEFAULT_REMINDER_TEMPLATE, REMINDER_PLACEHOLDERS, SETTINGS_ID } from "@/lib/settings/defaults";
import { extractPlaceholders } from "@/lib/settings/reminder-template";

describe("default settings", () => {
  it("has the documented default values", () => {
    expect(SETTINGS_ID).toBe("default");
    expect(DEFAULT_SETTINGS).toMatchObject({
      academyName: "SAINTS",
      logoUrl: null,
      address: null,
      mobile: null,
      email: null,
      receiptPrefix: "SNT",
      receiptIncludeYear: true,
      receiptFooter: "Thank You",
      dueSoonDays: 3,
      overdueReminderDays: 7,
    });
    expect(DEFAULT_SETTINGS.reminderTemplate).toBe(DEFAULT_REMINDER_TEMPLATE);
  });

  it("default template only uses known placeholders and includes name and amount", () => {
    const found = extractPlaceholders(DEFAULT_REMINDER_TEMPLATE);
    for (const p of found) expect(REMINDER_PLACEHOLDERS as readonly string[]).toContain(p);
    expect(found).toContain("name");
    expect(found).toContain("amount");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/settings-defaults.test.ts tests/unit/settings-receipt.test.ts tests/unit/settings-reminder-template.test.ts`
Expected: FAIL (cannot find the `@/lib/settings/*` modules).

- [ ] **Step 3: Write `src/lib/settings/defaults.ts`**

```ts
// Pure module (no Prisma, no server-only): safe to import from client
// components and unit tests.

export const SETTINGS_ID = "default";

export const REMINDER_PLACEHOLDERS = ["name", "amount", "academy"] as const;
export type ReminderPlaceholder = (typeof REMINDER_PLACEHOLDERS)[number];

// The exact wording the app used before Settings existed (Phase 4), so
// upgrading changes nothing until an admin edits the template.
export const DEFAULT_REMINDER_TEMPLATE = [
  "SAINTS – Fee Reminder",
  "Hi {name}, this is a reminder that ₹{amount} is pending for your SAINTS fees. Please clear it at your earliest convenience. Thank you!",
].join("\n");

export type SettingsValues = {
  academyName: string;
  logoUrl: string | null;
  address: string | null;
  mobile: string | null;
  email: string | null;
  receiptPrefix: string;
  receiptIncludeYear: boolean;
  receiptFooter: string;
  reminderTemplate: string;
  dueSoonDays: number;
  overdueReminderDays: number;
};

export const DEFAULT_SETTINGS: SettingsValues = {
  academyName: "SAINTS",
  logoUrl: null,
  address: null,
  mobile: null,
  email: null,
  receiptPrefix: "SNT",
  receiptIncludeYear: true,
  receiptFooter: "Thank You",
  reminderTemplate: DEFAULT_REMINDER_TEMPLATE,
  dueSoonDays: 3,
  overdueReminderDays: 7,
};
```

- [ ] **Step 4: Write `src/lib/settings/receipt.ts`**

```ts
const SEQUENCE_WIDTH = 5;

/**
 * Receipt numbers are `{prefix}-{year}-{seq}` or `{prefix}-{seq}`. The prefix
 * is validated to letters/digits only (no hyphen), so the two shapes -- and
 * different prefixes -- can never produce the same string, which matters
 * because Receipt.receiptNumber is unique.
 */
export function formatReceiptNumber({
  prefix,
  includeYear,
  year,
  sequence,
}: {
  prefix: string;
  includeYear: boolean;
  year: number;
  sequence: number;
}): string {
  const padded = String(sequence).padStart(SEQUENCE_WIDTH, "0");
  return includeYear ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
}

/**
 * A year-less number must not restart every January (it would repeat), so it
 * uses one global counter; a year-bearing number keeps a counter per year.
 */
export function receiptSequenceName(includeYear: boolean, year: number): string {
  return includeYear ? `receipt-${year}` : "receipt-all";
}
```

- [ ] **Step 5: Write `src/lib/settings/reminder-template.ts`**

```ts
export type ReminderTemplateValues = {
  name: string;
  amount: string;
  academy: string;
};

/**
 * Replaces {name}, {amount} and {academy} in a single pass, so a value that
 * itself looks like a placeholder is never re-substituted, and a function
 * replacer keeps `$&`-style patterns in values literal.
 */
export function renderReminderTemplate(template: string, values: ReminderTemplateValues): string {
  return template.replace(/\{(name|amount|academy)\}/g, (_match, key: keyof ReminderTemplateValues) => values[key]);
}

/** Every `{...}` token's inner text, unique, in order of first appearance. */
export function extractPlaceholders(template: string): string[] {
  const found: string[] = [];
  for (const match of template.matchAll(/\{([^{}]*)\}/g)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/settings-defaults.test.ts tests/unit/settings-receipt.test.ts tests/unit/settings-reminder-template.test.ts`
Expected: PASS (2 + 9 + 9 = 20 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/settings tests/unit/settings-defaults.test.ts tests/unit/settings-receipt.test.ts tests/unit/settings-reminder-template.test.ts
git commit -m "Add settings defaults, receipt number formatting and reminder template rendering

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Reminder message uses the template (TDD)

**Files:**
- Modify: `src/lib/reminders/message.ts`
- Modify: `tests/unit/reminders-message.test.ts`

**Interfaces:**
- Consumes: `renderReminderTemplate` (`@/lib/settings/reminder-template`), `DEFAULT_REMINDER_TEMPLATE` (`@/lib/settings/defaults`), Task 2.
- Produces: `buildReminderMessage(name: string, pendingAmount: number, options?: { template?: string; academyName?: string }): string`. With no options its output is byte-identical to today's. Task 12 calls it with options.

- [ ] **Step 1: Add the failing tests**

Append inside the existing `describe("buildReminderMessage", ...)` block of `tests/unit/reminders-message.test.ts` (keep all four existing tests untouched):

```ts
  it("produces the exact legacy message when called without options", () => {
    expect(buildReminderMessage("Aarav Shah", 1500)).toBe(
      "SAINTS – Fee Reminder\nHi Aarav Shah, this is a reminder that ₹1,500 is pending for your SAINTS fees. Please clear it at your earliest convenience. Thank you!"
    );
  });

  it("renders a custom template with name and amount", () => {
    expect(buildReminderMessage("Priya", 123456, { template: "Dear {name}, please pay ₹{amount}." })).toBe(
      "Dear Priya, please pay ₹1,23,456."
    );
  });

  it("fills {academy} from the academy name option, defaulting to SAINTS", () => {
    expect(buildReminderMessage("Rahul", 500, { template: "{academy}: {name}", academyName: "Zen Studio" })).toBe(
      "Zen Studio: Rahul"
    );
    expect(buildReminderMessage("Rahul", 500, { template: "{academy}: {name}" })).toBe("SAINTS: Rahul");
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/unit/reminders-message.test.ts`
Expected: the 3 new tests FAIL (the function ignores options), the 4 existing tests pass.

- [ ] **Step 3: Replace `src/lib/reminders/message.ts`**

```ts
import { DEFAULT_REMINDER_TEMPLATE } from "@/lib/settings/defaults";
import { renderReminderTemplate } from "@/lib/settings/reminder-template";

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
 *
 * `options.template` is the admin-configured reminder template (Settings);
 * with no options the output is exactly the pre-Settings message.
 */
export function buildReminderMessage(
  name: string,
  pendingAmount: number,
  options: { template?: string; academyName?: string } = {}
): string {
  return renderReminderTemplate(options.template ?? DEFAULT_REMINDER_TEMPLATE, {
    name,
    amount: pendingAmount.toLocaleString("en-IN"),
    academy: options.academyName ?? "SAINTS",
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/reminders-message.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reminders/message.ts tests/unit/reminders-message.test.ts
git commit -m "Let the reminder message use a configurable template

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Settings validation schemas (TDD)

**Files:**
- Create: `src/lib/validations/settings.ts`
- Test: `tests/unit/settings-validation.test.ts`

**Interfaces:**
- Consumes: `extractPlaceholders` (`@/lib/settings/reminder-template`), `REMINDER_PLACEHOLDERS` (`@/lib/settings/defaults`), Task 2.
- Produces: `academySettingsSchema`, `receiptSettingsSchema`, `reminderSettingsSchema`, and the explicit input types `AcademySettingsInput = { academyName: string; logoUrl: string | null; address: string | null; mobile: string | null; email: string | null }`, `ReceiptSettingsInput = { receiptPrefix: string; receiptIncludeYear: boolean; receiptFooter: string }`, `ReminderSettingsInput = { reminderTemplate: string; dueSoonDays: number | string; overdueReminderDays: number | string }`. Tasks 7 and 13 use these by these exact names. Optional text fields normalize empty/whitespace to `null`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/settings-validation.test.ts
import { describe, it, expect } from "vitest";
import {
  academySettingsSchema,
  receiptSettingsSchema,
  reminderSettingsSchema,
} from "@/lib/validations/settings";
import { DEFAULT_REMINDER_TEMPLATE } from "@/lib/settings/defaults";

describe("academySettingsSchema", () => {
  const valid = {
    academyName: "SAINTS",
    logoUrl: "https://example.com/logo.png",
    address: "12 MG Road, Pune",
    mobile: "9876543210",
    email: "hello@saints.example",
  };

  it("accepts a fully valid payload", () => {
    expect(academySettingsSchema.safeParse(valid).success).toBe(true);
  });

  it("normalizes empty optional fields to null", () => {
    const result = academySettingsSchema.parse({ academyName: "SAINTS", logoUrl: "", address: "  ", mobile: "", email: "" });
    expect(result).toEqual({ academyName: "SAINTS", logoUrl: null, address: null, mobile: null, email: null });
  });

  it("accepts missing optional keys", () => {
    expect(academySettingsSchema.parse({ academyName: "SAINTS" })).toEqual({
      academyName: "SAINTS",
      logoUrl: null,
      address: null,
      mobile: null,
      email: null,
    });
  });

  it("rejects an academy name shorter than 2 characters", () => {
    expect(academySettingsSchema.safeParse({ ...valid, academyName: "A" }).success).toBe(false);
  });

  it("rejects an academy name longer than 60 characters", () => {
    expect(academySettingsSchema.safeParse({ ...valid, academyName: "A".repeat(61) }).success).toBe(false);
  });

  it("trims the academy name", () => {
    expect(academySettingsSchema.parse({ ...valid, academyName: "  SAINTS  " }).academyName).toBe("SAINTS");
  });

  it("rejects a non-https logo URL", () => {
    expect(academySettingsSchema.safeParse({ ...valid, logoUrl: "http://example.com/logo.png" }).success).toBe(false);
  });

  it("rejects dangerous or non-URL logo values", () => {
    expect(academySettingsSchema.safeParse({ ...valid, logoUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(academySettingsSchema.safeParse({ ...valid, logoUrl: "not a url" }).success).toBe(false);
  });

  it("rejects an invalid mobile number", () => {
    expect(academySettingsSchema.safeParse({ ...valid, mobile: "12345" }).success).toBe(false);
    expect(academySettingsSchema.safeParse({ ...valid, mobile: "5876543210" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(academySettingsSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });

  it("rejects an address over 300 characters", () => {
    expect(academySettingsSchema.safeParse({ ...valid, address: "a".repeat(301) }).success).toBe(false);
  });
});

describe("receiptSettingsSchema", () => {
  const valid = { receiptPrefix: "SNT", receiptIncludeYear: true, receiptFooter: "Thank You" };

  it("accepts a valid payload", () => {
    expect(receiptSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it("uppercases and trims the prefix", () => {
    expect(receiptSettingsSchema.parse({ ...valid, receiptPrefix: " snt " }).receiptPrefix).toBe("SNT");
  });

  it("accepts digits in the prefix", () => {
    expect(receiptSettingsSchema.safeParse({ ...valid, receiptPrefix: "ST2" }).success).toBe(true);
  });

  it.each(["S", "ABCDEFGHI", "S-T", "SN T", ""])("rejects the invalid prefix %j", (bad) => {
    expect(receiptSettingsSchema.safeParse({ ...valid, receiptPrefix: bad }).success).toBe(false);
  });

  it("allows an empty footer", () => {
    expect(receiptSettingsSchema.parse({ ...valid, receiptFooter: "" }).receiptFooter).toBe("");
  });

  it("rejects a footer over 200 characters", () => {
    expect(receiptSettingsSchema.safeParse({ ...valid, receiptFooter: "a".repeat(201) }).success).toBe(false);
  });

  it("requires include-year to be a boolean", () => {
    expect(receiptSettingsSchema.safeParse({ ...valid, receiptIncludeYear: "yes" }).success).toBe(false);
  });
});

describe("reminderSettingsSchema", () => {
  const valid = { reminderTemplate: DEFAULT_REMINDER_TEMPLATE, dueSoonDays: 3, overdueReminderDays: 7 };

  it("accepts the default template and default numbers", () => {
    expect(reminderSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a custom template using all three placeholders", () => {
    expect(
      reminderSettingsSchema.safeParse({ ...valid, reminderTemplate: "{academy}: Hi {name}, please pay ₹{amount}." }).success
    ).toBe(true);
  });

  it("rejects a template missing {amount}", () => {
    expect(reminderSettingsSchema.safeParse({ ...valid, reminderTemplate: "Hi {name}, please pay soon." }).success).toBe(false);
  });

  it("rejects a template missing {name}", () => {
    expect(reminderSettingsSchema.safeParse({ ...valid, reminderTemplate: "Please pay ₹{amount} soon." }).success).toBe(false);
  });

  it("rejects an unknown placeholder", () => {
    expect(
      reminderSettingsSchema.safeParse({ ...valid, reminderTemplate: "Hi {name}, ₹{amount} {foo}" }).success
    ).toBe(false);
  });

  it("rejects an empty template and one longer than 500 characters", () => {
    expect(reminderSettingsSchema.safeParse({ ...valid, reminderTemplate: "   " }).success).toBe(false);
    expect(
      reminderSettingsSchema.safeParse({ ...valid, reminderTemplate: `{name} {amount} ${"a".repeat(500)}` }).success
    ).toBe(false);
  });

  it("accepts the shortest valid template", () => {
    expect(reminderSettingsSchema.safeParse({ ...valid, reminderTemplate: "{name}{amount}" }).success).toBe(true);
  });

  it("coerces numeric strings for the day counts", () => {
    const result = reminderSettingsSchema.parse({ ...valid, dueSoonDays: "5", overdueReminderDays: "10" });
    expect(result.dueSoonDays).toBe(5);
    expect(result.overdueReminderDays).toBe(10);
  });

  it.each([0, 31, 5.5, "", "abc"])("rejects dueSoonDays %j", (bad) => {
    expect(reminderSettingsSchema.safeParse({ ...valid, dueSoonDays: bad }).success).toBe(false);
  });

  it.each([0, 61, 2.5, ""])("rejects overdueReminderDays %j", (bad) => {
    expect(reminderSettingsSchema.safeParse({ ...valid, overdueReminderDays: bad }).success).toBe(false);
  });

  it("accepts the boundary values 1 and 30 / 60", () => {
    expect(reminderSettingsSchema.safeParse({ ...valid, dueSoonDays: 1, overdueReminderDays: 1 }).success).toBe(true);
    expect(reminderSettingsSchema.safeParse({ ...valid, dueSoonDays: 30, overdueReminderDays: 60 }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/settings-validation.test.ts`
Expected: FAIL (cannot find `@/lib/validations/settings`).

- [ ] **Step 3: Write `src/lib/validations/settings.ts`**

```ts
import { z } from "zod";
import { REMINDER_PLACEHOLDERS } from "@/lib/settings/defaults";
import { extractPlaceholders } from "@/lib/settings/reminder-template";

// Optional text fields arrive as "" / whitespace when the admin clears them.
const emptyToNull = (value: unknown): unknown =>
  value === undefined || (typeof value === "string" && value.trim() === "") ? null : value;

// Day counts arrive as numbers or as text-input strings.
const wholeNumber = (min: number, max: number, label: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? (value.trim() === "" ? NaN : Number(value)) : value),
    z
      .number({ invalid_type_error: `${label} must be a whole number` })
      .int(`${label} must be a whole number`)
      .min(min, `${label} must be between ${min} and ${max}`)
      .max(max, `${label} must be between ${min} and ${max}`)
  );

export const academySettingsSchema = z.object({
  academyName: z
    .string()
    .trim()
    .min(2, "Academy name is required")
    .max(60, "Academy name can be at most 60 characters"),
  logoUrl: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .url("Enter a valid URL")
      .refine((value) => value.startsWith("https://"), "Logo URL must start with https://")
      .nullable()
  ),
  address: z.preprocess(emptyToNull, z.string().trim().max(300, "Address can be at most 300 characters").nullable()),
  mobile: z.preprocess(
    emptyToNull,
    z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number").nullable()
  ),
  email: z.preprocess(
    emptyToNull,
    z.string().trim().email("Enter a valid email address").max(120, "Email can be at most 120 characters").nullable()
  ),
});

export const receiptSettingsSchema = z.object({
  receiptPrefix: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
    z.string().regex(/^[A-Z0-9]{2,8}$/, "Use 2-8 letters or digits (no spaces or hyphens)")
  ),
  receiptIncludeYear: z.boolean(),
  receiptFooter: z.string().trim().max(200, "Footer can be at most 200 characters"),
});

export const reminderSettingsSchema = z.object({
  reminderTemplate: z
    .string()
    .trim()
    // No meaningful minimum: requiring both {name} and {amount} already forces
    // at least 14 characters.
    .min(1, "Template is required")
    .max(500, "Template can be at most 500 characters")
    .superRefine((template, ctx) => {
      const found = extractPlaceholders(template);
      const unknown = found.filter((p) => !(REMINDER_PLACEHOLDERS as readonly string[]).includes(p));
      if (unknown.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown placeholder: ${unknown.map((u) => `{${u}}`).join(", ")}`,
        });
      }
      for (const required of ["name", "amount"]) {
        if (!found.includes(required)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Template must include {${required}}` });
        }
      }
    }),
  dueSoonDays: wholeNumber(1, 30, "Due soon days"),
  overdueReminderDays: wholeNumber(1, 60, "Overdue reminder frequency"),
});

// Explicit input shapes for the Server Action boundary (z.preprocess makes
// z.input `unknown`, which would accept anything at compile time).
export type AcademySettingsInput = {
  academyName: string;
  logoUrl: string | null;
  address: string | null;
  mobile: string | null;
  email: string | null;
};
export type ReceiptSettingsInput = {
  receiptPrefix: string;
  receiptIncludeYear: boolean;
  receiptFooter: string;
};
export type ReminderSettingsInput = {
  reminderTemplate: string;
  dueSoonDays: number | string;
  overdueReminderDays: number | string;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/settings-validation.test.ts`
Expected: PASS. If a rejection expectation fails, confirm against the actual zod output before changing the schema (do not guess).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validations/settings.ts tests/unit/settings-validation.test.ts
git commit -m "Add settings validation schemas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Notification candidate builders and activity merge (TDD)

**Files:**
- Create: `src/lib/notifications/candidates.ts`
- Create: `src/lib/notifications/activity.ts`
- Test: `tests/unit/notification-candidates.test.ts`, `tests/unit/notification-activity.test.ts`

**Interfaces:**
- Produces (`candidates.ts`): `NOTIFICATION_TYPES`, `NotificationType`, `NotificationCandidate = { type: NotificationType; studentId: string | null; message: string; dedupeKey: string }`, constants `SYNC_INTERVAL_MS`, `LOW_ATTENDANCE_MIN_RECORDS` (5), `LOW_ATTENDANCE_WINDOW_DAYS` (30), `LOW_ATTENDANCE_RATE_BELOW` (60); functions `formatInr(amount: number): string`, `isSyncStale(lastSyncAt: Date | null, now: Date): boolean`, `overdueCycle(today: Date, everyDays: number): number`, `buildOverdueCandidates(rows, today, everyDays)`, `buildDueSoonCandidates(rows, today, withinDays)`, `buildLowAttendanceCandidates(rows, today)`, `buildAdmissionMessage(name, academyName)`, `buildPaymentMessage(name, amount, modeLabel)`, `paymentModeLabel(mode: string)`.
- Produces (`activity.ts`): `ActivityEvent = { at: Date; text: string }`, `mergeActivity(events, limit)`, `summarizeAttendance(rows)`. Tasks 9, 10, 11, 12, 17 import these by these exact names.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/notification-candidates.test.ts
import { describe, it, expect } from "vitest";
import {
  formatInr,
  isSyncStale,
  overdueCycle,
  buildOverdueCandidates,
  buildDueSoonCandidates,
  buildLowAttendanceCandidates,
  buildAdmissionMessage,
  buildPaymentMessage,
  paymentModeLabel,
  SYNC_INTERVAL_MS,
} from "@/lib/notifications/candidates";
import { formatDateUTC } from "@/lib/dates";

const day = (n: number) => new Date(n * 86_400_000);

describe("formatInr", () => {
  it("formats with the rupee sign and Indian grouping", () => {
    expect(formatInr(1500)).toBe("₹1,500");
    expect(formatInr(123456)).toBe("₹1,23,456");
  });
});

describe("isSyncStale", () => {
  const now = new Date("2026-09-19T10:00:00Z");

  it("is stale when there has never been a sync", () => {
    expect(isSyncStale(null, now)).toBe(true);
  });

  it("is fresh just inside the interval", () => {
    expect(isSyncStale(new Date(now.getTime() - SYNC_INTERVAL_MS + 1), now)).toBe(false);
  });

  it("is stale exactly at the interval", () => {
    expect(isSyncStale(new Date(now.getTime() - SYNC_INTERVAL_MS), now)).toBe(true);
  });
});

describe("overdueCycle", () => {
  it("stays constant within a window and changes at the boundary", () => {
    expect(overdueCycle(day(0), 7)).toBe(0);
    expect(overdueCycle(day(6), 7)).toBe(0);
    expect(overdueCycle(day(7), 7)).toBe(1);
    expect(overdueCycle(day(13), 7)).toBe(1);
    expect(overdueCycle(day(14), 7)).toBe(2);
  });

  it("gives one cycle per day when the frequency is 1", () => {
    expect(overdueCycle(day(5), 1)).toBe(5);
    expect(overdueCycle(day(6), 1)).toBe(6);
  });
});

describe("buildOverdueCandidates", () => {
  it("builds a message and a cycle-scoped dedupe key", () => {
    const [c] = buildOverdueCandidates([{ studentId: "s1", name: "Rahul Sharma", pastDuePending: 1500 }], day(14), 7);
    expect(c).toEqual({
      type: "FEE_OVERDUE",
      studentId: "s1",
      message: "Rahul Sharma has ₹1,500 overdue.",
      dedupeKey: "overdue:s1:2",
    });
  });

  it("returns nothing for no rows", () => {
    expect(buildOverdueCandidates([], day(14), 7)).toEqual([]);
  });

  it("re-notifies in the next cycle with a different key", () => {
    const row = { studentId: "s1", name: "A", pastDuePending: 10 };
    expect(buildOverdueCandidates([row], day(6), 7)[0].dedupeKey).not.toBe(
      buildOverdueCandidates([row], day(7), 7)[0].dedupeKey
    );
  });
});

describe("buildDueSoonCandidates", () => {
  const today = new Date(Date.UTC(2026, 8, 13)); // 13 Sep 2026, UTC midnight
  const row = (nextDueDate: Date | null) => ({ studentId: "s1", name: "Priya Singh", totalPending: 1000, nextDueDate });

  it("includes a fee due today", () => {
    expect(buildDueSoonCandidates([row(new Date(Date.UTC(2026, 8, 13, 23, 59, 59, 999)))], today, 3)).toHaveLength(1);
  });

  it("includes a fee due on the last day of the window", () => {
    expect(buildDueSoonCandidates([row(new Date(Date.UTC(2026, 8, 16, 23, 59, 59, 999)))], today, 3)).toHaveLength(1);
  });

  it("excludes a fee due one day after the window", () => {
    expect(buildDueSoonCandidates([row(new Date(Date.UTC(2026, 8, 17, 0, 0, 0, 0)))], today, 3)).toHaveLength(0);
  });

  it("excludes a fee that is already past due", () => {
    expect(buildDueSoonCandidates([row(new Date(Date.UTC(2026, 8, 12, 23, 59, 59, 999)))], today, 3)).toHaveLength(0);
  });

  it("excludes students with no upcoming due date", () => {
    expect(buildDueSoonCandidates([row(null)], today, 3)).toHaveLength(0);
  });

  it("keys on the due date and words the message with the amount and date", () => {
    const due = new Date(Date.UTC(2026, 8, 16, 23, 59, 59, 999));
    const [c] = buildDueSoonCandidates([row(due)], today, 3);
    expect(c.type).toBe("FEE_DUE_SOON");
    expect(c.dedupeKey).toBe("duesoon:s1:2026-09-16");
    expect(c.message).toBe(`Priya Singh's fee of ₹1,000 is due on ${formatDateUTC(due)}.`);
  });
});

describe("buildLowAttendanceCandidates", () => {
  const today = new Date(Date.UTC(2026, 8, 13));
  const row = (markedCount: number, rate: number) => ({ studentId: "s1", name: "Asha", markedCount, rate });

  it("includes 5 marked classes with a rate just under the threshold", () => {
    expect(buildLowAttendanceCandidates([row(5, 59)], today)).toHaveLength(1);
  });

  it("excludes a student with too few marked classes", () => {
    expect(buildLowAttendanceCandidates([row(4, 10)], today)).toHaveLength(0);
  });

  it("excludes a rate at the threshold", () => {
    expect(buildLowAttendanceCandidates([row(10, 60)], today)).toHaveLength(0);
  });

  it("keys once per calendar month and words the message", () => {
    const [c] = buildLowAttendanceCandidates([row(8, 40)], today);
    expect(c).toEqual({
      type: "LOW_ATTENDANCE",
      studentId: "s1",
      message: "Asha's attendance is 40% over the last 30 days.",
      dedupeKey: "lowatt:s1:2026-09",
    });
  });
});

describe("event message builders", () => {
  it("words an admission", () => {
    expect(buildAdmissionMessage("Priya Singh", "SAINTS")).toBe("Priya Singh joined SAINTS.");
  });

  it("words a payment", () => {
    expect(buildPaymentMessage("Rahul Sharma", 1500, "UPI")).toBe("Rahul Sharma paid ₹1,500 via UPI.");
  });

  it("maps payment modes to labels and passes unknown ones through", () => {
    expect(paymentModeLabel("CASH")).toBe("Cash");
    expect(paymentModeLabel("UPI")).toBe("UPI");
    expect(paymentModeLabel("ONLINE")).toBe("Online Payment");
    expect(paymentModeLabel("BANK_TRANSFER")).toBe("Bank Transfer");
    expect(paymentModeLabel("CHEQUE")).toBe("CHEQUE");
  });
});
```

```ts
// tests/unit/notification-activity.test.ts
import { describe, it, expect } from "vitest";
import { mergeActivity, summarizeAttendance } from "@/lib/notifications/activity";

const at = (iso: string) => new Date(iso);

describe("mergeActivity", () => {
  it("sorts newest first", () => {
    const merged = mergeActivity(
      [
        { at: at("2026-09-01T00:00:00Z"), text: "old" },
        { at: at("2026-09-03T00:00:00Z"), text: "new" },
        { at: at("2026-09-02T00:00:00Z"), text: "mid" },
      ],
      10
    );
    expect(merged.map((e) => e.text)).toEqual(["new", "mid", "old"]);
  });

  it("caps the result at the limit", () => {
    const events = Array.from({ length: 15 }, (_, i) => ({ at: new Date(Date.UTC(2026, 8, 1 + i)), text: `e${i}` }));
    expect(mergeActivity(events, 10)).toHaveLength(10);
    expect(mergeActivity(events, 10)[0].text).toBe("e14");
  });

  it("returns an empty array for no events and does not mutate its input", () => {
    expect(mergeActivity([], 10)).toEqual([]);
    const input = [
      { at: at("2026-09-01T00:00:00Z"), text: "a" },
      { at: at("2026-09-02T00:00:00Z"), text: "b" },
    ];
    mergeActivity(input, 10);
    expect(input.map((e) => e.text)).toEqual(["a", "b"]);
  });
});

describe("summarizeAttendance", () => {
  const row = (batchId: string, batchName: string, date: string, status: string, createdAt: string) => ({
    batchId,
    batchName,
    date: at(date),
    status,
    createdAt: at(createdAt),
  });

  it("groups rows for the same batch and date into one event", () => {
    const events = summarizeAttendance([
      row("b1", "Morning Zumba", "2026-09-13T00:00:00Z", "PRESENT", "2026-09-13T06:00:00Z"),
      row("b1", "Morning Zumba", "2026-09-13T00:00:00Z", "LATE", "2026-09-13T06:00:05Z"),
      row("b1", "Morning Zumba", "2026-09-13T00:00:00Z", "ABSENT", "2026-09-13T06:00:10Z"),
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].text).toBe("Morning Zumba attendance marked: 2 of 3 present.");
    expect(events[0].at.toISOString()).toBe("2026-09-13T06:00:10.000Z");
  });

  it("keeps different batches and different dates separate", () => {
    const events = summarizeAttendance([
      row("b1", "Morning Zumba", "2026-09-13T00:00:00Z", "PRESENT", "2026-09-13T06:00:00Z"),
      row("b2", "Evening Yoga", "2026-09-13T00:00:00Z", "PRESENT", "2026-09-13T18:00:00Z"),
      row("b1", "Morning Zumba", "2026-09-12T00:00:00Z", "PRESENT", "2026-09-12T06:00:00Z"),
    ]);
    expect(events).toHaveLength(3);
  });

  it("counts LEAVE and ABSENT as not present", () => {
    const [event] = summarizeAttendance([
      row("b1", "Batch", "2026-09-13T00:00:00Z", "LEAVE", "2026-09-13T06:00:00Z"),
      row("b1", "Batch", "2026-09-13T00:00:00Z", "ABSENT", "2026-09-13T06:00:00Z"),
    ]);
    expect(event.text).toBe("Batch attendance marked: 0 of 2 present.");
  });

  it("returns no events for no rows", () => {
    expect(summarizeAttendance([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/notification-candidates.test.ts tests/unit/notification-activity.test.ts`
Expected: FAIL (cannot find the modules).

- [ ] **Step 3: Write `src/lib/notifications/candidates.ts`**

```ts
import { formatDateUTC } from "@/lib/dates";

export const NOTIFICATION_TYPES = [
  "FEE_OVERDUE",
  "FEE_DUE_SOON",
  "LOW_ATTENDANCE",
  "NEW_ADMISSION",
  "PAYMENT_RECEIVED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationCandidate = {
  type: NotificationType;
  studentId: string | null;
  message: string;
  dedupeKey: string;
};

export const SYNC_INTERVAL_MS = 30 * 60 * 1000;
// The brief lists no setting for low attendance, so these are code constants.
export const LOW_ATTENDANCE_MIN_RECORDS = 5;
export const LOW_ATTENDANCE_WINDOW_DAYS = 30;
export const LOW_ATTENDANCE_RATE_BELOW = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function isSyncStale(lastSyncAt: Date | null, now: Date): boolean {
  return lastSyncAt === null || now.getTime() - lastSyncAt.getTime() >= SYNC_INTERVAL_MS;
}

/** Which `everyDays`-sized window (counted from the epoch) `today` falls in. */
export function overdueCycle(today: Date, everyDays: number): number {
  return Math.floor(Math.floor(today.getTime() / DAY_MS) / everyDays);
}

export function buildOverdueCandidates(
  rows: { studentId: string; name: string; pastDuePending: number }[],
  today: Date,
  everyDays: number
): NotificationCandidate[] {
  const cycle = overdueCycle(today, everyDays);
  return rows.map((r) => ({
    type: "FEE_OVERDUE",
    studentId: r.studentId,
    message: `${r.name} has ${formatInr(r.pastDuePending)} overdue.`,
    dedupeKey: `overdue:${r.studentId}:${cycle}`,
  }));
}

/**
 * `rows` must already exclude overdue students. A fee is "due soon" when its
 * next unpaid due date falls between the start of `today` and the end of the
 * day `withinDays` days ahead (due dates are month-end 23:59:59.999 UTC).
 */
export function buildDueSoonCandidates(
  rows: { studentId: string; name: string; totalPending: number; nextDueDate: Date | null }[],
  today: Date,
  withinDays: number
): NotificationCandidate[] {
  const start = today.getTime();
  const endExclusive = start + (withinDays + 1) * DAY_MS;
  const result: NotificationCandidate[] = [];
  for (const r of rows) {
    if (r.nextDueDate === null) continue;
    const due = r.nextDueDate.getTime();
    if (due < start || due >= endExclusive) continue;
    result.push({
      type: "FEE_DUE_SOON",
      studentId: r.studentId,
      message: `${r.name}'s fee of ${formatInr(r.totalPending)} is due on ${formatDateUTC(r.nextDueDate)}.`,
      dedupeKey: `duesoon:${r.studentId}:${r.nextDueDate.toISOString().slice(0, 10)}`,
    });
  }
  return result;
}

export function buildLowAttendanceCandidates(
  rows: { studentId: string; name: string; markedCount: number; rate: number }[],
  today: Date
): NotificationCandidate[] {
  const month = today.toISOString().slice(0, 7);
  return rows
    .filter((r) => r.markedCount >= LOW_ATTENDANCE_MIN_RECORDS && r.rate < LOW_ATTENDANCE_RATE_BELOW)
    .map((r) => ({
      type: "LOW_ATTENDANCE",
      studentId: r.studentId,
      message: `${r.name}'s attendance is ${r.rate}% over the last ${LOW_ATTENDANCE_WINDOW_DAYS} days.`,
      dedupeKey: `lowatt:${r.studentId}:${month}`,
    }));
}

export function buildAdmissionMessage(name: string, academyName: string): string {
  return `${name} joined ${academyName}.`;
}

export function buildPaymentMessage(name: string, amount: number, modeLabel: string): string {
  return `${name} paid ${formatInr(amount)} via ${modeLabel}.`;
}

const PAYMENT_MODE_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  ONLINE: "Online Payment",
  BANK_TRANSFER: "Bank Transfer",
};

export function paymentModeLabel(mode: string): string {
  return PAYMENT_MODE_LABELS[mode] ?? mode;
}
```

- [ ] **Step 4: Write `src/lib/notifications/activity.ts`**

```ts
export type ActivityEvent = { at: Date; text: string };

/** Newest first, capped at `limit`. Does not mutate its input. */
export function mergeActivity(events: ActivityEvent[], limit: number): ActivityEvent[] {
  return [...events].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

/**
 * One roll call saves a row per student; collapse rows for the same batch and
 * calendar date into a single event ("Morning Zumba attendance marked: 12 of
 * 15 present."). PRESENT and LATE count as present (same as the attendance
 * rate); the event time is the latest row's `createdAt`.
 */
export function summarizeAttendance(
  rows: { batchId: string; batchName: string; date: Date; status: string; createdAt: Date }[]
): ActivityEvent[] {
  const groups = new Map<string, { batchName: string; present: number; total: number; latest: Date }>();
  for (const row of rows) {
    const key = `${row.batchId}|${row.date.toISOString().slice(0, 10)}`;
    const group = groups.get(key) ?? { batchName: row.batchName, present: 0, total: 0, latest: row.createdAt };
    group.total += 1;
    if (row.status === "PRESENT" || row.status === "LATE") group.present += 1;
    if (row.createdAt.getTime() > group.latest.getTime()) group.latest = row.createdAt;
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => ({
    at: g.latest,
    text: `${g.batchName} attendance marked: ${g.present} of ${g.total} present.`,
  }));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/notification-candidates.test.ts tests/unit/notification-activity.test.ts`
Expected: PASS (22 + 7 = 29 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifications/candidates.ts src/lib/notifications/activity.ts tests/unit/notification-candidates.test.ts tests/unit/notification-activity.test.ts
git commit -m "Add notification candidate builders and activity merge

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Next unpaid due date for fee-due-soon (TDD)

**Files:**
- Modify: `src/lib/reports/dues.ts`
- Modify: `tests/unit/dues.test.ts`
- Modify: `src/lib/queries/reports-dues.ts`

**Interfaces:**
- Produces: `nextUnpaidDueDate(periods: PeriodWithStatus[], now: Date): Date | null` (in `dues.ts`), and `PendingStudentWithDues.nextDueDate: Date | null` returned by `listPendingStudentsWithDues()` (Phase 5). Task 10 reads `nextDueDate`. Existing Phase 5 consumers (`reports-overview.ts`, `reports-operational.ts`) only read other fields and keep working.

- [ ] **Step 1: Add the failing tests**

In `tests/unit/dues.test.ts`, extend the import to `import { classifyDues, nextUnpaidDueDate } from "@/lib/reports/dues";`, add one constant next to `AUG_END`/`SEP_END`: `const OCT_END = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));`, and append at the end of the file (reusing the file's existing `period`, `TODAY`, `AUG_END`, `SEP_END`):

```ts
describe("nextUnpaidDueDate", () => {
  it("returns the current period's due date when it is unpaid", () => {
    expect(
      nextUnpaidDueDate([period(0, AUG_END, 1500, 1500, "PAID"), period(1, SEP_END, 1500, 0, "DUE")], TODAY)
    ).toEqual(SEP_END);
  });

  it("returns the due date of a partly paid current period", () => {
    expect(nextUnpaidDueDate([period(0, SEP_END, 1500, 500, "PARTIAL")], TODAY)).toEqual(SEP_END);
  });

  it("returns null when the current period is fully paid", () => {
    expect(nextUnpaidDueDate([period(0, SEP_END, 1500, 1500, "PAID")], TODAY)).toBeNull();
  });

  it("ignores past-due periods", () => {
    expect(
      nextUnpaidDueDate([period(0, AUG_END, 1500, 0, "OVERDUE"), period(1, SEP_END, 1500, 1500, "PAID")], TODAY)
    ).toBeNull();
  });

  it("returns the earliest not-yet-due unpaid period", () => {
    expect(
      nextUnpaidDueDate([period(0, SEP_END, 1500, 0, "DUE"), period(1, OCT_END, 1500, 0, "DUE")], TODAY)
    ).toEqual(SEP_END);
  });

  it("treats a period due exactly now as not yet past due", () => {
    expect(nextUnpaidDueDate([period(0, TODAY, 1500, 0, "DUE")], TODAY)).toEqual(TODAY);
  });

  it("returns null for an empty list", () => {
    expect(nextUnpaidDueDate([], TODAY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/unit/dues.test.ts`
Expected: FAIL (`nextUnpaidDueDate` is not exported).

- [ ] **Step 3: Add the function to `src/lib/reports/dues.ts`** (append after `classifyDues`)

```ts
/**
 * The earliest due date, not yet past, of a period that still has an unpaid
 * balance (`null` if none). Periods are chronological; "not yet past due"
 * matches classifyDues (a period due exactly `now` is not past due).
 */
export function nextUnpaidDueDate(periods: PeriodWithStatus[], now: Date): Date | null {
  for (const p of periods) {
    if (p.dueDate.getTime() < now.getTime()) continue;
    if (p.amountDue.minus(p.amountPaid).gt(0)) return p.dueDate;
  }
  return null;
}
```

- [ ] **Step 4: Update `src/lib/queries/reports-dues.ts`**

Change the import to `import { classifyDues, nextUnpaidDueDate, type DuesCategory } from "@/lib/reports/dues";`, add `nextDueDate: Date | null;` to the `PendingStudentWithDues` type (after `category`), and add `nextDueDate: nextUnpaidDueDate(periods, today),` to the pushed row (after `category,`).

- [ ] **Step 5: Run tests and typecheck**

```bash
npx vitest run tests/unit/dues.test.ts
npx tsc --noEmit
```

Expected: PASS (9 + 7 = 16 tests in `dues.test.ts`); tsc clean apart from the known `LayoutProps` error.

- [ ] **Step 6: Verify against the real database**

Temp student-code prefix `ZZT6-`. Write a temporary script (harness per Global Constraints) that creates two temp students with MONTHLY fee plans starting this month (one unpaid, one fully paid via a Payment covering this month with `feePlanId` set), calls `listPendingStudentsWithDues()`, and confirms the unpaid student has `nextDueDate` equal to the end of the current UTC month (`23:59:59.999`), the fully paid student is absent from the list, and a third temp student whose CUSTOM plan started in the past and is unpaid has `nextDueDate === null` and category OVERDUE. Clean up all rows and confirm zero `ZZT6-` students remain.

- [ ] **Step 7: Commit**

```bash
git add src/lib/reports/dues.ts tests/unit/dues.test.ts src/lib/queries/reports-dues.ts
git commit -m "Return the next unpaid due date with pending dues

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Settings query and actions

**Files:**
- Create: `src/lib/queries/settings.ts`
- Create: `src/actions/settings.ts`

**Interfaces:**
- Consumes: `DEFAULT_SETTINGS`, `SETTINGS_ID`, `SettingsValues` (`@/lib/settings/defaults`, Task 2); the three schemas and input types (`@/lib/validations/settings`, Task 4); `prisma.academySettings` (Task 1).
- Produces: `getSettings(): Promise<SettingsValues>`; `saveAcademySettings(input: AcademySettingsInput): Promise<void>`, `saveReceiptSettings(input: ReceiptSettingsInput): Promise<void>`, `saveReminderSettings(input: ReminderSettingsInput): Promise<void>`. Tasks 8, 10, 12, 13, 14, 15, 18 use these by these exact names.

- [ ] **Step 1: Write `src/lib/queries/settings.ts`**

```ts
// Read-only query. Deliberately NOT `import "server-only"`: src/lib/ids.ts
// calls this and is imported by unit tests, and `server-only` throws under
// vitest. It imports the Prisma client, so it can never be bundled for the
// browser anyway. Do not wrap in React's cache() (unavailable outside an RSC
// render, e.g. in verification scripts).
import { prisma } from "@/lib/db";
import { DEFAULT_SETTINGS, SETTINGS_ID, type SettingsValues } from "@/lib/settings/defaults";

export async function getSettings(): Promise<SettingsValues> {
  const row = await prisma.academySettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row) return DEFAULT_SETTINGS;

  return {
    academyName: row.academyName,
    logoUrl: row.logoUrl,
    address: row.address,
    mobile: row.mobile,
    email: row.email,
    receiptPrefix: row.receiptPrefix,
    receiptIncludeYear: row.receiptIncludeYear,
    receiptFooter: row.receiptFooter,
    reminderTemplate: row.reminderTemplate ?? DEFAULT_SETTINGS.reminderTemplate,
    dueSoonDays: row.dueSoonDays,
    overdueReminderDays: row.overdueReminderDays,
  };
}
```

- [ ] **Step 2: Write `src/actions/settings.ts`**

```ts
"use server";

import { prisma } from "@/lib/db";
import { SETTINGS_ID } from "@/lib/settings/defaults";
import {
  academySettingsSchema,
  receiptSettingsSchema,
  reminderSettingsSchema,
  type AcademySettingsInput,
  type ReceiptSettingsInput,
  type ReminderSettingsInput,
} from "@/lib/validations/settings";
import { revalidatePath } from "next/cache";

// Settings feed the sidebar brand, receipts and reminders, so refresh every page.
function revalidateEverywhere() {
  revalidatePath("/", "layout");
}

export async function saveAcademySettings(input: AcademySettingsInput) {
  const data = academySettingsSchema.parse(input);
  await prisma.academySettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
  revalidateEverywhere();
}

export async function saveReceiptSettings(input: ReceiptSettingsInput) {
  const data = receiptSettingsSchema.parse(input);
  await prisma.academySettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
  revalidateEverywhere();
}

export async function saveReminderSettings(input: ReminderSettingsInput) {
  const data = reminderSettingsSchema.parse(input);
  await prisma.academySettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
  revalidateEverywhere();
}
```

- [ ] **Step 2b: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in these two files.

- [ ] **Step 3: Verify against the real database (SNAPSHOT AND RESTORE the real settings row)**

This is the ONLY task allowed to write the real `AcademySettings` row. First read the existing row (or record that none exists). Stub `next/cache` and `server-only` in your preload. Then, in a temporary script:

1. `getSettings()` with no row returns exactly `DEFAULT_SETTINGS`; with only `{ id: "default" }` inserted returns the same values (the schema defaults match the code defaults, and a null `reminderTemplate` falls back to the default template).
2. `saveAcademySettings({ academyName: "ZZT7 Academy", logoUrl: "https://example.com/l.png", address: "", mobile: "9876543210", email: "" })` upserts the row; `getSettings()` reflects it, with `address`/`email` stored as `null`. A second call updates the same row (exactly one row with `id: "default"`).
3. `saveReceiptSettings({ receiptPrefix: "zzt7", receiptIncludeYear: false, receiptFooter: "" })` stores prefix `ZZT7` (uppercased), `false`, and an empty footer; `saveReminderSettings({ reminderTemplate: "Hi {name}, pay ₹{amount} to {academy}.", dueSoonDays: "5", overdueReminderDays: 10 })` stores the template and the integers 5 and 10. Each save leaves the other groups' fields untouched.
4. Invalid inputs are rejected by zod and change nothing: `academyName: "A"`, `logoUrl: "http://x.com/a.png"`, `mobile: "123"`, `receiptPrefix: "S-T"`, a template missing `{amount}`, `dueSoonDays: 0`, `overdueReminderDays: 61`.
5. RESTORE: put the row back exactly as first read (delete the row if it did not exist). Confirm `getSettings()` equals what it returned before you started. Delete all `_tmp_*` files.

- [ ] **Step 4: Run full regression**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/settings.ts src/actions/settings.ts
git commit -m "Add settings query and save actions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Receipt numbers follow the settings

**Files:**
- Modify: `src/lib/ids.ts`

**Interfaces:**
- Consumes: `formatReceiptNumber`, `receiptSequenceName` (`@/lib/settings/receipt`, Task 2); `getSettings` (`@/lib/queries/settings`, Task 7); `SettingsValues`.
- Produces: `generateReceiptNumber(settings?: Pick<SettingsValues, "receiptPrefix" | "receiptIncludeYear">): Promise<string>`. With no argument it reads the real settings (this is what `createPayment` does, unchanged call site). The optional argument exists so verification can avoid touching real settings and real sequences.

- [ ] **Step 1: Edit `src/lib/ids.ts`**

Add these imports at the top:

```ts
import { getSettings } from "@/lib/queries/settings";
import { formatReceiptNumber, receiptSequenceName } from "@/lib/settings/receipt";
import type { SettingsValues } from "@/lib/settings/defaults";
```

Replace `generateReceiptNumber` with:

```ts
export async function generateReceiptNumber(
  settings?: Pick<SettingsValues, "receiptPrefix" | "receiptIncludeYear">
): Promise<string> {
  const { receiptPrefix, receiptIncludeYear } = settings ?? (await getSettings());
  const year = new Date().getFullYear();
  const n = await nextSequenceValue(receiptSequenceName(receiptIncludeYear, year));
  return formatReceiptNumber({ prefix: receiptPrefix, includeYear: receiptIncludeYear, year, sequence: n });
}
```

Leave `formatSequence`, `nextSequenceValue` and `generateStudentCode` unchanged.

- [ ] **Step 2: Verify it compiles and existing tests still pass**

```bash
npx tsc --noEmit
npx vitest run tests/unit/ids.test.ts
```

Expected: clean; `ids.test.ts` still passes (it must keep importing `@/lib/ids` without hitting `server-only`).

- [ ] **Step 3: Verify against the real database (do NOT consume real sequences)**

Temp prefix `ZZT8`. NEVER call `generateReceiptNumber()` with no argument (it would consume a real `receipt-<year>` number). In a temporary script: first read the `Sequence` row named `receipt-all` (record whether it exists and its value). Call `generateReceiptNumber({ receiptPrefix: "ZZT8", receiptIncludeYear: false })` twice: the results must be consecutive, of the shape `ZZT8-NNNNN` (5+ digits). Then restore the `receipt-all` `Sequence` row exactly (delete it if it did not exist, otherwise set `value` back). Confirm the `receipt-<current year>` sequence row's value is unchanged from before you started. Delete all `_tmp_*` files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ids.ts
git commit -m "Generate receipt numbers from the configured prefix and year setting

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Notification queries, actions and safe create helpers

**Files:**
- Create: `src/lib/queries/notifications.ts`
- Create: `src/actions/notifications.ts`
- Create: `src/lib/notifications/create.ts`

**Interfaces:**
- Consumes: `NotificationCandidate`, `buildAdmissionMessage`, `buildPaymentMessage`, `paymentModeLabel` (`@/lib/notifications/candidates`, Task 5); `getSettings` (Task 7 — used by the notify helpers); `prisma.notification` with `dedupeKey` (Task 1).
- Produces:
  - `NotificationRow = { id: string; type: string; message: string; read: boolean; createdAt: Date; studentId: string | null }`, `listNotifications(limit?: number): Promise<NotificationRow[]>` (default 100, newest first), `countUnreadNotifications(): Promise<number>`.
  - `markNotificationRead(id: string): Promise<void>`, `markAllNotificationsRead(): Promise<void>`.
  - `createNotification(candidate: NotificationCandidate): Promise<void>`, `notifyNewAdmission({ studentId, name }): Promise<void>`, `notifyPaymentReceived({ paymentId, studentId, studentName, amount, mode }): Promise<void>`. All three swallow and log errors. Tasks 12, 15, 16 use these by these exact names.

- [ ] **Step 1: Write `src/lib/queries/notifications.ts`**

```ts
// Read-only queries, not mutations -- lives outside src/actions/ (which is
// "use server") so these can never be called as Server Actions from client
// code. "server-only" makes any client-side value import a build error.
import "server-only";

import { prisma } from "@/lib/db";

export type NotificationRow = {
  id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: Date;
  studentId: string | null;
};

// A notification about a since-deleted student is hidden everywhere (and not
// counted), consistent with every other list in the app.
const VISIBLE = { OR: [{ studentId: null }, { student: { deletedAt: null } }] };

export async function listNotifications(limit = 100): Promise<NotificationRow[]> {
  const rows = await prisma.notification.findMany({
    where: VISIBLE,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, type: true, message: true, read: true, createdAt: true, studentId: true },
  });
  return rows;
}

export async function countUnreadNotifications(): Promise<number> {
  return prisma.notification.count({ where: { read: false, ...VISIBLE } });
}
```

- [ ] **Step 2: Write `src/actions/notifications.ts`**

```ts
"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

function revalidateNotifications() {
  revalidatePath("/notifications");
  // The unread badge lives in the shared layout header.
  revalidatePath("/", "layout");
}

export async function markNotificationRead(id: string) {
  await prisma.notification.updateMany({ where: { id, read: false }, data: { read: true } });
  revalidateNotifications();
}

export async function markAllNotificationsRead() {
  await prisma.notification.updateMany({ where: { read: false }, data: { read: true } });
  revalidateNotifications();
}
```

- [ ] **Step 3: Write `src/lib/notifications/create.ts`**

```ts
import "server-only";

import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/queries/settings";
import {
  buildAdmissionMessage,
  buildPaymentMessage,
  paymentModeLabel,
  type NotificationCandidate,
} from "@/lib/notifications/candidates";

/**
 * Inserts one notification, ignoring a duplicate `dedupeKey`. Errors are
 * caught and logged: a notification must never fail the admission, payment
 * or page that triggered it.
 */
export async function createNotification(candidate: NotificationCandidate): Promise<void> {
  try {
    await prisma.notification.createMany({ data: [candidate], skipDuplicates: true });
  } catch (error) {
    console.error("Failed to create notification", candidate.dedupeKey, error);
  }
}

export async function notifyNewAdmission({ studentId, name }: { studentId: string; name: string }): Promise<void> {
  try {
    const { academyName } = await getSettings();
    await createNotification({
      type: "NEW_ADMISSION",
      studentId,
      message: buildAdmissionMessage(name, academyName),
      dedupeKey: `admission:${studentId}`,
    });
  } catch (error) {
    console.error("Failed to create admission notification", studentId, error);
  }
}

export async function notifyPaymentReceived({
  paymentId,
  studentId,
  studentName,
  amount,
  mode,
}: {
  paymentId: string;
  studentId: string;
  studentName: string;
  amount: number;
  mode: string;
}): Promise<void> {
  await createNotification({
    type: "PAYMENT_RECEIVED",
    studentId,
    message: buildPaymentMessage(studentName, amount, paymentModeLabel(mode)),
    dedupeKey: `payment:${paymentId}`,
  });
}
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in these files.

- [ ] **Step 5: Verify against the real database**

Temp student-code prefix `ZZT9-`. Stub `server-only` and `next/cache` in your preload. In a temporary script with two temp students (one later soft-deleted) and no reliance on global unread totals (use before/after deltas):

1. `createNotification` inserts a row; calling it again with the same `dedupeKey` inserts nothing (exactly one row with that key). `notifyNewAdmission({studentId, name: "ZZT9 Student"})` inserts a `NEW_ADMISSION` row with message `ZZT9 Student joined <academyName>.` and key `admission:<id>`; a second call is a no-op. `notifyPaymentReceived({paymentId: "zzt9-pay", ..., amount: 1500, mode: "UPI"})` inserts `ZZT9 Student paid ₹1,500 via UPI.` with key `payment:zzt9-pay`.
2. `listNotifications()` returns your rows newest-first with the right fields; `countUnreadNotifications()` rises by exactly the number of your unread rows visible; soft-deleting the temp student removes their notifications from both the list and the count (delta drops accordingly); a notification with `studentId: null` remains visible.
3. `markNotificationRead(id)` flips exactly that row to read (count drops by 1); calling it again is a no-op. Do NOT call `markAllNotificationsRead()` against the real DB (it would mark real users' notifications read): instead verify its `where`/`data` by reading the code.
4. `createNotification` swallows an error: call it with a candidate whose `studentId` refers to a nonexistent student (foreign-key violation) and confirm it does not throw and logs to `console.error`.
5. Clean up every notification/student row you created and confirm zero `ZZT9-` students and no leftover notifications with your dedupe keys remain; delete all `_tmp_*` files.

- [ ] **Step 6: Run full regression, then commit**

```bash
npx vitest run
npx tsc --noEmit
git add src/lib/queries/notifications.ts src/actions/notifications.ts src/lib/notifications/create.ts
git commit -m "Add notification queries, mark-read actions and safe create helpers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Throttled notification sync

**Files:**
- Create: `src/lib/notifications/sync.ts`

**Interfaces:**
- Consumes: `isSyncStale`, `SYNC_INTERVAL_MS`, `buildOverdueCandidates`, `buildDueSoonCandidates`, `buildLowAttendanceCandidates`, `LOW_ATTENDANCE_WINDOW_DAYS` (Task 5); `getSettings` (Task 7); `listPendingStudentsWithDues` with `nextDueDate` (Task 6); `computeAttendanceRate`; `startOfUTCDay`, `todayInIST`; `SETTINGS_ID`.
- Produces: `claimNotificationSync(now: Date): Promise<boolean>` and `syncTimeBasedNotifications(options?: { now?: Date; studentIds?: string[] }): Promise<{ created: number } | null>` (`null` = the throttle skipped this run). The optional `studentIds` restricts candidate generation to those students AND bypasses the throttle claim; it exists so verification can run the real logic without creating real notifications, and production callers never pass it. Task 15 calls `syncTimeBasedNotifications()` with no arguments.

- [ ] **Step 1: Write `src/lib/notifications/sync.ts`**

```ts
import "server-only";

import { prisma } from "@/lib/db";
import { computeAttendanceRate } from "@/lib/attendance/rate";
import { startOfUTCDay, todayInIST } from "@/lib/dates";
import { getSettings } from "@/lib/queries/settings";
import { listPendingStudentsWithDues } from "@/lib/queries/reports-dues";
import { SETTINGS_ID } from "@/lib/settings/defaults";
import {
  LOW_ATTENDANCE_WINDOW_DAYS,
  SYNC_INTERVAL_MS,
  buildDueSoonCandidates,
  buildLowAttendanceCandidates,
  buildOverdueCandidates,
  isSyncStale,
} from "@/lib/notifications/candidates";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True for exactly one caller per throttle window. The cheap read is a fast
 * path (most page loads stop here); the conditional `updateMany` is the real
 * atomic claim, so two concurrent stale callers can never both proceed.
 */
export async function claimNotificationSync(now: Date): Promise<boolean> {
  const row = await prisma.academySettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { lastNotificationSyncAt: true },
  });
  if (row && !isSyncStale(row.lastNotificationSyncAt, now)) return false;

  // Make sure the singleton row exists so the conditional update has a row
  // to claim (all other columns take their schema defaults).
  await prisma.academySettings.createMany({ data: [{ id: SETTINGS_ID }], skipDuplicates: true });

  const staleBefore = new Date(now.getTime() - SYNC_INTERVAL_MS);
  const result = await prisma.academySettings.updateMany({
    where: {
      id: SETTINGS_ID,
      OR: [{ lastNotificationSyncAt: null }, { lastNotificationSyncAt: { lte: staleBefore } }],
    },
    data: { lastNotificationSyncAt: now },
  });
  return result.count === 1;
}

async function lowAttendanceInputs(today: Date, studentIds?: string[]) {
  const since = new Date(today.getTime() - LOW_ATTENDANCE_WINDOW_DAYS * DAY_MS);
  const students = await prisma.student.findMany({
    where: { deletedAt: null, status: "ACTIVE", ...(studentIds ? { id: { in: studentIds } } : {}) },
    select: {
      id: true,
      name: true,
      attendance: { where: { date: { gte: since } }, select: { status: true } },
    },
  });
  return students.map((s) => ({
    studentId: s.id,
    name: s.name,
    markedCount: s.attendance.length,
    rate: computeAttendanceRate(s.attendance),
  }));
}

export async function syncTimeBasedNotifications(
  options: { now?: Date; studentIds?: string[] } = {}
): Promise<{ created: number } | null> {
  const now = options.now ?? new Date();
  const { studentIds } = options;

  if (!studentIds) {
    const claimed = await claimNotificationSync(now);
    if (!claimed) return null;
  }

  const settings = await getSettings();
  const today = startOfUTCDay(todayInIST());

  const inScope = <T extends { studentId: string }>(rows: T[]) =>
    studentIds ? rows.filter((r) => studentIds.includes(r.studentId)) : rows;
  const dues = inScope(await listPendingStudentsWithDues());

  const overdue = dues
    .filter((d) => d.category === "OVERDUE")
    .map((d) => ({ studentId: d.studentId, name: d.name, pastDuePending: d.pastDuePending.toNumber() }));
  const dueSoon = dues
    .filter((d) => d.category !== "OVERDUE")
    .map((d) => ({
      studentId: d.studentId,
      name: d.name,
      totalPending: d.totalPending.toNumber(),
      nextDueDate: d.nextDueDate,
    }));

  const candidates = [
    ...buildOverdueCandidates(overdue, today, settings.overdueReminderDays),
    ...buildDueSoonCandidates(dueSoon, today, settings.dueSoonDays),
    ...buildLowAttendanceCandidates(await lowAttendanceInputs(today, studentIds), today),
  ];
  if (candidates.length === 0) return { created: 0 };

  const result = await prisma.notification.createMany({ data: candidates, skipDuplicates: true });
  return { created: result.count };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in this file.

- [ ] **Step 3: Verify against the real database**

Temp student-code prefix `ZZT10-`. NEVER call `syncTimeBasedNotifications()` without `studentIds`. Stub `server-only` in your preload.

1. **Claim logic (snapshot and restore the real settings row):** read the current `AcademySettings` row (or record its absence). Set `lastNotificationSyncAt` to `null` (creating the row via `createMany` if needed), then run `Promise.all` of 6 concurrent `claimNotificationSync(new Date())` calls: EXACTLY ONE resolves `true`. An immediate follow-up call resolves `false` (fresh). Set `lastNotificationSyncAt` to 31 minutes ago and confirm the next call resolves `true`, the one after `false`. RESTORE the row exactly as first read (delete it if it did not exist) and confirm `getSettings()` is unchanged.
2. **Candidate generation scoped to temp students:** create four temp students: (a) a MONTHLY plan starting 3 months ago, unpaid → OVERDUE; (b) a MONTHLY plan starting this month, unpaid, with `dueSoonDays` large enough to include month-end (do NOT change the real setting: instead the run uses the real setting, so choose the plan/dates so the test is deterministic: if the real `dueSoonDays` window does not reach month-end today, assert only on the overdue and low-attendance results and reason about due-soon from the pure builder tests); (c) an ACTIVE student with a temp batch and 6 attendance rows in the last 30 days of which only 2 are PRESENT (33%) → LOW_ATTENDANCE; (d) an ACTIVE student with 6 rows all PRESENT → nothing. Call `syncTimeBasedNotifications({ studentIds: [<the four ids>] })`: notifications exist ONLY for your temp students, with the expected types, messages and dedupe keys (`overdue:<id>:<cycle>`, `lowatt:<id>:<YYYY-MM>`); `created` matches the count. Call it again: `created` is 0 (dedupe). Confirm no notification was created for any real student (count of notifications with your dedupe-key patterns equals your temp students' only; the total for non-temp students is unchanged from before).
3. Soft-delete student (a) and confirm a fresh scoped run creates nothing for it.
4. Clean up (Notification, Attendance, Payment, FeePlan, Enrollment, Batch, Course, Student — children first), confirm zero `ZZT10-` students and no notifications carrying your temp students' ids remain, and delete all `_tmp_*` files.

- [ ] **Step 4: Run full regression, then commit**

```bash
npx vitest run
npx tsc --noEmit
git add src/lib/notifications/sync.ts
git commit -m "Add throttled time-based notification sync

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Recent activity query

**Files:**
- Create: `src/lib/queries/activity.ts`

**Interfaces:**
- Consumes: `mergeActivity`, `summarizeAttendance`, `ActivityEvent` (`@/lib/notifications/activity`, Task 5); `formatInr`, `buildPaymentMessage`, `paymentModeLabel` (`@/lib/notifications/candidates`, Task 5).
- Produces: `getRecentActivity(): Promise<ActivityEvent[]>` (at most 10, newest first, all plain values). Task 17 calls it by this exact name.

- [ ] **Step 1: Write `src/lib/queries/activity.ts`**

```ts
// Read-only query, not a mutation. "server-only" makes any client-side value
// import a build error.
import "server-only";

import { prisma } from "@/lib/db";
import { mergeActivity, summarizeAttendance, type ActivityEvent } from "@/lib/notifications/activity";
import { buildPaymentMessage, paymentModeLabel } from "@/lib/notifications/candidates";

const PER_SOURCE = 10;
const ATTENDANCE_ROWS = 60;
const LIMIT = 10;
// A brand-new student's enrollment is created within moments of the student
// itself; only report a batch join if it happened clearly after admission.
const JOIN_AFTER_ADMISSION_MS = 60 * 1000;

export async function getRecentActivity(): Promise<ActivityEvent[]> {
  const [payments, students, enrollments, reminders, attendance] = await Promise.all([
    prisma.payment.findMany({
      where: { student: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { amount: true, mode: true, createdAt: true, student: { select: { name: true } } },
    }),
    prisma.student.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: PER_SOURCE,
      select: { name: true, createdAt: true },
    }),
    prisma.enrollment.findMany({
      where: { student: { deletedAt: null }, batch: { deletedAt: null } },
      orderBy: { joiningBatchDate: "desc" },
      take: PER_SOURCE,
      select: {
        joiningBatchDate: true,
        student: { select: { name: true, createdAt: true } },
        batch: { select: { name: true } },
      },
    }),
    prisma.feeReminder.findMany({
      where: { student: { deletedAt: null } },
      orderBy: { sentAt: "desc" },
      take: PER_SOURCE,
      select: { sentAt: true, student: { select: { name: true } } },
    }),
    prisma.attendance.findMany({
      where: { student: { deletedAt: null }, batch: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: ATTENDANCE_ROWS,
      select: { batchId: true, date: true, status: true, createdAt: true, batch: { select: { name: true } } },
    }),
  ]);

  const events: ActivityEvent[] = [
    ...payments.map((p) => ({
      at: p.createdAt,
      text: buildPaymentMessage(p.student.name, p.amount.toNumber(), paymentModeLabel(p.mode)),
    })),
    ...students.map((s) => ({ at: s.createdAt, text: `${s.name} joined.` })),
    ...enrollments
      .filter((e) => e.joiningBatchDate.getTime() - e.student.createdAt.getTime() > JOIN_AFTER_ADMISSION_MS)
      .map((e) => ({ at: e.joiningBatchDate, text: `${e.student.name} joined ${e.batch.name}.` })),
    ...reminders.map((r) => ({ at: r.sentAt, text: `Fee reminder sent to ${r.student.name}.` })),
    ...summarizeAttendance(
      attendance.map((a) => ({
        batchId: a.batchId,
        batchName: a.batch.name,
        date: a.date,
        status: a.status,
        createdAt: a.createdAt,
      }))
    ),
  ];

  return mergeActivity(events, LIMIT);
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in this file.

- [ ] **Step 3: Verify against the real database**

Temp student-code prefix `ZZT11-`. Stub `server-only` in your preload. In a temporary script: create a temp student with a temp course/batch, an enrollment, a fee plan with a Payment (mode UPI, amount 1500, `feePlanId` set), a `FeeReminder`, and 4 Attendance rows for one batch/date (3 PRESENT, 1 ABSENT). Call `getRecentActivity()`: the result has at most 10 items, is sorted newest-first, is plain (`JSON.stringify` round-trips with no errors and every `at` is a `Date`), and — because your rows are the newest — contains: `ZZT11 Student paid ₹1,500 via UPI.`, `ZZT11 Student joined.`, `Fee reminder sent to ZZT11 Student.`, and exactly ONE attendance event `<batch name> attendance marked: 3 of 4 present.`, and NO `joined <batch name>` event for the just-created enrollment (created within a minute of the student). Then insert a second enrollment for the temp student in another temp batch with `joiningBatchDate` set 2 hours after the student's `createdAt` and confirm a `ZZT11 Student joined <that batch>.` event appears. Soft-delete the temp student and confirm none of their events remain. Clean up all rows children-first, confirm zero `ZZT11-` students remain, and delete all `_tmp_*` files.

- [ ] **Step 4: Run full regression, then commit**

```bash
npx vitest run
npx tsc --noEmit
git add src/lib/queries/activity.ts
git commit -m "Add recent activity query

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: Wire notifications and the reminder template into the existing actions

**Files:**
- Modify: `src/actions/students.ts`
- Modify: `src/actions/fees.ts`
- Modify: `src/actions/reminders.ts`

**Interfaces:**
- Consumes: `notifyNewAdmission`, `notifyPaymentReceived` (`@/lib/notifications/create`, Task 9); `getSettings` (Task 7); `buildReminderMessage` with options (Task 3).

- [ ] **Step 1: Edit `src/actions/students.ts` (`createStudent` only)**

Add the import `import { notifyNewAdmission } from "@/lib/notifications/create";`. Capture the created student's id by changing `await prisma.student.create({` to `const student = await prisma.student.create({`, and adding `select: { id: true },` as the last property of that call's options object (after `data: { ... },`). Then, immediately before `revalidatePath("/students");` in `createStudent`, add:

```ts
  await notifyNewAdmission({ studentId: student.id, name: data.name });
```

Do not touch `updateStudent` or any other function.

- [ ] **Step 2: Edit `src/actions/fees.ts` (`createPayment` only)**

Add the import `import { notifyPaymentReceived } from "@/lib/notifications/create";`. In `createPayment`, change the student lookup's `select: { id: true },` to `select: { id: true, name: true },`, and immediately before the three `revalidatePath` calls at the end of `createPayment` add:

```ts
  await notifyPaymentReceived({
    paymentId: payment.id,
    studentId,
    studentName: student.name,
    amount: payment.amount.toNumber(),
    mode: payment.mode,
  });
```

Do not touch `saveFeePlan`.

- [ ] **Step 3: Edit `src/actions/reminders.ts`**

Add `import { getSettings } from "@/lib/queries/settings";` and replace `const message = buildReminderMessage(student.name, pendingAmount);` with:

```ts
  const settings = await getSettings();
  const message = buildReminderMessage(student.name, pendingAmount, {
    template: settings.reminderTemplate,
    academyName: settings.academyName,
  });
```

- [ ] **Step 4: Verify it compiles and tests pass**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: clean.

- [ ] **Step 5: Verify (WITHOUT calling createStudent or createPayment against the real DB)**

`createStudent` and `createPayment` consume real student-code / receipt sequence numbers, so do NOT call them. Verify their wiring by reading the final code (the notification call sits after the write, is awaited, is the only change, and cannot throw because the helpers catch their own errors). For `sendFeeReminder`: temp student-code prefix `ZZT12-`; create a temp student with an unpaid MONTHLY plan starting this month; stub `server-only` and `next/cache` in your preload; call `sendFeeReminder(studentId)` (this only READS settings and inserts a `FeeReminder`): with the real settings at their defaults the returned `message` must equal `buildReminderMessage(name, amount)` exactly (the legacy text); a `FeeReminder` row exists with the same message. Delete the FeeReminder and temp rows, confirm zero `ZZT12-` rows remain, and delete all `_tmp_*` files. (If the real settings row has a custom template, assert the message equals `buildReminderMessage(name, amount, { template, academyName })` instead.)

- [ ] **Step 6: Commit**

```bash
git add src/actions/students.ts src/actions/fees.ts src/actions/reminders.ts
git commit -m "Notify on new admissions and payments; use the reminder template

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: Settings forms

**Files:**
- Create: `src/components/settings/settings-form-utils.ts`
- Create: `src/components/settings/academy-settings-form.tsx`
- Create: `src/components/settings/receipt-settings-form.tsx`
- Create: `src/components/settings/reminder-settings-form.tsx`

**Interfaces:**
- Consumes: the three save actions (Task 7); the schemas and input types (Task 4); `formatReceiptNumber` (Task 2); `renderReminderTemplate`, `DEFAULT_REMINDER_TEMPLATE` (Task 2).
- Produces: `fieldErrors(issues: ZodIssue[]): Record<string, string>`; `AcademySettingsForm({ initial })` with `initial: { academyName: string; logoUrl: string; address: string; mobile: string; email: string }`; `ReceiptSettingsForm({ initial, year })` with `initial: { receiptPrefix: string; receiptIncludeYear: boolean; receiptFooter: string }` and `year: number`; `ReminderSettingsForm({ initial, academyName })` with `initial: { reminderTemplate: string; dueSoonDays: string; overdueReminderDays: string }`. Task 14 renders them by these exact names.

- [ ] **Step 1: Write `src/components/settings/settings-form-utils.ts`**

```ts
import type { ZodIssue } from "zod";

/** First error message per top-level field name, for inline display. */
export function fieldErrors(issues: ZodIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}
```

- [ ] **Step 2: Write `src/components/settings/academy-settings-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { saveAcademySettings } from "@/actions/settings";
import { academySettingsSchema } from "@/lib/validations/settings";
import { fieldErrors } from "@/components/settings/settings-form-utils";
import { toast } from "sonner";

type FormState = {
  academyName: string;
  logoUrl: string;
  address: string;
  mobile: string;
  email: string;
};

export function AcademySettingsForm({ initial }: { initial: FormState }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function update(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = academySettingsSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await saveAcademySettings(form);
      toast.success("Academy settings saved");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card space-y-4 p-6">
      <h2 className="font-medium text-gold">Academy Settings</h2>
      <div className="space-y-2">
        <Label htmlFor="academyName">Academy Name</Label>
        <Input
          id="academyName"
          value={form.academyName}
          onChange={(e) => update("academyName", e.target.value)}
          disabled={submitting}
        />
        {errors.academyName && <p className="text-sm text-danger">{errors.academyName}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="logoUrl">Logo URL</Label>
        <Input
          id="logoUrl"
          placeholder="https://example.com/logo.png"
          value={form.logoUrl}
          onChange={(e) => update("logoUrl", e.target.value)}
          disabled={submitting}
        />
        <p className="text-xs text-muted">The address of a logo image you have hosted (must start with https://).</p>
        {errors.logoUrl && <p className="text-sm text-danger">{errors.logoUrl}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          value={form.address}
          onChange={(e) => update("address", e.target.value)}
          disabled={submitting}
          className="max-h-40 overflow-y-auto"
        />
        {errors.address && <p className="text-sm text-danger">{errors.address}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="academyMobile">Mobile Number</Label>
          <Input
            id="academyMobile"
            value={form.mobile}
            onChange={(e) => update("mobile", e.target.value)}
            disabled={submitting}
          />
          {errors.mobile && <p className="text-sm text-danger">{errors.mobile}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="academyEmail">Email</Label>
          <Input
            id="academyEmail"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            disabled={submitting}
          />
          {errors.email && <p className="text-sm text-danger">{errors.email}</p>}
        </div>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : "Save Settings"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Write `src/components/settings/receipt-settings-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { saveReceiptSettings } from "@/actions/settings";
import { receiptSettingsSchema } from "@/lib/validations/settings";
import { formatReceiptNumber } from "@/lib/settings/receipt";
import { fieldErrors } from "@/components/settings/settings-form-utils";
import { toast } from "sonner";

type FormState = {
  receiptPrefix: string;
  receiptIncludeYear: boolean;
  receiptFooter: string;
};

// `year` comes from the server (page.tsx): calling new Date() during render in
// a client component is impure and can mismatch between server and client.
export function ReceiptSettingsForm({ initial, year }: { initial: FormState; year: number }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const previewPrefix = form.receiptPrefix.trim() === "" ? "SNT" : form.receiptPrefix;
  const preview = formatReceiptNumber({
    prefix: previewPrefix,
    includeYear: form.receiptIncludeYear,
    year,
    sequence: 45,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = receiptSettingsSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await saveReceiptSettings(form);
      toast.success("Receipt settings saved");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card space-y-4 p-6">
      <h2 className="font-medium text-gold">Receipt Settings</h2>
      <div className="space-y-2">
        <Label htmlFor="receiptPrefix">Receipt Prefix</Label>
        <Input
          id="receiptPrefix"
          value={form.receiptPrefix}
          onChange={(e) => setForm((f) => ({ ...f, receiptPrefix: e.target.value.toUpperCase() }))}
          disabled={submitting}
          className="max-w-40"
        />
        <p className="text-xs text-muted">2-8 letters or digits.</p>
        {errors.receiptPrefix && <p className="text-sm text-danger">{errors.receiptPrefix}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="receiptIncludeYear"
          checked={form.receiptIncludeYear}
          onCheckedChange={(checked) => setForm((f) => ({ ...f, receiptIncludeYear: checked === true }))}
          disabled={submitting}
        />
        <Label htmlFor="receiptIncludeYear">Include the year in receipt numbers</Label>
      </div>
      <p className="text-sm text-muted">
        Next receipts will look like <span className="text-foreground">{preview}</span>. Existing receipts are not
        changed.
      </p>
      <div className="space-y-2">
        <Label htmlFor="receiptFooter">Footer Message</Label>
        <Input
          id="receiptFooter"
          value={form.receiptFooter}
          onChange={(e) => setForm((f) => ({ ...f, receiptFooter: e.target.value }))}
          disabled={submitting}
        />
        <p className="text-xs text-muted">Shown at the bottom of every receipt. Leave empty for none.</p>
        {errors.receiptFooter && <p className="text-sm text-danger">{errors.receiptFooter}</p>}
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : "Save Settings"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Write `src/components/settings/reminder-settings-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { saveReminderSettings } from "@/actions/settings";
import { reminderSettingsSchema } from "@/lib/validations/settings";
import { renderReminderTemplate } from "@/lib/settings/reminder-template";
import { DEFAULT_REMINDER_TEMPLATE } from "@/lib/settings/defaults";
import { fieldErrors } from "@/components/settings/settings-form-utils";
import { toast } from "sonner";

type FormState = {
  reminderTemplate: string;
  dueSoonDays: string;
  overdueReminderDays: string;
};

export function ReminderSettingsForm({ initial, academyName }: { initial: FormState; academyName: string }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const preview = renderReminderTemplate(form.reminderTemplate, {
    name: "Aarav Shah",
    amount: "1,500",
    academy: academyName,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = reminderSettingsSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await saveReminderSettings(form);
      toast.success("Fee reminder settings saved");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card space-y-4 p-6">
      <h2 className="font-medium text-gold">Fee Reminder Settings</h2>
      <div className="space-y-2">
        <Label htmlFor="reminderTemplate">Reminder Message Template</Label>
        <Textarea
          id="reminderTemplate"
          value={form.reminderTemplate}
          onChange={(e) => setForm((f) => ({ ...f, reminderTemplate: e.target.value }))}
          disabled={submitting}
          className="max-h-56 overflow-y-auto"
        />
        <p className="text-xs text-muted">
          Use {"{name}"} and {"{amount}"} (required) and optionally {"{academy}"}.
        </p>
        {errors.reminderTemplate && <p className="text-sm text-danger">{errors.reminderTemplate}</p>}
        <div className="rounded-lg border border-card-border p-3">
          <p className="mb-1 text-xs text-muted">Preview</p>
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">{preview}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setForm((f) => ({ ...f, reminderTemplate: DEFAULT_REMINDER_TEMPLATE }))}
          disabled={submitting}
        >
          Restore Default
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dueSoonDays">Due Soon Days</Label>
          <Input
            id="dueSoonDays"
            inputMode="numeric"
            value={form.dueSoonDays}
            onChange={(e) => setForm((f) => ({ ...f, dueSoonDays: e.target.value }))}
            disabled={submitting}
          />
          <p className="text-xs text-muted">Notify this many days before a fee falls due (1-30).</p>
          {errors.dueSoonDays && <p className="text-sm text-danger">{errors.dueSoonDays}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="overdueReminderDays">Overdue Reminder Frequency</Label>
          <Input
            id="overdueReminderDays"
            inputMode="numeric"
            value={form.overdueReminderDays}
            onChange={(e) => setForm((f) => ({ ...f, overdueReminderDays: e.target.value }))}
            disabled={submitting}
          />
          <p className="text-xs text-muted">Re-notify about an overdue student every this many days (1-60).</p>
          {errors.overdueReminderDays && <p className="text-sm text-danger">{errors.overdueReminderDays}</p>}
        </div>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : "Save Settings"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Verify it compiles and lints**

```bash
npx tsc --noEmit
npx eslint src/components/settings/settings-form-utils.ts src/components/settings/academy-settings-form.tsx src/components/settings/receipt-settings-form.tsx src/components/settings/reminder-settings-form.tsx
```

Expected: no errors and no warnings in these files.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/settings-form-utils.ts src/components/settings/academy-settings-form.tsx src/components/settings/receipt-settings-form.tsx src/components/settings/reminder-settings-form.tsx
git commit -m "Add settings forms for academy, receipts and fee reminders

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 14: Settings page

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `getSettings` (Task 7); the three forms (Task 13); the existing `ChangePasswordForm`.

- [ ] **Step 1: Rewrite `src/app/(app)/settings/page.tsx`**

```tsx
import { getSettings } from "@/lib/queries/settings";
import { AcademySettingsForm } from "@/components/settings/academy-settings-form";
import { ReceiptSettingsForm } from "@/components/settings/receipt-settings-form";
import { ReminderSettingsForm } from "@/components/settings/reminder-settings-form";
import { ChangePasswordForm } from "@/components/settings/change-password-form";

export default async function SettingsPage() {
  const settings = await getSettings();
  const year = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
      <div className="grid max-w-3xl gap-6">
        <AcademySettingsForm
          initial={{
            academyName: settings.academyName,
            logoUrl: settings.logoUrl ?? "",
            address: settings.address ?? "",
            mobile: settings.mobile ?? "",
            email: settings.email ?? "",
          }}
        />
        <ReceiptSettingsForm
          initial={{
            receiptPrefix: settings.receiptPrefix,
            receiptIncludeYear: settings.receiptIncludeYear,
            receiptFooter: settings.receiptFooter,
          }}
          year={year}
        />
        <ReminderSettingsForm
          initial={{
            reminderTemplate: settings.reminderTemplate,
            dueSoonDays: String(settings.dueSoonDays),
            overdueReminderDays: String(settings.overdueReminderDays),
          }}
          academyName={settings.academyName}
        />
        <ChangePasswordForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npx tsc --noEmit
npx eslint "src/app/(app)/settings/page.tsx"
```

Expected: no errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/settings/page.tsx"
git commit -m "Build out the Settings page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 15: Header bell, sidebar brand and layout integration

**Files:**
- Create: `src/components/layout/notification-bell.tsx`
- Modify: `src/components/layout/header.tsx`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `syncTimeBasedNotifications` (Task 10); `countUnreadNotifications` (Task 9); `getSettings` (Task 7).
- Produces: `NotificationBell({ unreadCount }: { unreadCount: number })`; `Header({ name, unreadCount })`; `Sidebar({ academyName, logoUrl })`; `AppShell({ userName, academyName, logoUrl, unreadCount, children })`. Keep the `greeting` export of `header.tsx` (a unit test imports it).

- [ ] **Step 1: Write `src/components/layout/notification-bell.tsx`**

```tsx
import Link from "next/link";
import { Bell } from "lucide-react";

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const label = unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      className="relative rounded-md p-2 text-muted transition-colors hover:text-gold"
    >
      <Bell size={20} />
      {unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold text-background">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Edit `src/components/layout/header.tsx`**

Add `import { NotificationBell } from "@/components/layout/notification-bell";` under the existing import. Change the signature to `export function Header({ name, unreadCount }: { name: string; unreadCount: number }) {` and replace the trailing `<LogoutButton />` inside `<header>` with:

```tsx
      <div className="flex items-center gap-2">
        <NotificationBell unreadCount={unreadCount} />
        <LogoutButton />
      </div>
```

Leave `greeting` and `currentHourInIST` unchanged.

- [ ] **Step 3: Edit `src/components/layout/sidebar.tsx`**

Change `export function Sidebar() {` to:

```tsx
export function Sidebar({ academyName, logoUrl }: { academyName: string; logoUrl: string | null }) {
```

and replace the brand line `{!collapsed && <span className="text-lg font-semibold text-gold">SAINTS</span>}` with:

```tsx
        {!collapsed && (
          <span className="flex items-center gap-2 text-lg font-semibold text-gold">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- admin-configured external logo; next/image would need every host allow-listed
              <img src={logoUrl} alt="" className="h-7 w-7 rounded object-contain" />
            )}
            {academyName}
          </span>
        )}
```

- [ ] **Step 4: Rewrite `src/components/layout/app-shell.tsx`**

```tsx
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export function AppShell({
  userName,
  academyName,
  logoUrl,
  unreadCount,
  children,
}: {
  userName: string;
  academyName: string;
  logoUrl: string | null;
  unreadCount: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar academyName={academyName} logoUrl={logoUrl} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header name={userName} unreadCount={unreadCount} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Rewrite `src/app/(app)/layout.tsx`**

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { getSettings } from "@/lib/queries/settings";
import { countUnreadNotifications } from "@/lib/queries/notifications";
import { syncTimeBasedNotifications } from "@/lib/notifications/sync";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  // Throttled (at most once per 30 minutes across all requests); a failure
  // here must never break page rendering.
  try {
    await syncTimeBasedNotifications();
  } catch (error) {
    console.error("Notification sync failed", error);
  }

  const [settings, unreadCount] = await Promise.all([getSettings(), countUnreadNotifications()]);

  return (
    <AppShell
      userName={session.user.name}
      academyName={settings.academyName}
      logoUrl={settings.logoUrl}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 6: Verify it compiles, lints, and the header test still passes**

```bash
npx tsc --noEmit
npx eslint src/components/layout/notification-bell.tsx src/components/layout/header.tsx src/components/layout/sidebar.tsx src/components/layout/app-shell.tsx "src/app/(app)/layout.tsx"
npx vitest run tests/unit/greeting.test.ts
```

Expected: no errors or warnings (the `eslint-disable-next-line` comment must silence the img rule without adding a problem); the greeting test still passes.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/notification-bell.tsx src/components/layout/header.tsx src/components/layout/sidebar.tsx src/components/layout/app-shell.tsx "src/app/(app)/layout.tsx"
git commit -m "Add notification bell, academy branding and throttled sync to the app layout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 16: Notifications page

**Files:**
- Create: `src/components/notifications/notifications-list.tsx`
- Create: `src/app/(app)/notifications/page.tsx`

**Interfaces:**
- Consumes: `listNotifications`, `NotificationRow` (Task 9); `markNotificationRead`, `markAllNotificationsRead` (Task 9); `formatDateUTC`.
- Produces: `NotificationsList({ notifications }: { notifications: NotificationRow[] })`.

- [ ] **Step 1: Write `src/components/notifications/notifications-list.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { markAllNotificationsRead, markNotificationRead } from "@/actions/notifications";
import { formatDateUTC } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { NotificationRow } from "@/lib/queries/notifications";

const TYPE_LABELS: Record<string, string> = {
  FEE_OVERDUE: "Fee Overdue",
  FEE_DUE_SOON: "Fee Due Soon",
  LOW_ATTENDANCE: "Low Attendance",
  NEW_ADMISSION: "New Admission",
  PAYMENT_RECEIVED: "Payment Received",
};

export function NotificationsList({ notifications }: { notifications: NotificationRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  async function handleMarkRead(id: string) {
    setPendingId(id);
    try {
      await markNotificationRead(id);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleMarkAll() {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground">Notifications</h1>
          <p className="text-sm text-muted">{unreadCount === 0 ? "You're all caught up." : `${unreadCount} unread`}</p>
        </div>
        <Button variant="outline" onClick={handleMarkAll} disabled={unreadCount === 0 || markingAll}>
          {markingAll ? "Marking..." : "Mark All Read"}
        </Button>
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet." />
      ) : (
        <div className="glass-card divide-y divide-card-border">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={cn("flex items-start justify-between gap-4 p-4", !n.read && "border-l-2 border-gold bg-gold/5")}
            >
              <div className="min-w-0 space-y-1">
                <p className={cn("break-words", n.read ? "text-muted" : "text-foreground")}>{n.message}</p>
                <p className="text-xs text-muted">
                  {TYPE_LABELS[n.type] ?? n.type} · {formatDateUTC(n.createdAt)}
                  {n.studentId && (
                    <>
                      {" · "}
                      <Link href={`/students/${n.studentId}`} className="text-gold hover:underline">
                        View Student
                      </Link>
                    </>
                  )}
                </p>
              </div>
              {!n.read && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => handleMarkRead(n.id)}
                  disabled={pendingId === n.id}
                >
                  {pendingId === n.id ? "Marking..." : "Mark Read"}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `src/app/(app)/notifications/page.tsx`**

```tsx
import { listNotifications } from "@/lib/queries/notifications";
import { NotificationsList } from "@/components/notifications/notifications-list";

export default async function NotificationsPage() {
  const notifications = await listNotifications();
  return <NotificationsList notifications={notifications} />;
}
```

- [ ] **Step 3: Verify it compiles and lints**

```bash
npx tsc --noEmit
npx eslint src/components/notifications/notifications-list.tsx "src/app/(app)/notifications/page.tsx"
```

Expected: no errors or warnings.

- [ ] **Step 4: Commit**

```bash
git add src/components/notifications/notifications-list.tsx "src/app/(app)/notifications/page.tsx"
git commit -m "Add the notification center page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 17: Dashboard Recent Activity

**Files:**
- Create: `src/components/dashboard/recent-activity.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `getRecentActivity` (Task 11); `ActivityEvent` (Task 5); `formatDateUTC`.
- Produces: `RecentActivity({ events }: { events: ActivityEvent[] })` (a Server Component, no hooks).

- [ ] **Step 1: Write `src/components/dashboard/recent-activity.tsx`**

```tsx
import { formatDateUTC } from "@/lib/dates";
import type { ActivityEvent } from "@/lib/notifications/activity";

export function RecentActivity({ events }: { events: ActivityEvent[] }) {
  return (
    <div className="glass-card space-y-3 p-6">
      <h2 className="font-semibold text-foreground">Recent Activity</h2>
      {events.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          Nothing has happened yet. Activity will appear here as you add students, take payments and mark attendance.
        </p>
      ) : (
        <ul className="divide-y divide-card-border">
          {events.map((event, index) => (
            <li key={`${event.at.getTime()}-${index}`} className="flex items-start justify-between gap-4 py-3">
              <span className="min-w-0 break-words text-sm text-foreground">{event.text}</span>
              <span className="shrink-0 text-xs text-muted">{formatDateUTC(event.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Edit `src/app/(app)/dashboard/page.tsx`**

Add these imports:

```tsx
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { getRecentActivity } from "@/lib/queries/activity";
```

Replace `const stats = await getDashboardStats();` with:

```tsx
  const [stats, activity] = await Promise.all([getDashboardStats(), getRecentActivity()]);
```

and add `<RecentActivity events={activity} />` as the last child of the outer `<div className="space-y-8">`, after the stat-card grid `</div>`.

- [ ] **Step 3: Verify it compiles and lints**

```bash
npx tsc --noEmit
npx eslint src/components/dashboard/recent-activity.tsx "src/app/(app)/dashboard/page.tsx"
```

Expected: no errors or warnings.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/recent-activity.tsx "src/app/(app)/dashboard/page.tsx"
git commit -m "Add Recent Activity to the dashboard

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 18: Receipt page uses the academy settings

**Files:**
- Modify: `src/app/receipts/[paymentId]/page.tsx`

**Interfaces:**
- Consumes: `getSettings` (Task 7).

- [ ] **Step 1: Edit `src/app/receipts/[paymentId]/page.tsx`**

Read the whole file first, then make exactly these edits and change nothing else:

1. Add `import { getSettings } from "@/lib/queries/settings";` with the other imports.
2. After `if (!payment || !payment.receipt) notFound();` add:

```tsx
  const settings = await getSettings();
  const contactLines = [settings.address, settings.mobile, settings.email].filter(
    (line): line is string => !!line
  );
```

3. In the `shareMessage` array: change `"SAINTS – Fee Receipt",` to `` `${settings.academyName} – Fee Receipt`, `` and replace the last element `"Thank you!",` with `...(settings.receiptFooter ? [settings.receiptFooter] : []),` (keep `.join("\n")`).
4. In the header block, replace

```tsx
          <p className="text-lg font-semibold text-gold print:text-black">SAINTS</p>
          <p className="text-sm text-muted print:text-black">Dance • Zumba • Movement • Self Knowledge</p>
```

with

```tsx
          {settings.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- admin-configured external logo; next/image would need every host allow-listed
            <img src={settings.logoUrl} alt="" className="mx-auto mb-2 h-12 w-12 object-contain" />
          )}
          <p className="text-lg font-semibold text-gold print:text-black">{settings.academyName}</p>
          <p className="text-sm text-muted print:text-black">Dance • Zumba • Movement • Self Knowledge</p>
          {contactLines.map((line) => (
            <p key={line} className="text-xs text-muted print:text-black">
              {line}
            </p>
          ))}
```

5. Replace `<p className="text-center text-sm text-muted print:text-black">Thank You</p>` with:

```tsx
        {settings.receiptFooter && (
          <p className="text-center text-sm text-muted print:text-black">{settings.receiptFooter}</p>
        )}
```

- [ ] **Step 2: Verify it compiles and lints**

```bash
npx tsc --noEmit
npx eslint "src/app/receipts/[paymentId]/page.tsx"
```

Expected: no errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add "src/app/receipts/[paymentId]/page.tsx"
git commit -m "Show academy name, logo, contact lines and footer on receipts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 19: Final verification and wrap-up

**Files:** none (verification only)

- [ ] **Step 1: Full regression pass**

```bash
npx vitest run
npx tsc --noEmit
npx eslint .
npx next build
```

Expected: every test passes (the 224 from earlier phases plus this phase's new unit tests: settings-defaults 2, settings-receipt 9, settings-reminder-template 9, reminders-message +3, settings-validation about 40, notification-candidates 22, notification-activity 7, dues +7); `tsc` clean; `eslint` matches the project baseline exactly (13 problems: 1 error, 12 warnings, none in Phase 7 files, and the two `eslint-disable-next-line @next/next/no-img-element` comments must not add problems); `next build` clean with `/notifications` in the route table.

- [ ] **Step 2: Migration safety check**

`git diff main...HEAD -- prisma/` shows only the `AcademySettings` model, the `Notification.dedupeKey` column and its index, and one migration folder whose SQL contains only additive statements. `package.json` and the lockfile are untouched.

- [ ] **Step 3: End-to-end data-layer verification (temp prefix `ZZT19-`)**

With a temp student, temp batch/course and a temp fee plan, and following the Global Constraints safety rules (no `createStudent`/`createPayment`, no unscoped sync, no writes to the real settings row): confirm that `getSettings()` defaults reproduce the legacy reminder message and receipt format; that a scoped `syncTimeBasedNotifications({ studentIds })` produces the expected overdue/low-attendance notifications for the temp students only and is idempotent; that `listNotifications`/`countUnreadNotifications`/`markNotificationRead` agree with each other; and that `getRecentActivity()` reflects the temp student's events. Clean up and confirm zero `ZZT19-` rows remain.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "Phase 7 (Settings & Notifications) complete: verification pass

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Post-Plan Check

At the end of this plan the roadmap is complete: the admin can configure the academy, receipts and reminders; sees notifications for admissions, payments and time-based fee/attendance conditions; and gets a live activity feed on the dashboard.
