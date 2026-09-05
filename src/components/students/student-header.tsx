import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { DeleteStudentButton } from "@/components/students/delete-student-button";
import type { StudentStatus } from "@prisma/client";

const STATUS_COLORS: Record<StudentStatus, string> = {
  ACTIVE: "border-success text-success",
  INACTIVE: "border-warning text-warning",
  LEFT: "border-danger text-danger",
};

export function StudentHeader({
  id,
  name,
  studentCode,
  photoUrl,
  status,
}: {
  id: string;
  name: string;
  studentCode: string;
  photoUrl: string | null;
  status: StudentStatus;
}) {
  return (
    <div className="glass-card flex items-center justify-between p-6">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          {photoUrl && <AvatarImage src={photoUrl} alt={name} />}
          <AvatarFallback>{name.charAt(0)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm text-muted">{studentCode}</p>
          <h1 className="text-xl font-semibold text-foreground">{name}</h1>
          <Badge variant="outline" className={STATUS_COLORS[status]}>
            {status}
          </Badge>
        </div>
      </div>
      <div className="flex gap-2">
        {/* This project's Button (base-ui, not Radix) has no `asChild` — use its
            `render` prop instead, and nativeButton={false} since it's rendering
            as an <a> (via Link), not a native <button> (see students-list.tsx). */}
        <Button render={<Link href={`/students/${id}/edit`} />} nativeButton={false} variant="outline">
          <Pencil size={16} className="mr-2" />
          Edit
        </Button>
        <DeleteStudentButton id={id} />
      </div>
    </div>
  );
}
