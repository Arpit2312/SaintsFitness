"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteStudent } from "@/actions/students";
import { toast } from "sonner";

export function DeleteStudentButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 size={16} className="mr-2" />
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this student?"
        description="This removes the student from active lists. Their history is preserved, not erased."
        onConfirm={async () => {
          await deleteStudent(id);
          toast.success("Student deleted");
          router.push("/students");
        }}
      />
    </>
  );
}
