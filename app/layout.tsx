import type { Metadata } from 'next';
import { Geist, Source_Serif_4 } from 'next/font/google';
import Image from 'next/image';
import Link from 'next/link';
import { cookies } from 'next/headers';
import './globals.css';
import { COOKIE_NAME, verifyToken } from '@/lib/session';
import { SignOutButton } from '@/components/sign-out-button';
import { MobileNav } from '@/components/mobile-nav';
import { ThemeToggle } from '@/components/theme-toggle';

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });
const serif = Source_Serif_4({
  variable: '--font-serif',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Empower Revenue Dashboard',
  description: 'Live revenue, forecasts, and accountability for the Empower team.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const c = await cookies();
  const signedIn = verifyToken(c.get(COOKIE_NAME)?.value);

  return (
    <html
      lang="en"
      className={`${geist.variable} ${serif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply theme before paint to avoid flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('erd_theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {signedIn && (
          <header className="app-header sticky top-0 z-40 anim-fade-in">
            <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
              <div className="flex items-center gap-4 sm:gap-8 min-w-0">
                <Link href="/" className="flex items-center group flex-shrink-0">
                  <Image
                    src="/empower-logo.svg"
                    alt="Empower Home Services"
                    width={160}
                    height={32}
                    priority
                    className="logo-img h-6 sm:h-7 w-auto transition-transform duration-200 group-hover:scale-[1.02]"
                  />
                </Link>
                <nav className="hidden sm:flex items-center gap-1 text-sm">
                  <NavLink href="/">Weekly Review</NavLink>
                  <NavLink href="/dashboard">Dashboard</NavLink>
                  <NavLink href="/enter">Quick Enter</NavLink>
                  <NavLink href="/forecast">Forecast</NavLink>
                  <NavLink href="/sales-context">Sales Context</NavLink>
                  <NavLink href="/upload">Upload</NavLink>
                  <NavLink href="/settings">Settings</NavLink>
                </nav>
              </div>
              <div className="hidden sm:flex items-center gap-1">
                <ThemeToggle />
                <SignOutButton />
              </div>
              <MobileNav />
            </div>
          </header>
        )}
        <main className="flex-1 w-full">{children}</main>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-muted)] transition-colors duration-150"
    >
      {children}
    </Link>
  );
}
