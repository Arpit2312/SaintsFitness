import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

/**
 * Builds an `onOpenChange` handler for `<Dialog>` that blocks every
 * dismissal path (X button, Escape, backdrop click) while `pending` is
 * true — only the caller's own success/cancel handlers may change open
 * state mid-request.
 *
 * Merely skipping the call to the underlying `onOpenChange` isn't enough:
 * base-ui's internal DialogStore applies `next` to its own state
 * regardless of what this callback does, unless
 * `eventDetails.cancel()` is called. This hook exists so that detail
 * doesn't have to be remembered (and can't be silently dropped) at every
 * call site — see commit 2f12f7f, which fixed exactly this bug after an
 * earlier version only skipped the parent setter.
 *
 * @param pending Whether an async action (submit/confirm) is in flight.
 * @param onOpenChange The "real" open-change handler to run once `pending`
 *   is false, e.g. the `onOpenChange` prop passed down from the parent.
 */
export function useGuardedDialogOpenChange(
  pending: boolean,
  onOpenChange: (open: boolean) => void
): (open: boolean, eventDetails: DialogPrimitive.Root.ChangeEventDetails) => void {
  return (next, eventDetails) => {
    if (pending) {
      eventDetails.cancel();
      return;
    }
    onOpenChange(next);
  };
}
