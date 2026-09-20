"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Menu } from "lucide-react";

// Open/closed state of the phone navigation drawer, shared by the header's menu
// button, the sidebar and the backdrop. Only matters below the `md` breakpoint:
// from `md` up the sidebar is a permanent column and none of this is visible.
type MobileNavContextValue = { open: boolean; setOpen: (open: boolean) => void };

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // Escape closes the drawer. This subscribes to an external event source, and
  // only while the drawer is open.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return <MobileNavContext.Provider value={{ open, setOpen }}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav(): MobileNavContextValue {
  const context = useContext(MobileNavContext);
  if (!context) throw new Error("useMobileNav must be used inside MobileNavProvider");
  return context;
}

export function MobileNavButton() {
  const { open, setOpen } = useMobileNav();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open menu"
      aria-expanded={open}
      aria-controls="app-sidebar"
      className="rounded-md p-2 text-muted transition-colors outline-none hover:text-gold focus-visible:ring-2 focus-visible:ring-ring/50 md:hidden"
    >
      <Menu size={22} />
    </button>
  );
}

export function MobileNavBackdrop() {
  const { open, setOpen } = useMobileNav();
  if (!open) return null;
  return <div aria-hidden className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setOpen(false)} />;
}
