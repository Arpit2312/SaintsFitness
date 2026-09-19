import { DEFAULT_REMINDER_TEMPLATE } from "@/lib/settings/defaults";
import { renderReminderTemplate } from "@/lib/settings/reminder-template";

/**
 * The WhatsApp reminder message text -- one source of truth used both
 * server-side (sendFeeReminder logs exactly this text) and client-side (the
 * "Send Reminder" button builds the same text into the wa.me URL), so the
 * logged message and the actually-sent message can never drift apart.
 *
 * Takes a plain `number`, not a Prisma `Decimal` -- Decimal instances can't
 * cross a Server->Client component boundary (RSC serialization rejects
 * them), so callers convert via `.toNumber()` before this function ever
 * runs, on either side of that boundary.
 *
 * `options.template` is the admin-configured reminder template (Settings);
 * with no options the output is exactly the pre-Settings message.
 */
export function buildReminderMessage(
  name: string,
  pendingAmount: number,
  options: { template?: string; academyName?: string } = {}
): string {
  return renderReminderTemplate(options.template ?? DEFAULT_REMINDER_TEMPLATE, {
    name,
    amount: pendingAmount.toLocaleString("en-IN"),
    academy: options.academyName ?? "SAINTS",
  });
}
