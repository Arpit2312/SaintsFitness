import { cn } from "@/lib/utils";

export type JourneyPathItem = {
  key: string;
  label: string;
  value: number | null;
  word: string;
};

const RING_RADIUS = 20;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// A soft ring whose gold arc fills in proportion to the quality. An unrated
// quality is a faint dashed ring, not an empty (0%) one -- "not yet
// reflected" is different from "low". `decorative` rings sit next to visible
// label text, so they are hidden from assistive tech to avoid announcing
// every quality twice.
function Ring({ item, size, decorative }: { item: JourneyPathItem; size: number; decorative: boolean }) {
  const value = item.value === null ? null : Math.min(100, Math.max(0, item.value));
  const offset = value === null ? 0 : RING_CIRCUMFERENCE * (1 - value / 100);
  const description = `${item.label}: ${item.word}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className="rounded-full bg-background"
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": description })}
    >
      {!decorative && <title>{description}</title>}
      <circle
        cx="24"
        cy="24"
        r={RING_RADIUS}
        fill="none"
        stroke={value === null ? "var(--muted-foreground)" : "var(--card-border)"}
        strokeOpacity={value === null ? 0.5 : 1}
        strokeWidth="3"
        strokeDasharray={value === null ? "3 5" : undefined}
      />
      {/* Skipped at 0%: a zero-length dash with round caps can render as a dot in some browsers. */}
      {value !== null && value > 0 && (
        <circle
          cx="24"
          cy="24"
          r={RING_RADIUS}
          fill="none"
          stroke="var(--gold)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 24 24)"
        />
      )}
    </svg>
  );
}

export function JourneyPath({ items, compact = false }: { items: JourneyPathItem[]; compact?: boolean }) {
  const size = compact ? 36 : 56;

  return (
    <div className="space-y-3">
      <div className="relative">
        <div
          aria-hidden
          className={cn("absolute left-[10%] right-[10%] h-px bg-gold/30", compact ? "top-[18px]" : "top-7")}
        />
        <ol className="relative grid grid-cols-5 gap-1">
          {items.map((item) => (
            <li key={item.key} className="flex flex-col items-center gap-1.5 text-center">
              <Ring item={item} size={size} decorative={!compact} />
              {!compact && (
                <>
                  {/* Smaller text below sm: five labels share ~50px columns on a phone. */}
                  <span className="text-[10px] text-foreground sm:text-sm">{item.label}</span>
                  <span className="text-[10px] text-muted sm:text-xs">{item.word}</span>
                </>
              )}
            </li>
          ))}
        </ol>
      </div>
      {!compact && (
        <p className="text-center text-xs tracking-wide text-muted">
          Body → Movement → Discipline → Awareness → Self Knowledge
        </p>
      )}
    </div>
  );
}
