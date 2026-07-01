import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { getRoles, getUsers } from "@/lib/data/access";
import { AccessClient } from "@/components/access/access-client";

export default async function AccessPage() {
  const user = await getCurrentUser();
  if (!user?.permissions.access) redirect("/library");

  const [users, roles] = await Promise.all([getUsers(), getRoles()]);

  return (
    <>
      <PageHeader
        title="Access"
        subtitle="Users (grouped by role) & Roles (the six permissions)"
      />
      <div className="flex-1 overflow-auto">
        <AccessClient users={users} roles={roles} />
      </div>
    </>
  );
}
