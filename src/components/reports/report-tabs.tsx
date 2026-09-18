"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "operational", label: "Operational" },
] as const;

export function ReportTabs({ activeTab }: { activeTab: string }) {
  const searchParams = useSearchParams();

  return (
    <div className="flex gap-2 border-b border-card-border">
      {TABS.map((t) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", t.value);
        return (
          <Link
            key={t.value}
            href={`/reports?${params.toString()}`}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              activeTab === t.value
                ? "border-gold text-gold"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
