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
// reflected" is different from "low".
function Ring({ item, size }: { item: JourneyPathItem; size: number }) {
  const value = item.value;
  const offset = value === null ? 0 : RING_CIRCUMFERENCE * (1 - value / 100);
  const description = `${item.label}: ${item.word}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={description}
      className="rounded-full bg-background"
    >
      <title>{description}</title>
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
      {value !== null && (
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
              <Ring item={item} size={size} />
              {!compact && (
                <>
                  <span className="text-sm text-foreground">{item.label}</span>
                  <span className="text-xs text-muted">{item.word}</span>
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
