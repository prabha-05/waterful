import { getCurrentUser, type AppUser } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";

/**
 * App-layer enforcement (decisions §4, the PRIMARY check). Every mutating Server
 * Action calls this before acting. Throws on failure — the action surfaces it.
 */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user || !user.hasValidRole) {
    throw new Error("Not authorized — no valid role.");
  }
  return user;
}

export async function requirePermission(perm: Permission): Promise<AppUser> {
  const user = await requireUser();
  if (!user.permissions[perm]) {
    throw new Error(`Not authorized — missing "${perm}" permission.`);
  }
  return user;
}
