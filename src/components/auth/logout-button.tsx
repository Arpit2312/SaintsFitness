"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    // Guards the pre-repaint window where disabled={loading} hasn't committed
    // yet and a double-click/double-Enter could fire signOut() twice.
    if (loading) return;
    setLoading(true);
    try {
      await authClient.signOut();
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Could not log out. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="ghost" onClick={handleLogout} disabled={loading}>
      Log out
    </Button>
  );
}
