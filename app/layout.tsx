import type { Metadata } from 'next';
import { Geist, Source_Serif_4 } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { COOKIE_NAME, verifyToken } from '@/lib/session';
import { SiteNav } from '@/components/site-nav';

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
        {signedIn && <SiteNav initials="DF" />}
        <main className="flex-1 w-full">{children}</main>
      </body>
    </html>
  );
}
