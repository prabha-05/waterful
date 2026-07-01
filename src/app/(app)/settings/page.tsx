import { PageHeader } from "@/components/app-shell/page-header";
import { SettingsClient } from "@/components/settings/settings-client";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Number format & default landing (functional); theme & date format (stubbed)"
      />
      <div className="flex-1 overflow-auto">
        <SettingsClient />
      </div>
    </>
  );
}
