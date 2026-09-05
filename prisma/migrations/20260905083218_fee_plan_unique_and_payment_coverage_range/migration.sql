-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "period",
ADD COLUMN     "coverageEnd" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "coverageStart" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "FeePlan_studentId_key" ON "FeePlan"("studentId");

