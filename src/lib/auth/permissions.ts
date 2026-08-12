/**
 * The eight permissions (decisions §4 + `sync` 2026-07 + `script` 2026-08). Code
 * always asks "has `link`?" — never "is Performance?". Roles are bundles of these.
 * `sync`   = may run the manual 28-day Meta re-pull (Full Rebuild stays `master`).
 * `script` = may write scripts and move them through the Script Library pipeline.
 *
 * NOTE: the August 2026 design bundle listed seven permissions and omitted `sync`.
 * It was written against an older snapshot; `sync` is live and load-bearing — it
 * is how Performance refreshes data before a call — so the real count is eight.
 */
export type Permission =
  | "script"
  | "upload"
  | "link"
  | "unlink"
  | "log"
  | "sync"
  | "master"
  | "access";

export type Permissions = Record<Permission, boolean>;

export const NO_PERMISSIONS: Permissions = {
  script: false,
  upload: false,
  link: false,
  unlink: false,
  log: false,
  sync: false,
  master: false,
  access: false,
};

/** Order matters: drives the Access screen's checkbox order and privilege sort. */
export const ALL_PERMISSIONS: Permission[] = [
  "script",
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
