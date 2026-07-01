/**
 * Number formatting (README Settings). Indian (₹1.2L) vs International (₹120k).
 * Functional per design; the per-user toggle is wired in Phase 4 — default Indian.
 */
export type NumberFormat = "indian" | "international";

export function formatCurrency(
  n: number,
  mode: NumberFormat = "indian",
): string {
  if (!isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const trim = (x: number) => {
    const s = x.toFixed(x % 1 === 0 ? 0 : 1);
    return s.replace(/\.0$/, "");
  };

  if (mode === "indian") {
    if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
    if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
    if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}k`;
    return `${sign}₹${trim(a)}`;
  }
  // international
  if (a >= 1e9) return `${sign}₹${trim(a / 1e9)}B`;
  if (a >= 1e6) return `${sign}₹${trim(a / 1e6)}M`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}k`;
  return `${sign}₹${trim(a)}`;
}

export function formatRoas(roas: number): string {
  if (!isFinite(roas)) return "—";
  return `${roas.toFixed(2)}×`;
}

export function formatInt(n: number): string {
  return new Intl.NumberFormat("en-IN").format(Math.round(n));
}

export type DateFormatMode = "dmy" | "ymd";

/** Date display honoring the user's format setting (DD-MM-YYYY vs YYYY-MM-DD). */
export function formatDate(d: Date | string, mode: DateFormatMode = "dmy"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return mode === "ymd" ? `${yyyy}-${mm}-${dd}` : `${dd}-${mm}-${yyyy}`;
}
