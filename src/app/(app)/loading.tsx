// Shown instantly while a page's server data loads (prefetched by Next, so
// switching tabs responds immediately instead of freezing on the old screen).
// The sidebar and header live in the layout and stay interactive meanwhile.
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-card" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="glass-card h-28 animate-pulse" />
        ))}
      </div>
      <div className="glass-card h-64 animate-pulse" />
    </div>
  );
}
