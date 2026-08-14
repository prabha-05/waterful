import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { ScriptsClient } from "@/components/scripts/scripts-client";
import { getCurrentUser } from "@/lib/auth/session";
import { getScriptLibrary } from "@/lib/data/scripts";
import { getTaxonomy } from "@/lib/data/taxonomy";

/**
 * Script Library — the stage before a creative exists. Gated on `script`:
 * hiding the nav item is cosmetic, this redirect is the real boundary.
 */
export default async function ScriptsPage() {
  const user = await getCurrentUser();
  if (!user?.permissions.script) redirect("/dashboard");

  const [data, taxonomy] = await Promise.all([getScriptLibrary(), getTaxonomy()]);

  return (
    <>
      <PageHeader
        title="Script Library"
        subtitle="Written scripts, from draft to a brief a creator can shoot"
      />
      <div className="flex-1 overflow-auto">
        <ScriptsClient
          data={data}
          taxonomy={taxonomy}
          perms={user.permissions}
        />
      </div>
    </>
  );
}
