"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const PRESETS = [
  { value: "this-month", label: "This Month" },
  { value: "last-3-months", label: "Last 3 Months" },
  { value: "this-year", label: "This Year" },
  { value: "custom", label: "Custom Range" },
] as const;

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function DateRangePicker({ range, from, to }: { range: string; from: Date; to: Date }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) params.delete(key);
      else params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={range}
        onValueChange={(v) =>
          v === "custom"
            ? updateParams({ range: "custom", from: toDateInputValue(from), to: toDateInputValue(to) })
            : updateParams({ range: v as string, from: undefined, to: undefined })
        }
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Select a range">
            {(value: string) => PRESETS.find((p) => p.value === value)?.label ?? "Select a range"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {range === "custom" && (
        <>
          <Input
            type="date"
            value={toDateInputValue(from)}
            max={toDateInputValue(to)}
            onChange={(e) => {
              if (!e.target.value) return;
              updateParams({ range: "custom", from: e.target.value, to: toDateInputValue(to) });
            }}
            className="w-40"
          />
          <span className="text-sm text-muted">to</span>
          <Input
            type="date"
            value={toDateInputValue(to)}
            min={toDateInputValue(from)}
            onChange={(e) => {
              if (!e.target.value) return;
              updateParams({ range: "custom", from: toDateInputValue(from), to: e.target.value });
            }}
            className="w-40"
          />
        </>
      )}
    </div>
  );
}
