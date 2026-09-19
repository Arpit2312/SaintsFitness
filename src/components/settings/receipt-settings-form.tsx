"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { saveReceiptSettings } from "@/actions/settings";
import { receiptSettingsSchema } from "@/lib/validations/settings";
import { formatReceiptNumber } from "@/lib/settings/receipt";
import { fieldErrors } from "@/components/settings/settings-form-utils";
import { toast } from "sonner";

type FormState = {
  receiptPrefix: string;
  receiptIncludeYear: boolean;
  receiptFooter: string;
};

// `year` comes from the server (page.tsx): calling new Date() during render in
// a client component is impure and can mismatch between server and client.
export function ReceiptSettingsForm({ initial, year }: { initial: FormState; year: number }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const previewPrefix = form.receiptPrefix.trim() === "" ? "SNT" : form.receiptPrefix;
  const preview = formatReceiptNumber({
    prefix: previewPrefix,
    includeYear: form.receiptIncludeYear,
    year,
    sequence: 45,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = receiptSettingsSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await saveReceiptSettings(form);
      toast.success("Receipt settings saved");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card space-y-4 p-6">
      <h2 className="font-medium text-gold">Receipt Settings</h2>
      <div className="space-y-2">
        <Label htmlFor="receiptPrefix">Receipt Prefix</Label>
        <Input
          id="receiptPrefix"
          value={form.receiptPrefix}
          onChange={(e) => setForm((f) => ({ ...f, receiptPrefix: e.target.value.toUpperCase() }))}
          disabled={submitting}
          className="max-w-40"
        />
        <p className="text-xs text-muted">2-8 letters or digits.</p>
        {errors.receiptPrefix && <p className="text-sm text-danger">{errors.receiptPrefix}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="receiptIncludeYear"
          checked={form.receiptIncludeYear}
          onCheckedChange={(checked) => setForm((f) => ({ ...f, receiptIncludeYear: checked === true }))}
          disabled={submitting}
        />
        <Label htmlFor="receiptIncludeYear">Include the year in receipt numbers</Label>
      </div>
      <p className="text-sm text-muted">
        Next receipts will look like <span className="text-foreground">{preview}</span>. Existing receipts are not
        changed.
      </p>
      <div className="space-y-2">
        <Label htmlFor="receiptFooter">Footer Message</Label>
        <Input
          id="receiptFooter"
          value={form.receiptFooter}
          onChange={(e) => setForm((f) => ({ ...f, receiptFooter: e.target.value }))}
          disabled={submitting}
        />
        <p className="text-xs text-muted">Shown at the bottom of every receipt. Leave empty for none.</p>
        {errors.receiptFooter && <p className="text-sm text-danger">{errors.receiptFooter}</p>}
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : "Save Settings"}
      </Button>
    </form>
  );
}
