import type { Permission, Permissions } from "@/lib/auth/permissions";

export type NavItem = {
  href: string;
  label: string;
  /** Visible to any valid user when omitted; otherwise OR of the listed perms. */
  requires?: Permission[];
  /** Awaiting shows a count badge (README §2/§8). */
  badge?: "awaiting" | "scripts";
  /** lucide-react icon name, resolved in the Sidebar. */
  icon: NavIcon;
};

export type NavIcon =
  | "script"
  | "library"
  | "dashboard"
  | "reports"
  | "awaiting"
  | "master"
  | "access"
  | "sync"
  | "settings";

/**
 * Sidebar nav (README §2 + HANDOVER). Visibility is permission-gated (cosmetic;
 * the security boundary is app-layer + RLS — decisions §4). A Viewer (all perms
 * off) sees only Library, Dashboard, and Settings.
 */
export const NAV: NavItem[] = [
  {
    href: "/scripts",
    label: "Script Library",
    requires: ["script"],
    badge: "scripts",
    icon: "script",
  },
  { href: "/library", label: "Creative Library", icon: "library" },
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/reports", label: "Reports", icon: "reports" },
  {
    href: "/awaiting",
    label: "Awaiting",
    requires: ["upload", "link"],
    badge: "awaiting",
    icon: "awaiting",
  },
  {
    href: "/master-data",
    label: "Master Data",
    requires: ["master"],
    icon: "master",
  },
  { href: "/access", label: "Access", requires: ["access"], icon: "access" },
  { href: "/meta-sync", label: "Meta Sync", requires: ["sync"], icon: "sync" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function visibleNav(perms: Permissions): NavItem[] {
  return NAV.filter(
    (item) => !item.requires || item.requires.some((p) => perms[p]),
  );
}
