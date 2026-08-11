import { PageHeader } from "@/components/app-shell/page-header";
import { ReportsClient } from "@/components/reports/reports-client";
import { getDataBounds, getReport } from "@/lib/data/reports";

/**
 * Ranged performance report. The date range lives in the URL (?from=&to=) so a
 * view can be linked and shared — Deepak sends "look at this window" rather
 * than describing which dates to pick.
 */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const bounds = await getDataBounds();

  // Default to the last 30 days of data we actually hold, not of the calendar —
  // if syncing stalled, an empty "last 30 days" would read as zero performance.
  const today = bounds?.max ?? ymd(new Date());
  const defaultFrom = (() => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - 29);
    const iso = ymd(d);
    return bounds && iso < bounds.min ? bounds.min : iso;
  })();

  const from = ISO.test(sp.from ?? "") ? sp.from! : defaultFrom;
  const to = ISO.test(sp.to ?? "") ? sp.to! : today;
  const range = from <= to ? { from, to } : { from: to, to: from };

  const data = await getReport(range);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Pick a date range to see how every ad performed in it"
      />
      <div className="flex-1 overflow-auto">
        <ReportsClient data={data} bounds={bounds} />
      </div>
    </>
  );
}
