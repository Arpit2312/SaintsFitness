"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { MarkAttendanceDialog } from "@/components/attendance/mark-attendance-dialog";
import { formatDateUTC } from "@/lib/dates";
import type { AttendanceStatus } from "@prisma/client";

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  PRESENT: "border-success text-success",
  ABSENT: "border-danger text-danger",
  LATE: "border-warning text-warning",
  LEAVE: "border-muted text-muted",
};
// Matches AttendanceRoster/MarkAttendanceDialog's Title Case labels -- this
// table used to render the raw enum value (e.g. "PRESENT") while the other
// two attendance surfaces already showed "Present", an inconsistency caught
// in the final phase-wide review.
const STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  LEAVE: "Leave",
};

export type AttendanceHistoryRecord = {
  id: string;
  date: Date;
  batchName: string;
  status: AttendanceStatus;
};

export function StudentAttendanceTab({
  studentId,
  records,
  rate,
  enrolledBatches,
}: {
  studentId: string;
  records: AttendanceHistoryRecord[];
  rate: number;
  enrolledBatches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Attendance Rate: <span className="text-gold">{rate}%</span>
        </p>
        <Button onClick={() => setDialogOpen(true)} disabled={enrolledBatches.length === 0}>
          <Plus size={16} className="mr-2" />
          Mark Attendance
        </Button>
      </div>

      {records.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No attendance recorded yet." />
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-muted">
                <th className="p-3 font-medium">Date</th>
                <th className="p-3 font-medium">Batch</th>
                <th className="p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b border-card-border last:border-0">
                  <td className="p-3 text-foreground">{formatDateUTC(record.date)}</td>
                  <td className="p-3 text-muted">{record.batchName}</td>
                  <td className="p-3">
                    <Badge variant="outline" className={STATUS_COLORS[record.status]}>
                      {STATUS_LABELS[record.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MarkAttendanceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        studentId={studentId}
        batches={enrolledBatches}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
