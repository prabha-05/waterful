"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RoleRow, UserRow } from "@/lib/data/access";
import { ALL_PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import {
  addRole,
  addUser,
  deactivateUser,
  deleteRole,
  deleteUser,
  restoreUser,
  setUserRole,
  updateRolePerm,
} from "@/app/actions/access";
import { Button, Chip, Input, Select } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const PERM_LABEL: Record<Permission, string> = {
  upload: "Upload",
  link: "Link",
  unlink: "Unlink",
  log: "Log",
  master: "Master Data",
  access: "Access",
};

export function AccessClient({ users, roles }: { users: UserRow[]; roles: RoleRow[] }) {
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-1 self-start rounded-[var(--radius-control)] bg-surface-2 p-0.5 text-sm font-medium">
        {(["users", "roles"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-4 py-1.5 capitalize transition",
              tab === t ? "bg-surface text-ink shadow-sm" : "text-ink-3",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-[var(--radius-control)] bg-red-bg px-3 py-2 text-sm text-red">{error}</div>
      )}

      {tab === "users" ? (
        <UsersTab users={users} roles={roles} run={run} pending={pending} />
      ) : (
        <RolesTab roles={roles} run={run} pending={pending} />
      )}
    </div>
  );
}

function UsersTab({
  users,
  roles,
  run,
  pending,
}: {
  users: UserRow[];
  roles: RoleRow[];
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  pending: boolean;
}) {
  const active = users.filter((u) => !u.archived);
  const deactivated = users.filter((u) => u.archived);
  const groups = roles
    .map((r) => ({ role: r, members: active.filter((u) => u.roleId === r.id) }))
    .filter((g) => g.members.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <AddUserForm roles={roles} run={run} pending={pending} />

      {groups.map(({ role, members }) => (
        <section key={role.id}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            {role.label}
            <span className="rounded-full bg-surface-2 px-2 text-xs text-muted">{members.length}</span>
          </h3>
          <div className="flex flex-col divide-y divide-line-2 rounded-[var(--radius-card)] border border-line bg-surface">
            {members.map((u) => (
              <UserRowView key={u.id} user={u} roles={roles} run={run} pending={pending} />
            ))}
          </div>
        </section>
      ))}

      {deactivated.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
            Deactivated
            <span className="rounded-full bg-surface-2 px-2 text-xs text-muted">{deactivated.length}</span>
          </h3>
          <div className="flex flex-col divide-y divide-line-2 rounded-[var(--radius-card)] border border-line bg-surface">
            {deactivated.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-3">{u.name}</div>
                  <div className="truncate text-xs text-muted">{u.email}</div>
                </div>
                <Chip className="bg-line-2 text-muted">No role</Chip>
                <Button variant="secondary" disabled={pending} onClick={() => run(() => restoreUser(u.id))}>
                  Restore
                </Button>
                <Button variant="danger" disabled={pending} onClick={() => run(() => deleteUser(u.id))}>
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function UserRowView({
  user,
  roles,
  run,
  pending,
}: {
  user: UserRow;
  roles: RoleRow[];
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  pending: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-ink-2">
        {user.name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{user.name}</div>
        <div className="truncate text-xs text-muted">{user.email}</div>
      </div>
      <Select
        value={user.roleId ?? ""}
        disabled={pending}
        onChange={(e) => run(() => setUserRole(user.id, e.target.value))}
        className="h-9 w-40"
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>{r.label}</option>
        ))}
      </Select>
      <Button variant="ghost" disabled={pending} onClick={() => run(() => deactivateUser(user.id))}>
        Deactivate
      </Button>
    </div>
  );
}

function AddUserForm({
  roles,
  run,
  pending,
}: {
  roles: RoleRow[];
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-3">
      <div className="flex-1">
        <div className="mb-1 text-[11px] font-medium text-muted">Name</div>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
      </div>
      <div className="flex-1">
        <div className="mb-1 text-[11px] font-medium text-muted">Google email</div>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" />
      </div>
      <div>
        <div className="mb-1 text-[11px] font-medium text-muted">Role</div>
        <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="w-40">
          {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </Select>
      </div>
      <Button
        disabled={pending || !name.trim() || !email.trim()}
        onClick={() => run(async () => { const r = await addUser(name, email, roleId); if (r.ok) { setName(""); setEmail(""); } return r; })}
      >
        Add user
      </Button>
    </div>
  );
}

function RolesTab({
  roles,
  run,
  pending,
}: {
  roles: RoleRow[];
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
  pending: boolean;
}) {
  const [newRole, setNewRole] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-3">
        <div className="flex-1">
          <div className="mb-1 text-[11px] font-medium text-muted">New role name</div>
          <Input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="e.g. Analyst" />
        </div>
        <Button
          disabled={pending || !newRole.trim()}
          onClick={() => run(async () => { const r = await addRole(newRole); if (r.ok) setNewRole(""); return r; })}
        >
          Add role
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {roles.map((role) => (
          <div key={role.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">{role.label}</h3>
              {role.isSystem && <Chip className="bg-surface-2 text-muted">Built-in</Chip>}
              {role.isLocked && <span className="text-xs text-muted">🔒 locked</span>}
              <span className="ml-auto text-xs text-muted">{role.userCount} user{role.userCount === 1 ? "" : "s"}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_PERMISSIONS.map((p) => (
                <label
                  key={p}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1 text-xs",
                    role.isLocked ? "text-muted" : "text-ink-2",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={role.perms[p]}
                    disabled={role.isLocked || pending}
                    onChange={(e) => run(() => updateRolePerm(role.id, p, e.target.checked))}
                  />
                  {PERM_LABEL[p]}
                </label>
              ))}
            </div>
            {!role.isSystem && role.userCount === 0 && (
              <button
                disabled={pending}
                onClick={() => run(() => deleteRole(role.id))}
                className="mt-3 text-xs font-medium text-red hover:underline"
              >
                Delete role
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
