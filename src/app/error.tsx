'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useLang } from '@/contexts/LanguageContext';
import { t } from '@/lib/i18n';

/**
 * Global error boundary. Note: Next.js requires this be a Client Component
 * and own its own <html>/<body> because it replaces the root layout.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Re-render when language toggles. lang/dir on <html> below uses current value.
  const { lang } = useLang();

  useEffect(() => {
    console.error('[Global Error Boundary]', error);
  }, [error]);

  return (
    <html lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <body className="min-h-screen flex items-center justify-center bg-gray-50 font-sans p-4">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-red-50 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {t('حدث خطأ غير متوقع', 'Something went wrong')}
          </h1>
          <p className="text-gray-500 mb-6 text-sm">
            {t(
              'نعتذر، واجه التطبيق مشكلة غير متوقعة. يمكنك المحاولة مجدداً أو العودة للصفحة الرئيسية.',
              'An unexpected error occurred. Please try again or return to the home page.'
            )}
          </p>
          {error.digest && (
            <p className="text-gray-400 text-xs mb-4 font-mono bg-gray-50 rounded px-3 py-1">
              {t('رقم الخطأ', 'Error ID')}: {error.digest}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={reset}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              {t('حاول مجدداً', 'Try Again')}
            </button>
            <Link
              href="/"
              className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium text-sm"
            >
              {t('الصفحة الرئيسية', 'Home')}
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
