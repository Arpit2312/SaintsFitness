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

  const prefix = form.receiptPrefix.trim().toUpperCase();
  const prefixValid = /^[A-Z0-9]{2,8}$/.test(prefix);
  const preview = prefixValid
    ? formatReceiptNumber({
        prefix,
        includeYear: form.receiptIncludeYear,
        year,
        sequence: 45,
      })
    : null;

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
      // Show what the server actually stored (trimmed, upper-cased prefix).
      setForm({
        receiptPrefix: parsed.data.receiptPrefix,
        receiptIncludeYear: parsed.data.receiptIncludeYear,
        receiptFooter: parsed.data.receiptFooter,
      });
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
        <Label htmlFor="receiptIncludeYear">Include Year in Receipt Numbers</Label>
      </div>
      {preview ? (
        <p className="text-sm text-muted">
          Next receipts will look like <span className="text-foreground">{preview}</span>. Existing receipts are not
          changed.
        </p>
      ) : (
        <p className="text-sm text-muted">Enter a 2-8 character prefix (letters or digits) to see a preview.</p>
      )}
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
