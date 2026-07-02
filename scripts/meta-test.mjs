/**
 * Meta connection test. Validates META_ACCESS_TOKEN against a real Ad ID and
 * prints a summary of what the real provider will pull — run this after adding
 * your Meta credentials to .env.local, before relying on the link flow.
 *
 * Usage:  node --env-file=.env.local scripts/meta-test.mjs <AD_ID>
 */
const VERSION = process.env.META_GRAPH_VERSION || "v21.0";
const BASE = `https://graph.facebook.com/${VERSION}`;
const TOKEN = process.env.META_ACCESS_TOKEN;
const adId = process.argv[2];

if (!TOKEN) {
  console.error("❌ META_ACCESS_TOKEN is not set in .env.local");
  process.exit(1);
}
if (!adId) {
  console.error("Usage: node --env-file=.env.local scripts/meta-test.mjs <AD_ID>");
  process.exit(1);
}

async function graph(path, params) {
  const url = new URL(`${BASE}/${path}`);
  url.searchParams.set("access_token", TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? res.statusText);
  }
  return json;
}

try {
  console.log(`Testing ad ${adId} on Graph ${VERSION}…\n`);

  const ad = await graph(adId, {
    fields: "id,effective_status,campaign{name,objective},adset{name,optimization_goal}",
  });
  console.log("✅ Ad node:");
  console.log("   status   :", ad.effective_status);
  console.log("   campaign :", ad.campaign?.name, `(${ad.campaign?.objective})`);
  console.log("   ad set   :", ad.adset?.name);

  const life = await graph(`${adId}/insights`, {
    fields: "spend,impressions,reach,frequency,clicks,actions,action_values",
    date_preset: "maximum",
  });
  const row = life.data?.[0] ?? {};
  console.log("\n✅ Lifetime insights:");
  console.log("   spend       :", row.spend ?? "0");
  console.log("   impressions :", row.impressions ?? "0");
  console.log("   reach       :", row.reach ?? "0", "(de-duplicated)");
  console.log("   frequency   :", row.frequency ?? "0");
  console.log("   clicks      :", row.clicks ?? "0");

  console.log("\n🎉 Meta connection works — the real provider is ready.");
} catch (e) {
  console.error("\n❌ Meta API error:", e.message);
  console.error("Check: token has ads_read, the ad belongs to an account you manage, and the Ad ID is correct.");
  process.exit(2);
}
