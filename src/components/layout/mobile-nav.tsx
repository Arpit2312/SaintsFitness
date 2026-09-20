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

  // Escape closes the drawer and hands focus back to the menu button. This
  // subscribes to an external event source, and only while the drawer is open.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      focusMenuButton();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Growing past the phone breakpoint (e.g. rotating to landscape) turns the
  // drawer into the permanent sidebar; drop the open state so it doesn't come
  // back open when the screen shrinks again.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    function onChange(event: MediaQueryListEvent) {
      if (event.matches) setOpen(false);
    }
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return <MobileNavContext.Provider value={{ open, setOpen }}>{children}</MobileNavContext.Provider>;
}

// After closing without navigating, keyboard focus would otherwise fall to <body>
// (the hidden drawer held it), so return it to the button that opened the drawer.
export function focusMenuButton() {
  document.querySelector<HTMLElement>('[aria-controls="app-sidebar"]')?.focus();
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
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-30 bg-black/60 md:hidden"
      onClick={() => {
        setOpen(false);
        focusMenuButton();
      }}
    />
  );
}
