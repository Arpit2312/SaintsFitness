"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { sendFeeReminder } from "@/actions/reminders";
import { buildReminderMessage } from "@/lib/reminders/message";
import { formatDateUTC } from "@/lib/dates";
import { toast } from "sonner";

// Same 3-value color map as fees-list.tsx (OVERDUE/PARTIAL/DUE are the only
// statuses that can appear here -- this list only ever shows students with
// totalPending > 0).
const STATUS_COLORS: Record<string, string> = {
  OVERDUE: "border-danger text-danger",
  PARTIAL: "border-warning text-warning",
  DUE: "border-muted text-muted",
};

export type PendingFeeStudent = {
  studentId: string;
  studentCode: string;
  name: string;
  mobile: string;
  status: string;
  totalPending: number;
  lastRemindedAt: Date | null;
};

export function RemindersList({ students }: { students: PendingFeeStudent[] }) {
  const router = useRouter();
  const [sendingId, setSendingId] = useState<string | null>(null);

  async function handleSend(student: PendingFeeStudent) {
    setSendingId(student.studentId);
    try {
      await sendFeeReminder(student.studentId);
      const message = buildReminderMessage(student.name, student.totalPending);
      const url = `https://wa.me/91${student.mobile}?text=${encodeURIComponent(message)}`;
      window.open(url, "_blank");
      toast.success("Reminder logged");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Fee Reminders</h1>

      {students.length === 0 ? (
        <EmptyState icon={MessageCircle} title="No students have pending dues." />
      ) : (
        <div className="glass-card divide-y divide-card-border">
          {students.map((student) => (
            <div key={student.studentId} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium text-foreground">{student.name}</p>
                <p className="text-sm text-muted">
                  {student.studentCode} · ₹{student.totalPending.toLocaleString("en-IN")} pending
                  {student.lastRemindedAt && ` · Last reminded ${formatDateUTC(student.lastRemindedAt)}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={STATUS_COLORS[student.status]}>
                  {student.status}
                </Badge>
                <Button
                  variant="outline"
                  onClick={() => handleSend(student)}
                  disabled={sendingId === student.studentId}
                >
                  <MessageCircle size={16} className="mr-2" />
                  {sendingId === student.studentId ? "Sending..." : "Send Reminder"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
