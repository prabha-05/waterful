"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { formatCurrency, formatDate, type NumberFormat } from "@/lib/format";

type DefaultLanding = "library" | "dashboard";
type Theme = "light" | "dark";
type DateFormat = "dmy" | "ymd";

type SettingsState = {
  numberFormat: NumberFormat;
  defaultLanding: DefaultLanding;
  theme: Theme;
  dateFormat: DateFormat;
  setNumberFormat: (f: NumberFormat) => void;
  setDefaultLanding: (l: DefaultLanding) => void;
  setTheme: (t: Theme) => void;
  setDateFormat: (d: DateFormat) => void;
  /** Format currency using the current number-format preference. */
  fmt: (n: number) => string;
  /** Format a date using the current date-format preference. */
  fmtDate: (d: Date | string) => string;
};

const SettingsContext = createContext<SettingsState | null>(null);

export function SettingsProvider({
  initial,
  children,
}: {
  initial: {
    numberFormat: NumberFormat;
    defaultLanding: DefaultLanding;
    theme: Theme;
    dateFormat: DateFormat;
  };
  children: React.ReactNode;
}) {
  const [numberFormat, setNumberFormat] = useState<NumberFormat>(initial.numberFormat);
  const [defaultLanding, setDefaultLanding] = useState<DefaultLanding>(initial.defaultLanding);
  const [theme, setTheme] = useState<Theme>(initial.theme);
  const [dateFormat, setDateFormat] = useState<DateFormat>(initial.dateFormat);

  // Apply theme to the <html> element so the CSS variable overrides kick in.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const fmt = (n: number) => formatCurrency(n, numberFormat);
  const fmtDate = (d: Date | string) => formatDate(d, dateFormat);

  return (
    <SettingsContext.Provider
      value={{
        numberFormat,
        defaultLanding,
        theme,
        dateFormat,
        setNumberFormat,
        setDefaultLanding,
        setTheme,
        setDateFormat,
        fmt,
        fmtDate,
      }}
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

/** Convenience: the date formatter bound to the current preference. */
export function useDate(): (d: Date | string) => string {
  return useSettings().fmtDate;
}
