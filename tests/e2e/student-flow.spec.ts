import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Dedicated Prisma client for this spec file's cleanup queries. This runs
// against the real Neon database (no test-DB isolation exists in Phase 1 --
// see docs/superpowers/plans/2026-09-04-phase1-foundation.md Task 22), so the
// student created by the test below MUST be deleted afterward or every run
// would leave a new permanent "Test Student E2E" row behind.
const prisma = new PrismaClient();

// Fixed, distinctive mobile number used only by this test so the created
// row can be found again for cleanup without depending on its generated id.
const TEST_MOBILE = "9876543211";
const TEST_NAME = "Test Student E2E";

async function deleteTestStudent() {
  const student = await prisma.student.findFirst({ where: { mobile: TEST_MOBILE } });
  if (!student) return;
  // Guard against ever deleting a real student who happens to share this
  // mobile number (unlikely but not impossible -- it's a syntactically
  // valid Indian mobile number) by also requiring the exact test name
  // before deleting anything.
  if (student.name !== TEST_NAME) {
    throw new Error(
      `Refusing to delete student ${student.id}: mobile ${TEST_MOBILE} matched but name "${student.name}" !== "${TEST_NAME}"`
    );
  }
  // Enrollment doesn't cascade on Student delete (no onDelete: Cascade in
  // schema.prisma), so it must be removed first. Address/EmergencyContact/
  // ParentDetails all do cascade and need no explicit cleanup.
  await prisma.enrollment.deleteMany({ where: { studentId: student.id } });
  await prisma.student.delete({ where: { id: student.id } });
}

test.afterEach(async () => {
  try {
    await deleteTestStudent();
  } finally {
    await prisma.$disconnect();
  }
});

test("admin can log in, add a student, and see it in the list", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL ?? "arpitagrggc@gmail.com");
  await page.getByLabel("Password").fill(process.env.ADMIN_SEED_PASSWORD ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/students/new");
  await page.getByLabel("Student Name").fill("Test Student E2E");
  await page.getByLabel("Mobile Number", { exact: true }).first().fill(TEST_MOBILE);
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
