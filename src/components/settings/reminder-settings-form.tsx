"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { saveReminderSettings } from "@/actions/settings";
import { reminderSettingsSchema } from "@/lib/validations/settings";
import { renderReminderTemplate } from "@/lib/settings/reminder-template";
import { DEFAULT_REMINDER_TEMPLATE } from "@/lib/settings/defaults";
import { fieldErrors } from "@/components/settings/settings-form-utils";
import { toast } from "sonner";

type FormState = {
  reminderTemplate: string;
  dueSoonDays: string;
  overdueReminderDays: string;
};

export function ReminderSettingsForm({ initial, academyName }: { initial: FormState; academyName: string }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const preview = renderReminderTemplate(form.reminderTemplate, {
    name: "Aarav Shah",
    amount: "1,500",
    academy: academyName,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = reminderSettingsSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await saveReminderSettings(form);
      toast.success("Fee reminder settings saved");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card space-y-4 p-6">
      <h2 className="font-medium text-gold">Fee Reminder Settings</h2>
      <div className="space-y-2">
        <Label htmlFor="reminderTemplate">Reminder Message Template</Label>
        <Textarea
          id="reminderTemplate"
          value={form.reminderTemplate}
          onChange={(e) => setForm((f) => ({ ...f, reminderTemplate: e.target.value }))}
          disabled={submitting}
          className="max-h-56 overflow-y-auto"
        />
        <p className="text-xs text-muted">
          Use {"{name}"} and {"{amount}"} (required) and optionally {"{academy}"}.
        </p>
        {errors.reminderTemplate && <p className="text-sm text-danger">{errors.reminderTemplate}</p>}
        <div className="rounded-lg border border-card-border p-3">
          <p className="mb-1 text-xs text-muted">Preview</p>
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">{preview}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setForm((f) => ({ ...f, reminderTemplate: DEFAULT_REMINDER_TEMPLATE }))}
          disabled={submitting}
        >
          Restore Default
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dueSoonDays">Due Soon Days</Label>
          <Input
            id="dueSoonDays"
            inputMode="numeric"
            value={form.dueSoonDays}
            onChange={(e) => setForm((f) => ({ ...f, dueSoonDays: e.target.value }))}
            disabled={submitting}
          />
          <p className="text-xs text-muted">Notify this many days before a fee falls due (1-30).</p>
          {errors.dueSoonDays && <p className="text-sm text-danger">{errors.dueSoonDays}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="overdueReminderDays">Overdue Reminder Frequency</Label>
          <Input
            id="overdueReminderDays"
            inputMode="numeric"
            value={form.overdueReminderDays}
            onChange={(e) => setForm((f) => ({ ...f, overdueReminderDays: e.target.value }))}
            disabled={submitting}
          />
          <p className="text-xs text-muted">Re-notify about an overdue student every this many days (1-60).</p>
          {errors.overdueReminderDays && <p className="text-sm text-danger">{errors.overdueReminderDays}</p>}
        </div>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : "Save Settings"}
      </Button>
    </form>
  );
}
