/** Header band (68px) — screen title + subtitle, optional context action. README §2. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-line bg-surface px-7">
      <div className="leading-tight">
        <h1 className="text-base font-bold text-ink">{title}</h1>
        {subtitle && <p className="text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
