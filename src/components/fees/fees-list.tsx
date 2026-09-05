"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import type { listStudentFeeStatuses } from "@/lib/queries/fees";
import type { PeriodStatus } from "@/lib/fees/fee-history";

// Mirrors `Awaited<ReturnType<typeof listStudentFeeStatuses>>[number]`, but
// with `totalPending` (a Prisma Decimal when a student has a plan) converted
// to a plain number -- React Server Components reject Decimal instances
// passed to a "use client" component ("Only plain objects can be passed to
// Client Components from Server Components. Decimal objects are not
// supported."), so page.tsx converts via `.toNumber()` before handing the
// list to this component. Same pattern as SerializedPeriod/SerializedFeeHistory
// in fee-history-table.tsx / student-fees-tab.tsx.
export type SerializedStudentFeeStatus =
  | {
      studentId: string;
      studentCode: string;
      name: string;
      hasPlan: false;
    }
  | {
      studentId: string;
      studentCode: string;
      name: string;
      hasPlan: true;
      status: PeriodStatus | "NOT_STARTED";
      totalPending: number;
    };

// listStudentFeeStatuses can report "NOT_STARTED" for a plan whose dueDate
// hasn't arrived yet (see src/lib/queries/fees.ts), in addition to the 4
// PeriodStatus values -- so the color map and filter must cover all 5, not
// just PeriodStatus. Typing this as a Record over the full union means
// TypeScript enforces exhaustiveness here.
const STATUS_COLORS: Record<PeriodStatus | "NOT_STARTED", string> = {
  PAID: "border-success text-success",
  PARTIAL: "border-warning text-warning",
  DUE: "border-muted text-muted",
  OVERDUE: "border-danger text-danger",
  NOT_STARTED: "border-gold text-gold",
};

const STATUS_LABELS: Record<PeriodStatus | "NOT_STARTED", string> = {
  PAID: "Paid",
  PARTIAL: "Partial",
  DUE: "Due",
  OVERDUE: "Overdue",
  NOT_STARTED: "Not Started",
};

type StatusFilter = PeriodStatus | "NOT_STARTED" | "ALL";

export function FeesList({ students }: { students: SerializedStudentFeeStatus[] }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const filtered = useMemo(() => {
    if (statusFilter === "ALL") return students;
    return students.filter((s) => s.hasPlan && s.status === statusFilter);
  }, [students, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Fees</h1>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="PARTIAL">Partial</SelectItem>
            <SelectItem value="DUE">Due</SelectItem>
            <SelectItem value="OVERDUE">Overdue</SelectItem>
            <SelectItem value="NOT_STARTED">Not Started</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={students.length === 0 ? "No students yet." : "No students match this filter."}
        />
      ) : (
        <div className="glass-card divide-y divide-card-border">
          {filtered.map((student) => (
            <Link
              key={student.studentId}
              href={`/students/${student.studentId}`}
              className="flex items-center justify-between gap-4 p-4 hover:bg-card"
            >
              <div>
                <p className="font-medium text-foreground">{student.name}</p>
                <p className="text-sm text-muted">{student.studentCode}</p>
              </div>
              {student.hasPlan ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted">
                    ₹{student.totalPending.toLocaleString("en-IN")} pending
                  </span>
                  <Badge variant="outline" className={STATUS_COLORS[student.status]}>
                    {STATUS_LABELS[student.status]}
                  </Badge>
                </div>
              ) : (
                <Badge variant="outline" className="border-muted text-muted">
                  No plan
                </Badge>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
