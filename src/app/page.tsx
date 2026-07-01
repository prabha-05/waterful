import { redirect } from "next/navigation";
import { getSettings } from "@/lib/settings";

/** Root → per-user default landing (Library or Dashboard — Settings, Phase 4). */
export default async function Home() {
  const { defaultLanding } = await getSettings();
  redirect(defaultLanding === "dashboard" ? "/dashboard" : "/library");
}
