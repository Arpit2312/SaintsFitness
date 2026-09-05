import { Sparkles } from "lucide-react";

export function PhaseStub({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      <div className="glass-card flex flex-col items-center gap-3 p-16 text-center">
        <Sparkles className="text-gold" size={28} />
        <p className="text-muted">{title} is coming in {phase} of SAINTS.</p>
      </div>
    </div>
  );
}
