/**
 * The six permissions (decisions §4). Code always asks "has `link`?" — never
 * "is Performance?". Roles are bundles of these booleans.
 */
export type Permission =
  | "upload"
  | "link"
  | "unlink"
  | "log"
  | "master"
  | "access";

export type Permissions = Record<Permission, boolean>;

export const NO_PERMISSIONS: Permissions = {
  upload: false,
  link: false,
  unlink: false,
  log: false,
  master: false,
  access: false,
};

export const ALL_PERMISSIONS: Permission[] = [
  "upload",
  "link",
  "unlink",
  "log",
  "master",
  "access",
];

export function can(perms: Permissions, perm: Permission): boolean {
  return perms[perm] === true;
}
