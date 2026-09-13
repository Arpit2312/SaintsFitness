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
 */
export function buildReminderMessage(name: string, pendingAmount: number): string {
  const amountLabel = pendingAmount.toLocaleString("en-IN");
  return [
    "SAINTS – Fee Reminder",
    `Hi ${name}, this is a reminder that ₹${amountLabel} is pending for your SAINTS fees. Please clear it at your earliest convenience. Thank you!`,
  ].join("\n");
}
