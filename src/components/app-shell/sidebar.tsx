"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import type { Permissions } from "@/lib/auth/permissions";
import { visibleNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

type Props = {
  user: { name: string; roleLabel: string | null; permissions: Permissions };
  awaitingCount?: number;
};

/**
 * Left sidebar (248px) with permission-gated nav — README §2.
 * Desktop: static 248px column. Mobile (<md): a top bar with a hamburger that
 * slides the sidebar in as an overlay drawer.
 */
export function Sidebar({ user, awaitingCount = 0 }: Props) {
  const pathname = usePathname();
  const items = visibleNav(user.permissions);
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      {/* Mobile top bar (hamburger + logo) — hidden on desktop. */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="text-ink-2 hover:text-ink"
        >
          <Menu className="h-6 w-6" />
        </button>
        <Image src="/waterful-zero-logo.jpeg" alt="WaterfulZERO" width={26} height={26} className="rounded-md" />
        <span className="text-sm font-bold text-ink">WaterfulZERO</span>
      </div>

      {/* Backdrop when the drawer is open (mobile only). */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-[248px] flex-col border-r border-line bg-surface transition-transform duration-200",
          "md:static md:z-auto md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Close button — mobile only. */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="absolute right-3 top-4 text-ink-3 hover:text-ink md:hidden"
        >
          <X className="h-5 w-5" />
        </button>
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
    </>
  );
}
