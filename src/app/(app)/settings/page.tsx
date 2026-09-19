import { getSettings } from "@/lib/queries/settings";
import { AcademySettingsForm } from "@/components/settings/academy-settings-form";
import { ReceiptSettingsForm } from "@/components/settings/receipt-settings-form";
import { ReminderSettingsForm } from "@/components/settings/reminder-settings-form";
import { ChangePasswordForm } from "@/components/settings/change-password-form";

export default async function SettingsPage() {
  const settings = await getSettings();
  const year = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
      <div className="grid max-w-3xl gap-6">
        <AcademySettingsForm
          initial={{
            academyName: settings.academyName,
            logoUrl: settings.logoUrl ?? "",
            address: settings.address ?? "",
            mobile: settings.mobile ?? "",
            email: settings.email ?? "",
          }}
        />
        <ReceiptSettingsForm
          initial={{
            receiptPrefix: settings.receiptPrefix,
            receiptIncludeYear: settings.receiptIncludeYear,
            receiptFooter: settings.receiptFooter,
          }}
          year={year}
        />
        <ReminderSettingsForm
          initial={{
            reminderTemplate: settings.reminderTemplate,
            dueSoonDays: String(settings.dueSoonDays),
            overdueReminderDays: String(settings.overdueReminderDays),
          }}
          academyName={settings.academyName}
        />
        <ChangePasswordForm />
      </div>
    </div>
  );
}
