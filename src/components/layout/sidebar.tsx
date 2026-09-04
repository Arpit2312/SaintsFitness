"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Wallet,
  ClipboardCheck,
  Layers,
  BellRing,
  BarChart3,
  Sparkles,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/students", label: "Students", icon: Users },
  { href: "/fees", label: "Fees", icon: Wallet },
  { href: "/attendance", label: "Attendance", icon: ClipboardCheck },
  { href: "/classes/courses", label: "Classes & Batches", icon: Layers },
  { href: "/reminders", label: "Fee Reminders", icon: BellRing },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/journey", label: "SAINTS Journey", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-card-border bg-background transition-all",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex items-center justify-between p-4">
        {!collapsed && <span className="text-lg font-semibold text-gold">SAINTS</span>}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="rounded-md p-1 text-muted hover:text-gold"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
      <div className="gold-divider mx-4" />
      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href.split("/").slice(0, 2).join("/"));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-card text-gold"
                  : "text-muted hover:bg-card hover:text-foreground"
              )}
            >
              <Icon size={18} />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
