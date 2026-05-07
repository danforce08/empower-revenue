import type { ReactNode } from 'react';

export function SectionCard({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_1px_2px_rgba(10,24,40,0.04)] anim-fade-rise">
      <div className="px-5 sm:px-6 pt-5 pb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-[var(--ink)]">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--muted)] mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="px-5 sm:px-6 pb-5">{children}</div>
    </section>
  );
}
