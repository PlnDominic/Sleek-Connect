import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Inter } from 'next/font/google';
import { AnalyticsConsent } from '@/components/AnalyticsConsent';
import { SkipLink } from '@/components/SkipLink';
import { AuthProvider } from '@/components/AuthProvider';
import { CompareProvider } from '@/components/CompareProvider';
import { WebBagProvider } from '@/components/WebBagProvider';
import { WishlistProvider } from '@/components/WishlistProvider';
import { siteName, siteUrl } from '@/lib/site';
import { darkThemeCss, themeScript, themeVars } from '@/lib/theme';
import './globals.css';

// Inter, the same typeface as the admin console, so the store and the admin feel like one product.
const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'Sleek Connect Store: everyday essentials, delivered across Accra',
    template: '%s | Sleek Connect Store',
  },
  description:
    'Shop beauty, baby and kids, home and groceries, fashion, electronics and more, delivered across Accra. Pay with Mobile Money or card.',
  applicationName: siteName,
  openGraph: { type: 'website', siteName, locale: 'en_GH' },
  twitter: { card: 'summary_large_image' },
  // Google Search Console's HTML-tag verification (optional; a DNS record verifies the whole domain without it).
  ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } } : {}),
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-GH" className={inter.variable} style={themeVars} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: darkThemeCss }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SkipLink />
        {/* usePathname() needs a Suspense boundary so pages can still be prerendered. */}
        <Suspense fallback={null}>
          <AnalyticsConsent />
        </Suspense>
        <AuthProvider>
          <WebBagProvider>
            <WishlistProvider><CompareProvider>{children}</CompareProvider></WishlistProvider>
          </WebBagProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
