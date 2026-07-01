import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { roles, users } from "@/lib/db/schema";
import {
  NO_PERMISSIONS,
  type Permissions,
} from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: { id: string; label: string } | null;
  permissions: Permissions;
  /** True only when the user has a non-archived role mapping (authorization). */
  hasValidRole: boolean;
};

/**
 * Resolve the current request's app user from the Supabase session.
 *
 * Identity ≠ authorization (decisions §3): Google proves WHO; a valid,
 * non-archived role mapping proves WHETHER you're in and WHAT you can do.
 * Returns null when there is no authenticated Supabase user at all.
 */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createSupabaseServerClient();

  // Resolve the identity from the JWT locally (getClaims verifies the token without
  // a network round-trip — the proxy already refreshed the session). Fall back to
  // getUser() only if claims aren't available.
  let email: string | undefined;
  let sub: string | undefined;
  let fullName: string | undefined;

  try {
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims as Record<string, unknown> | undefined;
    if (claims?.email) {
      email = String(claims.email).toLowerCase();
      sub = typeof claims.sub === "string" ? claims.sub : undefined;
      const meta = claims.user_metadata as Record<string, unknown> | undefined;
      fullName = typeof meta?.full_name === "string" ? meta.full_name : undefined;
    }
  } catch {
    // fall through to getUser
  }

  if (!email) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email) {
      email = user.email.toLowerCase();
      sub =
        (user.user_metadata?.sub as string | undefined) ??
        (user.user_metadata?.provider_id as string | undefined) ??
        user.id;
      fullName = user.user_metadata?.full_name as string | undefined;
    }
  }

  if (!email) return null;

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      archivedAt: users.archivedAt,
      googleSub: users.googleSub,
      roleId: roles.id,
      roleLabel: roles.label,
      roleArchivedAt: roles.archivedAt,
      permUpload: roles.permUpload,
      permLink: roles.permLink,
      permUnlink: roles.permUnlink,
      permLog: roles.permLog,
      permMaster: roles.permMaster,
      permAccess: roles.permAccess,
    })
    .from(users)
    .leftJoin(roles, eq(roles.id, users.roleId))
    .where(eq(users.email, email))
    .limit(1);

  // Authenticated with Google but never admitted by an Admin — no row.
  if (!row) {
    return {
      id: "",
      name: fullName ?? email,
      email,
      role: null,
      permissions: NO_PERMISSIONS,
      hasValidRole: false,
    };
  }

  // Capture Google's stable identifier on first sight (decisions §3, best-effort).
  if (!row.googleSub && sub) {
    await db.update(users).set({ googleSub: sub }).where(eq(users.id, row.id));
  }

  const hasValidRole =
    row.roleId != null &&
    row.archivedAt == null &&
    row.roleArchivedAt == null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: hasValidRole ? { id: row.roleId!, label: row.roleLabel! } : null,
    permissions: hasValidRole
      ? {
          upload: row.permUpload ?? false,
          link: row.permLink ?? false,
          unlink: row.permUnlink ?? false,
          log: row.permLog ?? false,
          master: row.permMaster ?? false,
          access: row.permAccess ?? false,
        }
      : NO_PERMISSIONS,
    hasValidRole,
  };
});
