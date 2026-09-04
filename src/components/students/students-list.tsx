"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Users, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import type { listStudents } from "@/lib/queries/students";
import type { StudentStatus } from "@prisma/client";

type StudentRow = Awaited<ReturnType<typeof listStudents>>[number];

const STATUS_COLORS: Record<StudentStatus, string> = {
  ACTIVE: "border-success text-success",
  INACTIVE: "border-warning text-warning",
  LEFT: "border-danger text-danger",
};

export function StudentsList({
  students,
  batches,
}: {
  students: StudentRow[];
  batches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StudentStatus | "ALL">("ALL");
  const [batchId, setBatchId] = useState<string>("ALL");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((student) => {
      if (status !== "ALL" && student.status !== status) return false;
      if (batchId !== "ALL" && !student.enrollments.some((e) => e.batchId === batchId)) return false;
      if (q) {
        const haystack = `${student.name} ${student.studentCode} ${student.mobile}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [students, search, status, batchId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Students</h1>
        <Button render={<Link href="/students/new" />}>
          <Plus size={16} className="mr-2" />
          Add Student
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 text-muted" size={16} />
          <Input
            placeholder="Search by name, ID, or mobile"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StudentStatus | "ALL")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
            <SelectItem value="LEFT">Left</SelectItem>
          </SelectContent>
        </Select>
        <Select value={batchId} onValueChange={(v) => setBatchId(v as string)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Batch">
              {(value: string) =>
                value === "ALL" ? "All batches" : batches.find((b) => b.id === value)?.name ?? "Batch"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All batches</SelectItem>
            {batches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={students.length === 0 ? "No students added yet." : "No students match your filters."}
          actionLabel={students.length === 0 ? "+ Add Your First Student" : undefined}
          onAction={students.length === 0 ? () => router.push("/students/new") : undefined}
        />
      ) : (
        <div className="glass-card divide-y divide-card-border">
          {filtered.map((student) => (
            <Link
              key={student.id}
              href={`/students/${student.id}`}
              className="flex items-center gap-4 p-4 hover:bg-card"
            >
              <Avatar>
                {student.photoUrl && <AvatarImage src={student.photoUrl} alt={student.name} />}
                <AvatarFallback>{student.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium text-foreground">{student.name}</p>
                <p className="text-sm text-muted">
                  {student.studentCode} · {student.mobile} ·{" "}
                  {student.enrollments[0]?.batch.name ?? "No batch"}
                </p>
              </div>
              <Badge variant="outline" className={STATUS_COLORS[student.status]}>
                {student.status}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
