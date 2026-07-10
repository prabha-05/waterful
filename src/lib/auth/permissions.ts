/**
 * The seven permissions (decisions §4 + `sync` added 2026-07). Code always asks
 * "has `link`?" — never "is Performance?". Roles are bundles of these booleans.
 * `sync` = may run the manual 28-day Meta re-pull (Full Rebuild stays `master`).
 */
export type Permission =
  | "upload"
  | "link"
  | "unlink"
  | "log"
  | "sync"
  | "master"
  | "access";

export type Permissions = Record<Permission, boolean>;

export const NO_PERMISSIONS: Permissions = {
  upload: false,
  link: false,
  unlink: false,
  log: false,
  sync: false,
  master: false,
  access: false,
};

export const ALL_PERMISSIONS: Permission[] = [
  "upload",
  "link",
  "unlink",
  "log",
  "sync",
  "master",
  "access",
];

export function can(perms: Permissions, perm: Permission): boolean {
  return perms[perm] === true;
}
