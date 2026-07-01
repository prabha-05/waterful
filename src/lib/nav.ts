import type { Permission, Permissions } from "@/lib/auth/permissions";

export type NavItem = {
  href: string;
  label: string;
  /** Visible to any valid user when omitted; otherwise OR of the listed perms. */
  requires?: Permission[];
  /** Awaiting shows a count badge (README §2/§8). */
  badge?: "awaiting";
};

/**
 * Sidebar nav (README §2 + HANDOVER). Visibility is permission-gated (cosmetic;
 * the security boundary is app-layer + RLS — decisions §4). A Viewer (all perms
 * off) sees only Library, Dashboard, and Settings.
 */
export const NAV: NavItem[] = [
  { href: "/library", label: "Creative Library" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/awaiting", label: "Awaiting", requires: ["upload", "link"], badge: "awaiting" },
  { href: "/master-data", label: "Master Data", requires: ["master"] },
  { href: "/access", label: "Access", requires: ["access"] },
  { href: "/meta-sync", label: "Meta Sync", requires: ["master"] },
  { href: "/settings", label: "Settings" },
];

export function visibleNav(perms: Permissions): NavItem[] {
  return NAV.filter(
    (item) => !item.requires || item.requires.some((p) => perms[p]),
  );
}
