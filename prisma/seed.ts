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

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, name: "Admin", emailVerified: true, role: "ADMIN" },
    });

    await tx.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        issuer: "local:credential",
        password: hash,
      },
    });
  });

  console.log(`Seeded admin user: ${email}`);
}

async function seedAcademyData() {
  // Any existing course — whether from a prior seed run or added manually through the
  // app — is treated as "already initialized"; we deliberately skip seeding sample data
  // rather than risk duplicating real data. This is intentional, not an oversight.
  const existingCourses = await prisma.course.count();
  if (existingCourses > 0) {
    console.log("Sample academy data already exists, skipping.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const dance = await tx.course.create({
      data: { name: "Bollywood Dance", category: "Dance", description: "High-energy Bollywood choreography." },
    });
    const zumba = await tx.course.create({
      data: { name: "Zumba", category: "Zumba", description: "Cardio dance fitness sessions." },
    });
    const fitness = await tx.course.create({
      data: { name: "Group Fitness", category: "Fitness", description: "Group strength and conditioning." },
    });

    const priya = await tx.instructor.create({
      data: { name: "Priya Nair", mobile: "9876500001", bio: "8 years teaching Bollywood and contemporary dance." },
    });
    const rahul = await tx.instructor.create({
      data: { name: "Rahul Mehta", mobile: "9876500002", bio: "Certified Zumba and fitness instructor." },
    });

    await tx.batch.create({
      data: {
        name: "Bollywood — Evening",
        courseId: dance.id,
        instructorId: priya.id,
        timing: "6:00 PM - 7:00 PM",
        days: ["Mon", "Wed", "Fri"],
        capacity: 25,
      },
    });
    await tx.batch.create({
      data: {
        name: "Morning Zumba",
        courseId: zumba.id,
        instructorId: rahul.id,
        timing: "7:00 AM - 8:00 AM",
        days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
        capacity: 30,
      },
    });
    await tx.batch.create({
      data: {
        name: "Group Fitness — Evening",
        courseId: fitness.id,
        instructorId: rahul.id,
        timing: "7:30 PM - 8:30 PM",
        days: ["Tue", "Thu", "Sat"],
        capacity: 20,
      },
    });
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
