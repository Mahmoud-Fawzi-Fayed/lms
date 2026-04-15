import type { Metadata } from 'next';
import { Cairo } from 'next/font/google';
import Providers from '@/components/Providers';
import ContentProtection from '@/components/ContentProtection';
import './globals.css';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', weight: ['300', '400', '500', '600', '700', '800'] });

export const metadata: Metadata = {
  title: 'منصة أ/محمد الصباغ التعليمية',
  description: 'منصة تعليمية متكاملة للتعلم عن بُعد والاختبارات الإلكترونية',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="min-h-screen bg-gray-50 font-arabic overflow-x-hidden">
        <Providers>
          <ContentProtection>
            <div className="page-transition min-h-screen">{children}</div>
          </ContentProtection>
        </Providers>
      </body>
    </html>
  );
}
