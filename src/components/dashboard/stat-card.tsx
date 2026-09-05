import type { LucideIcon } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="glass-card space-y-2 p-5">
      <div className="flex items-center gap-2 text-muted">
        <Icon size={16} className="text-gold" />
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}
