import "server-only";
import { cookies } from "next/headers";
import type { NumberFormat } from "@/lib/format";

export type DefaultLanding = "library" | "dashboard";
export type Settings = {
  numberFormat: NumberFormat;
  defaultLanding: DefaultLanding;
};

export const SETTINGS_COOKIE = "waterful_settings";
export const DEFAULT_SETTINGS: Settings = {
  numberFormat: "indian",
  defaultLanding: "library",
};

export function parseSettings(raw: string | undefined): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const v = JSON.parse(raw) as Partial<Settings>;
    return {
      numberFormat: v.numberFormat === "international" ? "international" : "indian",
      defaultLanding: v.defaultLanding === "dashboard" ? "dashboard" : "library",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Read per-user settings from the cookie (server-side). */
export async function getSettings(): Promise<Settings> {
  const store = await cookies();
  return parseSettings(store.get(SETTINGS_COOKIE)?.value);
}
