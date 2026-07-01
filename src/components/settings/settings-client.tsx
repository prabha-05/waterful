"use client";

import { useTransition } from "react";
import type { NumberFormat } from "@/lib/format";
import { useSettings } from "@/components/providers/settings-provider";
import { saveSettings } from "@/app/actions/settings";
import { cn } from "@/lib/utils";

export function SettingsClient() {
  const { numberFormat, defaultLanding, setNumberFormat, setDefaultLanding } = useSettings();
  const [, startTransition] = useTransition();

  const persist = (next: { numberFormat?: NumberFormat; defaultLanding?: "library" | "dashboard" }) =>
    startTransition(() =>
      void saveSettings({
        numberFormat: next.numberFormat ?? numberFormat,
        defaultLanding: next.defaultLanding ?? defaultLanding,
      }),
    );

  return (
    <div className="flex max-w-2xl flex-col gap-4 p-6">
      {/* Number format — functional */}
      <Setting
        title="Number format"
        desc="How figures are displayed across the app."
        functional
      >
        <Toggle
          options={[
            { value: "indian", label: "Indian (₹1.2L)" },
            { value: "international", label: "International (₹120k)" },
          ]}
          value={numberFormat}
          onChange={(v) => {
            setNumberFormat(v as NumberFormat); // live
            persist({ numberFormat: v as NumberFormat });
          }}
        />
      </Setting>

      {/* Default landing — functional */}
      <Setting title="Open the app on" desc="Which screen loads first after sign-in." functional>
        <Toggle
          options={[
            { value: "library", label: "Creative Library" },
            { value: "dashboard", label: "Dashboard" },
          ]}
          value={defaultLanding}
          onChange={(v) => {
            setDefaultLanding(v as "library" | "dashboard");
            persist({ defaultLanding: v as "library" | "dashboard" });
          }}
        />
      </Setting>

      {/* Theme — stubbed */}
      <Setting title="Theme" desc="Light / Dark appearance.">
        <Toggle options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} value="light" disabled />
      </Setting>

      {/* Date format — stubbed */}
      <Setting title="Date format" desc="How dates are displayed.">
        <Toggle
          options={[{ value: "dmy", label: "DD-MM-YYYY" }, { value: "ymd", label: "YYYY-MM-DD" }]}
          value="dmy"
          disabled
        />
      </Setting>
    </div>
  );
}

function Setting({
  title,
  desc,
  functional,
  children,
}: {
  title: string;
  desc: string;
  functional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          {title}
          {!functional && <span className="text-[10px] font-medium text-muted">(coming soon)</span>}
        </div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-0.5 rounded-[var(--radius-control)] bg-surface-2 p-0.5", disabled && "opacity-50")}>
      {options.map((o) => (
        <button
          key={o.value}
          disabled={disabled}
          onClick={() => onChange?.(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition",
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-3",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
