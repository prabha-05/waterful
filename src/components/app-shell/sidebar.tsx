"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import type { Permissions } from "@/lib/auth/permissions";
import { visibleNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

type Props = {
  user: { name: string; roleLabel: string | null; permissions: Permissions };
  awaitingCount?: number;
};

/** Left sidebar (248px) with permission-gated nav — README §2. */
export function Sidebar({ user, awaitingCount = 0 }: Props) {
  const pathname = usePathname();
  const items = visibleNav(user.permissions);

  return (
    <aside className="flex h-screen w-[248px] flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Image
          src="/waterful-zero-logo.jpeg"
          alt="WaterfulZERO"
          width={32}
          height={32}
          className="rounded-lg"
        />
        <div className="leading-tight">
          <div className="text-sm font-bold text-ink">WaterfulZERO</div>
          <div className="text-[11px] text-muted">Ad Performance OS</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-brand-chip text-brand-deep"
                  : "text-ink-2 hover:bg-surface-2",
              )}
            >
              <span>{item.label}</span>
              {item.badge === "awaiting" && awaitingCount > 0 && (
                <span className="rounded-full bg-awaiting px-1.5 py-0.5 text-[11px] font-semibold text-white">
                  {awaitingCount}
                </span>
              )}
            </Link>
          );
        })}

        {/* Log out — red, directly below Settings (README §2 + prototype). */}
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm font-medium text-red transition hover:bg-red-bg"
          >
            <LogOut className="h-[17px] w-[17px]" />
            <span>Log out</span>
          </button>
        </form>
      </nav>

      {/* Bottom: signed-in user avatar + name + role — non-interactive. */}
      <div className="border-t border-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-ink-2">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-medium text-ink">
              {user.name}
            </div>
            <div className="truncate text-[11px] text-muted">
              {user.roleLabel ?? "No role"}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
