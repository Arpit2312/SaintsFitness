"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const OPTIONS = [7, 14, 30];

export function GapDaysSelect({ value }: { value: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateGapDays(days: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("gapDays", days);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={String(value)} onValueChange={(v) => updateGapDays(v as string)}>
      <SelectTrigger className="w-32">
        <SelectValue placeholder="Days">{(v: string) => `${v} days`}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((d) => (
          <SelectItem key={d} value={String(d)}>
            {d} days
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
