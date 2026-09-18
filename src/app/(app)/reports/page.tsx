import { ReportTabs } from "@/components/reports/report-tabs";
import { OverviewTab } from "@/components/reports/overview-tab";
import { OperationalTab } from "@/components/reports/operational-tab";
import { resolveDateRange } from "@/lib/reports/date-range";

const VALID_TABS = ["overview", "operational"] as const;
const DEFAULT_GAP_DAYS = 14;
const VALID_GAP_DAYS = [7, 14, 30];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; range?: string; from?: string; to?: string; gapDays?: string }>;
}) {
  const params = await searchParams;
  const tab = (VALID_TABS as readonly string[]).includes(params.tab ?? "") ? (params.tab as string) : "overview";
  const range = resolveDateRange(params);
  const rangeParam = params.range ?? "this-month";
  const parsedGapDays = Number(params.gapDays);
  const gapDays = VALID_GAP_DAYS.includes(parsedGapDays) ? parsedGapDays : DEFAULT_GAP_DAYS;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Reports</h1>
      <ReportTabs activeTab={tab} />
      {tab === "operational" ? (
        <OperationalTab range={range} gapDays={gapDays} />
      ) : (
        <OverviewTab range={range} rangeParam={rangeParam} />
      )}
    </div>
  );
}
