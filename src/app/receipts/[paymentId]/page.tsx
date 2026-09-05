import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { getPayment } from "@/lib/queries/fees";
import { formatMonthYear } from "@/lib/fees/periods";
import { ReceiptActions } from "@/components/fees/receipt-actions";

const MODE_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  ONLINE: "Online Payment",
  BANK_TRANSFER: "Bank Transfer",
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { paymentId } = await params;
  const payment = await getPayment(paymentId);
  if (!payment || !payment.receipt) notFound();

  const startLabel = formatMonthYear(payment.coverageStart);
  const endLabel = formatMonthYear(payment.coverageEnd);
  const periodLabel = startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
  const amountLabel = payment.amount.toNumber().toLocaleString("en-IN");

  const shareMessage = [
    "SAINTS – Fee Receipt",
    `Receipt No: ${payment.receipt.receiptNumber}`,
    `Student: ${payment.student.name}`,
    `Amount: ₹${amountLabel}`,
    `For: ${periodLabel}`,
    `Paid via ${MODE_LABELS[payment.mode]} on ${format(payment.paymentDate, "dd MMM yyyy")}`,
    "Thank you!",
  ].join("\n");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="glass-card w-full max-w-md space-y-6 p-8 print:border-none print:bg-white print:text-black">
        <div className="text-center">
          <p className="text-lg font-semibold text-gold print:text-black">SAINTS</p>
          <p className="text-sm text-muted">Dance • Zumba • Movement • Self Knowledge</p>
          <div className="gold-divider my-3" />
          <p className="font-medium text-foreground print:text-black">FEE RECEIPT</p>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Student</span>
            <span className="text-foreground print:text-black">{payment.student.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Receipt No</span>
            <span className="text-foreground print:text-black">{payment.receipt.receiptNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Amount</span>
            <span className="text-foreground print:text-black">₹{amountLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">For</span>
            <span className="text-foreground print:text-black">{periodLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Payment Mode</span>
            <span className="text-foreground print:text-black">{MODE_LABELS[payment.mode]}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Date</span>
            <span className="text-foreground print:text-black">{format(payment.paymentDate, "dd MMM yyyy")}</span>
          </div>
        </div>

        <p className="text-center text-sm text-muted">Thank You</p>

        <ReceiptActions studentMobile={payment.student.mobile} shareMessage={shareMessage} />
      </div>
    </main>
  );
}
