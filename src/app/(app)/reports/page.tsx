import { ReportTabs } from "@/components/reports/report-tabs";
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { OverviewTab } from "@/components/reports/overview-tab";
import { OperationalTab } from "@/components/reports/operational-tab";
import { resolveDateRange, normalizeRangeParam } from "@/lib/reports/date-range";

type SearchParamValue = string | string[] | undefined;

const VALID_TABS = ["overview", "operational"] as const;
const DEFAULT_GAP_DAYS = 14;
const VALID_GAP_DAYS = [7, 14, 30];

function first(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const params = await searchParams;

  const rawTab = first(params.tab) ?? "";
  const tab = (VALID_TABS as readonly string[]).includes(rawTab) ? rawTab : "overview";
  const range = normalizeRangeParam(params.range);
  const resolved = resolveDateRange({ range, from: first(params.from), to: first(params.to) });
  const parsedGapDays = Number(first(params.gapDays));
  const gapDays = VALID_GAP_DAYS.includes(parsedGapDays) ? parsedGapDays : DEFAULT_GAP_DAYS;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
      <ReportTabs activeTab={tab} />
      <DateRangePicker range={range} from={resolved.from} to={resolved.to} />
      {tab === "operational" ? (
        <OperationalTab range={resolved} gapDays={gapDays} />
      ) : (
        <OverviewTab range={resolved} />
      )}
    </div>
  );
}
