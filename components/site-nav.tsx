'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { MobileNav } from './mobile-nav';

type Tab = { href: string; label: string };

const PRIMARY_TABS: Tab[] = [
  { href: '/',                   label: 'Weekly Review' },
  { href: '/dashboard',          label: 'Dashboard' },
  { href: '/sales-context',      label: 'Sales Context' },
  { href: '/pipeline-reviewer',  label: 'Pipeline Reviewer' },
  { href: '/forecast',           label: 'Forecast' },
];

const THEME_STORAGE_KEY = 'erd_theme';
type Theme = 'light' | 'dark';

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Top-level site nav. Three tiers:
 *   1. Five primary tabs (Weekly Review, Dashboard, Sales Context,
 *      Pipeline Reviewer, Forecast) — daily-use destinations.
 *   2. Prominent "Upload" CTA on the right — the most important
 *      workflow on the site (refreshes everyone's data), so it lives
 *      in chrome that every page can see.
 *   3. Avatar dropdown — Settings, theme switcher, Sign out. Standard
 *      SaaS pattern; people know to look here for preferences.
 *
 * Quick Enter intentionally is NOT in the nav — per-channel entry is
 * inline on Weekly Review via the "+ enter" affordance.
 */
export function SiteNav({ initials }: { initials: string }) {
  return (
    <header className="app-header sticky top-0 z-40 anim-fade-in">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16 gap-3">
        <div className="flex items-center gap-4 sm:gap-8 min-w-0">
          <Link href="/" className="flex items-center group flex-shrink-0" aria-label="Empower Revenue Dashboard home">
            <Image
              src="/empower-logo.svg"
              alt="Empower Home Services"
              width={160}
              height={32}
              priority
              className="logo-img h-6 sm:h-7 w-auto transition-transform duration-200 group-hover:scale-[1.02]"
            />
          </Link>
          <PrimaryTabs />
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <UploadCta />
          <UserMenu initials={initials} />
        </div>
        <MobileNav />
      </div>
    </header>
  );
}

function PrimaryTabs() {
  const pathname = usePathname();
  return (
    <nav className="hidden md:flex items-center gap-1 text-sm" aria-label="Main">
      {PRIMARY_TABS.map((t) => {
        const active = isActive(pathname, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`relative px-3 py-1.5 rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-cyan)] ${
              active
                ? 'text-[var(--ink)] bg-[var(--surface-muted)]'
                : 'text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-muted)]'
            }`}
          >
            {t.label}
            {active && (
              <span
                aria-hidden
                className="absolute left-3 right-3 -bottom-0.5 h-0.5 rounded-full bg-[var(--brand-cyan)]"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function UploadCta() {
  const pathname = usePathname();
  const active = isActive(pathname, '/upload');
  return (
    <Link
      href="/upload"
      aria-current={active ? 'page' : undefined}
      className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-cyan)] ${
        active
          ? 'border-2 border-[var(--brand-cyan)] text-[var(--ink)] bg-[var(--brand-cyan-soft)]'
          : 'border border-[var(--brand-cyan)] text-[var(--brand-cyan)] hover:bg-[var(--brand-cyan-soft)]'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <span>Upload</span>
    </Link>
  );
}

function UserMenu({ initials }: { initials: string }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    const initial: Theme =
      stored === 'light' || stored === 'dark'
        ? stored
        : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    // Hydration-safe init: the inline <script> in <head> already set
    // data-theme on <html> before paint, so the user sees no flash. Here
    // we sync React state to that DOM value so the segmented control
    // can highlight the right choice. This is the canonical pattern;
    // react-hooks/set-state-in-effect doesn't recognize it as legit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function setThemeAndPersist(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { window.localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* storage unavailable */ }
  }

  function signOut() {
    startSignOut(async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      setOpen(false);
      router.push('/login');
      router.refresh();
    });
  }

  // Pre-mount, render a stable placeholder to avoid hydration mismatch
  // (the theme depends on localStorage, which is client-only).
  if (!mounted) {
    return <div className="w-9 h-9 rounded-full" aria-hidden />;
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={`w-9 h-9 inline-flex items-center justify-center rounded-full text-xs font-semibold tracking-wide text-[var(--ink)] bg-[var(--surface-muted)] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-cyan)] ${
          open
            ? 'border-[var(--brand-cyan)] bg-[var(--brand-cyan-soft)]'
            : 'border-[var(--border)] hover:border-[var(--brand-cyan)] hover:bg-[var(--brand-cyan-soft)]'
        }`}
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1.5 w-56 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_12px_32px_-8px_rgba(10,24,40,0.25)] overflow-hidden anim-fade-in"
        >
          {/* Theme row — segmented control */}
          <div className="px-3 pt-3 pb-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)] mb-1.5">
              Theme
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--surface-muted)] p-1">
              <ThemeChoice
                label="Light"
                active={theme === 'light'}
                onClick={() => setThemeAndPersist('light')}
                icon={
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <line x1="12" y1="3" x2="12" y2="5" />
                    <line x1="12" y1="19" x2="12" y2="21" />
                    <line x1="3" y1="12" x2="5" y2="12" />
                    <line x1="19" y1="12" x2="21" y2="12" />
                  </>
                }
              />
              <ThemeChoice
                label="Dark"
                active={theme === 'dark'}
                onClick={() => setThemeAndPersist('dark')}
                icon={<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />}
              />
            </div>
          </div>

          <div className="h-px bg-[var(--border)]" />

          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-[var(--ink)] hover:bg-[var(--surface-muted)] transition-colors"
          >
            Settings
          </Link>

          <div className="h-px bg-[var(--border)]" />

          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={signingOut}
            className="w-full text-left px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] transition-colors disabled:opacity-50"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}

function ThemeChoice({
  label, active, onClick, icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitemradio"
      aria-checked={active}
      className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[0_1px_2px_rgba(10,24,40,0.06)]'
          : 'text-[var(--muted)] hover:text-[var(--ink)]'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {icon}
      </svg>
      {label}
    </button>
  );
}
