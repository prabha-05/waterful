import type { AdFrameData } from "@/lib/data/creatives";

/** Recommendation banner — deterministic rules ported from the prototype (G3, §7). NOT ML. */
export function recommendation(data: AdFrameData): {
  tone: "neutral" | "positive" | "warn" | "paused";
  text: string;
} {
  // Meta status takes priority.
  if (data.status === "paused" || data.status === "archived") {
    return { tone: "paused", text: "Paused in Meta — review the log below." };
  }

  const last7 = data.daily.slice(-7);
  const prior7 = data.daily.slice(-14, -7);
  const sum = (rows: typeof last7, k: "spend" | "revenue") =>
    rows.reduce((s, r) => s + r[k], 0);

  const roasNow = sum(last7, "spend") > 0 ? sum(last7, "revenue") / sum(last7, "spend") : 0;
  const roasPrev = sum(prior7, "spend") > 0 ? sum(prior7, "revenue") / sum(prior7, "spend") : 0;
  const spendNow = sum(last7, "spend");
  const spendPrev = sum(prior7, "spend");

  const x = roasNow.toFixed(2);
  const roasTrend = roasNow - roasPrev;
  const spendRising = spendNow >= spendPrev * 0.95;

  if (roasNow < 1) {
    return { tone: "warn", text: `ROAS ${x}× and weak — consider trimming budget or pausing.` };
  }
  if (roasTrend > roasPrev * 0.05) {
    return {
      tone: "positive",
      text: `ROAS ${x}× (rising over 7 days) at ${spendRising ? "rising" : "steady"} spend — a candidate to increase budget.`,
    };
  }
  if (roasTrend < -roasPrev * 0.05) {
    return { tone: "warn", text: `ROAS ${x}× and falling — consider trimming budget or pausing.` };
  }
  return {
    tone: "neutral",
    text: `Holding ~${x}× ROAS (steady over 7 days) — monitor a little longer before acting.`,
  };
}

/** Lifetime derived metrics (computed on read, never stored — §6). */
export function lifetimeDerived(life: AdFrameData["lifetime"]) {
  const { spend, revenue, impressions, clicks, conversions, reach, frequency } = life;
  return {
    roas: spend > 0 ? revenue / spend : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpa: conversions > 0 ? spend / conversions : 0,
    reach,
    frequency,
  };
}
