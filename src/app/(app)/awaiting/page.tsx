import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { getAwaiting } from "@/lib/data/creatives";
import { getTaxonomy } from "@/lib/data/taxonomy";
import { signPaths } from "@/lib/storage";
import { AwaitingClient } from "@/components/library/awaiting-client";

export default async function AwaitingPage() {
  const user = await getCurrentUser();
  // App-layer gate (decisions §4): upload OR link.
  if (!user?.permissions.upload && !user?.permissions.link) redirect("/library");

  const [baseAwaiting, taxonomy] = await Promise.all([getAwaiting(), getTaxonomy()]);

  // Resolve signed thumbnail URLs for the rows (private bucket), same as Library.
  const urlMap = await signPaths(
    baseAwaiting.map((c) => c.thumbPath).filter((p): p is string => !!p),
  );
  const awaiting = baseAwaiting.map((c) => ({
    ...c,
    thumbUrl: c.thumbPath ? (urlMap.get(c.thumbPath) ?? null) : null,
  }));

  return (
    <>
      <PageHeader
        title="Awaiting Linking"
        subtitle={
          user!.permissions.link
            ? "Creatives with no linked ad — link a Meta Ad ID to take them Live"
            : "Creatives waiting on the Performance team to link a Meta ad"
        }
      />
      <div className="flex-1 overflow-auto">
        <AwaitingClient items={awaiting} taxonomy={taxonomy} perms={user!.permissions} />
      </div>
    </>
  );
}
