# SAINTS Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the SAINTS Student Management System's foundation — a deployed, working Next.js app where an Admin can log in, manage Courses/Batches/Instructors, manage full Student profiles with photos, and see a Dashboard driven entirely by real (not hardcoded) data.

**Architecture:** Next.js 16 (App Router, TypeScript) full-stack app. Server Actions for all writes, direct Prisma queries in Server Components for reads. PostgreSQL (Neon) via Prisma ORM. Better Auth for session-based email/password login. Vercel Blob for student photos. Tailwind CSS v4 + shadcn/ui themed to SAINTS's black/gold identity. Deployed on Vercel.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS v4, shadcn/ui, Prisma, PostgreSQL (Neon), Better Auth, Vercel Blob, Zod, react-hook-form, Vitest, Playwright.

**Reference spec:** `docs/superpowers/specs/2026-09-04-phase1-foundation-design.md`

---

## Task 1: Scaffold the Next.js project ✅ DONE (commit 1edc180)

**Files:**
- Create: entire project scaffold (package.json, tsconfig.json, next.config.ts, src/app/layout.tsx, src/app/page.tsx, src/app/globals.css, .gitignore, eslint config)

- [x] **Step 1: Run create-next-app in the current directory**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

If prompted about the directory already containing files (`.git`, `docs/`), confirm to continue — these don't conflict with the scaffold.

- [ ] **Step 2: Verify the dev server runs**

```bash
npm run dev
```

Expected: server starts on `http://localhost:3000` with no errors. Stop it with Ctrl+C once confirmed.

- [ ] **Step 3: Confirm `.gitignore` covers secrets and build output**

Open `.gitignore` and confirm it includes `.env`, `.env*.local`, `/node_modules`, `/.next`. `create-next-app` includes these by default — if any are missing, add them.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js 16 project with TypeScript and Tailwind v4

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Install and configure shadcn/ui ✅ DONE (commit 00afd3b — note: shadcn's "form" component is deprecated upstream, installed "field"+"separator" as the replacement; not used by any later task's code, which calls react-hook-form's register() directly)

**Files:**
- Create: `components.json`, `src/components/ui/*` (generated)

- [ ] **Step 1: Initialize shadcn/ui with defaults**

```bash
npx shadcn@latest init -d
```

- [ ] **Step 2: Add the components this phase needs**

```bash
npx shadcn@latest add button input label textarea select checkbox card dialog table tabs badge avatar dropdown-menu form sonner -d
```

- [ ] **Step 3: Verify components were generated**

Confirm `src/components/ui/` now contains `button.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`, `select.tsx`, `checkbox.tsx`, `card.tsx`, `dialog.tsx`, `table.tsx`, `tabs.tsx`, `badge.tsx`, `avatar.tsx`, `dropdown-menu.tsx`, `form.tsx`, `sonner.tsx`.

- [ ] **Step 4: Install form dependencies**

```bash
npm install react-hook-form @hookform/resolvers zod
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add shadcn/ui components and form dependencies

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Apply the SAINTS visual theme ✅ DONE (commits 069b9564, df4e65c — fixed --color-muted in follow-up)

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Replace the theme tokens in `src/app/globals.css`**

Keep the existing `@import "tailwindcss";` line at the top (added by shadcn init) and add/replace the theme block:

```css
@theme {
  --color-background: #0b0b0d;
  --color-foreground: #f5f5f0;
  --color-card: rgba(255, 255, 255, 0.04);
  --color-card-border: rgba(201, 162, 39, 0.18);
  --color-gold: #c9a227;
  --color-gold-soft: #e4c766;
  --color-muted: #9a9a9e;
  --color-danger: #e05252;
  --color-warning: #d4a72c;
  --color-success: #4caf7d;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
}

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
```

- [ ] **Step 2: Set the page title and description in `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "SAINTS — Self Awareness & Inner Transformation System",
  description: "Know Yourself — The Divine Within",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify visually**

```bash
npm run dev
```

Open `http://localhost:3000` and confirm the background is near-black. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Apply SAINTS black/gold visual theme tokens

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Database schema (Prisma + Neon) ✅ DONE (commit f6335e0 — prisma/@prisma/client pinned to exact 6.19.3, npm "latest" resolves to an incompatible 8.0.0-rc pre-release CLI and 7.10.0 drops classic datasource.url syntax; do NOT `npm i prisma@latest` in a later task without re-checking this. Follow-up noted but not yet done: non-unique FK columns (Payment.studentId, Attendance.batchId, etc.) have no index — cheap to add later before real data volume.)

**Files:**
- Create: `prisma/schema.prisma`
- Create: `.env.example`
- Create: `.env` (not committed)
- Create: `src/lib/db.ts`

- [ ] **Step 1: Install Prisma**

```bash
npm install prisma --save-dev
npm install @prisma/client
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: Create a free Neon project**

Go to https://neon.tech, sign up with no credit card, create a project named `saints`. Copy the **pooled connection string** (starts `postgres://...`, includes `-pooler` in the host).

- [ ] **Step 3: Set `DATABASE_URL` in `.env`**

```
DATABASE_URL="<paste your Neon pooled connection string here>"
```

- [ ] **Step 4: Write `.env.example`**

```
DATABASE_URL="postgres://user:password@host-pooler.neon.tech/dbname?sslmode=require"
BETTER_AUTH_SECRET="generate-with: openssl rand -base64 32"
BETTER_AUTH_URL="http://localhost:3000"
ADMIN_EMAIL="arpitagrggc@gmail.com"
ADMIN_SEED_PASSWORD="set-a-strong-password-here"
BLOB_READ_WRITE_TOKEN="from-vercel-blob-store-settings"
```

- [ ] **Step 5: Write the full schema in `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// --- Better Auth required models ---

model User {
  id            String    @id @default(cuid())
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  role          String    @default("ADMIN")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  sessions      Session[]
  accounts      Account[]
}

model Session {
  id        String   @id @default(cuid())
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Account {
  id                    String    @id @default(cuid())
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
}

model Verification {
  id         String    @id @default(cuid())
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime? @default(now())
  updatedAt  DateTime? @updatedAt
}

// --- Academy domain models ---

enum StudentStatus {
  ACTIVE
  INACTIVE
  LEFT
}

enum Gender {
  MALE
  FEMALE
  OTHER
}

enum AttendanceStatus {
  PRESENT
  ABSENT
  LATE
  LEAVE
}

enum PaymentMode {
  CASH
  UPI
  ONLINE
  BANK_TRANSFER
}

enum FeeFrequency {
  MONTHLY
  QUARTERLY
  YEARLY
  CUSTOM
}

model Instructor {
  id        String           @id @default(cuid())
  name      String
  mobile    String
  bio       String?
  deletedAt DateTime?
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt
  batches   Batch[]
  notes     InstructorNote[]
}

model Course {
  id          String    @id @default(cuid())
  name        String
  category    String
  description String?
  deletedAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  batches     Batch[]
}

model Batch {
  id           String       @id @default(cuid())
  name         String
  courseId     String
  course       Course       @relation(fields: [courseId], references: [id])
  instructorId String?
  instructor   Instructor?  @relation(fields: [instructorId], references: [id])
  timing       String
  days         String[]
  capacity     Int
  deletedAt    DateTime?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  enrollments  Enrollment[]
  attendance   Attendance[]
}

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
  feePlans         FeePlan[]
  payments         Payment[]
  attendance       Attendance[]
  notes            InstructorNote[]
  journeyProgress  JourneyProgress?
  notifications    Notification[]
}

model Address {
  id          String  @id @default(cuid())
  studentId   String  @unique
  student     Student @relation(fields: [studentId], references: [id], onDelete: Cascade)
  houseStreet String
  area        String
  city        String
  state       String
  pinCode     String
}

model EmergencyContact {
  id           String  @id @default(cuid())
  studentId    String  @unique
  student      Student @relation(fields: [studentId], references: [id], onDelete: Cascade)
  name         String
  relationship String
  mobile       String
}

model ParentDetails {
  id           String  @id @default(cuid())
  studentId    String  @unique
  student      Student @relation(fields: [studentId], references: [id], onDelete: Cascade)
  fatherName   String?
  motherName   String?
  guardianName String?
  parentMobile String?
}

model Enrollment {
  id               String   @id @default(cuid())
  studentId        String
  student          Student  @relation(fields: [studentId], references: [id])
  batchId          String
  batch            Batch    @relation(fields: [batchId], references: [id])
  joiningBatchDate DateTime @default(now())

  @@unique([studentId, batchId])
}

model FeePlan {
  id          String       @id @default(cuid())
  studentId   String
  student     Student      @relation(fields: [studentId], references: [id])
  totalAmount Decimal      @db.Decimal(10, 2)
  frequency   FeeFrequency
  dueDate     DateTime
  discount    Decimal      @default(0) @db.Decimal(10, 2)
  finalAmount Decimal      @db.Decimal(10, 2)
  createdAt   DateTime     @default(now())
  payments    Payment[]
}

model Payment {
  id          String      @id @default(cuid())
  studentId   String
  student     Student     @relation(fields: [studentId], references: [id])
  feePlanId   String?
  feePlan     FeePlan?    @relation(fields: [feePlanId], references: [id])
  amount      Decimal     @db.Decimal(10, 2)
  paymentDate DateTime
  mode        PaymentMode
  period      String
  notes       String?
  createdAt   DateTime    @default(now())
  receipt     Receipt?
}

model Receipt {
  id            String   @id @default(cuid())
  receiptNumber String   @unique
  paymentId     String   @unique
  payment       Payment  @relation(fields: [paymentId], references: [id])
  createdAt     DateTime @default(now())
}

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

model InstructorNote {
  id           String     @id @default(cuid())
  studentId    String
  student      Student    @relation(fields: [studentId], references: [id])
  instructorId String
  instructor   Instructor @relation(fields: [instructorId], references: [id])
  note         String
  createdAt    DateTime   @default(now())
}

model JourneyProgress {
  id               String   @id @default(cuid())
  studentId        String   @unique
  student          Student  @relation(fields: [studentId], references: [id])
  danceLevel       String?
  fitnessScore     Int?
  consistencyScore Int?
  updatedAt        DateTime @updatedAt
}

model Notification {
  id        String   @id @default(cuid())
  studentId String?
  student   Student? @relation(fields: [studentId], references: [id])
  type      String
  message   String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
}

// Atomic counter used for Student IDs (ST-00001) and Receipt numbers (SNT-2026-00001)
model Sequence {
  name  String @id
  value Int    @default(0)
}
```

- [ ] **Step 6: Run the first migration**

```bash
npx prisma migrate dev --name init
```

Expected: migration applies successfully and Prisma Client is generated with no errors.

- [ ] **Step 7: Create the Prisma client singleton in `src/lib/db.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add full Prisma schema and connect to Neon Postgres

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: ID generation utility + Vitest setup ✅ DONE (commit e0742b7 — vitest pinned to 3.2.7, not latest 5.x, since 5.x requires @types/node ^22 but this project pins ^20; live-verified against real Neon DB: sequential ID/receipt generation confirmed working)

**Files:**
- Create: `src/lib/ids.ts`
- Create: `vitest.config.ts`
- Create: `tests/unit/ids.test.ts`
- Modify: `package.json` (test script)

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Add test scripts to `package.json`**

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 4: Write the failing test in `tests/unit/ids.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { formatSequence } from "@/lib/ids";

describe("formatSequence", () => {
  it("pads a small number to the given width", () => {
    expect(formatSequence("ST", 1, 5)).toBe("ST-00001");
  });

  it("pads a larger number correctly", () => {
    expect(formatSequence("ST", 125, 5)).toBe("ST-00125");
  });

  it("does not truncate a number wider than the padding width", () => {
    expect(formatSequence("ST", 123456, 5)).toBe("ST-123456");
  });

  it("supports a year-scoped prefix for receipts", () => {
    expect(formatSequence("SNT-2026", 451, 5)).toBe("SNT-2026-00451");
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

```bash
npx vitest run tests/unit/ids.test.ts
```

Expected: FAIL with "formatSequence is not exported" or module not found.

- [ ] **Step 6: Implement `src/lib/ids.ts`**

```ts
import { prisma } from "@/lib/db";

export function formatSequence(prefix: string, n: number, width: number): string {
  const padded = String(n).padStart(width, "0");
  return `${prefix}-${padded}`;
}

async function nextSequenceValue(name: string): Promise<number> {
  const result = await prisma.$queryRaw<{ value: number }[]>`
    INSERT INTO "Sequence" (name, value) VALUES (${name}, 1)
    ON CONFLICT (name) DO UPDATE SET value = "Sequence".value + 1
    RETURNING value
  `;
  return result[0].value;
}

export async function generateStudentCode(): Promise<string> {
  const n = await nextSequenceValue("student");
  return formatSequence("ST", n, 5);
}

export async function generateReceiptNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const n = await nextSequenceValue(`receipt-${year}`);
  return formatSequence(`SNT-${year}`, n, 5);
}
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
npx vitest run tests/unit/ids.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add atomic ID/receipt-number generation with unit tests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Better Auth setup ✅ DONE (commit f621a58, then security fix in ee1148f6 — the original config below left `/api/auth/sign-up/email` as a live public endpoint defaulting every account to role ADMIN; fixed by adding `emailAndPassword.disableSignUp: true` and `role.input: false`. See Task 7's updated seed approach below, which was changed by this fix.)

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/auth-client.ts`
- Create: `src/app/api/auth/[...all]/route.ts`

- [ ] **Step 1: Install Better Auth**

```bash
npm install better-auth
```

- [ ] **Step 2: Generate `BETTER_AUTH_SECRET` and add it to `.env`**

```bash
openssl rand -base64 32
```

Copy the output into `.env` as `BETTER_AUTH_SECRET="<value>"`. Also set `BETTER_AUTH_URL="http://localhost:3000"`.

- [ ] **Step 3: Write `src/lib/auth.ts`**

```ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "ADMIN" },
    },
  },
  plugins: [nextCookies()],
});
```

- [ ] **Step 4: Write the API route handler `src/app/api/auth/[...all]/route.ts`**

```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 5: Write the client instance `src/lib/auth-client.ts`**

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Configure Better Auth with email/password provider

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Seed script

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (prisma seed config)

- [ ] **Step 1: Install `tsx` to run the TypeScript seed script**

```bash
npm install -D tsx
```

- [ ] **Step 2: Add the seed config to `package.json`**

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

- [ ] **Step 3: Write `prisma/seed.ts`**

**Note:** Task 6 disabled Better Auth's `emailAndPassword.disableSignUp` to close a public self-signup vulnerability (verified: it blocks `auth.api.signUpEmail()` too, not just the HTTP route — same handler, same check). So the admin user must be created via direct Prisma writes using Better Auth's own password hasher, not via `auth.api.signUpEmail()`:

```ts
import { hashPassword } from "better-auth/crypto";
import { prisma } from "../src/lib/db";

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL ?? "arpitagrggc@gmail.com").toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!password) {
    throw new Error("Set ADMIN_SEED_PASSWORD in .env before seeding.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already exists: ${email}`);
    return;
  }

  const hash = await hashPassword(password);

  const user = await prisma.user.create({
    data: { email, name: "Admin", emailVerified: true, role: "ADMIN" },
  });

  await prisma.account.create({
    data: {
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: hash,
    },
  });

  console.log(`Seeded admin user: ${email}`);
}

async function seedAcademyData() {
  const existingCourses = await prisma.course.count();
  if (existingCourses > 0) {
    console.log("Sample academy data already exists, skipping.");
    return;
  }

  const dance = await prisma.course.create({
    data: { name: "Bollywood Dance", category: "Dance", description: "High-energy Bollywood choreography." },
  });
  const zumba = await prisma.course.create({
    data: { name: "Zumba", category: "Zumba", description: "Cardio dance fitness sessions." },
  });
  const fitness = await prisma.course.create({
    data: { name: "Group Fitness", category: "Fitness", description: "Group strength and conditioning." },
  });

  const priya = await prisma.instructor.create({
    data: { name: "Priya Nair", mobile: "9876500001", bio: "8 years teaching Bollywood and contemporary dance." },
  });
  const rahul = await prisma.instructor.create({
    data: { name: "Rahul Mehta", mobile: "9876500002", bio: "Certified Zumba and fitness instructor." },
  });

  await prisma.batch.create({
    data: {
      name: "Bollywood — Evening",
      courseId: dance.id,
      instructorId: priya.id,
      timing: "6:00 PM - 7:00 PM",
      days: ["Mon", "Wed", "Fri"],
      capacity: 25,
    },
  });
  await prisma.batch.create({
    data: {
      name: "Morning Zumba",
      courseId: zumba.id,
      instructorId: rahul.id,
      timing: "7:00 AM - 8:00 AM",
      days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      capacity: 30,
    },
  });
  await prisma.batch.create({
    data: {
      name: "Group Fitness — Evening",
      courseId: fitness.id,
      instructorId: rahul.id,
      timing: "7:30 PM - 8:30 PM",
      days: ["Tue", "Thu", "Sat"],
      capacity: 20,
    },
  });

  console.log("Seeded sample courses, instructors, and batches.");
}

async function main() {
  await seedAdmin();
  await seedAcademyData();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 4: Set `ADMIN_SEED_PASSWORD` in `.env`**

Pick a strong password and set `ADMIN_SEED_PASSWORD="<your password>"` in `.env`. Do not commit this file.

- [ ] **Step 5: Run the seed script**

```bash
npx prisma db seed
```

Expected: "Seeded admin user: arpitagrggc@gmail.com" and "Seeded sample courses, instructors, and batches." printed with no errors.

- [ ] **Step 6: Verify with Prisma Studio**

```bash
npx prisma studio
```

Confirm one `User` row, 3 `Course` rows, 2 `Instructor` rows, 3 `Batch` rows exist. Close Prisma Studio.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add seed script for admin user and sample academy data

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Middleware, login page, logout

**Files:**
- Create: `src/middleware.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/components/auth/login-form.tsx`
- Create: `src/components/auth/logout-button.tsx`

- [ ] **Step 1: Write `src/middleware.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: Write the login form `src/components/auth/login-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Invalid email or password");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card w-full max-w-sm space-y-4 p-8">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">SAINTS</h1>
        <p className="text-sm text-muted">Know Yourself — The Divine Within</p>
      </div>
      <div className="gold-divider" />
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Write `src/app/login/page.tsx`**

```tsx
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 4: Write `src/components/auth/logout-button.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="ghost" onClick={handleLogout}>
      Log out
    </Button>
  );
}
```

- [ ] **Step 5: Verify manually**

```bash
npm run dev
```

Visit `http://localhost:3000/dashboard` — expect a redirect to `/login` (the page doesn't exist yet, a 404 after redirect is fine at this step; the redirect itself is what we're verifying). Log in with the seeded admin email/password and confirm no error toast appears. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add login page, logout, and route-protection middleware

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: App shell — sidebar, header, protected layout

**Files:**
- Create: `src/components/layout/sidebar.tsx`
- Create: `src/components/layout/header.tsx`
- Create: `src/components/layout/app-shell.tsx`
- Create: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Write `src/components/layout/sidebar.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Wallet,
  ClipboardCheck,
  Layers,
  BellRing,
  BarChart3,
  Sparkles,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/students", label: "Students", icon: Users },
  { href: "/fees", label: "Fees", icon: Wallet },
  { href: "/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/classes/courses", label: "Classes & Batches", icon: Layers },
  { href: "/reminders", label: "Fee Reminders", icon: BellRing },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/journey", label: "SAINTS Journey", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-card-border bg-background transition-all",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex items-center justify-between p-4">
        {!collapsed && <span className="text-lg font-semibold text-gold">SAINTS</span>}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="rounded-md p-1 text-muted hover:text-gold"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
      <div className="gold-divider mx-4" />
      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href.split("/").slice(0, 2).join("/"));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-card text-gold"
                  : "text-muted hover:bg-card hover:text-foreground"
              )}
            >
              <Icon size={18} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Write `src/components/layout/header.tsx`**

```tsx
import { LogoutButton } from "@/components/auth/logout-button";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export function Header({ name }: { name: string }) {
  return (
    <header className="flex items-center justify-between border-b border-card-border px-6 py-4">
      <div>
        <p className="text-lg text-foreground">
          {greeting()}, <span className="text-gold">{name}</span>
        </p>
        <p className="text-sm text-muted">
          Know Yourself • Move Your Body • Transform Your Life
        </p>
      </div>
      <LogoutButton />
    </header>
  );
}
```

- [ ] **Step 3: Write `src/components/layout/app-shell.tsx`**

```tsx
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export function AppShell({
  userName,
  children,
}: {
  userName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header name={userName} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the protected route group layout `src/app/(app)/layout.tsx`**

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  return <AppShell userName={session.user.name}>{children}</AppShell>;
}
```

- [ ] **Step 5: Verify `cn` utility exists**

Confirm `src/lib/utils.ts` (created by shadcn init) exports a `cn` function combining `clsx` and `tailwind-merge`. If missing, install and add it:

```bash
npm install clsx tailwind-merge
```

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: Install icon library**

```bash
npm install lucide-react
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add app shell: collapsible sidebar, header, protected layout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Shared components — empty state, confirm dialog

**Files:**
- Create: `src/components/shared/empty-state.tsx`
- Create: `src/components/shared/confirm-dialog.tsx`

- [ ] **Step 1: Write `src/components/shared/empty-state.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="glass-card flex flex-col items-center justify-center gap-3 p-12 text-center">
      <Icon className="text-gold" size={32} />
      <p className="text-muted">{title}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/shared/confirm-dialog.tsx`**

```tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "Delete",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add shared empty-state and confirm-dialog components

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Classes & Batches — tab layout + Courses CRUD

**Files:**
- Create: `src/lib/validations/course.ts`
- Create: `src/actions/courses.ts`
- Create: `src/app/(app)/classes/layout.tsx`
- Create: `src/app/(app)/classes/courses/page.tsx`
- Create: `src/components/classes/course-form-dialog.tsx`

- [ ] **Step 1: Write `src/lib/validations/course.ts`**

```ts
import { z } from "zod";

export const courseSchema = z.object({
  name: z.string().min(2, "Course name is required"),
  category: z.enum(["Dance", "Zumba", "Fitness", "Other"]),
  description: z.string().optional(),
});

export type CourseInput = z.infer<typeof courseSchema>;
```

- [ ] **Step 2: Write `src/actions/courses.ts`**

```ts
"use server";

import { prisma } from "@/lib/db";
import { courseSchema, type CourseInput } from "@/lib/validations/course";
import { revalidatePath } from "next/cache";

export async function listCourses() {
  return prisma.course.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { batches: { where: { deletedAt: null } } },
  });
}

export async function createCourse(input: CourseInput) {
  const data = courseSchema.parse(input);
  await prisma.course.create({ data });
  revalidatePath("/classes/courses");
}

export async function updateCourse(id: string, input: CourseInput) {
  const data = courseSchema.parse(input);
  await prisma.course.update({ where: { id }, data });
  revalidatePath("/classes/courses");
}

export async function deleteCourse(id: string) {
  await prisma.course.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/classes/courses");
}
```

- [ ] **Step 3: Write the tab layout `src/app/(app)/classes/layout.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/classes/courses", label: "Courses" },
  { href: "/classes/batches", label: "Batches" },
  { href: "/classes/instructors", label: "Instructors" },
];

export default function ClassesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Classes & Batches</h1>
      <div className="flex gap-2 border-b border-card-border">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 px-4 py-2 text-sm",
              pathname === tab.href
                ? "border-gold text-gold"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Write `src/components/classes/course-form-dialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { courseSchema, type CourseInput } from "@/lib/validations/course";
import { createCourse, updateCourse } from "@/actions/courses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export function CourseFormDialog({
  open,
  onOpenChange,
  course,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course?: { id: string; name: string; category: string; description: string | null };
}) {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CourseInput>({
    resolver: zodResolver(courseSchema),
    defaultValues: course
      ? { name: course.name, category: course.category as CourseInput["category"], description: course.description ?? "" }
      : { name: "", category: "Dance", description: "" },
  });

  async function onSubmit(data: CourseInput) {
    setSubmitting(true);
    try {
      if (course) {
        await updateCourse(course.id, data);
        toast.success("Course updated");
      } else {
        await createCourse(data);
        toast.success("Course created");
      }
      reset();
      onOpenChange(false);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{course ? "Edit Course" : "New Course"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Course Name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={watch("category")} onValueChange={(v) => setValue("category", v as CourseInput["category"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Dance">Dance</SelectItem>
                <SelectItem value="Zumba">Zumba</SelectItem>
                <SelectItem value="Fitness">Fitness</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...register("description")} />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving..." : "Save Course"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Write `src/app/(app)/classes/courses/page.tsx`**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Layers, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CourseFormDialog } from "@/components/classes/course-form-dialog";
import { listCourses, deleteCourse } from "@/actions/courses";

type CourseWithBatches = Awaited<ReturnType<typeof listCourses>>[number];

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseWithBatches[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CourseWithBatches | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<CourseWithBatches | undefined>();

  const refresh = useCallback(async () => {
    setCourses(await listCourses());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, formOpen]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus size={16} className="mr-2" />
          Add Course
        </Button>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No courses added yet."
          actionLabel="+ Add Your First Course"
          onAction={() => setFormOpen(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Card key={course.id} className="glass-card space-y-2 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-foreground">{course.name}</p>
                  <Badge variant="outline" className="mt-1 border-gold text-gold">
                    {course.category}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditing(course);
                      setFormOpen(true);
                    }}
                    className="rounded p-1 text-muted hover:text-gold"
                    aria-label="Edit course"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(course)}
                    className="rounded p-1 text-muted hover:text-danger"
                    aria-label="Delete course"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {course.description && <p className="text-sm text-muted">{course.description}</p>}
              <p className="text-xs text-muted">{course.batches.length} batch(es)</p>
            </Card>
          ))}
        </div>
      )}

      <CourseFormDialog open={formOpen} onOpenChange={setFormOpen} course={editing} />
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(undefined)}
          title={`Delete "${deleteTarget.name}"?`}
          description="This course will be removed from the list. Batches under it will need a new course."
          onConfirm={async () => {
            await deleteCourse(deleteTarget.id);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify manually**

```bash
npm run dev
```

Log in, navigate to Classes & Batches → Courses, confirm the 3 seeded courses render as cards. Add a new course, edit it, delete it, and confirm the list updates each time. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add Classes & Batches tab layout and Courses CRUD

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: Instructors CRUD

**Files:**
- Create: `src/lib/validations/instructor.ts`
- Create: `src/actions/instructors.ts`
- Create: `src/app/(app)/classes/instructors/page.tsx`
- Create: `src/components/classes/instructor-form-dialog.tsx`

- [ ] **Step 1: Write `src/lib/validations/instructor.ts`**

```ts
import { z } from "zod";

export const instructorSchema = z.object({
  name: z.string().min(2, "Name is required"),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  bio: z.string().optional(),
});

export type InstructorInput = z.infer<typeof instructorSchema>;
```

- [ ] **Step 2: Write `src/actions/instructors.ts`**

```ts
"use server";

import { prisma } from "@/lib/db";
import { instructorSchema, type InstructorInput } from "@/lib/validations/instructor";
import { revalidatePath } from "next/cache";

export async function listInstructors() {
  return prisma.instructor.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { batches: { where: { deletedAt: null } } },
  });
}

export async function createInstructor(input: InstructorInput) {
  const data = instructorSchema.parse(input);
  await prisma.instructor.create({ data });
  revalidatePath("/classes/instructors");
}

export async function updateInstructor(id: string, input: InstructorInput) {
  const data = instructorSchema.parse(input);
  await prisma.instructor.update({ where: { id }, data });
  revalidatePath("/classes/instructors");
}

export async function deleteInstructor(id: string) {
  await prisma.instructor.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/classes/instructors");
}
```

- [ ] **Step 3: Write `src/components/classes/instructor-form-dialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { instructorSchema, type InstructorInput } from "@/lib/validations/instructor";
import { createInstructor, updateInstructor } from "@/actions/instructors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export function InstructorFormDialog({
  open,
  onOpenChange,
  instructor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructor?: { id: string; name: string; mobile: string; bio: string | null };
}) {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InstructorInput>({
    resolver: zodResolver(instructorSchema),
    defaultValues: instructor
      ? { name: instructor.name, mobile: instructor.mobile, bio: instructor.bio ?? "" }
      : { name: "", mobile: "", bio: "" },
  });

  async function onSubmit(data: InstructorInput) {
    setSubmitting(true);
    try {
      if (instructor) {
        await updateInstructor(instructor.id, data);
        toast.success("Instructor updated");
      } else {
        await createInstructor(data);
        toast.success("Instructor added");
      }
      reset();
      onOpenChange(false);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{instructor ? "Edit Instructor" : "New Instructor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="mobile">Mobile Number</Label>
            <Input id="mobile" {...register("mobile")} />
            {errors.mobile && <p className="text-sm text-danger">{errors.mobile.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" {...register("bio")} />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving..." : "Save Instructor"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Write `src/app/(app)/classes/instructors/page.tsx`**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, UserRound, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InstructorFormDialog } from "@/components/classes/instructor-form-dialog";
import { listInstructors, deleteInstructor } from "@/actions/instructors";

type InstructorWithBatches = Awaited<ReturnType<typeof listInstructors>>[number];

export default function InstructorsPage() {
  const [instructors, setInstructors] = useState<InstructorWithBatches[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InstructorWithBatches | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<InstructorWithBatches | undefined>();

  const refresh = useCallback(async () => {
    setInstructors(await listInstructors());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, formOpen]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus size={16} className="mr-2" />
          Add Instructor
        </Button>
      </div>

      {instructors.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="No instructors added yet."
          actionLabel="+ Add Your First Instructor"
          onAction={() => setFormOpen(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {instructors.map((instructor) => (
            <Card key={instructor.id} className="glass-card flex items-start gap-3 p-5">
              <Avatar>
                <AvatarFallback>{instructor.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <div className="flex items-start justify-between">
                  <p className="font-medium text-foreground">{instructor.name}</p>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditing(instructor);
                        setFormOpen(true);
                      }}
                      className="rounded p-1 text-muted hover:text-gold"
                      aria-label="Edit instructor"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(instructor)}
                      className="rounded p-1 text-muted hover:text-danger"
                      aria-label="Delete instructor"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-muted">{instructor.mobile}</p>
                <p className="text-xs text-muted">{instructor.batches.length} batch(es)</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <InstructorFormDialog open={formOpen} onOpenChange={setFormOpen} instructor={editing} />
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(undefined)}
          title={`Delete "${deleteTarget.name}"?`}
          description="This instructor will be removed from the list."
          onConfirm={async () => {
            await deleteInstructor(deleteTarget.id);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify manually and commit**

```bash
npm run dev
```

Navigate to Classes & Batches → Instructors, confirm the 2 seeded instructors render, and add/edit/delete works. Stop the server.

```bash
git add -A
git commit -m "Add Instructors CRUD

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: Batches CRUD

**Files:**
- Create: `src/lib/validations/batch.ts`
- Create: `src/actions/batches.ts`
- Create: `src/app/(app)/classes/batches/page.tsx`
- Create: `src/components/classes/batch-form-dialog.tsx`

- [ ] **Step 1: Write `src/lib/validations/batch.ts`**

```ts
import { z } from "zod";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const batchSchema = z.object({
  name: z.string().min(2, "Batch name is required"),
  courseId: z.string().min(1, "Course is required"),
  instructorId: z.string().min(1, "Instructor is required"),
  timing: z.string().min(1, "Timing is required"),
  days: z.array(z.enum(DAYS)).min(1, "Select at least one day"),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1"),
});

export type BatchInput = z.infer<typeof batchSchema>;
```

- [ ] **Step 2: Write `src/actions/batches.ts`**

```ts
"use server";

import { prisma } from "@/lib/db";
import { batchSchema, type BatchInput } from "@/lib/validations/batch";
import { revalidatePath } from "next/cache";

export async function listBatches() {
  return prisma.batch.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      course: true,
      instructor: true,
      enrollments: { where: { student: { deletedAt: null } } },
    },
  });
}

export async function listBatchOptions() {
  return prisma.batch.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function createBatch(input: BatchInput) {
  const data = batchSchema.parse(input);
  await prisma.batch.create({ data });
  revalidatePath("/classes/batches");
}

export async function updateBatch(id: string, input: BatchInput) {
  const data = batchSchema.parse(input);
  await prisma.batch.update({ where: { id }, data });
  revalidatePath("/classes/batches");
}

export async function deleteBatch(id: string) {
  await prisma.batch.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/classes/batches");
}
```

- [ ] **Step 3: Write `src/components/classes/batch-form-dialog.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { batchSchema, type BatchInput, DAYS } from "@/lib/validations/batch";
import { createBatch, updateBatch } from "@/actions/batches";
import { listCourses } from "@/actions/courses";
import { listInstructors } from "@/actions/instructors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type BatchWithRelations = {
  id: string;
  name: string;
  courseId: string;
  instructorId: string | null;
  timing: string;
  days: string[];
  capacity: number;
};

export function BatchFormDialog({
  open,
  onOpenChange,
  batch,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batch?: BatchWithRelations;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [instructors, setInstructors] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    listCourses().then(setCourses);
    listInstructors().then(setInstructors);
  }, [open]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<BatchInput>({
    resolver: zodResolver(batchSchema),
    defaultValues: batch
      ? {
          name: batch.name,
          courseId: batch.courseId,
          instructorId: batch.instructorId ?? "",
          timing: batch.timing,
          days: batch.days as BatchInput["days"],
          capacity: batch.capacity,
        }
      : { name: "", courseId: "", instructorId: "", timing: "", days: [], capacity: 20 },
  });

  const selectedDays = watch("days") ?? [];

  async function onSubmit(data: BatchInput) {
    setSubmitting(true);
    try {
      if (batch) {
        await updateBatch(batch.id, data);
        toast.success("Batch updated");
      } else {
        await createBatch(data);
        toast.success("Batch created");
      }
      reset();
      onOpenChange(false);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleDay(day: (typeof DAYS)[number]) {
    const next = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day];
    setValue("days", next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{batch ? "Edit Batch" : "New Batch"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Batch Name</Label>
            <Input id="name" {...register("name")} placeholder="e.g. Morning Zumba" />
            {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Course</Label>
            <Select value={watch("courseId")} onValueChange={(v) => setValue("courseId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.courseId && <p className="text-sm text-danger">{errors.courseId.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Instructor</Label>
            <Select value={watch("instructorId")} onValueChange={(v) => setValue("instructorId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select an instructor" />
              </SelectTrigger>
              <SelectContent>
                {instructors.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.instructorId && <p className="text-sm text-danger">{errors.instructorId.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="timing">Timing</Label>
            <Input id="timing" {...register("timing")} placeholder="e.g. 7:00 AM - 8:00 AM" />
            {errors.timing && <p className="text-sm text-danger">{errors.timing.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Days</Label>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((day) => (
                <label key={day} className="flex items-center gap-1 text-sm text-muted">
                  <Checkbox
                    checked={selectedDays.includes(day)}
                    onCheckedChange={() => toggleDay(day)}
                  />
                  {day}
                </label>
              ))}
            </div>
            {errors.days && <p className="text-sm text-danger">{errors.days.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="capacity">Capacity</Label>
            <Input id="capacity" type="number" {...register("capacity")} />
            {errors.capacity && <p className="text-sm text-danger">{errors.capacity.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Saving..." : "Save Batch"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Write `src/app/(app)/classes/batches/page.tsx`**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, CalendarDays, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { BatchFormDialog } from "@/components/classes/batch-form-dialog";
import { listBatches, deleteBatch } from "@/actions/batches";

type BatchWithRelations = Awaited<ReturnType<typeof listBatches>>[number];

export default function BatchesPage() {
  const [batches, setBatches] = useState<BatchWithRelations[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BatchWithRelations | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<BatchWithRelations | undefined>();

  const refresh = useCallback(async () => {
    setBatches(await listBatches());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, formOpen]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus size={16} className="mr-2" />
          Add Batch
        </Button>
      </div>

      {batches.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No batches created yet."
          actionLabel="+ Add Your First Batch"
          onAction={() => setFormOpen(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {batches.map((batch) => (
            <Card key={batch.id} className="glass-card space-y-2 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-foreground">{batch.name}</p>
                  <p className="text-sm text-muted">{batch.course.name}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditing(batch);
                      setFormOpen(true);
                    }}
                    className="rounded p-1 text-muted hover:text-gold"
                    aria-label="Edit batch"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(batch)}
                    className="rounded p-1 text-muted hover:text-danger"
                    aria-label="Delete batch"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-muted">{batch.timing}</p>
              <div className="flex flex-wrap gap-1">
                {batch.days.map((day) => (
                  <Badge key={day} variant="outline" className="border-gold text-gold">
                    {day}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted">
                {batch.instructor?.name ?? "No instructor assigned"} ·{" "}
                {batch.enrollments.length}/{batch.capacity} students
              </p>
            </Card>
          ))}
        </div>
      )}

      <BatchFormDialog open={formOpen} onOpenChange={setFormOpen} batch={editing} />
      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(undefined)}
          title={`Delete "${deleteTarget.name}"?`}
          description="This batch will be removed from the list."
          onConfirm={async () => {
            await deleteBatch(deleteTarget.id);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify manually and commit**

```bash
npm run dev
```

Navigate to Classes & Batches → Batches, confirm the 3 seeded batches render with correct course/instructor/days, and add/edit/delete works. Stop the server.

```bash
git add -A
git commit -m "Add Batches CRUD

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 14: Student validation schema + unit tests

**Files:**
- Create: `src/lib/validations/student.ts`
- Create: `tests/unit/student-validation.test.ts`

- [ ] **Step 1: Write the failing test in `tests/unit/student-validation.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { studentSchema } from "@/lib/validations/student";

const validInput = {
  name: "Rahul Sharma",
  mobile: "9876543210",
  dob: "2005-06-15",
  gender: "MALE" as const,
  joiningDate: "2026-01-10",
  status: "ACTIVE" as const,
  batchId: "some-batch-id",
  houseStreet: "12 MG Road",
  area: "Andheri",
  city: "Mumbai",
  state: "Maharashtra",
  pinCode: "400058",
  emergencyContactName: "Sunita Sharma",
  emergencyContactRelationship: "Mother",
  emergencyContactMobile: "9876500000",
  fatherName: "Ramesh Sharma",
  motherName: "Sunita Sharma",
  guardianName: "",
  parentMobile: "9876500000",
};

describe("studentSchema", () => {
  it("accepts a fully valid student", () => {
    const result = studentSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid mobile number", () => {
    const result = studentSchema.safeParse({ ...validInput, mobile: "12345" });
    expect(result.success).toBe(false);
  });

  it("rejects a PIN code that isn't 6 digits", () => {
    const result = studentSchema.safeParse({ ...validInput, pinCode: "4005" });
    expect(result.success).toBe(false);
  });

  it("rejects a date of birth in the future", () => {
    const result = studentSchema.safeParse({ ...validInput, dob: "2099-01-01" });
    expect(result.success).toBe(false);
  });

  it("requires a batch to be selected", () => {
    const result = studentSchema.safeParse({ ...validInput, batchId: "" });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/unit/student-validation.test.ts
```

Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/validations/student.ts`**

```ts
import { z } from "zod";

const mobileRegex = /^[6-9]\d{9}$/;

export const studentSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  mobile: z.string().regex(mobileRegex, "Enter a valid 10-digit Indian mobile number"),
  dob: z.coerce.date().refine((d) => d < new Date(), "Date of birth must be in the past"),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  joiningDate: z.coerce.date(),
  status: z.enum(["ACTIVE", "INACTIVE", "LEFT"]).default("ACTIVE"),
  batchId: z.string().min(1, "Batch is required"),

  houseStreet: z.string().min(1, "Required"),
  area: z.string().min(1, "Required"),
  city: z.string().min(1, "Required"),
  state: z.string().min(1, "Required"),
  pinCode: z.string().regex(/^\d{6}$/, "PIN code must be 6 digits"),

  emergencyContactName: z.string().min(1, "Required"),
  emergencyContactRelationship: z.string().min(1, "Required"),
  emergencyContactMobile: z.string().regex(mobileRegex, "Enter a valid 10-digit mobile number"),

  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  guardianName: z.string().optional(),
  parentMobile: z.string().regex(mobileRegex).optional().or(z.literal("")),
});

export type StudentInput = z.infer<typeof studentSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/unit/student-validation.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add student validation schema with unit tests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 15: Student server actions

**Files:**
- Create: `src/actions/students.ts`

- [ ] **Step 1: Write `src/actions/students.ts`**

```ts
"use server";

import { prisma } from "@/lib/db";
import { generateStudentCode } from "@/lib/ids";
import { studentSchema, type StudentInput } from "@/lib/validations/student";
import { revalidatePath } from "next/cache";
import type { StudentStatus } from "@prisma/client";

export type StudentFilters = {
  search?: string;
  status?: StudentStatus;
  batchId?: string;
};

export async function listStudents(filters: StudentFilters = {}) {
  return prisma.student.findMany({
    where: {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { studentCode: { contains: filters.search, mode: "insensitive" } },
              { mobile: { contains: filters.search } },
            ],
          }
        : {}),
      ...(filters.batchId
        ? { enrollments: { some: { batchId: filters.batchId } } }
        : {}),
    },
    include: {
      enrollments: { include: { batch: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getStudent(id: string) {
  return prisma.student.findUnique({
    where: { id, deletedAt: null },
    include: {
      address: true,
      emergencyContact: true,
      parentDetails: true,
      enrollments: { include: { batch: { include: { course: true, instructor: true } } } },
    },
  });
}

export async function createStudent(input: StudentInput, photoUrl?: string) {
  const data = studentSchema.parse(input);
  const studentCode = await generateStudentCode();

  await prisma.student.create({
    data: {
      studentCode,
      name: data.name,
      photoUrl,
      mobile: data.mobile,
      dob: data.dob,
      gender: data.gender,
      joiningDate: data.joiningDate,
      status: data.status,
      address: {
        create: {
          houseStreet: data.houseStreet,
          area: data.area,
          city: data.city,
          state: data.state,
          pinCode: data.pinCode,
        },
      },
      emergencyContact: {
        create: {
          name: data.emergencyContactName,
          relationship: data.emergencyContactRelationship,
          mobile: data.emergencyContactMobile,
        },
      },
      parentDetails: {
        create: {
          fatherName: data.fatherName || null,
          motherName: data.motherName || null,
          guardianName: data.guardianName || null,
          parentMobile: data.parentMobile || null,
        },
      },
      enrollments: {
        create: { batchId: data.batchId },
      },
    },
  });

  revalidatePath("/students");
  return studentCode;
}

export async function updateStudent(id: string, input: StudentInput, photoUrl?: string) {
  const data = studentSchema.parse(input);

  await prisma.student.update({
    where: { id },
    data: {
      name: data.name,
      ...(photoUrl ? { photoUrl } : {}),
      mobile: data.mobile,
      dob: data.dob,
      gender: data.gender,
      joiningDate: data.joiningDate,
      status: data.status,
      address: {
        upsert: {
          create: {
            houseStreet: data.houseStreet,
            area: data.area,
            city: data.city,
            state: data.state,
            pinCode: data.pinCode,
          },
          update: {
            houseStreet: data.houseStreet,
            area: data.area,
            city: data.city,
            state: data.state,
            pinCode: data.pinCode,
          },
        },
      },
      emergencyContact: {
        upsert: {
          create: {
            name: data.emergencyContactName,
            relationship: data.emergencyContactRelationship,
            mobile: data.emergencyContactMobile,
          },
          update: {
            name: data.emergencyContactName,
            relationship: data.emergencyContactRelationship,
            mobile: data.emergencyContactMobile,
          },
        },
      },
      parentDetails: {
        upsert: {
          create: {
            fatherName: data.fatherName || null,
            motherName: data.motherName || null,
            guardianName: data.guardianName || null,
            parentMobile: data.parentMobile || null,
          },
          update: {
            fatherName: data.fatherName || null,
            motherName: data.motherName || null,
            guardianName: data.guardianName || null,
            parentMobile: data.parentMobile || null,
          },
        },
      },
    },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
}

export async function deleteStudent(id: string) {
  await prisma.student.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/students");
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "Add student server actions: CRUD, search, filters, soft delete

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 16: Student photo upload (Vercel Blob)

**Files:**
- Create: `src/app/api/students/photo-upload/route.ts`
- Create: `src/components/students/photo-upload.tsx`

- [ ] **Step 1: Install the Vercel Blob SDK**

```bash
npm install @vercel/blob
```

- [ ] **Step 2: Create a Vercel Blob store**

In the Vercel dashboard, go to Storage → Create → Blob, name it `saints-photos`. Copy the `BLOB_READ_WRITE_TOKEN` into `.env`.

- [ ] **Step 3: Write the upload route handler `src/app/api/students/photo-upload/route.ts`**

```ts
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function POST(request: Request): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
        maximumSizeInBytes: 5 * 1024 * 1024,
      }),
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 4: Write `src/components/students/photo-upload.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function PhotoUpload({
  initialUrl,
  onUploaded,
}: {
  initialUrl?: string | null;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialUrl ?? null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/students/photo-upload",
      });
      setPreview(blob.url);
      onUploaded(blob.url);
    } catch {
      toast.error("Photo upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-16 w-16">
        {preview && <AvatarImage src={preview} alt="Student photo" />}
        <AvatarFallback>?</AvatarFallback>
      </Avatar>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
        {uploading ? "Uploading..." : "Upload Photo"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add student photo upload via Vercel Blob

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 17: Student list page

**Files:**
- Create: `src/app/(app)/students/page.tsx`

- [ ] **Step 1: Write `src/app/(app)/students/page.tsx`**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Users, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { listStudents } from "@/actions/students";
import { listBatchOptions } from "@/actions/batches";
import type { StudentStatus } from "@prisma/client";

type StudentRow = Awaited<ReturnType<typeof listStudents>>[number];

const STATUS_COLORS: Record<StudentStatus, string> = {
  ACTIVE: "border-success text-success",
  INACTIVE: "border-warning text-warning",
  LEFT: "border-danger text-danger",
};

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StudentStatus | "ALL">("ALL");
  const [batchId, setBatchId] = useState<string>("ALL");

  const refresh = useCallback(async () => {
    setStudents(
      await listStudents({
        search: search || undefined,
        status: status === "ALL" ? undefined : status,
        batchId: batchId === "ALL" ? undefined : batchId,
      })
    );
  }, [search, status, batchId]);

  useEffect(() => {
    listBatchOptions().then(setBatches);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(refresh, 250);
    return () => clearTimeout(timeout);
  }, [refresh]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Students</h1>
        <Button asChild>
          <Link href="/students/new">
            <Plus size={16} className="mr-2" />
            Add Student
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 text-muted" size={16} />
          <Input
            placeholder="Search by name, ID, or mobile"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StudentStatus | "ALL")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
            <SelectItem value="LEFT">Left</SelectItem>
          </SelectContent>
        </Select>
        <Select value={batchId} onValueChange={setBatchId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Batch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All batches</SelectItem>
            {batches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students added yet."
          actionLabel="+ Add Your First Student"
          onAction={() => (window.location.href = "/students/new")}
        />
      ) : (
        <div className="glass-card divide-y divide-card-border">
          {students.map((student) => (
            <Link
              key={student.id}
              href={`/students/${student.id}`}
              className="flex items-center gap-4 p-4 hover:bg-card"
            >
              <Avatar>
                {student.photoUrl && <AvatarImage src={student.photoUrl} alt={student.name} />}
                <AvatarFallback>{student.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium text-foreground">{student.name}</p>
                <p className="text-sm text-muted">
                  {student.studentCode} · {student.mobile} ·{" "}
                  {student.enrollments[0]?.batch.name ?? "No batch"}
                </p>
              </div>
              <Badge variant="outline" className={STATUS_COLORS[student.status]}>
                {student.status}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "Add student list page with search, status, and batch filters

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 18: Student new/edit form page

**Files:**
- Create: `src/components/students/student-form.tsx`
- Create: `src/app/(app)/students/new/page.tsx`
- Create: `src/app/(app)/students/[id]/edit/page.tsx`

- [ ] **Step 1: Write `src/components/students/student-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { studentSchema, type StudentInput } from "@/lib/validations/student";
import { createStudent, updateStudent } from "@/actions/students";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhotoUpload } from "@/components/students/photo-upload";
import { toast } from "sonner";
import { useEffect } from "react";
import { listBatchOptions } from "@/actions/batches";

type ExistingStudent = StudentInput & { id: string; photoUrl: string | null };

export function StudentForm({ existing }: { existing?: ExistingStudent }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(existing?.photoUrl ?? undefined);
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    listBatchOptions().then(setBatches);
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StudentInput>({
    resolver: zodResolver(studentSchema),
    defaultValues: existing ?? {
      name: "",
      mobile: "",
      dob: undefined,
      gender: "MALE",
      joiningDate: new Date(),
      status: "ACTIVE",
      batchId: "",
      houseStreet: "",
      area: "",
      city: "",
      state: "",
      pinCode: "",
      emergencyContactName: "",
      emergencyContactRelationship: "",
      emergencyContactMobile: "",
      fatherName: "",
      motherName: "",
      guardianName: "",
      parentMobile: "",
    },
  });

  async function onSubmit(data: StudentInput) {
    setSubmitting(true);
    try {
      if (existing) {
        await updateStudent(existing.id, data, photoUrl);
        toast.success("Student updated");
        router.push(`/students/${existing.id}`);
      } else {
        await createStudent(data, photoUrl);
        toast.success("Student added");
        router.push("/students");
      }
    } catch {
      toast.error("Something went wrong. Please check the form and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function field(name: keyof StudentInput, label: string, type = "text") {
    return (
      <div className="space-y-2">
        <Label htmlFor={name}>{label}</Label>
        <Input id={name} type={type} {...register(name)} />
        {errors[name] && <p className="text-sm text-danger">{errors[name]?.message as string}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-8">
      <PhotoUpload initialUrl={photoUrl} onUploaded={setPhotoUrl} />

      <section className="glass-card space-y-4 p-6">
        <h2 className="font-medium text-gold">Basic Information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name", "Student Name")}
          {field("mobile", "Mobile Number")}
          {field("dob", "Date of Birth", "date")}
          {field("joiningDate", "Joining Date", "date")}
          <div className="space-y-2">
            <Label>Gender</Label>
            <Select value={watch("gender")} onValueChange={(v) => setValue("gender", v as StudentInput["gender"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={watch("status")} onValueChange={(v) => setValue("status", v as StudentInput["status"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="LEFT">Left</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Batch</Label>
            <Select value={watch("batchId")} onValueChange={(v) => setValue("batchId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a batch" />
              </SelectTrigger>
              <SelectContent>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.batchId && <p className="text-sm text-danger">{errors.batchId.message}</p>}
          </div>
        </div>
      </section>

      <section className="glass-card space-y-4 p-6">
        <h2 className="font-medium text-gold">Address</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("houseStreet", "House / Street")}
          {field("area", "Area")}
          {field("city", "City")}
          {field("state", "State")}
          {field("pinCode", "PIN Code")}
        </div>
      </section>

      <section className="glass-card space-y-4 p-6">
        <h2 className="font-medium text-gold">Emergency Contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("emergencyContactName", "Contact Name")}
          {field("emergencyContactRelationship", "Relationship")}
          {field("emergencyContactMobile", "Mobile Number")}
        </div>
      </section>

      <section className="glass-card space-y-4 p-6">
        <h2 className="font-medium text-gold">Parent Details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("fatherName", "Father Name")}
          {field("motherName", "Mother Name")}
          {field("guardianName", "Guardian Name")}
          {field("parentMobile", "Parent Mobile Number")}
        </div>
      </section>

      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : existing ? "Save Changes" : "Add Student"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Write `src/app/(app)/students/new/page.tsx`**

```tsx
import { StudentForm } from "@/components/students/student-form";

export default function NewStudentPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Add Student</h1>
      <StudentForm />
    </div>
  );
}
```

- [ ] **Step 3: Write `src/app/(app)/students/[id]/edit/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getStudent } from "@/actions/students";
import { StudentForm } from "@/components/students/student-form";

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Edit Student</h1>
      <StudentForm
        existing={{
          id: student.id,
          photoUrl: student.photoUrl,
          name: student.name,
          mobile: student.mobile,
          dob: student.dob,
          gender: student.gender,
          joiningDate: student.joiningDate,
          status: student.status,
          batchId: student.enrollments[0]?.batchId ?? "",
          houseStreet: student.address?.houseStreet ?? "",
          area: student.address?.area ?? "",
          city: student.address?.city ?? "",
          state: student.address?.state ?? "",
          pinCode: student.address?.pinCode ?? "",
          emergencyContactName: student.emergencyContact?.name ?? "",
          emergencyContactRelationship: student.emergencyContact?.relationship ?? "",
          emergencyContactMobile: student.emergencyContact?.mobile ?? "",
          fatherName: student.parentDetails?.fatherName ?? "",
          motherName: student.parentDetails?.motherName ?? "",
          guardianName: student.parentDetails?.guardianName ?? "",
          parentMobile: student.parentDetails?.parentMobile ?? "",
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify manually**

```bash
npm run dev
```

Log in, go to Students → Add Student, fill in every field, upload a photo, submit. Confirm redirect to the student list and the new student appears with the correct auto-generated `ST-00001` code. Edit the student, change the name, confirm it saves. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add student create/edit form with photo upload

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 19: Student profile page (6 tabs)

**Files:**
- Create: `src/app/(app)/students/[id]/page.tsx`
- Create: `src/components/students/student-header.tsx`
- Create: `src/components/students/delete-student-button.tsx`

- [ ] **Step 1: Write `src/components/students/student-header.tsx`**

```tsx
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { DeleteStudentButton } from "@/components/students/delete-student-button";
import type { StudentStatus } from "@prisma/client";

const STATUS_COLORS: Record<StudentStatus, string> = {
  ACTIVE: "border-success text-success",
  INACTIVE: "border-warning text-warning",
  LEFT: "border-danger text-danger",
};

export function StudentHeader({
  id,
  name,
  studentCode,
  photoUrl,
  status,
}: {
  id: string;
  name: string;
  studentCode: string;
  photoUrl: string | null;
  status: StudentStatus;
}) {
  return (
    <div className="glass-card flex items-center justify-between p-6">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          {photoUrl && <AvatarImage src={photoUrl} alt={name} />}
          <AvatarFallback>{name.charAt(0)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm text-muted">{studentCode}</p>
          <h1 className="text-xl font-semibold text-foreground">{name}</h1>
          <Badge variant="outline" className={STATUS_COLORS[status]}>
            {status}
          </Badge>
        </div>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link href={`/students/${id}/edit`}>
            <Pencil size={16} className="mr-2" />
            Edit
          </Link>
        </Button>
        <DeleteStudentButton id={id} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/students/delete-student-button.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteStudent } from "@/actions/students";
import { toast } from "sonner";

export function DeleteStudentButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 size={16} className="mr-2" />
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this student?"
        description="This removes the student from active lists. Their history is preserved, not erased."
        onConfirm={async () => {
          await deleteStudent(id);
          toast.success("Student deleted");
          router.push("/students");
        }}
      />
    </>
  );
}
```

- [ ] **Step 3: Write `src/app/(app)/students/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getStudent } from "@/actions/students";
import { StudentHeader } from "@/components/students/student-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="glass-card p-8 text-center text-muted">
      {label} tracking arrives in a future phase of SAINTS.
    </div>
  );
}

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();

  const enrollment = student.enrollments[0];

  return (
    <div className="space-y-6">
      <StudentHeader
        id={student.id}
        name={student.name}
        studentCode={student.studentCode}
        photoUrl={student.photoUrl}
        status={student.status}
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="journey">SAINTS Journey</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="glass-card space-y-3 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted">Mobile</p>
              <p className="text-foreground">{student.mobile}</p>
            </div>
            <div>
              <p className="text-sm text-muted">Date of Birth</p>
              <p className="text-foreground">{format(student.dob, "dd MMM yyyy")}</p>
            </div>
            <div>
              <p className="text-sm text-muted">Joining Date</p>
              <p className="text-foreground">{format(student.joiningDate, "dd MMM yyyy")}</p>
            </div>
            <div>
              <p className="text-sm text-muted">Gender</p>
              <p className="text-foreground">{student.gender}</p>
            </div>
            {student.address && (
              <div className="sm:col-span-2">
                <p className="text-sm text-muted">Address</p>
                <p className="text-foreground">
                  {student.address.houseStreet}, {student.address.area}, {student.address.city},{" "}
                  {student.address.state} - {student.address.pinCode}
                </p>
              </div>
            )}
            {student.emergencyContact && (
              <div>
                <p className="text-sm text-muted">Emergency Contact</p>
                <p className="text-foreground">
                  {student.emergencyContact.name} ({student.emergencyContact.relationship}) —{" "}
                  {student.emergencyContact.mobile}
                </p>
              </div>
            )}
            {student.parentDetails && (
              <div>
                <p className="text-sm text-muted">Parent / Guardian</p>
                <p className="text-foreground">
                  {student.parentDetails.fatherName || student.parentDetails.guardianName || "—"}
                  {student.parentDetails.parentMobile ? ` — ${student.parentDetails.parentMobile}` : ""}
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="fees">
          <ComingSoon label="Fee" />
        </TabsContent>

        <TabsContent value="attendance">
          <ComingSoon label="Attendance" />
        </TabsContent>

        <TabsContent value="classes" className="glass-card space-y-2 p-6">
          {enrollment ? (
            <div>
              <p className="font-medium text-foreground">{enrollment.batch.name}</p>
              <p className="text-sm text-muted">{enrollment.batch.course.name}</p>
              <p className="text-sm text-muted">{enrollment.batch.timing}</p>
              <p className="text-sm text-muted">
                Instructor: {enrollment.batch.instructor?.name ?? "Unassigned"}
              </p>
              <p className="text-sm text-muted">
                Joined batch on {format(enrollment.joiningBatchDate, "dd MMM yyyy")}
              </p>
            </div>
          ) : (
            <p className="text-muted">Not enrolled in any batch.</p>
          )}
        </TabsContent>

        <TabsContent value="notes">
          <ComingSoon label="Instructor notes" />
        </TabsContent>

        <TabsContent value="journey">
          <ComingSoon label="SAINTS Journey" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 4: Install `date-fns`**

```bash
npm install date-fns
```

- [ ] **Step 5: Verify manually**

```bash
npm run dev
```

Open a student's profile, confirm the Overview tab shows all fields correctly, Classes tab shows the enrolled batch, and Fees/Attendance/Notes/Journey tabs show the "coming soon" message without erroring. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add student profile page with 6 tabs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 20: Dashboard

**Files:**
- Create: `src/actions/dashboard.ts`
- Create: `src/components/dashboard/stat-card.tsx`
- Create: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Write `src/actions/dashboard.ts`**

```ts
import { prisma } from "@/lib/db";
import { startOfDay, endOfDay } from "date-fns";

export async function getDashboardStats() {
  const [totalStudents, activeStudents, todaysBatchCount] = await Promise.all([
    prisma.student.count({ where: { deletedAt: null } }),
    prisma.student.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.batch.count({ where: { deletedAt: null } }),
  ]);

  // Fee/attendance data doesn't exist until Phase 2/3 — these are real
  // queries against real (currently empty) tables, not hardcoded numbers.
  const [monthCollection, pendingFees, todaysAttendanceCount] = await Promise.all([
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: {
        paymentDate: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) },
      },
    }),
    prisma.feePlan.aggregate({ _sum: { finalAmount: true } }),
    prisma.attendance.count({
      where: { date: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) } },
    }),
  ]);

  return {
    totalStudents,
    activeStudents,
    monthCollection: Number(monthCollection._sum.amount ?? 0),
    pendingFees: Number(pendingFees._sum.finalAmount ?? 0),
    todaysClasses: todaysBatchCount,
    todaysAttendanceCount,
  };
}
```

- [ ] **Step 2: Write `src/components/dashboard/stat-card.tsx`**

```tsx
import type { LucideIcon } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="glass-card space-y-2 p-5">
      <div className="flex items-center gap-2 text-muted">
        <Icon size={16} className="text-gold" />
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Write `src/app/(app)/dashboard/page.tsx`**

```tsx
import { Users, UserCheck, Wallet, AlertCircle, CalendarClock, ClipboardCheck } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { getDashboardStats } from "@/actions/dashboard";

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div className="space-y-8">
      <div className="glass-card p-6 text-center">
        <p className="text-lg text-gold">SAINTS</p>
        <p className="text-sm text-muted">Know Yourself — The Divine Within</p>
        <p className="mt-3 text-sm text-muted">स्वयं को जानना ही वास्तविक शिक्षा है।</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Users} label="Total Students" value={String(stats.totalStudents)} />
        <StatCard icon={UserCheck} label="Active Students" value={String(stats.activeStudents)} />
        <StatCard icon={CalendarClock} label="Today's Classes" value={String(stats.todaysClasses)} />
        <StatCard
          icon={Wallet}
          label="This Month Collection"
          value={`₹${stats.monthCollection.toLocaleString("en-IN")}`}
          note="Starts tracking in Phase 2"
        />
        <StatCard
          icon={AlertCircle}
          label="Pending Fees"
          value={`₹${stats.pendingFees.toLocaleString("en-IN")}`}
          note="Starts tracking in Phase 2"
        />
        <StatCard
          icon={ClipboardCheck}
          label="Today's Attendance"
          value={`${stats.todaysAttendanceCount}`}
          note="Starts tracking in Phase 3"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify manually**

```bash
npm run dev
```

Log in, confirm the Dashboard shows the Hindi quote, correct Total/Active Student counts, correct Today's Classes count (3, from seeded batches), and ₹0 / 0 for the fee/attendance cards with their "Starts tracking..." notes. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add dashboard with real stat queries and Phase-2/3 placeholders

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 21: Future-phase nav stubs + Settings (change password)

**Files:**
- Create: `src/components/shared/phase-stub.tsx`
- Create: `src/app/(app)/fees/page.tsx`
- Create: `src/app/(app)/attendance/page.tsx`
- Create: `src/app/(app)/reminders/page.tsx`
- Create: `src/app/(app)/reports/page.tsx`
- Create: `src/app/(app)/journey/page.tsx`
- Create: `src/app/(app)/settings/page.tsx`
- Create: `src/components/settings/change-password-form.tsx`

- [ ] **Step 1: Write `src/components/shared/phase-stub.tsx`**

```tsx
import { Sparkles } from "lucide-react";

export function PhaseStub({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      <div className="glass-card flex flex-col items-center gap-3 p-16 text-center">
        <Sparkles className="text-gold" size={28} />
        <p className="text-muted">{title} is coming in {phase} of SAINTS.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the five stub pages**

`src/app/(app)/fees/page.tsx`:
```tsx
import { PhaseStub } from "@/components/shared/phase-stub";

export default function FeesPage() {
  return <PhaseStub title="Fees" phase="Phase 2" />;
}
```

`src/app/(app)/attendance/page.tsx`:
```tsx
import { PhaseStub } from "@/components/shared/phase-stub";

export default function AttendancePage() {
  return <PhaseStub title="Attendance" phase="Phase 3" />;
}
```

`src/app/(app)/reminders/page.tsx`:
```tsx
import { PhaseStub } from "@/components/shared/phase-stub";

export default function RemindersPage() {
  return <PhaseStub title="Fee Reminders" phase="Phase 4" />;
}
```

`src/app/(app)/reports/page.tsx`:
```tsx
import { PhaseStub } from "@/components/shared/phase-stub";

export default function ReportsPage() {
  return <PhaseStub title="Reports" phase="Phase 5" />;
}
```

`src/app/(app)/journey/page.tsx`:
```tsx
import { PhaseStub } from "@/components/shared/phase-stub";

export default function JourneyPage() {
  return <PhaseStub title="SAINTS Journey" phase="Phase 6" />;
}
```

- [ ] **Step 3: Write `src/components/settings/change-password-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message ?? "Could not change password");
      return;
    }
    toast.success("Password updated");
    setCurrentPassword("");
    setNewPassword("");
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card max-w-sm space-y-4 p-6">
      <h2 className="font-medium text-gold">Change Password</h2>
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Current Password</Label>
        <Input
          id="currentPassword"
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">New Password</Label>
        <Input
          id="newPassword"
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Updating..." : "Update Password"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Write `src/app/(app)/settings/page.tsx`**

```tsx
import { ChangePasswordForm } from "@/components/settings/change-password-form";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
      <ChangePasswordForm />
    </div>
  );
}
```

- [ ] **Step 5: Verify manually**

```bash
npm run dev
```

Visit each stub page (Fees, Attendance, Fee Reminders, Reports, SAINTS Journey) and confirm each shows its phase message without erroring. On Settings, change the admin password, log out, and log back in with the new password to confirm it took effect. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add future-phase nav stubs and password change in Settings

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 22: End-to-end smoke test

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/student-flow.spec.ts`

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

- [ ] **Step 2: Write `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 3: Write the failing test in `tests/e2e/student-flow.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("admin can log in, add a student, and see it in the list", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL ?? "arpitagrggc@gmail.com");
  await page.getByLabel("Password").fill(process.env.ADMIN_SEED_PASSWORD ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/students/new");
  await page.getByLabel("Student Name").fill("Test Student E2E");
  await page.getByLabel("Mobile Number", { exact: true }).first().fill("9876543211");
  await page.getByLabel("Date of Birth").fill("2000-01-01");
  await page.getByLabel("Joining Date").fill("2026-01-01");
  await page.getByLabel("House / Street").fill("1 Test Street");
  await page.getByLabel("Area").fill("Test Area");
  await page.getByLabel("City").fill("Test City");
  await page.getByLabel("State").fill("Test State");
  await page.getByLabel("PIN Code").fill("110001");
  await page.getByLabel("Contact Name").fill("Test Contact");
  await page.getByLabel("Relationship").fill("Friend");
  await page.getByLabel("Mobile Number", { exact: true }).nth(1).fill("9876543212");

  // Select the first available batch
  await page.getByText("Select a batch").click();
  await page.getByRole("option").first().click();

  await page.getByRole("button", { name: "Add Student" }).click();

  await expect(page).toHaveURL(/\/students$/);
  await expect(page.getByText("Test Student E2E")).toBeVisible();
});
```

- [ ] **Step 4: Run the test to verify it fails (no `.env.test` credentials wired yet is fine — it should at least attempt and reach the app)**

```bash
npx playwright test
```

Expected: runs against the dev server; note any selector mismatches and adjust labels above to match the actual rendered `<Label>` text if a step fails to find an element.

- [ ] **Step 5: Fix any selector mismatches found in Step 4, then re-run until it passes**

```bash
npx playwright test
```

Expected: PASS, 1 test.

- [ ] **Step 6: Add test scripts to `package.json`**

```json
"scripts": {
  "test:e2e": "playwright test"
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add Playwright E2E smoke test: login, add student, verify in list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 23: Deploy to Vercel

**Files:**
- Create: `.github` (none required — deploying via Vercel CLI/dashboard, not CI)

- [ ] **Step 1: Push the repository to GitHub**

```bash
gh repo create saints-fitness --private --source=. --remote=origin
git push -u origin master
```

- [ ] **Step 2: Import the project in Vercel**

Go to https://vercel.com/new, import the `saints-fitness` GitHub repo. Keep default Next.js build settings.

- [ ] **Step 3: Set environment variables in the Vercel project settings**

Add all of: `DATABASE_URL` (Neon pooled connection string), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (set to the production URL Vercel assigns, e.g. `https://saints-fitness.vercel.app`), `ADMIN_EMAIL`, `ADMIN_SEED_PASSWORD`, `BLOB_READ_WRITE_TOKEN`.

- [ ] **Step 4: Deploy**

Trigger the deploy from the Vercel dashboard (or it auto-deploys on push). Confirm the build succeeds.

- [ ] **Step 5: Run the production seed once**

From your local machine, with `DATABASE_URL` in `.env` pointed at the same Neon database used in production:

```bash
npx prisma db seed
```

- [ ] **Step 6: Verify the live site**

Open the deployed URL, log in with the seeded admin credentials, confirm the Dashboard, Students, and Classes & Batches pages all load with real data.

- [ ] **Step 7: Commit any deployment-related config changes**

```bash
git add -A
git commit -m "Finalize deployment configuration

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

---

## Post-plan check

At the end of this plan, the following from the Phase 1 spec are fully working: Admin login, Courses/Batches/Instructors CRUD, full Student CRUD with photo upload and soft delete, student search/filters, the 6-tab student profile (Overview + Classes functional, rest stubbed), a Dashboard with real (non-hardcoded) stats, an E2E smoke test, and a live deployment on a $0 Vercel + Neon stack. Fees, Attendance, Fee Reminders, Reports, and SAINTS Journey remain stubbed, to be built in their own subsequent plans.
