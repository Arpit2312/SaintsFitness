-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT;

-- CreateTable
CREATE TABLE "AcademySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "academyName" TEXT NOT NULL DEFAULT 'SAINTS',
    "logoUrl" TEXT,
    "address" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "receiptPrefix" TEXT NOT NULL DEFAULT 'SNT',
    "receiptIncludeYear" BOOLEAN NOT NULL DEFAULT true,
    "receiptFooter" TEXT NOT NULL DEFAULT 'Thank You',
    "reminderTemplate" TEXT,
    "dueSoonDays" INTEGER NOT NULL DEFAULT 3,
    "overdueReminderDays" INTEGER NOT NULL DEFAULT 7,
    "lastNotificationSyncAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_read_createdAt_idx" ON "Notification"("read", "createdAt");

