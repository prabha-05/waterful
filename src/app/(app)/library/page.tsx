import { PageHeader } from "@/components/app-shell/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { listCreatives } from "@/lib/data/creatives";
import { getTaxonomy } from "@/lib/data/taxonomy";
import { signPaths } from "@/lib/storage";
import { LibraryClient } from "@/components/library/library-client";
import { UploadButton } from "@/components/library/upload-button";
import { ApprovedScripts } from "@/components/library/approved-scripts";
import { getApprovedScripts } from "@/lib/data/scripts";

export default async function LibraryPage() {
  // One round trip, not two: fetching the script queue after the others cost a
  // second sequential hop to Supabase on every Library load. The permission
  // check now filters what is DISPLAYED, not what is fetched.
  const [user, baseCreatives, taxonomy, allApproved] = await Promise.all([
    getCurrentUser(),
    listCreatives(),
    getTaxonomy(),
    getApprovedScripts(),
  ]);
  const perms = user!.permissions;
  const approvedScripts = perms.upload || perms.script ? allApproved : [];

  // Resolve signed thumbnail URLs for the cards (private bucket). Cards with a
  // poster only need that small JPEG; the rest also get the source file signed
  // so the card can capture a frame once and heal the missing poster.
  const urlMap = await signPaths([
    ...baseCreatives.map((c) => c.thumbPath).filter((p): p is string => !!p),
    ...baseCreatives.filter((c) => !c.hasPoster).map((c) => c.sourcePath).filter((p): p is string => !!p),
  ]);
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
        {approvedScripts.length > 0 && (
          <div className="px-6 pt-6">
            <ApprovedScripts
              scripts={approvedScripts}
              taxonomy={taxonomy}
              canUpload={perms.upload}
            />
          </div>
        )}
        <LibraryClient creatives={creatives} taxonomy={taxonomy} perms={perms} />
      </div>
    </>
  );
}
