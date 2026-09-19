import { listJourneyOverview } from "@/lib/queries/journey";
import { JourneyOverview } from "@/components/journey/journey-overview";

export default async function JourneyPage() {
  const students = await listJourneyOverview();
  return <JourneyOverview students={students} />;
}
