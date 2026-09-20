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
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isActiveRoute } from "@/lib/nav";
import { useMobileNav } from "@/components/layout/mobile-nav";

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
  // `collapsed` is the desktop icon-only mode. It applies from `md` up only
  // (the `md:` classes below); the phone drawer always shows full labels.
  const [collapsed, setCollapsed] = useState(false);
  const { open, setOpen } = useMobileNav();

  return (
    <aside
      id="app-sidebar"
      className={cn(
        // Below md: an off-canvas drawer over the page. From md: a static column.
        "fixed inset-y-0 left-0 z-40 flex h-dvh w-64 flex-col border-r border-card-border bg-background",
        "transition-[transform,width,visibility] duration-200 md:static md:z-auto",
        open ? "translate-x-0" : "-translate-x-full max-md:invisible md:translate-x-0",
        collapsed ? "md:w-16" : "md:w-64"
      )}
    >
      <div className="flex items-center justify-between p-4">
        <span
          className={cn(
            "flex min-w-0 items-center gap-2 text-lg font-semibold text-gold",
            collapsed && "md:hidden"
          )}
        >
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
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden rounded-md p-1 text-muted hover:text-gold md:block"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md p-1 text-muted outline-none hover:text-gold focus-visible:ring-2 focus-visible:ring-ring/50 md:hidden"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>
      <div className="gold-divider mx-4" />
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActiveRoute(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors md:py-2",
                active
                  ? "bg-card text-gold"
                  : "text-muted hover:bg-card hover:text-foreground"
              )}
            >
              <Icon size={18} className="shrink-0" />
              <span className={cn(collapsed && "md:hidden")}>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
