import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { getMetaSyncData } from "@/lib/data/meta-sync";
import { MetaSyncClient } from "@/components/meta-sync/meta-sync-client";

export default async function MetaSyncPage() {
  // Gated on `sync` (Admin + Performance); Full Rebuild additionally needs `master`.
  const user = await getCurrentUser();
  if (!user?.permissions.sync) redirect("/library");

  const data = await getMetaSyncData();

  return (
    <>
      <PageHeader
        title="Meta Sync"
        subtitle="Automatic daily sync, manual 28-day re-pull, full rebuild, sync history"
      />
      <div className="flex-1 overflow-auto">
        <MetaSyncClient data={data} canRebuild={user.permissions.master} />
      </div>
    </>
  );
}
