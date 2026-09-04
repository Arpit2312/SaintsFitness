import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="glass-card flex flex-col items-center justify-center gap-3 p-12 text-center">
      <Icon className="text-gold" size={32} />
      <p className="text-muted">{title}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}
