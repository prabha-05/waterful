import { redirect } from "next/navigation";
import { Sidebar } from "@/components/app-shell/sidebar";
import { getCurrentUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { SettingsProvider } from "@/components/providers/settings-provider";
import { getScriptsInReviewCount } from "@/lib/data/scripts";
import { getAwaitingCount } from "@/lib/data/creatives";

/**
 * Authenticated app shell. Enforces authorization server-side on every request
 * (decisions §3): no session → /login; authenticated but no valid role → /no-access.
 * This is the in-session gate; the proxy handles the unauthenticated redirect.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // All four together. Gating the badge counts on permissions would save a
  // Viewer two cheap counts but cost EVERY other page load a second sequential
  // round trip to Supabase, which is the more expensive trade — this layout
  // runs on every navigation.
  const [user, settings, awaitingCount, scriptCount] = await Promise.all([
    getCurrentUser(),
    getSettings(),
    getAwaitingCount(),
    getScriptsInReviewCount(),
  ]);

  if (!user) redirect("/login");
  if (!user.hasValidRole) redirect("/no-access");

  return (
    <SettingsProvider
      initial={{
        numberFormat: settings.numberFormat,
        defaultLanding: settings.defaultLanding,
        theme: settings.theme,
        dateFormat: settings.dateFormat,
      }}
    >
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          user={{
            name: user.name,
            roleLabel: user.role?.label ?? null,
            permissions: user.permissions,
          }}
          awaitingCount={awaitingCount}
          scriptCount={scriptCount}
        />
        {/* pt-14 on mobile clears the fixed hamburger top bar; none on desktop. */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden pt-14 md:pt-0">
          {children}
        </div>
      </div>
    </SettingsProvider>
  );
}
