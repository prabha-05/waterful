"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { BAND_CLASSES, scoreBand } from "@/lib/score";
import { STATUS_CLASSES, STATUS_LABEL, type CreativeStatus } from "@/lib/status";

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const variants = {
    primary: "bg-brand text-white hover:bg-brand-deep",
    secondary: "border border-line bg-surface text-ink hover:bg-surface-2",
    ghost: "text-ink-2 hover:bg-surface-2",
    danger: "text-red hover:bg-red-bg",
  };
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] px-3.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Chip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-0.5 text-[11px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: CreativeStatus }) {
  return (
    <Chip className={STATUS_CLASSES[status]}>{STATUS_LABEL[status]}</Chip>
  );
}

export function ScorePill({
  score,
  className,
}: {
  /** null = unproven (no spend / not linked yet) → renders a neutral “—”. */
  score: number | null;
  className?: string;
}) {
  if (score == null) {
    return (
      <span
        title="Unscored — no spend yet"
        className={cn(
          "inline-flex items-center justify-center rounded-md bg-surface-2 px-2 py-0.5 font-mono text-sm font-semibold text-muted",
          className,
        )}
      >
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md px-2 py-0.5 font-mono text-sm font-semibold",
        BAND_CLASSES[scoreBand(score)],
        className,
      )}
    >
      {score}
    </span>
  );
}

/** Centered modal with backdrop. */
export function Modal({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[rgba(20,40,60,0.35)] animate-[fadeIn_.15s_ease]"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[0_24px_60px_rgba(20,40,60,0.25)]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Right-side drawer. */
export function Drawer({
  open,
  onClose,
  children,
  width = 600,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-[rgba(20,40,60,0.35)] animate-[fadeIn_.15s_ease]"
        onClick={onClose}
      />
      <div
        className="absolute right-0 top-0 flex h-full flex-col bg-surface shadow-[0_0_60px_rgba(20,40,60,0.2)] animate-[slideIn_.2s_ease]"
        style={{ width, maxWidth: "100%" }}
      >
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-2">
        {label}
        {required && <span className="text-red"> *</span>}
      </span>
      {children}
    </label>
  );
}

const controlClass =
  "h-10 w-full rounded-[var(--radius-control)] border border-[var(--control-border)] bg-surface px-3 text-sm text-ink outline-none focus:border-brand disabled:bg-surface-2 disabled:text-muted";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={controlClass} {...props} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(controlClass, "h-auto min-h-20 py-2 leading-relaxed")}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClass, className)} {...props} />;
}
