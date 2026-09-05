"use client";

import { Badge } from "@/components/ui/badge";
import type { PeriodWithStatus, PeriodStatus } from "@/lib/fees/fee-history";
import { formatMonthYear } from "@/lib/fees/periods";

// React Server Components can only pass plain, JSON-like values across the
// server/client boundary -- Prisma's Decimal (from PeriodWithStatus) throws
// "Only plain objects can be passed to Client Components from Server
// Components. Decimal objects are not supported." at request time if handed
// to a "use client" component directly. page.tsx (the Server Component)
// converts each period's amountDue/amountPaid to plain numbers via
// `.toNumber()` before this client component ever sees them, so this type
// -- not the plan's original `PeriodWithStatus[]` -- is what's actually
// received here.
export type SerializedPeriod = Omit<PeriodWithStatus, "amountDue" | "amountPaid"> & {
  amountDue: number;
  amountPaid: number;
};

const STATUS_COLORS: Record<PeriodStatus, string> = {
  PAID: "border-success text-success",
  PARTIAL: "border-warning text-warning",
  DUE: "border-muted text-muted",
  OVERDUE: "border-danger text-danger",
};

function formatPeriodLabel(period: SerializedPeriod): string {
  const startLabel = formatMonthYear(period.start);
  const endLabel = formatMonthYear(period.end);
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

export function FeeHistoryTable({
  periods,
  totalPaid,
  totalPending,
}: {
  periods: SerializedPeriod[];
  totalPaid: number;
  totalPending: number;
}) {
  return (
    <div className="space-y-3">
      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border text-left text-muted">
              <th className="p-3 font-medium">Period</th>
              <th className="p-3 font-medium">Amount Due</th>
              <th className="p-3 font-medium">Amount Paid</th>
              <th className="p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.index} className="border-b border-card-border last:border-0">
                <td className="p-3 text-foreground">{formatPeriodLabel(period)}</td>
                <td className="p-3 text-muted">₹{period.amountDue.toLocaleString("en-IN")}</td>
                <td className="p-3 text-muted">₹{period.amountPaid.toLocaleString("en-IN")}</td>
                <td className="p-3">
                  <Badge variant="outline" className={STATUS_COLORS[period.status]}>
                    {period.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-6 text-sm">
        <p className="text-muted">
          Total Paid: <span className="text-success">₹{totalPaid.toLocaleString("en-IN")}</span>
        </p>
        <p className="text-muted">
          Total Pending: <span className="text-danger">₹{totalPending.toLocaleString("en-IN")}</span>
        </p>
      </div>
    </div>
  );
}
