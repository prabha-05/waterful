import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { roles, users } from "@/lib/db/schema";
import { ALL_PERMISSIONS, type Permission } from "@/lib/auth/permissions";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  archived: boolean;
  roleId: string | null;
  roleLabel: string | null;
  isAdmin: boolean; // role has `access`
};

export type RoleRow = {
  id: string;
  label: string;
  isSystem: boolean;
  isLocked: boolean;
  userCount: number;
  perms: Record<Permission, boolean>;
  permCount: number;
};

export async function getUsers(): Promise<UserRow[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      archivedAt: users.archivedAt,
      roleId: users.roleId,
      roleLabel: roles.label,
      permAccess: roles.permAccess,
    })
    .from(users)
    .leftJoin(roles, eq(roles.id, users.roleId))
    .orderBy(asc(users.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    archived: r.archivedAt != null,
    roleId: r.roleId,
    roleLabel: r.roleLabel,
    isAdmin: r.permAccess === true,
  }));
}

export async function getRoles(): Promise<RoleRow[]> {
  const rows = await db
    .select({
      id: roles.id,
      label: roles.label,
      isSystem: roles.isSystem,
      isLocked: roles.isLocked,
      permUpload: roles.permUpload,
      permLink: roles.permLink,
      permUnlink: roles.permUnlink,
      permLog: roles.permLog,
      permMaster: roles.permMaster,
      permAccess: roles.permAccess,
      userCount: sql<number>`(select count(*)::int from users u where u.role_id = ${roles.id} and u.archived_at is null)`,
    })
    .from(roles)
    .where(sql`${roles.archivedAt} is null`);

  const result: RoleRow[] = rows.map((r) => {
    const perms: Record<Permission, boolean> = {
      upload: r.permUpload,
      link: r.permLink,
      unlink: r.permUnlink,
      log: r.permLog,
      master: r.permMaster,
      access: r.permAccess,
    };
    return {
      id: r.id,
      label: r.label,
      isSystem: r.isSystem,
      isLocked: r.isLocked,
      userCount: Number(r.userCount),
      perms,
      permCount: ALL_PERMISSIONS.filter((p) => perms[p]).length,
    };
  });

  // Order by privilege (permission count) desc, then label.
  return result.sort((a, b) => b.permCount - a.permCount || a.label.localeCompare(b.label));
}
