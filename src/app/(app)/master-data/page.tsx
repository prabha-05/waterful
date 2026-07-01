import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { getMasterData } from "@/lib/data/master";
import { MasterClient } from "@/components/master/master-client";

export default async function MasterDataPage() {
  const user = await getCurrentUser();
  if (!user?.permissions.master) redirect("/library");

  const data = await getMasterData();

  return (
    <>
      <PageHeader
        title="Master Data"
        subtitle="Personas, Angles, Angle ↔ Persona, Types & Sub-types, Dimensions"
      />
      <div className="flex-1 overflow-auto">
        <MasterClient data={data} />
      </div>
    </>
  );
}
