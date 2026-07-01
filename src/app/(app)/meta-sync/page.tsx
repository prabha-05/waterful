import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { getMetaSyncData } from "@/lib/data/meta-sync";
import { MetaSyncClient } from "@/components/meta-sync/meta-sync-client";

export default async function MetaSyncPage() {
  // Admin-only — gated on `master` (decisions §6 / HANDOVER §6).
  const user = await getCurrentUser();
  if (!user?.permissions.master) redirect("/library");

  const data = await getMetaSyncData();

  return (
    <>
      <PageHeader
        title="Meta Sync"
        subtitle="Automatic daily sync, manual 28-day re-pull, full rebuild, sync history"
      />
      <div className="flex-1 overflow-auto">
        <MetaSyncClient data={data} />
      </div>
    </>
  );
}
