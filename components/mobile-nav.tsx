'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

// Mirror SiteNav's primary tabs so the two stay in sync. Quick Enter
// intentionally lives inline on Weekly Review, so it's not here either.
const PRIMARY_TABS = [
  { href: '/',                  label: 'Weekly Review' },
  { href: '/dashboard',         label: 'Dashboard' },
  { href: '/sales-context',     label: 'Sales Context' },
  { href: '/pipeline-reviewer', label: 'Pipeline Reviewer' },
  { href: '/forecast',          label: 'Forecast' },
];

const ACCOUNT_LINKS = [
  { href: '/upload',   label: 'Upload Jobflo export' },
  { href: '/settings', label: 'Settings' },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  // Close the drawer when the route changes. Derived from a render-time
  // comparison rather than useEffect, per the "you might not need an
  // effect" guidance — calling setState during render with a current-
  // state derivative is the idiomatic way to react to prop changes.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (open) setOpen(false);
  }

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  function signOut() {
    start(async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      setOpen(false);
      router.push('/login');
      router.refresh();
    });
  }

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className="p-2 -mr-2 text-[var(--ink)] focus:outline-none"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
          {open ? (
            <>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </>
          ) : (
            <>
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="13" x2="20" y2="13" />
              <line x1="4" y1="19" x2="20" y2="19" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 top-16 bg-[rgba(10,24,40,0.4)] backdrop-blur-sm z-40 anim-fade-in"
            aria-hidden
          />
          <div className="fixed inset-x-0 top-16 z-50 bg-[var(--surface)] border-b border-[var(--border)] shadow-[0_24px_48px_-16px_rgba(10,24,40,0.25)] anim-fade-rise">
            <nav className="flex flex-col py-2">
              <SectionLabel>Views</SectionLabel>
              {PRIMARY_TABS.map((l) => (
                <NavItem key={l.href} href={l.href} active={pathname === l.href || (l.href !== '/' && pathname.startsWith(`${l.href}/`))}>
                  {l.label}
                </NavItem>
              ))}
              <SectionLabel>Account</SectionLabel>
              {ACCOUNT_LINKS.map((l) => (
                <NavItem key={l.href} href={l.href} active={pathname === l.href || pathname.startsWith(`${l.href}/`)}>
                  {l.label}
                </NavItem>
              ))}
              <button
                type="button"
                onClick={signOut}
                disabled={pending}
                className="text-left px-6 py-3 text-base font-medium text-[var(--muted)] hover:bg-[var(--surface-muted)] border-t border-[var(--border)] mt-2 disabled:opacity-50"
              >
                {pending ? 'Signing out…' : 'Sign out'}
              </button>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-6 pt-3 pb-1 text-[10px] uppercase tracking-[0.14em] font-semibold text-[var(--muted)]">
      {children}
    </div>
  );
}

function NavItem({
  href, active, children,
}: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`px-6 py-3 text-base font-medium transition-colors ${
        active
          ? 'text-[var(--ink)] bg-[var(--brand-cyan-soft)]'
          : 'text-[var(--foreground)] hover:bg-[var(--surface-muted)]'
      }`}
    >
      {children}
    </Link>
  );
}
