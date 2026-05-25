'use client';

import Link from 'next/link';
import { useLang } from '@/contexts/LanguageContext';
import { t } from '@/lib/i18n';

/** 404 Not Found — single-language (matches the active UI lang). */
export default function NotFound() {
  const { lang } = useLang();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="max-w-lg w-full text-center">
        <div className="text-[120px] font-extrabold leading-none bg-gradient-to-br from-blue-500 to-blue-700 bg-clip-text text-transparent select-none mb-4">
          404
        </div>
        <div className="w-16 h-16 mx-auto mb-6 bg-blue-50 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {t('الصفحة غير موجودة', 'Page not found')}
        </h1>
        <p className="text-gray-500 mb-8 text-sm">
          {t(
            'عذراً، الصفحة التي تبحث عنها غير موجودة أو تم نقلها.',
            'Sorry, the page you are looking for does not exist or has been moved.'
          )}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/" className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-sm">
            {t('الصفحة الرئيسية', 'Home')}
          </Link>
          <Link href="/courses" className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium text-sm">
            {t('تصفح الكورسات', 'Browse Courses')}
          </Link>
        </div>
      </div>
    </div>
  );
}
