"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { saveAcademySettings } from "@/actions/settings";
import { academySettingsSchema } from "@/lib/validations/settings";
import { fieldErrors } from "@/components/settings/settings-form-utils";
import { toast } from "sonner";

type FormState = {
  academyName: string;
  logoUrl: string;
  address: string;
  mobile: string;
  email: string;
};

export function AcademySettingsForm({ initial }: { initial: FormState }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function update(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = academySettingsSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await saveAcademySettings(form);
      toast.success("Academy settings saved");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card space-y-4 p-6">
      <h2 className="font-medium text-gold">Academy Settings</h2>
      <div className="space-y-2">
        <Label htmlFor="academyName">Academy Name</Label>
        <Input
          id="academyName"
          value={form.academyName}
          onChange={(e) => update("academyName", e.target.value)}
          disabled={submitting}
        />
        {errors.academyName && <p className="text-sm text-danger">{errors.academyName}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="logoUrl">Logo URL</Label>
        <Input
          id="logoUrl"
          placeholder="https://example.com/logo.png"
          value={form.logoUrl}
          onChange={(e) => update("logoUrl", e.target.value)}
          disabled={submitting}
        />
        <p className="text-xs text-muted">The address of a logo image you have hosted (must start with https://).</p>
        {errors.logoUrl && <p className="text-sm text-danger">{errors.logoUrl}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Textarea
          id="address"
          value={form.address}
          onChange={(e) => update("address", e.target.value)}
          disabled={submitting}
          className="max-h-40 overflow-y-auto"
        />
        {errors.address && <p className="text-sm text-danger">{errors.address}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="academyMobile">Mobile Number</Label>
          <Input
            id="academyMobile"
            value={form.mobile}
            onChange={(e) => update("mobile", e.target.value)}
            disabled={submitting}
          />
          {errors.mobile && <p className="text-sm text-danger">{errors.mobile}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="academyEmail">Email</Label>
          <Input
            id="academyEmail"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            disabled={submitting}
          />
          {errors.email && <p className="text-sm text-danger">{errors.email}</p>}
        </div>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : "Save Settings"}
      </Button>
    </form>
  );
}
