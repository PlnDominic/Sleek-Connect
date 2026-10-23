import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { AuthProvider } from '@/components/AuthProvider';
import { CompareProvider } from '@/components/CompareProvider';
import { WebBagProvider } from '@/components/WebBagProvider';
import { WishlistProvider } from '@/components/WishlistProvider';
import { siteName, siteUrl } from '@/lib/site';
import { themeVars } from '@/lib/theme';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-sans',
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'Sleek Connect Store: authentic beauty and kids essentials in Accra',
    template: '%s | Sleek Connect Store',
  },
  description:
    'Authentic beauty and safe, age-appropriate products for little ones, delivered across Accra. Pay with Mobile Money or card.',
  applicationName: siteName,
  openGraph: { type: 'website', siteName, locale: 'en_GH' },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-GH" className={jakarta.variable} style={themeVars}>
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
