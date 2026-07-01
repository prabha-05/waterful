"use client";

import { createContext, useContext, useState } from "react";
import { formatCurrency, type NumberFormat } from "@/lib/format";

type DefaultLanding = "library" | "dashboard";
type SettingsState = {
  numberFormat: NumberFormat;
  defaultLanding: DefaultLanding;
  setNumberFormat: (f: NumberFormat) => void;
  setDefaultLanding: (l: DefaultLanding) => void;
  /** Format currency using the current number-format preference. */
  fmt: (n: number) => string;
};

const SettingsContext = createContext<SettingsState | null>(null);

export function SettingsProvider({
  initial,
  children,
}: {
  initial: { numberFormat: NumberFormat; defaultLanding: DefaultLanding };
  children: React.ReactNode;
}) {
  const [numberFormat, setNumberFormat] = useState<NumberFormat>(initial.numberFormat);
  const [defaultLanding, setDefaultLanding] = useState<DefaultLanding>(initial.defaultLanding);

  const fmt = (n: number) => formatCurrency(n, numberFormat);

  return (
    <SettingsContext.Provider
      value={{ numberFormat, defaultLanding, setNumberFormat, setDefaultLanding, fmt }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

/** Convenience: the currency formatter bound to the current preference. */
export function useFormat(): (n: number) => string {
  return useSettings().fmt;
}
