import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * No-access gate (HANDOVER §2 / decisions §3). Shown when a Google-authenticated
 * user has no valid, non-archived role. Offers "Switch account".
 */
export default async function NoAccessPage() {
  const user = await getCurrentUser();

  // Not authenticated at all → login. Has a valid role → into the app.
  if (!user) redirect("/login");
  if (user.hasValidRole) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-amber-bg text-amber">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 8v5m0 3h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.42 0Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-ink">No access</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-3">
          This account ({user.email}) has no role assigned. Ask an admin to map a
          role first.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button
            type="submit"
            className="h-10 w-full rounded-[var(--radius-control)] border border-line bg-surface px-4 font-medium text-ink transition hover:bg-surface-2"
          >
            Switch account
          </button>
        </form>
      </div>
    </main>
  );
}
