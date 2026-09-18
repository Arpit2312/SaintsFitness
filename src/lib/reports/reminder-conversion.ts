// src/lib/reports/reminder-conversion.ts

export type ReminderRecord = { id: string; studentId: string; sentAt: Date };
export type PaymentRecord = { studentId: string; paymentDate: Date };

/**
 * A reminder "converts" if the same student made a payment strictly after
 * that reminder was sent, and at or before the window end -- the
 * chronologically-next reminder sent to that same student, or `now` if
 * there is no next reminder. This intentionally does NOT check whether the
 * payment was "for" the same pending amount -- any payment in the window
 * counts, since the goal is "did reminding them correlate with them paying
 * soon after", not exact dollar-for-dollar attribution.
 */
export function computeReminderConversions(
  reminders: ReminderRecord[],
  payments: PaymentRecord[],
  now: Date
): Map<string, boolean> {
  const remindersByStudent = new Map<string, ReminderRecord[]>();
  for (const r of reminders) {
    const list = remindersByStudent.get(r.studentId) ?? [];
    list.push(r);
    remindersByStudent.set(r.studentId, list);
  }

  const paymentsByStudent = new Map<string, PaymentRecord[]>();
  for (const p of payments) {
    const list = paymentsByStudent.get(p.studentId) ?? [];
    list.push(p);
    paymentsByStudent.set(p.studentId, list);
  }

  const result = new Map<string, boolean>();
  for (const [studentId, studentReminders] of remindersByStudent) {
    const sorted = [...studentReminders].sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
    const studentPayments = paymentsByStudent.get(studentId) ?? [];
    for (let i = 0; i < sorted.length; i++) {
      const reminder = sorted[i];
      const windowEnd = sorted[i + 1] ? sorted[i + 1].sentAt : now;
      const converted = studentPayments.some(
        (p) => p.paymentDate.getTime() > reminder.sentAt.getTime() && p.paymentDate.getTime() <= windowEnd.getTime()
      );
      result.set(reminder.id, converted);
    }
  }
  return result;
}
