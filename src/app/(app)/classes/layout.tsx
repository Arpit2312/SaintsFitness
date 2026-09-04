"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/classes/courses", label: "Courses" },
  { href: "/classes/batches", label: "Batches" },
  { href: "/classes/instructors", label: "Instructors" },
];

export default function ClassesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Classes & Batches</h1>
      <div className="flex gap-2 border-b border-card-border">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 px-4 py-2 text-sm",
              pathname === tab.href
                ? "border-gold text-gold"
                : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
