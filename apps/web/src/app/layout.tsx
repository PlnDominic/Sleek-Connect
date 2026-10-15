import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { WebBagProvider } from '@/components/WebBagProvider';
import { themeVars } from '@/lib/theme';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-sans',
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: {
    default: 'Sleek Connect: authentic beauty and kids essentials in Accra',
    template: '%s | Sleek Connect',
  },
  description:
    'Authentic beauty and safe, age-appropriate products for little ones, delivered across Accra. Pay with Mobile Money or card.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-GH" className={jakarta.variable} style={themeVars}>
      <body>
        <WebBagProvider>{children}</WebBagProvider>
      </body>
    </html>
  );
}
