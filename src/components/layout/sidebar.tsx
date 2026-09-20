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
import { isActiveRoute } from "@/lib/nav";

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

export function Sidebar({ academyName, logoUrl }: { academyName: string; logoUrl: string | null }) {
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
        {!collapsed && (
          <span className="flex min-w-0 items-center gap-2 text-lg font-semibold text-gold">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- admin-configured external logo; next/image would need every host allow-listed
              <img
                src={logoUrl}
                alt=""
                referrerPolicy="no-referrer"
                loading="lazy"
                className="h-7 w-7 shrink-0 rounded object-contain"
              />
            )}
            {/* truncate needs its own block-level span: it has no effect on a flex container's text */}
            <span className="min-w-0 truncate">{academyName}</span>
          </span>
        )}
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
          const active = isActiveRoute(pathname, href);
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
