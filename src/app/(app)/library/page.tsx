import { PageHeader } from "@/components/app-shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { listCreatives } from "@/lib/data/creatives";
import { getTaxonomy } from "@/lib/data/taxonomy";
import { signPaths } from "@/lib/storage";
import { LibraryClient } from "@/components/library/library-client";
import { UploadButton } from "@/components/library/upload-button";

export default async function LibraryPage() {
  const [user, baseCreatives, taxonomy] = await Promise.all([
    getCurrentUser(),
    listCreatives(),
    getTaxonomy(),
  ]);
  const perms = user!.permissions;

  // Resolve signed thumbnail URLs for the cards (private bucket).
  const urlMap = await signPaths(
    baseCreatives.map((c) => c.thumbPath).filter((p): p is string => !!p),
  );
  const creatives = baseCreatives.map((c) => ({
    ...c,
    thumbUrl: c.thumbPath ? (urlMap.get(c.thumbPath) ?? null) : null,
  }));

  return (
    <>
      <PageHeader
        title="Creative Library"
        subtitle="Every creative tied to an Angle / Persona hypothesis"
        action={perms.upload ? <UploadButton taxonomy={taxonomy} /> : undefined}
      />
      <div className="flex-1 overflow-auto">
        <LibraryClient creatives={creatives} taxonomy={taxonomy} perms={perms} />
      </div>
    </>
  );
}
