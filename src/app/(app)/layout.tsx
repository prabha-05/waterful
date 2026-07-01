import { redirect } from "next/navigation";
import { Sidebar } from "@/components/app-shell/sidebar";
import { getCurrentUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { SettingsProvider } from "@/components/providers/settings-provider";

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
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);

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
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </SettingsProvider>
  );
}
