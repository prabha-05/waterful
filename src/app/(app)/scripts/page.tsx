import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { ScriptsClient } from "@/components/scripts/scripts-client";
import { getCurrentUser } from "@/lib/auth/session";
import { getScriptLibrary } from "@/lib/data/scripts";
import { getUsers } from "@/lib/data/access";
import { getTaxonomy } from "@/lib/data/taxonomy";

/**
 * Script Library — the stage before a creative exists. Gated on `script`:
 * hiding the nav item is cosmetic, this redirect is the real boundary.
 */
export default async function ScriptsPage() {
  const user = await getCurrentUser();
  if (!user?.permissions.script) redirect("/dashboard");

  const [data, users, taxonomy] = await Promise.all([
    getScriptLibrary(),
    getUsers(),
    getTaxonomy(),
  ]);
  // Anyone active with a role can be handed a script to shoot.
  const creators = users
    .filter((u) => !u.archived && u.roleLabel)
    .map((u) => ({ id: u.id, name: u.name }));

  return (
    <>
      <PageHeader
        title="Script Library"
        subtitle="Written scripts, from draft to a brief a creator can shoot"
      />
      <div className="flex-1 overflow-auto">
        <ScriptsClient
          data={data}
          creators={creators}
          taxonomy={taxonomy}
          perms={user.permissions}
        />
      </div>
    </>
  );
}
