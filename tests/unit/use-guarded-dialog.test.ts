import { describe, it, expect, vi } from "vitest";
import { useGuardedDialogOpenChange } from "@/hooks/use-guarded-dialog";

describe("useGuardedDialogOpenChange", () => {
  it("cancels the dismissal and does not call onOpenChange while pending", () => {
    const onOpenChange = vi.fn();
    const eventDetails = { cancel: vi.fn() };

    const handleOpenChange = useGuardedDialogOpenChange(true, onOpenChange);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handleOpenChange(false, eventDetails as any);

    expect(eventDetails.cancel).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("forwards to onOpenChange and does not cancel when not pending", () => {
    const onOpenChange = vi.fn();
    const eventDetails = { cancel: vi.fn() };

    const handleOpenChange = useGuardedDialogOpenChange(false, onOpenChange);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handleOpenChange(false, eventDetails as any);

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(eventDetails.cancel).not.toHaveBeenCalled();
  });
});
