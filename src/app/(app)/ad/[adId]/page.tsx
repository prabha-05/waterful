import { notFound } from "next/navigation";
import { getAdFrame } from "@/lib/data/creatives";
import { getCurrentUser } from "@/lib/auth/session";
import { AdFrame } from "@/components/ad/ad-frame";

export default async function AdFramePage({
  params,
}: {
  params: Promise<{ adId: string }>;
}) {
  const { adId } = await params;
  const [user, data] = await Promise.all([getCurrentUser(), getAdFrame(adId)]);
  if (!data) notFound();
  return <AdFrame data={data} perms={user!.permissions} />;
}
