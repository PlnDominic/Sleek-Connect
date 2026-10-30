import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/components/AuthProvider';
import { CompareProvider } from '@/components/CompareProvider';
import { WebBagProvider } from '@/components/WebBagProvider';
import { WishlistProvider } from '@/components/WishlistProvider';
import { siteName, siteUrl } from '@/lib/site';
import { themeVars } from '@/lib/theme';
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
    default: 'Sleek Connect Store: beauty, home, fashion and kids essentials in Accra',
    template: '%s | Sleek Connect Store',
  },
  description:
    'Beauty, baby and kids, home and groceries, fashion and accessories, delivered across Accra. Pay with Mobile Money or card.',
  applicationName: siteName,
  openGraph: { type: 'website', siteName, locale: 'en_GH' },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-GH" className={inter.variable} style={themeVars}>
      <body>
        <AuthProvider>
          <WebBagProvider>
            <WishlistProvider><CompareProvider>{children}</CompareProvider></WishlistProvider>
          </WebBagProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
