-- CreateTable
CREATE TABLE "FeeReminder" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pendingAmountAtSend" DECIMAL(10,2) NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "FeeReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeeReminder_studentId_idx" ON "FeeReminder"("studentId");

-- AddForeignKey
ALTER TABLE "FeeReminder" ADD CONSTRAINT "FeeReminder_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
