"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { roles, users } from "@/lib/db/schema";
import { requirePermission } from "@/lib/auth/guard";
import { clearUserCache } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";

export type ActionResult = { ok: boolean; error?: string };

const PERM_FIELD: Record<Permission, "permUpload" | "permLink" | "permUnlink" | "permLog" | "permMaster" | "permAccess"> = {
  upload: "permUpload",
  link: "permLink",
  unlink: "permUnlink",
  log: "permLog",
  master: "permMaster",
  access: "permAccess",
};

/** Count active users whose role grants `access` (the admin guard, decisions §5). */
async function activeAdminCount(): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(and(isNull(users.archivedAt), eq(roles.permAccess, true)));
  return Number(n);
}

async function isActiveAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ access: roles.permAccess, archived: users.archivedAt })
    .from(users)
    .leftJoin(roles, eq(roles.id, users.roleId))
    .where(eq(users.id, userId));
  return !!row && row.archived == null && row.access === true;
}

function done(): ActionResult {
  clearUserCache(); // role/user change → drop cached permission snapshots
  revalidatePath("/access");
  return { ok: true };
}

export async function addUser(name: string, email: string, roleId: string): Promise<ActionResult> {
  try {
    await requirePermission("access");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const n = name.trim();
  const em = email.trim().toLowerCase();
  if (!n || !em) return { ok: false, error: "Name and email are required." };
  if (!em.includes("@")) return { ok: false, error: "Enter a valid Google email." };
  if (!roleId) return { ok: false, error: "Pick a role." };

  try {
    await db.insert(users).values({ name: n, email: em, roleId });
  } catch {
    return { ok: false, error: "A user with that email already exists." };
  }
  return done();
}

export async function setUserRole(userId: string, roleId: string): Promise<ActionResult> {
  try {
    await requirePermission("access");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  // Moving the last active admin off an admin role would lock everyone out.
  const [target] = await db.select({ access: roles.permAccess }).from(roles).where(eq(roles.id, roleId));
  if ((await isActiveAdmin(userId)) && !target?.access && (await activeAdminCount()) <= 1) {
    return { ok: false, error: "Can't change the role of the last active admin." };
  }
  await db.update(users).set({ roleId }).where(eq(users.id, userId));
  return done();
}

export async function deactivateUser(userId: string): Promise<ActionResult> {
  try {
    await requirePermission("access");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if ((await isActiveAdmin(userId)) && (await activeAdminCount()) <= 1) {
    return { ok: false, error: "Can't deactivate the last active admin." };
  }
  // Clears the role mapping (decisions §5): role_id = NULL + archived_at set.
  await db
    .update(users)
    .set({ roleId: null, archivedAt: new Date() })
    .where(eq(users.id, userId));
  return done();
}

export async function restoreUser(userId: string): Promise<ActionResult> {
  try {
    await requirePermission("access");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  // Restore returns the user as Viewer (least-privilege default, decisions §5).
  const [viewer] = await db.select({ id: roles.id }).from(roles).where(eq(roles.label, "Viewer"));
  await db
    .update(users)
    .set({ roleId: viewer?.id ?? null, archivedAt: null })
    .where(eq(users.id, userId));
  return done();
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  try {
    await requirePermission("access");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if ((await isActiveAdmin(userId)) && (await activeAdminCount()) <= 1) {
    return { ok: false, error: "Can't delete the last active admin." };
  }
  try {
    await db.delete(users).where(eq(users.id, userId));
  } catch {
    return {
      ok: false,
      error: "Can't delete — this user has attributed creatives or log entries. Deactivate instead.",
    };
  }
  return done();
}

export async function updateRolePerm(
  roleId: string,
  perm: Permission,
  value: boolean,
): Promise<ActionResult> {
  try {
    await requirePermission("access");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const [role] = await db.select({ isLocked: roles.isLocked }).from(roles).where(eq(roles.id, roleId));
  if (!role) return { ok: false, error: "Role not found." };
  if (role.isLocked) return { ok: false, error: "This is a locked system role and can't be edited." };

  await db.update(roles).set({ [PERM_FIELD[perm]]: value }).where(eq(roles.id, roleId));
  clearUserCache(); // permission change on a role affects everyone with it
  revalidatePath("/access");
  return { ok: true };
}

export async function addRole(label: string): Promise<ActionResult> {
  try {
    await requirePermission("access");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const l = label.trim();
  if (!l) return { ok: false, error: "Enter a role name." };
  await db.insert(roles).values({ label: l, isSystem: false, isLocked: false });
  return done();
}

export async function deleteRole(roleId: string): Promise<ActionResult> {
  try {
    await requirePermission("access");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const [role] = await db
    .select({ isSystem: roles.isSystem, n: sql<number>`(select count(*)::int from users u where u.role_id = ${roles.id})` })
    .from(roles)
    .where(eq(roles.id, roleId));
  if (!role) return { ok: false, error: "Role not found." };
  if (role.isSystem) return { ok: false, error: "Built-in roles can't be deleted." };
  if (Number(role.n) > 0) return { ok: false, error: "Role is in use — reassign its users first." };

  await db.delete(roles).where(eq(roles.id, roleId));
  return done();
}
