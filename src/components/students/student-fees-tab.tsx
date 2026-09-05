"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { FeeHistoryTable, type SerializedPeriod } from "@/components/fees/fee-history-table";
import { FeePlanFormDialog } from "@/components/fees/fee-plan-form-dialog";
import { AddPaymentDialog } from "@/components/fees/add-payment-dialog";
import type { FeeFrequency } from "@prisma/client";

// Mirrors the shape of `Awaited<ReturnType<typeof getStudentFeeHistory>>`
// (src/lib/queries/fees.ts), but with every Prisma Decimal field converted to
// a plain number. React Server Components reject Decimal instances passed to
// a "use client" component ("Only plain objects can be passed to Client
// Components from Server Components. Decimal objects are not supported."),
// so page.tsx converts via `.toNumber()` before handing feeHistory to this
// component -- this type describes what actually crosses that boundary, not
// the query's raw Decimal-bearing return type.
type SerializedFeeHistory = {
  plan: {
    totalAmount: number;
    frequency: FeeFrequency;
    dueDate: Date;
    discount: number;
    finalAmount: number;
  };
  periods: SerializedPeriod[];
  totalPaid: number;
  totalPending: number;
  nextCoverageStart: Date;
} | null;

export function StudentFeesTab({
  studentId,
  feeHistory,
}: {
  studentId: string;
  feeHistory: SerializedFeeHistory;
}) {
  const router = useRouter();
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  if (!feeHistory) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={Wallet}
          title="No fee plan set up yet."
          actionLabel="+ Set Up Fee Plan"
          onAction={() => setPlanDialogOpen(true)}
        />
        <FeePlanFormDialog
          open={planDialogOpen}
          onOpenChange={setPlanDialogOpen}
          studentId={studentId}
          onSuccess={() => router.refresh()}
        />
      </div>
    );
  }

  const { plan, periods, totalPaid, totalPending, nextCoverageStart } = feeHistory;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          ₹{plan.finalAmount.toLocaleString("en-IN")} / {plan.frequency.toLowerCase()}
          {plan.discount > 0 && ` (₹${plan.discount.toLocaleString("en-IN")} discount applied)`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPlanDialogOpen(true)}>
            <Pencil size={16} className="mr-2" />
            Edit Plan
          </Button>
          <Button onClick={() => setPaymentDialogOpen(true)}>
            <Plus size={16} className="mr-2" />
            Add Payment
          </Button>
        </div>
      </div>

      <FeeHistoryTable periods={periods} totalPaid={totalPaid} totalPending={totalPending} />

      <FeePlanFormDialog
        open={planDialogOpen}
        onOpenChange={setPlanDialogOpen}
        studentId={studentId}
        plan={{
          totalAmount: plan.totalAmount,
          frequency: plan.frequency,
          dueDate: plan.dueDate,
          discount: plan.discount,
        }}
        onSuccess={() => router.refresh()}
      />
      <AddPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        studentId={studentId}
        frequency={plan.frequency}
        nextCoverageStart={nextCoverageStart}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
