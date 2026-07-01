import { PageHeader } from "@/components/app-shell/page-header";
import { getDashboard } from "@/lib/data/dashboard";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default async function DashboardPage() {
  const data = await getDashboard();
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Find the central group — the persona/angle that wins at scale"
      />
      <div className="flex-1 overflow-auto">
        <DashboardClient data={data} />
      </div>
    </>
  );
}
