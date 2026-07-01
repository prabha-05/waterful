"use server";

import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/guard";
import {
  DEFAULT_SETTINGS,
  SETTINGS_COOKIE,
  type Settings,
} from "@/lib/settings";

/** Persist per-user settings to a cookie (number format, landing, theme, date format). */
export async function saveSettings(settings: Settings): Promise<{ ok: boolean }> {
  await requireUser();
  const value = JSON.stringify({
    numberFormat: settings.numberFormat === "international" ? "international" : "indian",
    defaultLanding: settings.defaultLanding === "dashboard" ? "dashboard" : "library",
    theme: settings.theme === "dark" ? "dark" : "light",
    dateFormat: settings.dateFormat === "ymd" ? "ymd" : "dmy",
  } satisfies Settings);

  const store = await cookies();
  store.set(SETTINGS_COOKIE, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
  });
  return { ok: true };
}

export { DEFAULT_SETTINGS };
