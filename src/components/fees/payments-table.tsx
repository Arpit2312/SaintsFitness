"use client";

import { buttonVariants } from "@/components/ui/button";
import { formatDateUTC } from "@/lib/dates";
import { formatMonthYear } from "@/lib/fees/periods";
import { paymentModeLabel } from "@/lib/notifications/candidates";

// What actually crosses the Server -> Client boundary: page.tsx converts each
// payment's Decimal amount to a plain number first.
export type SerializedPayment = {
  id: string;
  amount: number;
  paymentDate: Date;
  mode: string;
  coverageStart: Date;
  coverageEnd: Date;
  receiptNumber: string | null;
};

function periodLabel(payment: SerializedPayment): string {
  const start = formatMonthYear(payment.coverageStart);
  const end = formatMonthYear(payment.coverageEnd);
  return start === end ? start : `${start} – ${end}`;
}

export function PaymentsTable({ payments }: { payments: SerializedPayment[] }) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-foreground">Payments</h3>
      {payments.length === 0 ? (
        <p className="glass-card py-6 text-center text-sm text-muted">No payments recorded yet.</p>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-muted">
                <th className="p-3 font-medium">Receipt No</th>
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Amount</th>
                <th className="p-3 font-medium">Mode</th>
                <th className="p-3 font-medium">For</th>
                <th className="p-3 font-medium">
                  <span className="sr-only">Receipt</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b border-card-border last:border-0">
                  <td className="p-3 text-foreground">{payment.receiptNumber ?? "—"}</td>
                  <td className="p-3 text-muted">{formatDateUTC(payment.paymentDate)}</td>
                  <td className="p-3 text-foreground">₹{payment.amount.toLocaleString("en-IN")}</td>
                  <td className="p-3 text-muted">{paymentModeLabel(payment.mode)}</td>
                  <td className="p-3 text-muted">{periodLabel(payment)}</td>
                  <td className="p-3 text-right">
                    {payment.receiptNumber ? (
                      // The receipt page is a standalone printable page, so it opens in a new tab.
                      <a
                        href={`/receipts/${payment.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        View Receipt
                      </a>
                    ) : (
                      <span className="text-xs text-muted">No receipt</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
